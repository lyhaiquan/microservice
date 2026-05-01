const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 1. Ghi root package.json
const rootPkg = {
  name: 'shopee-microservices',
  version: '2.0.0',
  scripts: {
    'start:auth': 'node services/auth-service/src/server.js',
    'start:product': 'node services/product-service/src/server.js',
    'start:cart': 'node services/cart-service/src/server.js',
    'start:order': 'node services/order-service/src/server.js',
    'start:payment': 'node services/payment-service/src/server.js',
    'test:e2e': 'node scripts/final-check.js',
    'test:race': 'node scripts/account-sharing-race-test.js'
  },
  dependencies: {
    argon2: '^0.41.1',
    axios: '^1.14.0',
    bcryptjs: '^3.0.3',
    concurrently: '^9.2.1',
    cors: '^2.8.6',
    dotenv: '^17.3.1',
    express: '^5.2.1',
    ioredis: '^5.5.0',
    jsonwebtoken: '^9.0.3',
    kafkajs: '^2.2.4',
    moment: '^2.30.1',
    mongoose: '^8.0.0',
    'node-cron': '^4.2.1',
    qs: '^6.15.0',
    'rate-limiter-flexible': '^11.0.1'
  },
  devDependencies: {
    jest: '^30.3.0',
    'mongodb-memory-server': '^11.0.1',
    nodemon: '^3.1.14',
    supertest: '^7.2.2'
  }
};

fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(rootPkg, null, 2));
console.log('1. Root package.json written');

// 2. Backup & remove sub package.jsons + node_modules
const services = ['auth-service', 'product-service', 'order-service', 'cart-service', 'payment-service', 'common'];
services.forEach(svc => {
  const svcDir = path.join(ROOT, 'services', svc);
  const pkgFile = path.join(svcDir, 'package.json');
  const nmDir = path.join(svcDir, 'node_modules');

  if (fs.existsSync(pkgFile)) {
    fs.renameSync(pkgFile, pkgFile + '.backup');
    console.log('   Backed up ' + svc + '/package.json');
  }
  if (fs.existsSync(nmDir)) {
    fs.rmSync(nmDir, { recursive: true, force: true });
    console.log('   Removed ' + svc + '/node_modules');
  }
});

console.log('2. Cleaned sub-services');
console.log('Now run: npm install');
