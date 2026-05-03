/**
 * Account Sharing Race Condition Test
 *
 * Test 2 mục tiêu RIÊNG BIỆT (mỗi mục tiêu reset stock + dùng userId riêng để
 * không bị rate-limiter `checkout` 3/min/user nhiễu):
 *
 *   Scenario 1 — IDEMPOTENCY: 2 người login chung 1 account, click "Buy" cùng
 *   lúc với CÙNG checkoutId (UI sinh idempotencyKey từ cart). Kỳ vọng: A=201,
 *   B=200 + is_duplicate=true, đúng 1 order trong DB.
 *
 *   Scenario 2 — STOCK ATOMICITY: 2 user KHÁC NHAU (để loại rate-limit) cùng
 *   cướp 1 sản phẩm stock=1. Kỳ vọng: 1 thành công 201, 1 thất bại 400
 *   (out-of-stock), KHÔNG có 429.
 */
const axios = require('axios');
const mongoose = require('mongoose');
const { buyerToken, makeBuyerToken } = require('./auth_helper');
const Product = require('../services/order-service/src/models/product.model');

const ORDER_API = process.env.ORDER_API || 'http://localhost:5003/api/orders';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';
const PRODUCT_ID = `PROD_SHARING_${Date.now()}`;

async function resetStock(stock) {
    await Product.deleteMany({ _id: PRODUCT_ID });
    await Product.create({
        _id: PRODUCT_ID, sellerId: 'SEL_TEST', sellerRegion: 'SOUTH',
        name: 'Test Sharing Product', slug: `test-sharing-${PRODUCT_ID.toLowerCase()}`,
        categoryId: 'CAT_TEST',
        variants: [{ skuId: PRODUCT_ID, price: 100, totalStock: stock, availableStock: stock, reservedStock: 0, version: 1 }],
        status: 'ACTIVE',
    });
}

async function cleanup() {
    try { await Product.deleteMany({ _id: PRODUCT_ID }); } catch (_) { }
}

async function scenario1_Idempotency() {
    console.log('\n──── SCENARIO 1: Idempotency (cùng userId, cùng checkoutId) ────');
    await resetStock(1);

    const userId = `USR_SHARE_IDEM_${Date.now()}`;
    const headers = { 'Authorization': `Bearer ${makeBuyerToken(userId)}` };
    const checkoutId = `CHK_SHARE_${Date.now()}`;

    const payload = {
        userId, checkoutId,
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        totalAmount: 100,
    };

    const [resA, resB] = await Promise.all([
        axios.post(ORDER_API, payload, { headers, validateStatus: () => true }),
        axios.post(ORDER_API, payload, { headers, validateStatus: () => true }),
    ]);

    console.log(`A: ${resA.status} orderId=${resA.data?.data?._id} is_duplicate=${resA.data?.is_duplicate}`);
    console.log(`B: ${resB.status} orderId=${resB.data?.data?._id} is_duplicate=${resB.data?.is_duplicate}`);

    const orderIds = [resA.data?.data?._id, resB.data?.data?._id].filter(Boolean);
    const sameOrder = orderIds.length === 2 && orderIds[0] === orderIds[1];
    const oneCreated = (resA.status === 201 && resB.status === 200) || (resA.status === 200 && resB.status === 201);
    const noDouble = !(resA.status === 201 && resB.status === 201 && resA.data?.data?._id !== resB.data?.data?._id);

    if (oneCreated && sameOrder && noDouble) {
        console.log('✅ PASS — idempotency: cùng orderId, không tạo trùng');
        return true;
    }
    console.log('❌ FAIL — kỳ vọng 1×201 + 1×200 cùng orderId');
    return false;
}

async function scenario2_StockRace() {
    console.log('\n──── SCENARIO 2: Stock race (2 userId khác nhau, stock=1) ────');
    await resetStock(1);

    // Hai userId khác nhau → mỗi user có quota rate-limit riêng → đo được
    // chính xác stock atomicity, không bị 429 nhiễu.
    const userA = `USR_SHARE_A_${Date.now()}`;
    const userB = `USR_SHARE_B_${Date.now()}`;
    const headersA = { 'Authorization': `Bearer ${makeBuyerToken(userA)}` };
    const headersB = { 'Authorization': `Bearer ${makeBuyerToken(userB)}` };

    const [resA, resB] = await Promise.all([
        axios.post(ORDER_API, {
            userId: userA, checkoutId: `CART_A_${Date.now()}`,
            items: [{ productId: PRODUCT_ID, quantity: 1 }], totalAmount: 100,
        }, { headers: headersA, validateStatus: () => true }),
        axios.post(ORDER_API, {
            userId: userB, checkoutId: `CART_B_${Date.now()}`,
            items: [{ productId: PRODUCT_ID, quantity: 1 }], totalAmount: 100,
        }, { headers: headersB, validateStatus: () => true }),
    ]);

    console.log(`A: ${resA.status} ${resA.data?.message || resA.data?.data?._id || ''}`);
    console.log(`B: ${resB.status} ${resB.data?.message || resB.data?.data?._id || ''}`);

    const successes = [resA.status, resB.status].filter(s => s === 201).length;
    const outOfStock = [resA.status, resB.status].filter(s => s === 400).length;
    const rateLimited = [resA.status, resB.status].filter(s => s === 429).length;

    if (successes === 1 && outOfStock === 1 && rateLimited === 0) {
        console.log('✅ PASS — atomic stock: 1 success + 1 out-of-stock, không 429');
        return true;
    }
    if (successes === 2) {
        console.log('❌ FAIL — overselling: cả 2 thành công với stock=1');
    } else if (rateLimited > 0) {
        console.log('❌ FAIL — bị rate limit, test không hợp lệ');
    } else {
        console.log('❌ FAIL — không match kỳ vọng (1 success + 1 oos)');
    }
    return false;
}

async function run() {
    console.log('🚀 Account Sharing Race Condition Test');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000 });

    let pass1 = false, pass2 = false;
    try {
        pass1 = await scenario1_Idempotency();
        pass2 = await scenario2_StockRace();
    } finally {
        await cleanup();
        await mongoose.disconnect();
    }

    console.log('\n═══════════════════════════════');
    console.log(`Result: scenario1=${pass1 ? 'PASS' : 'FAIL'}  scenario2=${pass2 ? 'PASS' : 'FAIL'}`);
    console.log('═══════════════════════════════');
    process.exit(pass1 && pass2 ? 0 : 1);
}

run().catch(async (err) => {
    console.error('FATAL:', err.message);
    try { await cleanup(); await mongoose.disconnect(); } catch (_) { }
    process.exit(1);
});
