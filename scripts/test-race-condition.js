const mongoose = require('mongoose');
const Product = require('../services/product-service/src/models/product.model');

const MONGO_URI = 'mongodb://127.0.0.1:27011/shopee?replicaSet=dbrs';

async function testRaceCondition() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB for Race Condition Test');

        // 1. Create a dummy product with 10 stock
        const product = await Product.create({
            name: 'Test Race Product',
            price: 100,
            quantity: 10,
            category: 'Testing'
        });
        console.log(`Created product: ${product._id} with stock 10`);

        // 2. Simulate 20 concurrent orders of 1 each
        const results = await Promise.allSettled(
            Array.from({ length: 20 }).map(() => 
                Product.findOneAndUpdate(
                    { _id: product._id, quantity: { $gte: 1 } },
                    { $inc: { quantity: -1 } },
                    { new: true }
                )
            )
        );

        // 3. Count successes
        const successfulOrders = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        const finalProduct = await Product.findById(product._id);

        console.log(`--- Test Results ---`);
        console.log(`Successful orders: ${successfulOrders}`);
        console.log(`Final stock: ${finalProduct.quantity}`);
        
        if (finalProduct.quantity === 0 && successfulOrders === 10) {
            console.log('✅ SUCCESS: No over-selling occurred!');
        } else {
            console.log('❌ FAILURE: Over-selling occurred or logic is wrong!');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

testRaceCondition();
