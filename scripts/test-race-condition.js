/**
 * ============================================================
 *  TEST RACE CONDITION — Mongoose Direct (Atomic Variant Stock)
 * ============================================================
 *
 *  Kịch bản:
 *    1. Tạo 1 sản phẩm test với variants[0].availableStock = 10
 *    2. Gửi đồng thời 20 request atomic update trừ 1 stock mỗi lần
 *    3. Kiểm tra: Chỉ đúng 10 lần update thành công, stock cuối = 0
 *
 *  Schema hiện tại (product.model.js):
 *    - sellerId, sellerRegion, name, slug, categoryId (required)
 *    - variants[]: { skuId, price, totalStock, availableStock, reservedStock, version }
 *
 *  Logic decreaseStock (product.controller.js):
 *    Product.findOneAndUpdate(
 *      { _id, 'variants.0.availableStock': { $gte: quantity } },
 *      { $inc: { 'variants.0.availableStock': -quantity } },
 *      { new: true }
 *    )
 *
 *  Chạy: node scripts/test-race-condition.js
 * ============================================================
 */

const mongoose = require('../services/product-service/node_modules/mongoose');
const Product = require('../services/product-service/src/models/product.model');

const MONGO_URI = 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';
const INITIAL_STOCK = 10;
const CONCURRENT_REQUESTS = 20;

async function testRaceCondition() {
    try {
        await mongoose.connect(MONGO_URI, {
            dbName: 'ecommerce_db',
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
            autoIndex: false,
        });
        console.log('✅ Connected to MongoDB for Race Condition Test');

        // 1. Tạo sản phẩm test khớp với schema hiện tại
        const testSlug = `race-test-${Date.now()}`;
        const product = await Product.create({
            sellerId: 'SELLER_TEST',
            sellerRegion: 'SOUTH',
            name: 'Race Condition Test Product',
            slug: testSlug,
            categoryId: 'CAT_TEST',
            variants: [{
                skuId: 'SKU_RACE_TEST',
                price: 100000,
                totalStock: INITIAL_STOCK,
                availableStock: INITIAL_STOCK,
                reservedStock: 0,
                version: 1
            }],
            status: 'ACTIVE'
        });
        console.log(`📦 Created product: ${product._id} with availableStock = ${INITIAL_STOCK}`);

        // 2. Gửi đồng thời 20 atomic update (cùng logic với decreaseStock controller)
        console.log(`🚀 Firing ${CONCURRENT_REQUESTS} concurrent atomic updates...`);
        const results = await Promise.allSettled(
            Array.from({ length: CONCURRENT_REQUESTS }).map(() =>
                Product.findOneAndUpdate(
                    { _id: product._id, 'variants.0.availableStock': { $gte: 1 } },
                    { $inc: { 'variants.0.availableStock': -1 } },
                    { new: true }
                )
            )
        );

        // 3. Đếm kết quả
        const successfulUpdates = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        const failedUpdates = results.filter(r => r.status === 'fulfilled' && r.value === null).length;
        const errors = results.filter(r => r.status === 'rejected').length;

        const finalProduct = await Product.findById(product._id);
        const finalStock = finalProduct.variants[0].availableStock;

        console.log(`\n--- Test Results ---`);
        console.log(`✅ Successful updates (stock deducted): ${successfulUpdates}`);
        console.log(`🔴 Rejected updates (out of stock):     ${failedUpdates}`);
        console.log(`❌ Errors:                               ${errors}`);
        console.log(`📦 Final availableStock:                 ${finalStock}`);

        // 4. Assertions
        const pass1 = successfulUpdates === INITIAL_STOCK;
        const pass2 = failedUpdates === CONCURRENT_REQUESTS - INITIAL_STOCK;
        const pass3 = finalStock === 0;
        const pass4 = finalStock >= 0; // Không overselling

        console.log(`\n--- Assertions ---`);
        console.log(`${pass1 ? '✅' : '❌'} Đúng ${INITIAL_STOCK} updates thành công (Got: ${successfulUpdates})`);
        console.log(`${pass2 ? '✅' : '❌'} Đúng ${CONCURRENT_REQUESTS - INITIAL_STOCK} updates bị từ chối (Got: ${failedUpdates})`);
        console.log(`${pass3 ? '✅' : '❌'} Final stock = 0 (Got: ${finalStock})`);
        console.log(`${pass4 ? '✅' : '❌'} Không có overselling (stock >= 0)`);

        if (pass1 && pass2 && pass3 && pass4) {
            console.log('\n🏆 SUCCESS: Atomic Update chống Race Condition hoàn hảo!');
        } else {
            console.log('\n💀 FAILURE: Phát hiện Race Condition hoặc logic sai!');
        }

        // 5. Cleanup - xóa sản phẩm test
        await Product.findByIdAndDelete(product._id);
        console.log('🗑️  Cleaned up test product.');

        process.exit(pass1 && pass2 && pass3 && pass4 ? 0 : 1);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

testRaceCondition();
