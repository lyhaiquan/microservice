const mongoose = require('mongoose');

const URI = 'mongodb://127.0.0.1:27011/shopee';

async function test() {
    console.log('Connecting to:', URI);
    try {
        await mongoose.connect(URI, { serverSelectionTimeoutMS: 5000, directConnection: true });
        console.log('SUCCESS: Connected to MongoDB');
        await mongoose.disconnect();
    } catch (err) {
        console.error('ERROR:', err.message);
    }
}

test();
