/**
 * INTEGRATION TEST — End-to-End qua API Gateway
 *
 * Test 3 luồng chính theo schema thực tế của hệ:
 *   1. Happy Path: register → login → create product → create order → verify stock decreased
 *   2. Data Integrity (Snapshot): order giữ unitPrice gốc dù product đổi giá sau đó
 *   3. Concurrency: 10 request decrease-stock đồng thời cho stock=1 → chỉ 1 thành công
 *
 * Schema product hiện tại dùng `variants[0]` (skuId/price/availableStock/...) chứ
 * không phải field phẳng `price/quantity`. Test này đã được rewrite cho khớp.
 */
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8081/api';
const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

let passCount = 0;
let failCount = 0;

function logPass(name) { passCount++; console.log(`🏆 ${name}: PASS\n`); }
function logFail(name, reason = '') {
    failCount++;
    console.log(`❌ ${name}: FAIL ${reason ? '— ' + reason : ''}\n`);
}

function buildProductPayload(overrides = {}) {
    const id = `PROD_IT_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    return {
        _id: id,
        sellerId: 'SEL_IT_TEST',
        sellerRegion: 'NORTH',
        name: overrides.name || 'Integration Test Product',
        slug: `it-prod-${id.toLowerCase()}`,
        categoryId: 'CAT_IT',
        variants: [{
            skuId: id,
            price: overrides.price ?? 1000,
            totalStock: overrides.stock ?? 10,
            availableStock: overrides.stock ?? 10,
            reservedStock: 0,
            version: 1
        }],
        status: 'ACTIVE'
    };
}

async function runTests() {
    console.log(`🏁 Integration Tests — ${BASE_URL}\n`);
    let userToken;
    let userId;

    // ─── TEST 1: HAPPY PATH ───────────────────────────────────────────
    console.log('─── TEST 1: Happy Path ───');
    try {
        const email = `it_user_${Date.now()}@gmail.com`;
        const password = 'Password123!';
        await api.post('/auth/register', {
            email, password, fullName: 'IT User', region: 'NORTH'
        });
        const loginRes = await api.post('/auth/login', { email, password });
        userToken = loginRes.data.token;
        userId = loginRes.data.user.id;
        api.defaults.headers.common['Authorization'] = `Bearer ${userToken}`;
        console.log(`  ✓ Auth ok, userId=${userId}`);

        const prodPayload = buildProductPayload({ price: 20000000, stock: 10, name: 'Laptop ASUS IT' });
        const prodRes = await api.post('/products', prodPayload);
        const product = prodRes.data.data;
        const skuId = product.variants[0].skuId;
        console.log(`  ✓ Product ${product._id} stock=${product.variants[0].availableStock}`);

        const orderRes = await api.post('/orders', {
            userId,
            checkoutId: `CHK_HAPPY_${Date.now()}`,
            items: [{ productId: skuId, quantity: 2 }],
            totalAmount: 40000000
        });
        const order = orderRes.data.data;
        console.log(`  ✓ Order ${order._id} status=${order.status}`);

        const finalProd = (await api.get(`/products/${product._id}`)).data.data;
        const remainStock = finalProd.variants[0].availableStock;
        console.log(`  ✓ Stock after order: ${remainStock} (expected 8)`);

        if (order.status === 'PENDING_PAYMENT' && remainStock === 8) {
            logPass('TEST 1');
        } else {
            logFail('TEST 1', `status=${order.status} remainStock=${remainStock}`);
        }
    } catch (err) {
        logFail('TEST 1', err.response?.data?.message || err.message);
    }

    // ─── TEST 2: SNAPSHOT INTEGRITY ────────────────────────────────────
    console.log('─── TEST 2: Snapshot Integrity ───');
    try {
        const prodPayload = buildProductPayload({ price: 500, stock: 100, name: 'Snapshot Product' });
        const prodRes = await api.post('/products', prodPayload);
        const product = prodRes.data.data;
        const skuId = product.variants[0].skuId;

        const orderRes = await api.post('/orders', {
            userId,
            checkoutId: `CHK_SNAPSHOT_${Date.now()}`,
            items: [{ productId: skuId, quantity: 1 }],
            totalAmount: 500
        });
        const orderId = orderRes.data.data._id;

        // Đổi giá variant 500 → 1000
        await api.put(`/products/${product._id}`, {
            variants: [{ ...product.variants[0], price: 1000 }]
        });
        console.log('  ✓ Product price 500 → 1000');

        // Đợi cache invalidate kịp
        await new Promise(r => setTimeout(r, 200));
        const verified = (await api.get(`/orders/${orderId}`)).data.data;
        const snapshotPrice = verified.items[0].unitPrice;
        console.log(`  ✓ Order unitPrice giữ ở: ${snapshotPrice} (expected 500)`);

        if (snapshotPrice === 500) logPass('TEST 2');
        else logFail('TEST 2', `unitPrice=${snapshotPrice}`);
    } catch (err) {
        logFail('TEST 2', err.response?.data?.message || err.message);
    }

    // ─── TEST 3: CONCURRENCY (decrease-stock) ─────────────────────────
    console.log('─── TEST 3: Concurrency (Stock=1, 10 req) ───');
    try {
        const prodPayload = buildProductPayload({ price: 1000, stock: 1, name: 'Flash Sale' });
        const prodRes = await api.post('/products', prodPayload);
        const product = prodRes.data.data;

        const results = await Promise.allSettled(
            Array.from({ length: 10 }).map(() =>
                api.post('/products/decrease-stock', { productId: product._id, quantity: 1 })
            )
        );
        const successes = results.filter(r => r.status === 'fulfilled' && r.value?.status === 200).length;
        const finalProd = (await api.get(`/products/${product._id}`)).data.data;
        const finalStock = finalProd.variants[0].availableStock;
        console.log(`  ✓ Successes: ${successes}, Final stock: ${finalStock}`);

        if (successes === 1 && finalStock === 0) logPass('TEST 3');
        else logFail('TEST 3', `successes=${successes} finalStock=${finalStock}`);
    } catch (err) {
        logFail('TEST 3', err.response?.data?.message || err.message);
    }

    console.log('═══════════════════════════════');
    console.log(`Integration: ${passCount} PASS / ${failCount} FAIL`);
    console.log('═══════════════════════════════');
    if (failCount > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('FATAL:', err.message);
    process.exit(1);
});
