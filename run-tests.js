const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("Locating primary MongoDB node...");
    let primaryPort = null;
    const ports = [27011, 27012, 27013];
    for (const port of ports) {
        try {
            const out = execSync(`mongosh "mongodb://127.0.0.1:${port}" --quiet --eval "db.isMaster().ismaster"`, {encoding: 'utf8'});
            if (out.trim() === 'true') {
                primaryPort = port;
                break;
            }
        } catch(e) {}
    }

    if (!primaryPort) {
        console.error("Could not find primary node!");
        process.exit(1);
    }
    console.log(`✅ Primary node found on port ${primaryPort}`);

    const baseURI = `mongodb://127.0.0.1:${primaryPort}/shopee?directConnection=true`;

    const services = ['auth-service', 'product-service', 'cart-service', 'order-service', 'payment-service'];
    
    // Update env files
    console.log("Updating connection strings...");
    for (const s of services) {
        const envPath = path.join(__dirname, 'services', s, '.env');
        if (fs.existsSync(envPath)) {
            let content = fs.readFileSync(envPath, 'utf8');
            content = content.replace(/mongodb:\/\/[^\n]+/g, baseURI);
            fs.writeFileSync(envPath, content);
        }
    }

    // Update test file
    const testPath = path.join(__dirname, 'scripts', 'race-condition-test.js');
    if (fs.existsSync(testPath)) {
        let content = fs.readFileSync(testPath, 'utf8');
        content = content.replace(/mongodb:\/\/[^'"]+/g, baseURI);
        fs.writeFileSync(testPath, content);
    }

    console.log("Starting microservices...");
    const pids = [];
    
    const startService = (service) => {
        return new Promise((resolve) => {
            const p = spawn('node', ['src/server.js'], {
                cwd: path.join(__dirname, 'services', service),
                stdio: 'ignore', // ignoring output to keep terminal clean
                detached: true
            });
            pids.push(p.pid);
            setTimeout(resolve, 500); // slight stagger
        });
    };

    for (const s of services) {
        await startService(s);
    }

    console.log("Waiting 15 seconds for services to initialize...");
    await new Promise(r => setTimeout(r, 15000));

    console.log("=========================================");
    console.log("RUNNING RACE CONDITION TEST");
    console.log("=========================================");
    
    try {
        execSync(`node scripts/race-condition-test.js`, { stdio: 'inherit' });
    } catch(err) {
        console.error("Test process failed!");
    }

    console.log("Cleaning up services...");
    pids.forEach(pid => {
        try { process.kill(pid); } catch(e) {}
    });
    
    console.log("Done!");
    process.exit(0);
}

main();
