const Product = require('../models/product.model');
const redisClient = require('../config/redis');

// Thời gian Cache tồn tại: 3600 giây (1 tiếng)
const CACHE_TTL = 3600;

class ProductController {
    
    // Helper function xóa cache search và list
    static async invalidateProductCache(productId = null) {
        try {
            // Xóa cache danh sách chung (wildcard vì có nhiều filter combination)
            const listKeys = await redisClient.keys('products:all:*');
            const keysToDelete = [...listKeys];
            
            if (productId) {
                keysToDelete.push(`products:detail:${productId}`);
            }
            
            // Tìm tất cả các key search để xóa
            const searchKeys = await redisClient.keys('products:search:*');
            if (searchKeys.length > 0) {
                keysToDelete.push(...searchKeys);
            }
            
            if (keysToDelete.length > 0) {
                await redisClient.del(keysToDelete);
            }

        } catch (err) {
            console.error('Lỗi khi xóa Redis Cache:', err.message);
        }
    }

    // Láy danh sách sản phẩm (có Cache & Filter)
    static async getAllProducts(req, res) {
        try {
            const { 
                minPrice, 
                maxPrice, 
                categoryId, 
                sellerId, 
                status = 'ACTIVE',
                rating,
                sort = 'newest' // newest, price_asc, price_desc
            } = req.query;


            // Xây dựng Cache Key dựa trên query params
            const queryStr = JSON.stringify(req.query);
            const cacheKey = `products:all:${queryStr}`;
            const cachedData = await redisClient.get(cacheKey);

            if (cachedData) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: JSON.parse(cachedData)
                });
            }

            // Xây dựng MongoDB Query
            const mongoQuery = { status };

            if (categoryId) mongoQuery.categoryId = categoryId;
            if (sellerId) mongoQuery.sellerId = sellerId;
            if (rating) mongoQuery.rating = { $gte: parseFloat(rating) };

            
            if (minPrice || maxPrice) {
                mongoQuery['variants.0.price'] = {};
                if (minPrice) mongoQuery['variants.0.price'].$gte = parseFloat(minPrice);
                if (maxPrice) mongoQuery['variants.0.price'].$lte = parseFloat(maxPrice);
            }

            // Xây dựng Sort
            let sortQuery = { createdAt: -1 };
            if (sort === 'price_asc') sortQuery = { 'variants.0.price': 1 };
            if (sort === 'price_desc') sortQuery = { 'variants.0.price': -1 };

            const products = await Product.find(mongoQuery).sort(sortQuery).limit(50);
            
            await redisClient.set(cacheKey, JSON.stringify(products), 'EX', CACHE_TTL);

            return res.status(200).json({
                success: true,
                meta: { source: 'mongodb', count: products.length },
                data: products
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }


    // Lấy chi tiết 1 sản phẩm (có Cache)
    static async getProductById(req, res) {
        try {
            const { id } = req.params;
            const cacheKey = `products:detail:${id}`;
            const cachedData = await redisClient.get(cacheKey);

            if (cachedData) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: JSON.parse(cachedData)
                });
            }

            const product = await Product.findById(id);
            if (!product) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            await redisClient.set(cacheKey, JSON.stringify(product), 'EX', CACHE_TTL);

            return res.status(200).json({
                success: true,
                meta: { source: 'mongodb' },
                data: product
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // Tìm kiếm (Sử dụng Text Index hoàn toàn mới)
    static async searchProducts(req, res) {
        try {
            const { q } = req.query;
            if (!q) {
                return res.status(400).json({ success: false, message: 'Missing search query' });
            }

            const cacheKey = `products:search:${q.toLowerCase().trim()}`;
            const cachedData = await redisClient.get(cacheKey);

            if (cachedData) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: JSON.parse(cachedData)
                });
            }

            // Sử dụng $text index để tìm kiếm hiệu quả hơn regex
            const products = await Product.find(
                { $text: { $search: q } },
                { score: { $meta: 'textScore' } }
            ).sort({ score: { $meta: 'textScore' } });

            await redisClient.set(cacheKey, JSON.stringify(products), 'EX', CACHE_TTL);

            return res.status(200).json({
                success: true,
                meta: { source: 'mongodb' },
                data: products
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // Hạ tồn kho (Atomic Update - Chống Race Condition)
    static async decreaseStock(req, res) {
        try {
            const { productId, quantity } = req.body;

            // Toán tử nguyên tử: Chỉ trừ kho nếu availableStock hiện tại >= quantity cần trừ
            const updatedProduct = await Product.findOneAndUpdate(
                { _id: productId, 'variants.0.availableStock': { $gte: quantity } },
                { $inc: { 'variants.0.availableStock': -quantity } },
                { new: true }
            );

            if (!updatedProduct) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Sản phẩm không tồn tại hoặc không đủ hàng (Out of stock)' 
                });
            }

            // Invalidate cache
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


    // Tạo sản phẩm mới (Write) -> Clear Cache All
    static async createProduct(req, res) {
        try {
            const newProduct = await Product.create(req.body);
            
            // Xóa cache danh sách chung do có thêm 1 item
            await ProductController.invalidateProductCache();

            return res.status(201).json({
                success: true,
                data: newProduct
            });
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    // Cập nhật Update (Write) -> Clear Cache
    static async updateProduct(req, res) {
        try {
            const { id } = req.params;
            const updatedProduct = await Product.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
            
            if (!updatedProduct) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            // Xóa cache Detail, Cache All, Cache Search
            await ProductController.invalidateProductCache(id);

            return res.status(200).json({
                success: true,
                data: updatedProduct
            });
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    // Xóa sản phẩm (Write) -> Clear Cache
    static async deleteProduct(req, res) {
        try {
            const { id } = req.params;
            const deletedProduct = await Product.findByIdAndDelete(id);
            
            if (!deletedProduct) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            // Xóa cache
            await ProductController.invalidateProductCache(id);

            return res.status(200).json({
                success: true,
                message: 'Product deleted successfully'
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
    // ============================================
    // ADMIN STATS
    // ============================================

    static async getProductCount(req, res, next) {
        try {
            const count = await Product.countDocuments({ status: 'ACTIVE' });
            res.status(200).json({
                success: true,
                data: { count }
            });
        } catch (error) {
            next(error);
        }
    }
}


module.exports = ProductController;
