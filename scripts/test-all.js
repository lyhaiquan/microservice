/**
 * TEST ALL — Chạy trực tiếp với MongoDB Remote
 * Test: Auth, Product, Cart, Order, Race Condition, Payment
 */
const crypto = require('crypto');

const MONGO_URI = 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';

const User = require('../services/auth-service/src/models/User');
const Product = require('../services/product-service/src/models/product.model');
const Cart = require('../services/cart-service/src/models/cart.model');
const Order = require('../services/order-service/src/models/order.model');
const Payment = require('../services/payment-service/src/models/payment.model');

// Use the mongoose instance from the models to avoid "dual instance" issues
const mongoose = User.base; 
// Connect other models to this instance if they aren't already
if (!mongoose.models['Product']) mongoose.model('Product', Product.schema);
if (!mongoose.models['Cart']) mongoose.model('Cart', Cart.schema);
if (!mongoose.models['Order']) mongoose.model('Order', Order.schema);
if (!mongoose.models['Payment']) mongoose.model('Payment', Payment.schema);

const results = {};
function log(step, ok, msg) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${step}: ${msg}`);
    results[step] = ok;
}

async function run() {
    console.log('=== TEST ALL - MongoDB Remote ===\n');
    
    // Connect all possible mongoose instances to the same URI
    const instances = [...new Set([
        mongoose,
        User.base,
        Product.base,
        Cart.base,
        Order.base,
        Payment.base
    ])];
    
    console.log(`Connecting to ${instances.length} mongoose instances...`);
    await Promise.all(instances.map(inst => inst.connect(MONGO_URI)));
    
    console.log('Connected to MongoDB Remote\n');

    // 1. AUTH
    console.log('--- 1. AUTH ---');
    const testEmail = 'test_' + Date.now() + '@shopee.com';
    const testPassword = 'Test@123';
    let userId;
    try {
        const globalSalt = 'shopee_global_salt_123';
        const { generateHmac } = require('../services/common/src/security/crypto.util');
        const emailHmac = generateHmac(testEmail, globalSalt);
        await User.deleteMany({ emailHmac });
        const user = new User({
            email: testEmail, emailHmac,
            perUserSalt: crypto.randomBytes(16).toString('hex'),
            fullName: 'Test User', region: 'NORTH',
            credentials: { passwordHash: testPassword }
        });
        await user.save();
        userId = user._id.toString();
        const found = await User.findOne({ emailHmac });
        const pwdOk = found && await found.comparePassword(testPassword);
        log('Register+Login', pwdOk, 'User ' + userId + ' created, password match: ' + pwdOk);
    } catch (e) {
        log('Auth', false, e.message);
    }

    // 2. PRODUCT
    console.log('--- 2. PRODUCT ---');
    let productId, skuId;
    try {
        const slug = 'test-e2e-' + Date.now();
        skuId = 'SKU_T' + Date.now();
        const product = await Product.create({
            sellerId: 'SELLER_001', sellerRegion: 'NORTH',
            name: 'Test Product E2E', slug, categoryId: 'CAT_001',
            variants: [{ skuId, price: 2000000, totalStock: 10, availableStock: 10, reservedStock: 0, version: 1 }],
            status: 'ACTIVE'
        });
        productId = product._id.toString();
        log('Create Product', true, product.name + ' ID:' + productId + ' Stock:10');

        const updated = await Product.findOneAndUpdate(
            { _id: product._id, 'variants.0.availableStock': { $gte: 1 } },
            { $inc: { 'variants.0.availableStock': -1, 'variants.0.reservedStock': 1, 'variants.0.version': 1 } },
            { new: true }
        );
        const newStock = updated ? updated.variants[0].availableStock : -1;
        log('Decrease Stock', newStock === 9, 'Stock now: ' + newStock);
        await Product.updateOne({ _id: product._id }, { $set: { 'variants.0.availableStock': 10, 'variants.0.reservedStock': 0 } });
        log('Product Summary', true, 'OK');
    } catch (e) {
        log('Product', false, e.message);
    }

    // 3. CART
    console.log('--- 3. CART ---');
    try {
        const cartUserId = 'USR_T' + Date.now();
        await Cart.deleteMany({ userId: cartUserId });
        const cart = new Cart({
            _id: 'CART_' + cartUserId, userId: cartUserId,
            items: [{ skuId: skuId || 'TMP', quantity: 2, selected: true, priceSnapshot: 2000000, productNameSnapshot: 'Test', addedAt: new Date() }],
            expiresAt: new Date(Date.now() + 30 * 24 * 3600000)
        });
        await cart.save();
        log('Create Cart', true, 'Cart: ' + cart._id);
        log('Cart Summary', true, 'OK');
    } catch (e) {
        log('Cart', false, e.message);
    }

    // 4. ORDER
    console.log('--- 4. ORDER ---');
    let orderId;
    try {
        const orderUserId = 'USR_T' + Date.now();
        await Order.deleteMany({ userId: orderUserId });
        const order = new Order({
            _id: 'ORD_T' + Date.now(), region: 'NORTH', userId: orderUserId,
            userRegion: 'NORTH', deliveryRegion: 'NORTH', isCrossRegion: false,
            status: 'PENDING_PAYMENT',
            pricing: { itemsSubtotal: 4000000, shippingFee: 0, grandTotal: 4000000 },
            shippingAddressSnapshot: { receiverName: 'Test', fullAddress: '123 Hanoi' },
            items: [{ skuId: skuId || 'TMP', productNameSnapshot: 'Test', unitPrice: 2000000, quantity: 2, lineTotal: 4000000 }],
            reservationId: 'RESV_T' + Date.now(),
            statusHistory: [{ status: 'PENDING_PAYMENT', timestamp: new Date() }],
            version: 1
        });
        await order.save();
        orderId = order._id;
        log('Create Order', true, 'Order: ' + orderId + ' Status:' + order.status);
        const fetched = await Order.findById(orderId);
        log('Get Order', !!fetched, 'Status:' + (fetched ? fetched.status : 'N/A'));
        log('Order Summary', true, 'OK');
    } catch (e) {
        log('Order', false, e.message);
    }

    // 5. RACE CONDITION
    console.log('--- 5. RACE CONDITION ---');
    try {
        if (productId) {
            await Product.updateOne({ _id: productId }, { $set: { 'variants.0.availableStock': 1, 'variants.0.reservedStock': 0, 'variants.0.version': 1 } });
            const concurrent = await Promise.allSettled(
                Array.from({ length: 10 }).map(function() {
                    return Product.findOneAndUpdate(
                        { _id: productId, 'variants.0.availableStock': { $gte: 1 } },
                        { $inc: { 'variants.0.availableStock': -1, 'variants.0.reservedStock': 1, 'variants.0.version': 1 } },
                        { new: true }
                    );
                })
            );
            const successes = concurrent.filter(function(r) { return r.status === 'fulfilled' && r.value !== null; }).length;
            const finalProduct = await Product.findById(productId);
            const finalStock = finalProduct.variants[0].availableStock;
            log('10 Concurrent', successes === 1, 'Success:' + successes + ' Expected:1');
            log('Final Stock', finalStock === 0, 'Stock:' + finalStock + ' Expected:0');
            log('No Overselling', finalStock >= 0, finalStock >= 0 ? 'OK' : 'OVERSOLD! Stock:' + finalStock);
            log('Race Condition Summary', successes === 1 && finalStock === 0, successes === 1 && finalStock === 0 ? 'ATOMIC WORKS' : 'FAIL');
        } else {
            log('Race Condition', false, 'No productId');
        }
    } catch (e) {
        log('Race Condition', false, e.message);
    }

    // 6. PAYMENT
    console.log('--- 6. PAYMENT ---');
    try {
        const payUserId = 'USR_T' + Date.now();
        const targetOrderId = orderId || 'TEMPORARY';
        await Payment.deleteMany({ orderId: targetOrderId });
        const payment = await Payment.create({
            _id: 'PAY_T' + Date.now(), orderId: targetOrderId, userId: payUserId,
            userRegion: 'NORTH', provider: 'VNPAY', amount: 4000000, status: 'PENDING', version: 1
        });
        log('Create Payment', true, 'Payment: ' + payment._id);
        await Payment.findOneAndUpdate({ _id: payment._id }, { $set: { status: 'SUCCESS', providerRef: 'REF_123' }, $inc: { version: 1 } });
        const paid = await Payment.findById(payment._id);
        log('Payment Success', paid && paid.status === 'SUCCESS', 'Status:' + (paid ? paid.status : 'N/A'));
        log('Payment Summary', true, 'OK');
    } catch (e) {
        log('Payment', false, e.message);
    }

    // SUMMARY
    console.log('\n========== SUMMARY ==========');
    for (var k in results) {
        if (results.hasOwnProperty(k)) {
            console.log((results[k] ? 'PASS' : 'FAIL') + ' ' + k);
        }
    }
    var allPassed = true;
    for (var kk in results) { if (results.hasOwnProperty(kk) && !results[kk]) { allPassed = false; } }
    console.log('==============================');
    console.log(allPassed ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED');
    console.log('==============================\n');

    await mongoose.disconnect();
    process.exit(allPassed ? 0 : 1);
}

run().catch(function(e) { console.error('FATAL:', e.message); process.exit(1); });
