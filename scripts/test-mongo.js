const mongoose = require('mongoose');

const TEST_URI = 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';

async function test() {
    try {
        await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 3000 });
        console.log('Connected!');
        const db = mongoose.connection.db;
        const result = await db.collection('test').insertOne({ time: new Date() });
        console.log('Insert success:', result.insertedId);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}
test();
