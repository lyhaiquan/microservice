/**
 * ============================================================
 *  RACE CONDITION TEST — Atomic Inventory Check
 * ============================================================
 * 
 *  Kịch bản:
 *    1. Reset sản phẩm A → quantity = 1
 *    2. Xóa tất cả orders cũ
 *    3. Gửi đồng thời 10 request POST /api/orders (Promise.all)
 *    4. Kiểm tra kết quả: Chỉ ĐÚNG 1 request thành công (201)
 *    5. Verify database: quantity = 0, orders count = 1
 * 
 *  Yêu cầu:
 *    - Docker containers đang chạy (MongoDB, Kafka, Redis)
 *    - Product Service (port 5001) + Order Service (port 5003) đã start
 *    - API Gateway (Nginx) listen trên port 8080
 * 
 *  Chạy: node scripts/race-condition-test.js
 * ============================================================
 */

const { MongoClient, ObjectId } = require('mongodb');

const API_GATEWAY = 'http://127.0.0.1:8080/api';
const MONGO_URI = 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';
const CONCURRENT_REQUESTS = 10;
const PRODUCT_STOCK = 1;

// ============================================================
//  Utility Functions
// ============================================================

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
};

function log(icon, msg) {
    console.log(`  ${icon}  ${msg}`);
}

function header(title) {
    console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}  ${title}${colors.reset}`);
    console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);
}

function divider() {
    console.log(`${colors.dim}  ${'─'.repeat(56)}${colors.reset}`);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============================================================
//  Phase 1: Setup Database — Reset Product & Clear Orders
// ============================================================
async function setupDatabase() {
    header('🔧 PHASE 1: SETUP DATABASE');

    const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
    });

    try {
        await client.connect();
        log('✅', 'Kết nối MongoDB thành công');

        const db = client.db('ecommerce_db');
        const productsCol = db.collection('products');
        const ordersCol = db.collection('orders');

        // --- Tìm hoặc tạo sản phẩm test ---
        let product = await productsCol.findOne({});
        
        if (!product) {
            const result = await productsCol.insertOne({
                sellerId: 'SELLER_001',
                sellerRegion: 'SOUTH',
                name: 'iPhone 16 Pro Max (Race Test)',
                slug: 'iphone-16-pro-max-race-test',
                categoryId: 'CAT_PHONE',
                variants: [{
                    skuId: 'SKU_IPHONE16',
                    price: 2000000,
                    totalStock: PRODUCT_STOCK,
                    availableStock: PRODUCT_STOCK,
                    reservedStock: 0,
                    version: 1,
                }],
                status: 'ACTIVE',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            product = await productsCol.findOne({ _id: result.insertedId });
            log('🆕', `Tạo sản phẩm mới: ${product.name}`);
        } else {
            await productsCol.updateOne(
                { _id: product._id },
                { $set: { 'variants.0.availableStock': PRODUCT_STOCK, updatedAt: new Date() } }
            );
            log('🔄', `Reset tồn kho "${product.name}" → availableStock = ${PRODUCT_STOCK}`);
        }

        // --- Xóa tất cả orders cũ ---
        const deleteResult = await ordersCol.deleteMany({});
        log('🗑️', `Xóa ${deleteResult.deletedCount} orders cũ`);

        const productId = product._id.toString();
        const productPrice = product.variants && product.variants[0] ? product.variants[0].price : (product.price || 0);
        
        log('📦', `Product ID: ${productId}`);
        log('💰', `Giá: ${productPrice.toLocaleString('vi-VN')} VNĐ`);
        log('📊', `Tồn kho hiện tại: ${PRODUCT_STOCK}`);

        await client.close();
        return productId;

    } catch (error) {
        console.error(`\n${colors.red}  ❌ Lỗi setup database: ${error.message}${colors.reset}`);
        await client.close().catch(() => {});
        process.exit(1);
    }
}


// ============================================================
//  Phase 2: Fire 10 Concurrent Order Requests
// ============================================================
async function fireConcurrentOrders(productId) {
    header(`🚀 PHASE 2: GỬI ${CONCURRENT_REQUESTS} REQUEST ĐỒNG THỜI`);

    log('🎯', `Target: POST ${API_GATEWAY}/orders`);
    log('📦', `Product ID: ${productId}`);
    log('👥', `Concurrent VUs: ${CONCURRENT_REQUESTS}`);
    log('📊', `Stock available: ${PRODUCT_STOCK}`);
    divider();

    const orderPayload = {
        userId: '000000000000000000000001',
        items: [{
            productId: productId,
            quantity: 1,
            price: 34990000,
            name: 'iPhone 16 Pro Max (Race Test)',
        }],
        totalAmount: 34990000,
    };

    const startTime = Date.now();

    const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
        fetch(`${API_GATEWAY}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload),
        })
            .then(async (res) => {
                const body = await res.json();
                return {
                    index: i + 1,
                    status: res.status,
                    success: body.success,
                    message: body.message || '',
                    orderId: body.data?._id || null,
                    duration: Date.now() - startTime,
                };
            })
            .catch((err) => ({
                index: i + 1,
                status: 0,
                success: false,
                message: `Network Error: ${err.message}`,
                orderId: null,
                duration: Date.now() - startTime,
            }))
    );

    const results = await Promise.all(promises);
    const totalDuration = Date.now() - startTime;

    results.sort((a, b) => a.duration - b.duration);

    console.log('');
    log('📋', `${colors.bold}Chi tiết từng request:${colors.reset}`);
    console.log('');

    for (const r of results) {
        const icon = r.status === 201 ? '🟢' : r.status === 400 ? '🔴' : '⚫';
        const statusText = r.status === 201
            ? `${colors.green}201 Created${colors.reset}`
            : r.status === 400
                ? `${colors.red}400 Bad Request${colors.reset}`
                : `${colors.yellow}${r.status} Error${colors.reset}`;

        const orderId = r.orderId ? ` → Order: ${r.orderId}` : '';
        const msg = r.status !== 201 ? ` → ${r.message}` : '';
        
        console.log(`    ${icon} Request #${String(r.index).padStart(2, '0')}  │  ${statusText}  │  ${r.duration}ms${orderId}${msg}`);
    }

    console.log(`\n    ⏱️  Tổng thời gian: ${totalDuration}ms\n`);

    return results;
}

