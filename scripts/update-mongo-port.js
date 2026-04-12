const fs = require('fs');

// Since we simplified to a single-node replica set (mongo1 only on port 27011),
// just ensure all services point to 27011
const PORT = '27011';
console.log(`Setting all services to use MongoDB on port ${PORT} (mongo1 - single node RS)`);

['auth-service', 'product-service', 'cart-service', 'order-service', 'payment-service'].forEach(service => {
    const envPath = `../services/${service}/.env`;
    if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf8');
        content = content.replace(/mongodb:\/\/127\.0\.0\.1:2701[0-9]/g, `mongodb://127.0.0.1:${PORT}`);
        fs.writeFileSync(envPath, content);
        console.log(`  ✅ ${service} -> port ${PORT}`);
    }
});
