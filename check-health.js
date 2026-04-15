/**
 * Health Check Script - Kiểm tra kết nối Database & APIs của tất cả services
 */
const http = require('http');
const net = require('net');

// ============================================
// Configuration
// ============================================
const SERVICES = [
  { name: 'Auth Service',    port: 5050, apiPath: '/api/auth' },
  { name: 'Product Service', port: 5001, apiPath: '/api/products' },
  { name: 'Cart Service',    port: 5002, apiPath: '/api/cart' },
  { name: 'Order Service',   port: 5003, apiPath: '/api/orders' },
  { name: 'Payment Service', port: 5004, apiPath: '/api/payments' },
];

const INFRA = [
  { name: 'MongoDB (mongo1)', host: '127.0.0.1', port: 27011 },
  { name: 'MongoDB (mongo2)', host: '127.0.0.1', port: 27012 },
  { name: 'MongoDB (mongo3)', host: '127.0.0.1', port: 27013 },
  { name: 'Redis',            host: '127.0.0.1', port: 6379 },
  { name: 'Kafka',            host: '127.0.0.1', port: 9092 },
  { name: 'API Gateway',      host: '127.0.0.1', port: 8080 },
];

// ============================================
// Utilities
// ============================================
function checkTcpPort(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error',   () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

function httpGet(host, port, path, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path, timeout }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'TIMEOUT' }); });
    req.on('error', (err) => resolve({ status: 0, body: err.message }));
  });
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('=' .repeat(60));
  console.log('  🏥  MICROSERVICE HEALTH CHECK');
  console.log('=' .repeat(60));

  // --- 1. Infrastructure ---
  console.log('\n📦 [1/3] INFRASTRUCTURE (Docker Containers)\n');
  for (const svc of INFRA) {
    const ok = await checkTcpPort(svc.host, svc.port);
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon}  ${svc.name.padEnd(22)} → ${svc.host}:${svc.port}`);
  }

  // --- 2. Service Ports ---
  console.log('\n🔌 [2/3] SERVICE PORTS (running locally)\n');
  const runningServices = [];
  for (const svc of SERVICES) {
    const ok = await checkTcpPort('127.0.0.1', svc.port);
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon}  ${svc.name.padEnd(22)} → port ${svc.port}`);
    if (ok) runningServices.push(svc);
  }

  // --- 3. API Endpoint Check ---
  console.log('\n🌐 [3/3] API ENDPOINTS (via API Gateway :8080)\n');

  // Check gateway first  
  const gwOk = await checkTcpPort('127.0.0.1', 8080);
  if (!gwOk) {
    console.log('  ⚠️  API Gateway (port 8080) is NOT reachable. Skipping API tests.\n');
  } else {
    for (const svc of SERVICES) {
      const res = await httpGet('127.0.0.1', 8080, svc.apiPath);
      // Any response (even 401/404) means service is alive behind gateway
      const alive = res.status > 0;
      const icon = alive ? '✅' : '❌';
      const detail = alive ? `HTTP ${res.status}` : res.body;
      console.log(`  ${icon}  ${svc.name.padEnd(22)} GET ${svc.apiPath.padEnd(18)} → ${detail}`);
    }

    // Also test direct service endpoints for running services
    console.log('\n🔗 DIRECT SERVICE ENDPOINTS (bypass gateway)\n');
    for (const svc of runningServices) {
      const res = await httpGet('127.0.0.1', svc.port, svc.apiPath);
      const alive = res.status > 0;
      const icon = alive ? '✅' : '❌';
      const detail = alive ? `HTTP ${res.status}` : res.body;
      console.log(`  ${icon}  ${svc.name.padEnd(22)} GET http://127.0.0.1:${svc.port}${svc.apiPath} → ${detail}`);
    }
  }

  // --- Summary ---
  console.log('\n' + '=' .repeat(60));
  console.log('  📊 SUMMARY');
  console.log('=' .repeat(60));
  const notRunning = SERVICES.filter(s => !runningServices.find(r => r.port === s.port));
  console.log(`  ✅ Services running:     ${runningServices.map(s => s.name).join(', ') || 'NONE'}`);
  if (notRunning.length > 0) {
    console.log(`  ❌ Services NOT running: ${notRunning.map(s => s.name).join(', ')}`);
    console.log('\n  💡 To start all services, run in each service directory:');
    console.log('     cd services/<service-name> && npm run dev\n');
  }
}

main().catch(console.error);