// ============================================================
//  Phase 3: Verify Database State
// ============================================================
async function verifyDatabase(productId) {
    header('🔍 PHASE 3: KIỂM TRA DATABASE (Source of Truth)');

    const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
    });

    try {
        await client.connect();
        const db = client.db('ecommerce_db');

        const product = await db.collection('products').findOne({ _id: new ObjectId(productId) });
        const finalStock = product && product.variants && product.variants[0] ? product.variants[0].availableStock : 'N/A';
        const ordersCount = await db.collection('orders').countDocuments({});

        log('📦', `Tồn kho còn lại: ${finalStock}`);
        log('📝', `Số orders trong DB: ${ordersCount}`);

        await client.close();
        return { finalStock, ordersCount };
    } catch (error) {
        console.error(`\n${colors.red}  ❌ Lỗi verify database: ${error.message}${colors.reset}`);
        await client.close().catch(() => {});
        return { finalStock: -1, ordersCount: -1 };
    }
}

// ============================================================
//  Phase 4: Final Verdict
// ============================================================
function printVerdict(results, dbState) {
    header('📊 PHASE 4: KẾT QUẢ CUỐI CÙNG');

    const successCount = results.filter(r => r.status === 201).length;
    const failedCount = results.filter(r => r.status === 400).length;
    const errorCount = results.filter(r => r.status !== 201 && r.status !== 400).length;

    console.log(`    ┌──────────────────────────────────┬───────────┐`);
    console.log(`    │ ${colors.bold}Metric${colors.reset}                           │ ${colors.bold}Value${colors.reset}     │`);
    console.log(`    ├──────────────────────────────────┼───────────┤`);
    console.log(`    │ 🟢 Requests thành công (201)      │     ${colors.green}${String(successCount).padStart(2)}${colors.reset}    │`);
    console.log(`    │ 🔴 Requests bị từ chối (400)      │     ${colors.red}${String(failedCount).padStart(2)}${colors.reset}    │`);
    console.log(`    │ ⚫ Requests lỗi khác              │     ${String(errorCount).padStart(2)}    │`);
    console.log(`    ├──────────────────────────────────┼───────────┤`);
    console.log(`    │ 📦 Tồn kho DB (expected: 0)       │     ${dbState.finalStock === 0 ? colors.green : colors.red}${String(dbState.finalStock).padStart(2)}${colors.reset}    │`);
    console.log(`    │ 📝 Orders DB (expected: 1)         │     ${dbState.ordersCount === 1 ? colors.green : colors.red}${String(dbState.ordersCount).padStart(2)}${colors.reset}    │`);
    console.log(`    └──────────────────────────────────┴───────────┘`);
    console.log('');

    const assertions = [
        {
            name: 'Chỉ ĐÚNG 1 request thành công (201)',
            pass: successCount === 1,
            detail: `Expected: 1, Got: ${successCount}`,
        },
        {
            name: `Đúng ${CONCURRENT_REQUESTS - 1} request bị từ chối (400)`,
            pass: failedCount === CONCURRENT_REQUESTS - 1,
            detail: `Expected: ${CONCURRENT_REQUESTS - 1}, Got: ${failedCount}`,
        },
        {
            name: 'Tồn kho DB = 0 (không âm, không dư)',
            pass: dbState.finalStock === 0,
            detail: `Expected: 0, Got: ${dbState.finalStock}`,
        },
        {
            name: 'Chỉ có 1 order trong DB',
            pass: dbState.ordersCount === 1,
            detail: `Expected: 1, Got: ${dbState.ordersCount}`,
        },
        {
            name: 'Không có overselling (stock không < 0)',
            pass: dbState.finalStock >= 0,
            detail: `Stock: ${dbState.finalStock}`,
        },
    ];

    console.log(`    ${colors.bold}Assertions:${colors.reset}`);
    console.log('');

    let allPassed = true;
    for (const a of assertions) {
        const icon = a.pass ? `${colors.green}✅ PASS${colors.reset}` : `${colors.red}❌ FAIL${colors.reset}`;
        console.log(`    ${icon}  ${a.name}`);
        if (!a.pass) {
            console.log(`           ${colors.dim}${a.detail}${colors.reset}`);
            allPassed = false;
        }
    }

    console.log('');
    console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    if (allPassed) {
        console.log(`${colors.green}${colors.bold}  🏆 VERDICT: PASS — Atomic Update hoạt động chính xác!${colors.reset}`);
        console.log(`${colors.green}  → findOneAndUpdate({quantity: {$gte}}, {$inc}) chống Race Condition thành công.${colors.reset}`);
    } else {
        console.log(`${colors.red}${colors.bold}  💀 VERDICT: FAIL — Phát hiện Race Condition / Overselling!${colors.reset}`);
        console.log(`${colors.red}  → Atomic update KHÔNG hoạt động đúng. Kiểm tra lại logic decreaseStock.${colors.reset}`);
    }
    console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);

    return allPassed;
}

