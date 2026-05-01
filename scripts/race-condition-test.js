/**
 * ============================================================
 *  RACE CONDITION TEST — Atomic Inventory qua API Gateway
 * ============================================================
 *
 *  Kịch bản:
 *    1. Tạo/reset 1 product có availableStock = 1 (String _id, đúng schema variants[]).
 *    2. Sinh N JWT cho N userId KHÁC NHAU (tránh per-user rate-limit `checkout`
 *       3 req/min/user — nếu cùng userId, hầu hết request sẽ bị 429 chứ không
 *       phản ánh đúng atomic inventory).
 *    3. Bắn N request POST /api/orders đồng thời.
 *    4. Đúng 1 request 201, các request còn lại 400 (out-of-stock).
 *    5. Verify DB: availableStock = 0, đúng 1 order trong collection.
 *
 *  Chạy: node scripts/race-condition-test.js
 * ============================================================
 */

const { MongoClient } = require('mongodb');
const { makeBuyerToken } = require('./auth_helper');

const API_GATEWAY = process.env.API_GATEWAY || 'http://127.0.0.1:8081/api';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT || '10', 10);
const PRODUCT_STOCK = 1;
const PRODUCT_ID = `PROD_RACE_${Date.now()}`;

const colors = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
};
const log = (icon, msg) => console.log(`  ${icon}  ${msg}`);
const header = (title) => {
    console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}  ${title}${colors.reset}`);
    console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function setupDatabase() {
    header('🔧 PHASE 1: SETUP DATABASE');
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    try {
        await client.connect();
        const db = client.db('ecommerce_db');

        // Upsert một product DEDICATED cho test này — không đụng vào product khác
        // (test cũ findOne({}) lấy ngẫu nhiên gây flaky).
        await db.collection('products').replaceOne(
            { _id: PRODUCT_ID },
            {
                _id: PRODUCT_ID,
                sellerId: 'SELLER_RACE',
                sellerRegion: 'SOUTH',
                name: 'Race Condition Test Product',
                slug: `race-${PRODUCT_ID.toLowerCase()}`,
                categoryId: 'CAT_TEST',
                variants: [{
                    skuId: PRODUCT_ID,
                    price: 2000000,
                    totalStock: PRODUCT_STOCK,
                    availableStock: PRODUCT_STOCK,
                    reservedStock: 0,
                    version: 1,
                }],
                status: 'ACTIVE',
                rating: 0,
                numReviews: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            { upsert: true }
        );
        log('🆕', `Upserted product ${PRODUCT_ID} (stock=${PRODUCT_STOCK})`);

        // Xoá order cũ của TEST này (theo idempotencyKey hoặc tag) — không xoá toàn bộ collection
        // (đụng vào dữ liệu test khác). Ở đây test sinh idempotencyKey unique nên skip cleanup.

        return PRODUCT_ID;
    } finally {
        await client.close().catch(() => { });
    }
}

async function fireConcurrentOrders(productId) {
    header(`🚀 PHASE 2: GỬI ${CONCURRENT_REQUESTS} REQUEST ĐỒNG THỜI`);
    log('🎯', `Target: POST ${API_GATEWAY}/orders`);
    log('👥', `Concurrent VUs (each unique userId): ${CONCURRENT_REQUESTS}`);
    log('📊', `Stock available: ${PRODUCT_STOCK}`);

    const runId = Date.now();
    const startTime = Date.now();

    const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => {
        // Mỗi VU dùng userId & token riêng để tránh per-user rate limiter (3/min)
        const userId = `USR_RACE_${runId}_${i}`;
        const token = makeBuyerToken(userId);
        const payload = {
            userId,
            checkoutId: `CHK_RACE_${runId}_${i}`,
            items: [{ productId, quantity: 1 }],
            totalAmount: 2000000,
        };
        return fetch(`${API_GATEWAY}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload),
        })
            .then(async (res) => ({
                index: i + 1,
                status: res.status,
                body: await res.json().catch(() => ({})),
                duration: Date.now() - startTime,
            }))
            .catch((err) => ({
                index: i + 1, status: 0,
                body: { message: `Network Error: ${err.message}` },
                duration: Date.now() - startTime,
            }));
    });

    const results = await Promise.all(promises);
    results.sort((a, b) => a.duration - b.duration);

    console.log('');
    for (const r of results) {
        const icon = r.status === 201 ? '🟢' : r.status === 400 ? '🔴' : r.status === 429 ? '🟠' : '⚫';
        const orderId = r.body?.data?._id ? ` → ${r.body.data._id}` : '';
        const msg = r.status !== 201 ? ` → ${r.body?.message || ''}` : '';
        console.log(`    ${icon} #${String(r.index).padStart(2, '0')} │ ${r.status} │ ${r.duration}ms${orderId}${msg}`);
    }
    return results;
}

