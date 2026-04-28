const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from auth-service
dotenv.config({ path: path.join(__dirname, 'services/auth-service/.env') });

const MONGO_URI = process.env.MONGO_URI;

console.log('Testing connection to:', MONGO_URI);

async function testConnection() {
    try {
        // Try with original URI
        console.log('--- Attempting connection with original URI ---');
        await mongoose.connect(MONGO_URI, { 
            serverSelectionTimeoutMS: 5000 
        });
        console.log('✅ SUCCESS: Connected to MongoDB with original URI');
        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ FAILED with original URI:', err.message);
        
        // Try replacing host.docker.internal with 127.0.0.1
        const localUri = MONGO_URI.replace(/host\.docker\.internal/g, '127.0.0.1');
        console.log('\n--- Attempting connection with local URI (127.0.0.1) ---');
        console.log('URI:', localUri);
        try {
            await mongoose.connect(localUri, { 
                serverSelectionTimeoutMS: 5000 
            });
            console.log('✅ SUCCESS: Connected to MongoDB with local URI');
            await mongoose.disconnect();
            console.log('\nNOTE: It seems you should use 127.0.0.1 instead of host.docker.internal if running the service outside Docker.');
        } catch (localErr) {
            console.error('❌ FAILED with local URI:', localErr.message);
            
            // Try direct connection to one of the nodes just in case RS is bad
            const directUri = 'mongodb://127.0.0.1:27011/shopee?directConnection=true';
            console.log('\n--- Attempting direct connection to mongo1 ---');
            try {
                await mongoose.connect(directUri, { serverSelectionTimeoutMS: 5000 });
                console.log('✅ SUCCESS: Direct connection to mongo1 works.');
                await mongoose.disconnect();
            } catch (directErr) {
                console.error('❌ FAILED direct connection:', directErr.message);
            }
        }
    }
}

testConnection();