// ============================================================
//  Main Execution
// ============================================================
async function main() {
    console.clear();
    console.log(`\n${colors.bold}${colors.cyan}`);
    console.log(`    ╔══════════════════════════════════════════════════╗`);
    console.log(`    ║       RACE CONDITION TEST — Atomic Inventory    ║`);
    console.log(`    ║         ${CONCURRENT_REQUESTS} VUs × 1 Product (Stock: ${PRODUCT_STOCK})           ║`);
    console.log(`    ╚══════════════════════════════════════════════════╝`);
    console.log(`${colors.reset}`);

    // Phase 1: Setup
    const productId = await setupDatabase();

    // Đợi 3s để services nhận thấy DB changes
    log('⏳', 'Đợi 3 giây cho services ổn định...');
    await sleep(3000);

    // Phase 2: Fire requests
    const results = await fireConcurrentOrders(productId);

    // Đợi 2s cho Kafka events settle
    await sleep(2000);

    // Phase 3: Verify DB
    const dbState = await verifyDatabase(productId);

    // Phase 4: Verdict
    const passed = printVerdict(results, dbState);

    process.exit(passed ? 0 : 1);
}

main().catch((err) => {
    console.error(`\n${colors.red}❌ Fatal error: ${err.message}${colors.reset}`);
    console.error(err.stack);
    process.exit(1);
});
