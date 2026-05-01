const Product = require('../models/product.model');
const redisClient = require('../config/redis');
const { setTracked, invalidateGroup, getOrLoad } = require('../../../common/src/cache');

const CACHE_TTL = 3600;

// Index sets — track key thuộc nhóm để invalidate nhanh, không dùng KEYS.
const IDX_LIST = 'idx:products:list';
const IDX_SEARCH = 'idx:products:search';
const KEY_COUNT = 'products:count:active';

// Field projection cho list endpoint — bớt bandwidth/CPU. Detail endpoint trả full.
const LIST_PROJECTION = {
    name: 1, slug: 1, sellerId: 1, sellerRegion: 1,
    categoryId: 1, status: 1, rating: 1, numReviews: 1,
    'variants.0.price': 1, 'variants.0.availableStock': 1,
    createdAt: 1
};

class ProductController {

    static async invalidateProductCache(productId = null) {
        try {
            const groups = [IDX_LIST, IDX_SEARCH];
            await invalidateGroup(groups);
            const extras = [KEY_COUNT];
            if (productId) extras.push(`products:detail:${productId}`);
            await redisClient.del(extras);
        } catch (err) {
            console.error('Lỗi khi xóa Redis Cache:', err.message);
        }
    }

    static async getAllProducts(req, res) {
        try {
            const {
                minPrice, maxPrice, categoryId, sellerId,
                status = 'ACTIVE',
                rating,
                sort = 'newest',
                page = '1',
                limit = '50'
            } = req.query;

            const pageNum = Math.max(1, parseInt(page, 10) || 1);
            const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
            const skip = (pageNum - 1) * limitNum;

            // Cache key dựa trên params chuẩn hoá (sort field) để tránh phân mảnh cache.
            const cacheKey = `products:all:${JSON.stringify({
                minPrice, maxPrice, categoryId, sellerId, status, rating, sort,
                page: pageNum, limit: limitNum
            })}`;

            const { value, source } = await getOrLoad(
                cacheKey,
                CACHE_TTL,
                async () => {
                    const mongoQuery = { status };
                    if (categoryId) mongoQuery.categoryId = categoryId;
                    if (sellerId) mongoQuery.sellerId = sellerId;
                    if (rating) mongoQuery.rating = { $gte: parseFloat(rating) };
                    if (minPrice || maxPrice) {
                        mongoQuery['variants.0.price'] = {};
                        if (minPrice) mongoQuery['variants.0.price'].$gte = parseFloat(minPrice);
                        if (maxPrice) mongoQuery['variants.0.price'].$lte = parseFloat(maxPrice);
                    }

                    let sortQuery = { createdAt: -1 };
                    if (sort === 'price_asc') sortQuery = { 'variants.0.price': 1 };
                    if (sort === 'price_desc') sortQuery = { 'variants.0.price': -1 };

                    // .lean() bỏ mongoose hydration → faster ~3-5x
                    // .select() chỉ lấy field cần cho list view → giảm bytes
                    return await Product.find(mongoQuery)
                        .select(LIST_PROJECTION)
                        .sort(sortQuery)
                        .skip(skip)
                        .limit(limitNum)
                        .lean();
                },
                { indexSet: IDX_LIST }
            );

            return res.status(200).json({
                success: true,
                meta: { source, count: value.length, page: pageNum, limit: limitNum },
                data: value
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getProductById(req, res) {
        try {
            const { id } = req.params;
            const cacheKey = `products:detail:${id}`;

            const { value, source } = await getOrLoad(
                cacheKey,
                CACHE_TTL,
                async () => {
                    const product = await Product.findById(id).lean();
                    if (!product) {
                        const err = new Error('Product not found');
                        err.status = 404;
                        throw err;
                    }
                    return product;
                }
            );

            return res.status(200).json({
                success: true,
                meta: { source },
                data: value
            });
        } catch (error) {
            const status = error.status || 500;
            return res.status(status).json({ success: false, message: error.message });
        }
    }

    static async searchProducts(req, res) {
        try {
            const { q, limit = '50' } = req.query;
            if (!q) {
                return res.status(400).json({ success: false, message: 'Missing search query' });
            }
            const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

            const cacheKey = `products:search:${q.toLowerCase().trim()}:${limitNum}`;

            const { value, source } = await getOrLoad(
                cacheKey,
                CACHE_TTL,
                async () => {
                    return await Product.find(
                        { $text: { $search: q } },
                        { score: { $meta: 'textScore' }, ...LIST_PROJECTION }
                    )
                        .sort({ score: { $meta: 'textScore' } })
                        .limit(limitNum)
                        .lean();
                },
                { indexSet: IDX_SEARCH }
            );

            return res.status(200).json({
                success: true,
                meta: { source, count: value.length },
                data: value
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async decreaseStock(req, res) {
        try {
            const { productId, quantity } = req.body;

            const updatedProduct = await Product.findOneAndUpdate(
                { _id: productId, 'variants.0.availableStock': { $gte: quantity } },
                { $inc: { 'variants.0.availableStock': -quantity } },
                { new: true, projection: { 'variants.0.availableStock': 1 } }
            ).lean();

            if (!updatedProduct) {
                return res.status(400).json({
                    success: false,
                    message: 'Sản phẩm không tồn tại hoặc không đủ hàng (Out of stock)'
                });
            }

            await ProductController.invalidateProductCache(productId);

            return res.status(200).json({
                success: true,
                message: 'Hạ tồn kho thành công',
                data: { productId, remainingStock: updatedProduct.variants[0].availableStock }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async createProduct(req, res) {
        try {
            const newProduct = await Product.create(req.body);
            await ProductController.invalidateProductCache();
            return res.status(201).json({ success: true, data: newProduct });
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async updateProduct(req, res) {
        try {
            const { id } = req.params;
            const updatedProduct = await Product.findByIdAndUpdate(
                id, req.body, { new: true, runValidators: true }
            );
            if (!updatedProduct) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }
            await ProductController.invalidateProductCache(id);
            return res.status(200).json({ success: true, data: updatedProduct });
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async deleteProduct(req, res) {
        try {
            const { id } = req.params;
            const deletedProduct = await Product.findByIdAndDelete(id);
            if (!deletedProduct) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }
            await ProductController.invalidateProductCache(id);
            return res.status(200).json({ success: true, message: 'Product deleted successfully' });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getProductCount(req, res, next) {
        try {
            const cached = await redisClient.get(KEY_COUNT);
            if (cached !== null) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: { count: parseInt(cached) }
                });
            }

            // estimatedDocumentCount() đọc metadata, O(1), nhanh hơn countDocuments O(N)
            // nhiều bậc khi collection lớn. Filter status sẽ phải dùng countDocuments;
            // ở đây ta cache lâu (10 phút) và invalidate khi create/delete.
            const count = await Product.countDocuments({ status: 'ACTIVE' });
            await redisClient.set(KEY_COUNT, String(count), 'EX', 600);

            res.status(200).json({
                success: true,
                meta: { source: 'mongodb' },
                data: { count }
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = ProductController;
