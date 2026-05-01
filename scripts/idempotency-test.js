/**
 * Idempotency Test (qua API Gateway) — gửi 2 request cùng X-Idempotency-Key,
 * kỳ vọng request 1: 201, request 2: 200 + is_duplicate=true, cùng orderId,
 * và đúng 1 order trong DB cho key đó.
 *
 * Tự seed một product DEDICATED cho test (String _id) thay vì findOne({}) ngẫu nhiên
 * (gây flaky khi DB có data khác).
 */
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const { makeBuyerToken } = require('./auth_helper');

const API_GATEWAY = process.env.API_GATEWAY || 'http://127.0.0.1:8081/api';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';
const PRODUCT_ID = `PROD_IDEM_GW_${Date.now()}`;
const TEST_USER_ID = `USR_IDEM_${Date.now()}`;

const C = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    cyan: '\x1b[36m', bold: '\x1b[1m',
};
const header = (t) => {
    console.log(`\n${C.cyan}${'═'.repeat(60)}${C.reset}\n${C.bold}  ${t}${C.reset}\n${C.cyan}${'═'.repeat(60)}${C.reset}\n`);
};

async function setupProduct(client) {
    const db = client.db('ecommerce_db');
    await db.collection('products').replaceOne(
        { _id: PRODUCT_ID },
        {
            _id: PRODUCT_ID,
            sellerId: 'SEL_IDEM',
            sellerRegion: 'SOUTH',
            name: 'Idempotency Test Product',
            slug: `idem-gw-${PRODUCT_ID.toLowerCase()}`,
            categoryId: 'CAT_TEST',
            variants: [{
                skuId: PRODUCT_ID, price: 2000000,
                totalStock: 100, availableStock: 100, reservedStock: 0, version: 1
            }],
            status: 'ACTIVE',
            createdAt: new Date(), updatedAt: new Date(),
        },
        { upsert: true }
    );
    console.log(`✅ Product ${PRODUCT_ID} seeded with stock=100`);
}

async function runTest() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    await setupProduct(client);

    const idempotencyKey = `order-key-${crypto.randomUUID()}`;
    header('🚀 IDEMPOTENCY TEST START');
    console.log(`🔑 Key: ${idempotencyKey}`);

    const payload = {
        userId: TEST_USER_ID,
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        totalAmount: 2000000,
        idempotencyKey,
        checkoutId: idempotencyKey,
    };
    const reqHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${makeBuyerToken(TEST_USER_ID)}`,
        'X-Idempotency-Key': idempotencyKey,
    };

    console.log('\n📡 Request #1...');
    const res1 = await fetch(`${API_GATEWAY}/orders`, {
        method: 'POST', headers: reqHeaders, body: JSON.stringify(payload),
    });
    const data1 = await res1.json();
    console.log(`   status=${res1.status} orderId=${data1.data?._id || 'FAIL'}`);

    if (res1.status !== 201) {
        console.error(`${C.red}❌ Request #1 expected 201, got ${res1.status}: ${JSON.stringify(data1)}${C.reset}`);
        await client.close();
        process.exit(1);
    }

    await new Promise(r => setTimeout(r, 1000));

    console.log('\n📡 Request #2 (duplicate key)...');
    const res2 = await fetch(`${API_GATEWAY}/orders`, {
        method: 'POST', headers: reqHeaders, body: JSON.stringify(payload),
    });
    const data2 = await res2.json();
    console.log(`   status=${res2.status} orderId=${data2.data?._id || 'FAIL'} is_duplicate=${data2.is_duplicate}`);

    header('🔍 VERIFY DB');
    const db = client.db('ecommerce_db');
    const count = await db.collection('orders').countDocuments({ idempotencyKey });
    console.log(`📝 Records with this key: ${count}`);

    // Cleanup product test (giữ order để verify ngoài tay nếu cần)
    await db.collection('products').deleteOne({ _id: PRODUCT_ID });
    await client.close();

    const pass1 = res1.status === 201;
    const pass2 = res2.status === 200 && data2.is_duplicate === true;
    const pass3 = data1.data?._id && data1.data._id === data2.data?._id;
    const pass4 = count === 1;

    console.log(`\n${C.bold}Assertions:${C.reset}`);
    console.log(`   ${pass1 ? '✅' : '❌'} Req 1 → 201`);
    console.log(`   ${pass2 ? '✅' : '❌'} Req 2 → 200 + is_duplicate=true`);
    console.log(`   ${pass3 ? '✅' : '❌'} Cùng orderId`);
    console.log(`   ${pass4 ? '✅' : '❌'} Đúng 1 record trong DB`);

    const ok = pass1 && pass2 && pass3 && pass4;
    console.log(ok
        ? `\n${C.green}${C.bold}🏆 PASS${C.reset}\n`
        : `\n${C.red}${C.bold}💀 FAIL${C.reset}\n`);
    process.exit(ok ? 0 : 1);
}

runTest().catch((err) => {
    console.error('FATAL:', err.message);
    process.exit(1);
});
