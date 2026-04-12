const fs = require('fs');

const URI = 'mongodb://127.0.0.1:27011,127.0.0.1:27012,127.0.0.1:27013/shopee?replicaSet=dbrs';

// Update .env files
['auth-service', 'product-service', 'cart-service', 'order-service', 'payment-service'].forEach(service => {
    const envPath = `services/${service}/.env`;
    if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf8');
        content = content.replace(/mongodb:\/\/[^\n]+/g, URI);
        fs.writeFileSync(envPath, content);
    }
});

// Update race-condition-test.js
const testPath = 'scripts/race-condition-test.js';
if (fs.existsSync(testPath)) {
    let content = fs.readFileSync(testPath, 'utf8');
    content = content.replace(/mongodb:\/\/[^'"]+/g, URI);
    fs.writeFileSync(testPath, content);
}

console.log("Updated environments to use full Replica Set URI.");
