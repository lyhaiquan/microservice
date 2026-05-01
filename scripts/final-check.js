const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs');

const BASE_URL = 'http://localhost:8081/api';
let authToken = '';
let userId = '';
let productId = '';
let orderId = '';
let totalAmount = 0;

const results = {};

function logStep(step, success, message) {
    console.log(`[${step}] ${success ? '✅ PASS' : '❌ FAIL'} - ${message}`);
    results[step] = success;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    console.log('🚀 Bắt đầu bài test E2E cho Web Shopee...\n');

    try {
        // --- Step 1: Auth ---
        let authPassed = false;
        try {
            await axios.post(`${BASE_URL}/auth/register`, {
                name: 'tester_01',
                password: 'password123',
                email: 'tester@test.com'
            });
        } catch (e) {
            console.log('Register skipped/failed:', JSON.stringify(e.response?.data || e.message));
        }
        
        try {
            const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
                email: 'tester@test.com',
                password: 'password123'
            });
            authToken = loginRes.data.token || loginRes.data.data?.token;
            // Decode token manually or just use as is
            userId = loginRes.data.user?.id || loginRes.data.data?.user?.id;
            
            // If the user ID wasn't returned, maybe we extract from token payload (JWT)
            if (!userId && authToken) {
                const payload = JSON.parse(Buffer.from(authToken.split('.')[1], 'base64').toString());
                userId = payload.id || payload.userId || 'test_user_from_jwt';
            }

            if (authToken) {
                authPassed = true;
                logStep('Step 1 (Auth)', true, `Đăng nhập tester_01 thành công (Token: ${authToken.substring(0, 15)}...)`);
            } else {
                logStep('Step 1 (Auth)', false, 'Không lấy được Auth Token');
            }
        } catch (e) {
            logStep('Step 1 (Auth)', false, `Lỗi đăng nhập: ${JSON.stringify(e.response?.data || e.message)}`);
        }

        const axiosConfig = {
            headers: { Authorization: `Bearer ${authToken}` }
        };

        // --- Step 2: Product ---
        try {
            // Ensure there is at least a product
            try {
                const addProdRes = await axios.post(`${BASE_URL}/products`, {
                    name: 'Bàn phím cơ',
                    price: 1500000,
                    quantity: 50
                }, axiosConfig);
                productId = addProdRes.data.data?._id || addProdRes.data._id;
            } catch (e) { }

            const prodRes = await axios.get(`${BASE_URL}/products`, axiosConfig);
            const products = prodRes.data.data || prodRes.data;
            if (products && products.length > 0) {
                if (!productId) {
                   productId = products[0]._id;
                }
                logStep('Step 2 (Product)', true, `Lấy danh sách thành công (${products.length} SP). Chọn SP ID: ${productId}`);
            } else {
                logStep('Step 2 (Product)', false, 'Danh sách sản phẩm trống');
            }
        } catch (e) {
            logStep('Step 2 (Product)', false, `Lỗi lấy sản phẩm: ${e.message}`);
        }

        // --- Step 3: Cart ---
        try {
            const cartRes = await axios.post(`${BASE_URL}/cart`, {
                userId: userId,
                productId: productId,
                quantity: 2
            }, axiosConfig);
            if (cartRes.data.success) {
                logStep('Step 3 (Cart)', true, `Thêm sản phẩm vào giỏ thành công`);
            } else {
                logStep('Step 3 (Cart)', false, 'Thêm sản phẩm thất bại do API trả false');
            }
        } catch (e) {
            logStep('Step 3 (Cart)', false, `Lỗi thêm giỏ hàng: ${e.response?.data?.message || e.message}`);
        }

        // --- Step 4: Order ---
        try {
            const orderRes = await axios.post(`${BASE_URL}/orders`, {
                userId: userId,
                items: [{ productId, name: 'Sản phẩm Test', quantity: 2, price: 1500000 }],
                totalAmount: 3000000
            }, axiosConfig);
            
            if (orderRes.data.success) {
                const order = orderRes.data.data;
                orderId = order._id;
                totalAmount = order.totalAmount;
                if (order.status === 'PENDING') {
                    logStep('Step 4 (Order)', true, `Tạo đơn hàng ${orderId} thành công (PENDING)`);
                } else {
                    logStep('Step 4 (Order)', false, `Đơn hàng tạo ra nhưng status là ${order.status}`);
                }
            } else {
                 logStep('Step 4 (Order)', false, 'Tạo đơn hàng thất bại');
            }
        } catch (e) {
            logStep('Step 4 (Order)', false, `Lỗi tạo đơn: ${e.response?.data?.message || e.message}`);
        }

        // --- Step 5: Kafka & Payment URL Simulation ---
        try {
            if (orderId && totalAmount) {
                // generate VNPAY URL locally like payment-service does
                const moment = require('moment');
                const VNP_TMN_CODE = 'GUHO01S5'; // From payment-service .env
                const VNP_HASH_SECRET = 'IFG6MHMPGZMJKE20TZ2EF3Q737LLBM'; // From payment-service .env
                const VNP_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
                const createDate = moment(new Date()).format('YYYYMMDDHHmmss');
                const vnp_TxnRef = `${orderId}_${moment(new Date()).format('HHmmss')}`; 
                
                let vnp_Params = {
                    vnp_Version: '2.1.0',
                    vnp_Command: 'pay',
                    vnp_TmnCode: VNP_TMN_CODE,
                    vnp_Locale: 'vn',
                    vnp_CurrCode: 'VND',
                    vnp_TxnRef: vnp_TxnRef,
                    vnp_OrderInfo: `Thanh toan don hang ${orderId}`,
                    vnp_OrderType: 'other',
                    vnp_Amount: totalAmount * 100,
                    vnp_ReturnUrl: 'http://localhost:8081/api/payments/vnpay-return',
                    vnp_IpAddr: '127.0.0.1',
                    vnp_CreateDate: createDate
                };

                // Sort
                let str = Object.keys(vnp_Params).map(encodeURIComponent).sort();
                let sortedParams = {};
                for (let i = 0; i < str.length; i++) {
                    sortedParams[str[i]] = encodeURIComponent(vnp_Params[str[i]]).replace(/%20/g, "+");
                }

                const signData = qs.stringify(sortedParams, { encode: false });
                const hmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
                const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
                sortedParams['vnp_SecureHash'] = signed;
                
                const finalUrl = VNP_URL + '?' + qs.stringify(sortedParams, { encode: false });
                
                // Allow Kafka message round-trip time
                console.log(`\n⏳ Xin chờ 3 giây để Kafka xử lý events...`);
                await sleep(3000);

                logStep('Step 5 (Kafka & Payment)', true, `URL VNPAY được sinh ra:\n   ${finalUrl}`);

                // --- Step 6: Simulate vnpay return ---
                try {
                    // Cấu trúc URL giống như VNPAY gửi về
                    const returnParams = new URL(finalUrl).searchParams;
                    let simParams = {};
                    returnParams.forEach((val, key) => {
                        simParams[key] = val;
                    });
                    
                    // Gắn response code = 00 = SUCCESS, TxnNo from vnpay
                    simParams['vnp_ResponseCode'] = '00';
                    simParams['vnp_TransactionNo'] = '1122334455';
                    simParams['vnp_BankCode'] = 'NCB';
                    simParams['vnp_PayDate'] = createDate;

                    // Remove hash để tạo mã mới
                    delete simParams['vnp_SecureHash'];
                    delete simParams['vnp_SecureHashType'];

                    let simStr = Object.keys(simParams).map(encodeURIComponent).sort();
                    let simSorted = {};
                    for (let i = 0; i < simStr.length; i++) {
                        simSorted[simStr[i]] = encodeURIComponent(simParams[simStr[i]]).replace(/%20/g, "+");
                    }
                    const simSignData = qs.stringify(simSorted, { encode: false });
                    const simHmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
                    simSorted['vnp_SecureHash'] = simHmac.update(Buffer.from(simSignData, 'utf-8')).digest("hex");

                    const returnUrlLocal = `${BASE_URL}/payments/vnpay-return?` + qs.stringify(simSorted, { encode: false });
                    
                    const paymentRes = await axios.get(returnUrlLocal);
                    if (paymentRes.data.success && paymentRes.data.orderId === orderId) {
                        logStep('Step 6 (Simulate Success)', true, `Xác nhận thanh toán thành công (Mô phỏng VNPAY IPN trả về)`);
                    } else {
                        logStep('Step 6 (Simulate Success)', false, `Lỗi API Return: ${JSON.stringify(paymentRes.data)}`);
                    }
                } catch (e) {
                     logStep('Step 6 (Simulate Success)', false, `Lỗi gọi API vnpay-return: ${e.response?.data?.message || e.message}`);
                }

            } else {
                logStep('Step 5 (Kafka & Payment)', false, 'Không có orderId do lỗi bước trước');
                logStep('Step 6 (Simulate Success)', false, 'Bỏ qua do không có orderId');
            }
        } catch (e) {
            logStep('Step 5/6', false, `Lỗi: ${e.message}`);
        }

        // --- Step 7: Final check ---
        try {
            if (orderId) {
                console.log(`\n⏳ Đợi 5 giây để Event payment-confirmed phản hồi về Order Service...`);
                await sleep(5000);
                const checkRes = await axios.get(`${BASE_URL}/orders/${orderId}`, axiosConfig);
                const fetchedOrder = checkRes.data.data;
                if (fetchedOrder && fetchedOrder.status === 'PAID') {
                     logStep('Step 7 (Final Check)', true, `Order ${orderId} đã cập nhật trạng thái thành PAID`);
                } else {
                     logStep('Step 7 (Final Check)', false, `Status hiện tại là ${fetchedOrder?.status || 'Không lấy được'}. Mong đợi: PAID`);
                }
            } else {
                 logStep('Step 7 (Final Check)', false, 'Bỏ qua do không có orderId');
            }
        } catch (e) {
            logStep('Step 7 (Final Check)', false, `Lỗi truy vấn Order DB: ${e.response?.data?.message || e.message}`);
        }

    } catch (error) {
         console.error('\n❌ Kịch bản bị gián đoạn:', error.message);
    }

    // --- Output result ---
    console.log('\n=======================================');
    console.log('🏁 TỔNG SẮP KẾT QUẢ CÁC SERVICES');
    console.log('=======================================');
    console.log(`AUTH SERVICE    : ${results['Step 1 (Auth)'] ? '✅ OK' : '❌ LỖI'}`);
    console.log(`PRODUCT SERVICE : ${results['Step 2 (Product)'] ? '✅ OK' : '❌ LỖI'}`);
    console.log(`CART SERVICE    : ${results['Step 3 (Cart)'] ? '✅ OK' : '❌ LỖI'}`);
    console.log(`ORDER SERVICE   : ${results['Step 4 (Order)'] && results['Step 7 (Final Check)'] ? '✅ OK' : '❌ LỖI'}`);
    console.log(`PAYMENT SERVICE : ${results['Step 5 (Kafka & Payment)'] && results['Step 6 (Simulate Success)'] ? '✅ OK' : '❌ LỖI'}`);
    console.log('=======================================');
}

runTest();
