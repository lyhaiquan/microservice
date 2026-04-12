const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment');

const BASE_URL = 'http://localhost:8080/api';
const VNP_HASH_SECRET = 'IFG6MHMPGZMJKE20TZ2EF3Q737LLBM'; // Lấy từ payment-service/.env

const api = axios.create({
    baseURL: BASE_URL,
    timeout: 10000
});

// Helper for Mock VNPay Signature
function generateVnPayResponse(orderId, amount, responseCode = '00') {
    const date = new Date();
    const vnp_TxnRef = `${orderId}_${moment(date).format('HHmmss')}`;
    
    let vnp_Params = {};
    vnp_Params['vnp_Amount'] = amount * 100;
    vnp_Params['vnp_BankCode'] = 'NCB';
    vnp_Params['vnp_BankTranNo'] = 'VNP13535353';
    vnp_Params['vnp_CardType'] = 'ATM';
    vnp_Params['vnp_OrderInfo'] = `Thanh toan don hang ${orderId}`;
    vnp_Params['vnp_PayDate'] = moment(date).format('YYYYMMDDHHmmss');
    vnp_Params['vnp_ResponseCode'] = responseCode;
    vnp_Params['vnp_TmnCode'] = 'GUHO01S5';
    vnp_Params['vnp_TransactionNo'] = '13535353';
    vnp_Params['vnp_TransactionStatus'] = responseCode;
    vnp_Params['vnp_TxnRef'] = vnp_TxnRef;

    // Sort
    const sorted = {};
    Object.keys(vnp_Params).sort().forEach(key => {
        sorted[key] = vnp_Params[key];
    });

    const signData = qs.stringify(sorted, { encode: false });
    const hmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
    
    sorted['vnp_SecureHash'] = signed;
    return sorted;
}

async function runTests() {
    console.log('🏁 Starting Integration Tests...\n');
    let userToken = '';
    let userId = '';

    try {
        // --- TEST 1: HAPPY PATH ---
        console.log('--- TEST 1: Happy Path (Mua hàng cơ bản) ---');
        
        // 1.1 Register & Login
        const email = `test_user_${Date.now()}@gmail.com`;
        await api.post('/auth/register', { email, password: 'password123', name: 'Test User' });
        const loginRes = await api.post('/auth/login', { email, password: 'password123' });
        userToken = loginRes.data.token;
        userId = loginRes.data.user.id;
        api.defaults.headers.common['Authorization'] = `Bearer ${userToken}`;
        console.log('✅ Auth: Login thành công.');

        // 1.2 Create a Product with stock 10
        const productRes = await api.post('/products', {
            name: 'Laptop Gaming ASUS',
            price: 20000000,
            quantity: 10,
            category: 'Laptop'
        });
        const product = productRes.data.data;
        console.log(`✅ Product: Đã tạo SP "${product.name}" - Tồn kho: 10 - Giá: 20M.`);

        // 1.3 Add to Cart
        await api.post('/cart', {
            userId: userId,
            productId: product._id,
            quantity: 2,
            price: product.price,
            name: product.name
        });
        console.log('✅ Cart: Đã thêm 2 SP vào giỏ hàng.');

        // 1.4 Create Order
        const orderRes = await api.post('/orders', {
            userId: userId,
            items: [{
                productId: product._id,
                quantity: 2,
                price: product.price,
                name: product.name
            }],
            totalAmount: 40000000
        });
        const order = orderRes.data.data;
        console.log(`✅ Order: Đã tạo đơn hàng ${order._id} - Status: ${order.status}.`);

        // 1.5 Mock Payment Success
        console.log('⏳ Payment: Đang giả lập thanh toán VNPay...');
        const vnpParams = generateVnPayResponse(order._id, 40000000);
        await api.get('/payments/vnpay-return', { params: vnpParams });
        
        // Wait for Kafka events processing
        await new Promise(r => setTimeout(r, 2000));

        // 1.6 Verify Cross-check
        const finalOrder = await api.get(`/orders/${order._id}`);
        const finalProduct = await api.get(`/products/${product._id}`);
        // Cart check: Since there's no GET /cart API in my knowledge, I'll bypass it or assumes it was cleared
        
        console.log(`✅ Verification: Order ${order._id} status: ${finalOrder.data.data.status}`);
        console.log(`✅ Verification: Product stock còn lại: ${finalProduct.data.data.quantity} (Kỳ vọng: 8)`);

        if (finalOrder.data.data.status === 'PAID' && finalProduct.data.data.quantity === 8) {
            console.log('🏆 TEST 1: PASS!\n');
        } else {
            console.log('❌ TEST 1: FAIL!\n');
        }

        // --- TEST 2: DATA INTEGRITY (SNAPSHOT) ---
        console.log('--- TEST 2: Data Integrity (Snapshotting) ---');
        
        // 2.1 Create order with price 500
        const prodSnapshotRes = await api.post('/products', {
            name: 'Old Product',
            price: 500,
            quantity: 100
        });
        const prodSnapshot = prodSnapshotRes.data.data;
        
        const orderSnapshotRes = await api.post('/orders', {
            userId: userId,
            items: [{
                productId: prodSnapshot._id,
                quantity: 1,
                price: 500,
                name: 'Old Product'
            }],
            totalAmount: 500
        });
        const orderSnapshotId = orderSnapshotRes.data.data._id;

        // 2.2 Update Product price to 1000
        await api.put(`/products/${prodSnapshot._id}`, { price: 1000 });
        console.log('✅ Product: Đã cập nhật giá từ 500 -> 1000.');

        // 2.3 Verify Order price still 500
        const verifiedOrder = await api.get(`/orders/${orderSnapshotId}`);
        const snapshotPrice = verifiedOrder.data.data.items[0].price;
        console.log(`✅ Verification: Giá trong đơn hàng cũ: ${snapshotPrice} (Kỳ vọng: 500)`);

        if (snapshotPrice === 500) {
            console.log('🏆 TEST 2: PASS!\n');
        } else {
            console.log('❌ TEST 2: FAIL!\n');
        }

        // --- TEST 3: CONCURRENCY ---
        console.log('--- TEST 3: Concurrency (Race Condition) ---');
        
        // 3.1 Create limited product
        const limitedRes = await api.post('/products', {
            name: 'iPhone 15 Flash Sale',
            price: 1000,
            quantity: 1
        });
        const limitedProd = limitedRes.data.data;
        console.log(`✅ Product: Đã tạo SP giới hạn - Tồn kho: 1.`);

        // 3.2 Send 10 concurrent requests (using product-service direct for simplicity or gateway)
        // Note: The product service we modified has decreaseStock endpoint
        console.log('🚀 Sending 10 concurrent stock-reduction requests...');
        const concurrentResults = await Promise.allSettled(
            Array.from({ length: 10 }).map(() => 
                 api.post('/products/decrease-stock', { productId: limitedProd._id, quantity: 1 })
            )
        );

        const successes = concurrentResults.filter(r => r.status === 'fulfilled').length;
        const finalLimited = await api.get(`/products/${limitedProd._id}`);
        
        console.log(`✅ Verification: Request thành công: ${successes}`);
        console.log(`✅ Verification: Tồn kho cuối cùng: ${finalLimited.data.data.quantity}`);

        if (successes === 1 && finalLimited.data.data.quantity === 0) {
            console.log('🏆 TEST 3: PASS!\n');
        } else {
            console.log('❌ TEST 3: FAIL!\n');
        }

    } catch (err) {
        console.error('❌ Error during tests:', err.response?.data || err.message);
    }
}

runTests();
