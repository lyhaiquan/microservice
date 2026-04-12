/**
 * ============================================================
 *  IDEMPOTENCY TEST — Duplicate Order Protection
 * ============================================================
 * 
 *  Kịch bản:
 *    1. Sinh 1 idempotencyKey ngẫu nhiên (UUID format).
 *    2. Gửi Request #1 tạo đơn hàng.
 *    3. Đợi 1 giây.
 *    4. Gửi Request #2 tạo đơn hàng (Cùng key, cùng data).
 *    5. Kiểm tra:
 *       - Request #1: 201 Created.
 *       - Request #2: 200 OK (is_duplicate: true).
 *       - Cả 2 có chung Order ID.
 *       - Chỉ có đúng 1 record được lưu trong database.
 * 
 *  Chạy: node scripts/idempotency-test.js
 * ============================================================
 */

const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const API_GATEWAY = 'http://127.0.0.1:8080/api';
const MONGO_URI = 'mongodb://host.docker.internal:27011,host.docker.internal:27012,host.docker.internal:27013/shopee?replicaSet=dbrs';

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

function header(title) {
    console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}  ${title}${colors.reset}`);
    console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);
}

async function setupProduct() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db('shopee');
    await db.collection('products').updateOne(
        { _id: new (require('mongodb').ObjectId)('69d60f78a03225d10b514f74') },
        { $set: { quantity: 100 } }
    );
    console.log('✅ Stock reset to 100');
    await client.close();
}

async function runTest() {
    await setupProduct();
    const idempotencyKey = `order-key-${crypto.randomUUID()}`;
    const productId = '69d60f78a03225d10b514f74'; // Sử dụng ID từ lần test trước hoặc tìm sản phẩm bất kỳ
    
    header('🚀 IDEMPOTENCY TEST START');
    console.log(`🔑 Key: ${idempotencyKey}`);

    const payload = {
        userId: '000000000000000000000001',
        items: [{
            productId: productId,
            quantity: 1,
            price: 2000000,
            name: 'Chanel Coco Noir'
        }],
        totalAmount: 2000000,
        idempotencyKey: idempotencyKey
    };

    // --- REQUEST #1 ---
    console.log(`\n📡 Sending Request #1 ...`);
    const res1 = await fetch(`${API_GATEWAY}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data1 = await res1.json();
    console.log(`   🔸 Result #1: Status ${res1.status} | OrderID: ${data1.data?._id || 'FAIL'}`);

    if (res1.status !== 201) {
        console.error(`${colors.red}❌ Error: Request #1 should return 201 Created${colors.reset}`);
        process.exit(1);
    }

    // --- Đợi 1s ---
    await new Promise(r => setTimeout(r, 1000));

    // --- REQUEST #2 (DUPLICATE) ---
    console.log(`\n📡 Sending Request #2 (Duplicate Key) ...`);
    const res2 = await fetch(`${API_GATEWAY}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data2 = await res2.json();
    console.log(`   🔸 Result #2: Status ${res2.status} | OrderID: ${data2.data?._id || 'FAIL'} | is_duplicate: ${data2.is_duplicate}`);

    // --- VERIFY DATABASE ---
    header('🔍 VERIFYING DATABASE');
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db('shopee');
    const count = await db.collection('orders').countDocuments({ idempotencyKey });
    console.log(`📝 Records with this key in DB: ${count}`);
    await client.close();

    // --- FINAL VERDICT ---
    console.log(`\n${colors.bold}Assertions:${colors.reset}`);
    
    const pass1 = res1.status === 201;
    const pass2 = res2.status === 200 && data2.is_duplicate === true;
    const pass3 = data1.data._id === data2.data._id;
    const pass4 = count === 1;

    console.log(`   ${pass1 ? '✅' : '❌'} Request 1 trả về 201 Created`);
    console.log(`   ${pass2 ? '✅' : '❌'} Request 2 trả về 200 OK (is_duplicate: true)`);
    console.log(`   ${pass3 ? '✅' : '❌'} Cả 2 request trả về cùng 1 Order ID`);
    console.log(`   ${pass4 ? '✅' : '❌'} Chỉ có duy nhất 1 record được tạo trong DB`);

    if (pass1 && pass2 && pass3 && pass4) {
        console.log(`\n${colors.green}${colors.bold}🏆 VERDICT: PASS — Idempotency hoạt động hoàn hảo!${colors.reset}\n`);
    } else {
        console.log(`\n${colors.red}${colors.bold}💀 VERDICT: FAIL — Phát hiện lỗi Idempotency!${colors.reset}\n`);
        process.exit(1);
    }
}

runTest().catch(console.error);
