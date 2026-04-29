const Product = require('../models/product.model');
const redisClient = require('../config/redis');
const authMiddleware = require('../../../common/src/middlewares/auth.middleware');

// Thời gian Cache tồn tại: 3600 giây (1 tiếng)
const CACHE_TTL = 3600;

class ProductController {
    
    // Helper function xóa cache search và list
    static async invalidateProductCache(productId = null) {
        try {
            // Xóa cache danh sách chung
            const keysToDelete = ['products:all'];
            if (productId) {
                keysToDelete.push(`products:detail:${productId}`);
            }
            
            // Tìm tất cả các key search để xóa
            const listKeys = await redisClient.keys('products:list:*');
            const searchKeys = await redisClient.keys('products:search:*');
            if (listKeys.length > 0) {
                keysToDelete.push(...listKeys);
            }
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

    // Láy danh sách sản phẩm (có Cache)
    static async getAllProducts(req, res) {
        try {
            const { sellerId, categoryId, status = 'ACTIVE' } = req.query;
            const filter = {};
            if (sellerId) filter.sellerId = sellerId;
            if (categoryId) filter.categoryId = categoryId;
            filter.status = status === 'ALL' ? 'ACTIVE' : status;

            const cacheKey = `products:list:${JSON.stringify(filter)}`;
            const cachedData = await redisClient.get(cacheKey);

            // Cache Hit
            if (cachedData) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: JSON.parse(cachedData)
                });
            }

            // Cache Miss
            const products = await Product.find(filter).sort({ createdAt: -1 });
            
            // Lưu vào Redis
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
            const { q, sellerId, categoryId, status = 'ACTIVE' } = req.query;
            if (!q) {
                return res.status(400).json({ success: false, message: 'Missing search query' });
            }

            const filter = { $text: { $search: q } };
            if (sellerId) filter.sellerId = sellerId;
            if (categoryId) filter.categoryId = categoryId;
            filter.status = status === 'ALL' ? 'ACTIVE' : status;

            const cacheKey = `products:search:${q.toLowerCase().trim()}:${JSON.stringify({ sellerId, categoryId, status })}`;
            const cachedData = await redisClient.get(cacheKey);

            if (cachedData) {
                return res.status(200).json({
                    success: true,
                    meta: { source: 'redis' },
                    data: JSON.parse(cachedData)
                });
            }

            // Sử dụng $text index để tìm kiếm hiệu quả hơn regex
            const products = await Product.find(filter, { score: { $meta: 'textScore' } })
                .sort({ score: { $meta: 'textScore' } });

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
            const payload = { ...req.body };
            if (!authMiddleware.hasRole(req.user, 'ADMIN')) {
                payload.sellerId = req.user.id;
            }
            const newProduct = await Product.create(payload);
            
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
            const existingProduct = await Product.findById(id);
            if (!existingProduct) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            if (!authMiddleware.hasRole(req.user, 'ADMIN') && existingProduct.sellerId !== req.user.id) {
                return res.status(403).json({ success: false, message: 'Seller can only update own products' });
            }

            const payload = { ...req.body };
            if (!authMiddleware.hasRole(req.user, 'ADMIN')) {
                delete payload.sellerId;
                delete payload.sellerRegion;
            }

            const updatedProduct = await Product.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
            
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
            const existingProduct = await Product.findById(id);
            if (!existingProduct) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            if (!authMiddleware.hasRole(req.user, 'ADMIN') && existingProduct.sellerId !== req.user.id) {
                return res.status(403).json({ success: false, message: 'Seller can only delete own products' });
            }

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

    static async adminStats(req, res) {
        try {
            const [totalProducts, activeProducts, bySeller, stock] = await Promise.all([
                Product.countDocuments({}),
                Product.countDocuments({ status: 'ACTIVE' }),
                Product.aggregate([
                    { $group: { _id: '$sellerId', products: { $sum: 1 } } },
                    { $sort: { products: -1 } },
                    { $limit: 10 }
                ]),
                Product.aggregate([
                    { $unwind: '$variants' },
                    {
                        $group: {
                            _id: null,
                            totalStock: { $sum: '$variants.totalStock' },
                            availableStock: { $sum: '$variants.availableStock' },
                            reservedStock: { $sum: '$variants.reservedStock' }
                        }
                    }
                ])
            ]);

            return res.status(200).json({
                success: true,
                data: {
                    totalProducts,
                    activeProducts,
                    bySeller,
                    stock: stock[0] || { totalStock: 0, availableStock: 0, reservedStock: 0 }
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = ProductController;
