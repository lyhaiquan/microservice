const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';

async function initDB() {
    try {
        console.log('🚀 Starting Database Re-initialization...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const collections = ['users', 'products', 'carts', 'orders', 'payments'];
        
        for (const colName of collections) {
            try {
                await mongoose.connection.db.dropCollection(colName);
                console.log(`🗑️ Dropped collection: ${colName}`);
            } catch (e) {
                console.log(`⚠️ Collection ${colName} does not exist, skipping drop.`);
            }
        }

        console.log('✨ All relevant collections dropped.');
        console.log('📝 New indexes will be created automatically when services start.');
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

initDB();
