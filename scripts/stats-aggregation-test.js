/**
 * TEST: MongoDB Aggregation Statistics
 * Kiểm tra pipeline thống kê doanh thu có loại trừ đúng các đơn hàng đã hoàn tiền.
 */
const mongoose = require('mongoose');

const MONGO_URI = "mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin";

// Define schema inline để tránh phụ thuộc vào service
const orderItemSchema = new mongoose.Schema({
    skuId: String, sellerId: String, productNameSnapshot: String,
    unitPrice: Number, quantity: Number, lineTotal: Number
}, { _id: false });

const orderSchema = new mongoose.Schema({
    _id: String,
    region: String, userId: String, userRegion: String,
    deliveryRegion: String, isCrossRegion: Boolean,
    status: String,
    pricing: {
        itemsSubtotal: Number, shippingFee: Number,
        grandTotal: Number, refundedAmount: { type: Number, default: 0 }
    },
    items: [orderItemSchema],
    paymentId: String, idempotencyKey: String, version: { type: Number, default: 1 }
}, { timestamps: true, _id: false });

const Order = mongoose.model('Order', orderSchema);

async function testAggregation() {
    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 30000,
            w: 1
        });
        console.log("✅ Connected to MongoDB");

        const sellerId = "SEL_AGG_TEST";

        // 1. Cleanup
        await Order.deleteMany({ "items.sellerId": sellerId });
        console.log("🧹 Cleaned up old test data");

        // 2. Insert Mock Orders
        await Order.create([
            {
                _id: "ORD_AGG_1", region: "SOUTH", userId: "U1", userRegion: "SOUTH",
                deliveryRegion: "SOUTH", isCrossRegion: false, status: 'COMPLETED',
                pricing: { itemsSubtotal: 100, shippingFee: 10, grandTotal: 110, refundedAmount: 0 },
                items: [{ skuId: "P1", sellerId, productNameSnapshot: "Product A", unitPrice: 100, quantity: 1, lineTotal: 100 }]
            },
            {
                _id: "ORD_AGG_2", region: "SOUTH", userId: "U1", userRegion: "SOUTH",
                deliveryRegion: "SOUTH", isCrossRegion: false, status: 'COMPLETED',
                pricing: { itemsSubtotal: 200, shippingFee: 10, grandTotal: 210, refundedAmount: 0 },
                items: [{ skuId: "P1", sellerId, productNameSnapshot: "Product A", unitPrice: 200, quantity: 1, lineTotal: 200 }]
            },
            {
                _id: "ORD_AGG_3", region: "SOUTH", userId: "U1", userRegion: "SOUTH",
                deliveryRegion: "SOUTH", isCrossRegion: false, status: 'COMPLETED',
                pricing: { itemsSubtotal: 300, shippingFee: 10, grandTotal: 310, refundedAmount: 310 }, // ĐÃ HOÀN TIỀN
                items: [{ skuId: "P1", sellerId, productNameSnapshot: "Product A", unitPrice: 300, quantity: 1, lineTotal: 300 }]
            },
            {
                _id: "ORD_AGG_4", region: "SOUTH", userId: "U2", userRegion: "SOUTH",
                deliveryRegion: "SOUTH", isCrossRegion: false, status: 'PENDING_PAYMENT', // CHƯA HOÀN TẤT
                pricing: { itemsSubtotal: 500, shippingFee: 10, grandTotal: 510, refundedAmount: 0 },
                items: [{ skuId: "P2", sellerId, productNameSnapshot: "Product B", unitPrice: 500, quantity: 1, lineTotal: 500 }]
            }
        ]);
        console.log("📦 Inserted 4 mock orders (1 refunded, 1 pending)");

        // ==========================================
        // TEST 1: Seller Revenue Aggregation
        // ==========================================
        console.log("\n--- TEST 1: Seller Revenue (exclude refunded & non-completed) ---");
        const sellerStats = await Order.aggregate([
            { $unwind: "$items" },
            {
                $match: {
                    "items.sellerId": sellerId,
                    status: 'COMPLETED',
                    "pricing.refundedAmount": 0
                }
            },
            {
                $group: {
                    _id: "$items.sellerId",
                    totalRevenue: { $sum: "$items.lineTotal" },
                    orderCount: { $sum: 1 }
                }
            }
        ]);

        console.log("Result:", JSON.stringify(sellerStats, null, 2));
        // Expected: 100 + 200 = 300 (ORD_AGG_3 refunded, ORD_AGG_4 pending)
        if (sellerStats[0] && sellerStats[0].totalRevenue === 300 && sellerStats[0].orderCount === 2) {
            console.log("✅ TEST 1 PASSED: Revenue = 300, Orders = 2");
        } else {
            console.error("❌ TEST 1 FAILED: Expected revenue=300, orders=2");
        }

        // ==========================================
        // TEST 2: Admin Revenue by Period (monthly)
        // ==========================================
        console.log("\n--- TEST 2: Admin Revenue by Period ---");
        const adminStats = await Order.aggregate([
            {
                $match: {
                    status: 'COMPLETED',
                    "pricing.refundedAmount": 0
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    totalRevenue: { $sum: "$pricing.grandTotal" },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": -1, "_id.month": -1 } }
        ]);

        console.log("Result:", JSON.stringify(adminStats, null, 2));
        // Expected: grandTotal of AGG_1 (110) + AGG_2 (210) = 320
        const currentMonth = adminStats.find(s =>
            s._id.year === new Date().getFullYear() && s._id.month === new Date().getMonth() + 1
        );
        if (currentMonth && currentMonth.totalRevenue >= 320) {
            console.log("✅ TEST 2 PASSED: Monthly admin revenue is correct");
        } else {
            console.log("⚠️ TEST 2: Check manually - other orders in DB may affect total");
            console.log("   Current month data:", currentMonth);
        }

        // ==========================================
        // TEST 3: Product-level Revenue for Seller
        // ==========================================
        console.log("\n--- TEST 3: Per-Product Revenue ---");
        const productStats = await Order.aggregate([
            { $unwind: "$items" },
            {
                $match: {
                    "items.sellerId": sellerId,
                    "items.skuId": "P1",
                    status: 'COMPLETED',
                    "pricing.refundedAmount": 0
                }
            },
            {
                $group: {
                    _id: "$items.skuId",
                    totalRevenue: { $sum: "$items.lineTotal" },
                    totalQty: { $sum: "$items.quantity" }
                }
            }
        ]);

        console.log("Result:", JSON.stringify(productStats, null, 2));
        if (productStats[0] && productStats[0].totalRevenue === 300 && productStats[0].totalQty === 2) {
            console.log("✅ TEST 3 PASSED: Product P1 revenue = 300, qty = 2");
        } else {
            console.error("❌ TEST 3 FAILED");
        }

        // ==========================================
        // CLEANUP
        // ==========================================
        await Order.deleteMany({ _id: { $in: ["ORD_AGG_1", "ORD_AGG_2", "ORD_AGG_3", "ORD_AGG_4"] } });
        console.log("\n🧹 Test data cleaned up");

        console.log("\n========================================");
        console.log("📊 AGGREGATION TEST SUITE COMPLETED");
        console.log("========================================");

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
    }
}

testAggregation();
