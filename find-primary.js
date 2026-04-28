const { execSync } = require('child_process');
const fs = require('fs');

let primaryPort = null;
for (const port of [27011, 27012, 27013]) {
    try {
        const isMaster = execSync(`mongosh "mongodb://127.0.0.1:${port}" --quiet --eval "db.isMaster().ismaster"`, {encoding: 'utf8'}).trim();
        if (isMaster === 'true') {
            primaryPort = port;
            break;
        }
    } catch(e) {}
}

if (!primaryPort) {
    console.error("No primary found!");
    process.exit(1);
}

console.log(`Primary is on port ${primaryPort}`);

// Update .env files
['auth-service', 'product-service', 'cart-service', 'order-service', 'payment-service'].forEach(service => {
    const envPath = `services/${service}/.env`;
    if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf8');
        content = content.replace(/mongodb:\/\/127\.0\.0\.1:2701[0-9]/g, `mongodb://127.0.0.1:${primaryPort}`);
        fs.writeFileSync(envPath, content);
    }
});

// Update race-condition-test.js
const testPath = 'scripts/race-condition-test.js';
if (fs.existsSync(testPath)) {
    let content = fs.readFileSync(testPath, 'utf8');
    content = content.replace(/mongodb:\/\/127\.0\.0\.1:2701[0-9]/g, `mongodb://127.0.0.1:${primaryPort}`);
    fs.writeFileSync(testPath, content);
}
console.log("Updated environments with primary port.");
