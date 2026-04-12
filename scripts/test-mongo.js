const mongoose = require('mongoose');

const TEST_URI = 'mongodb://127.0.0.1:27011,127.0.0.1:27012,127.0.0.1:27013/shopee?replicaSet=dbrs';

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