async function verifyDatabase(productId, runId) {
    header('🔍 PHASE 3: VERIFY DATABASE');
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    try {
        await client.connect();
        const db = client.db('ecommerce_db');
        const product = await db.collection('products').findOne({ _id: productId });
        const finalStock = product?.variants?.[0]?.availableStock ?? -1;
        // Đếm orders ref tới product này thay vì countDocuments({}) → không đụng dữ liệu khác.
        const ordersCount = await db.collection('orders').countDocuments({ 'items.skuId': productId });
        log('📦', `availableStock: ${finalStock}`);
        log('📝', `Orders chứa SKU ${productId}: ${ordersCount}`);
        return { finalStock, ordersCount };
    } finally {
        await client.close().catch(() => { });
    }
}

function printVerdict(results, dbState) {
    header('📊 PHASE 4: KẾT QUẢ');
    const successCount = results.filter(r => r.status === 201).length;
    const failedCount = results.filter(r => r.status === 400).length;
    const rateLimitedCount = results.filter(r => r.status === 429).length;
    const otherCount = results.filter(r => ![201, 400, 429].includes(r.status)).length;

    log('🟢', `Success (201): ${successCount}`);
    log('🔴', `Out-of-stock (400): ${failedCount}`);
    log('🟠', `Rate-limited (429): ${rateLimitedCount}`);
    log('⚫', `Other: ${otherCount}`);
    log('📦', `Final stock: ${dbState.finalStock} (expected 0)`);
    log('📝', `Orders for product: ${dbState.ordersCount} (expected 1)`);

    const assertions = [
        { name: 'Đúng 1 request 201', pass: successCount === 1 },
        { name: 'Còn lại đều 400 (không phải 429)', pass: rateLimitedCount === 0 && failedCount === CONCURRENT_REQUESTS - 1 },
        { name: 'Stock cuối = 0', pass: dbState.finalStock === 0 },
        { name: 'Đúng 1 order trong DB', pass: dbState.ordersCount === 1 },
        { name: 'Không overselling (stock ≥ 0)', pass: dbState.finalStock >= 0 },
    ];

    console.log('');
    let allPassed = true;
    for (const a of assertions) {
        const icon = a.pass ? `${colors.green}✅ PASS${colors.reset}` : `${colors.red}❌ FAIL${colors.reset}`;
        console.log(`    ${icon}  ${a.name}`);
        if (!a.pass) allPassed = false;
    }
    console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    console.log(allPassed
        ? `${colors.green}${colors.bold}  🏆 PASS — Atomic inventory hoạt động chính xác.${colors.reset}`
        : `${colors.red}${colors.bold}  💀 FAIL — Phát hiện overselling hoặc rate-limit gây nhiễu.${colors.reset}`);
    console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);
    return allPassed;
}

async function main() {
    const productId = await setupDatabase();
    log('⏳', 'Đợi 2s...');
    await sleep(2000);
    const results = await fireConcurrentOrders(productId);
    await sleep(2000);
    const dbState = await verifyDatabase(productId);
    const passed = printVerdict(results, dbState);
    process.exit(passed ? 0 : 1);
}

main().catch((err) => {
    console.error(`\n${colors.red}❌ Fatal: ${err.message}${colors.reset}`);
    console.error(err.stack);
    process.exit(1);
});
