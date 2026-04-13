/**
 * ============================================================
 *  SHOPEE MICROSERVICES — DATA SEEDING SCRIPT
 * ============================================================
 *  Nhiệm vụ:
 *    1. Kết nối MongoDB Replica Set (readPreference: primary)
 *    2. Fetch 50 sản phẩm từ DummyJSON API
 *    3. Map dữ liệu sang Product Schema (để MongoDB tự sinh ObjectId)
 *    4. insertMany vào collection products
 *    5. Tạo 1 bản ghi Cart mẫu với snapshot price/name
 *    6. Xác nhận dữ liệu đã replicate sang Secondary nodes
 *
 *  Chạy:  node scripts/seed.js
 * ============================================================
 */

const axios = require('axios');
const mongoose = require('mongoose');

// ─── CẤU HÌNH ────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27011,127.0.0.1:27012,127.0.0.1:27013/shopee?replicaSet=dbrs';
const DUMMYJSON_URL = 'https://dummyjson.com/products?limit=0';

// Thay bằng userId thật sau khi đăng ký (phải là ObjectId hợp lệ 24 hex chars)
// Nếu chưa có, script sẽ tự tạo một ObjectId giả lập để demo
const SAMPLE_USER_ID = null; // Ví dụ: '665f1a2b3c4d5e6f7a8b9c0d'

// ─── SCHEMA DEFINITIONS ──────────────────────────────────────
// Product Schema — giữ nguyên hoàn toàn từ product-service
const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    price: {
        type: Number,
        required: [true, 'Product price is required'],
        min: [0, 'Price must be greater than or equal to 0']
    },
    quantity: {
        type: Number,
        required: [true, 'Stock quantity is required'],
        default: 0,
        min: [0, 'Quantity cannot be negative']
    },
    images: [{
        type: String
    }],
    category: {
        type: String,
        index: true
    }
}, {
    timestamps: true,
    optimisticConcurrency: true
});

productSchema.index({ name: 'text', description: 'text' });

// Cart Schema — giữ nguyên từ cart-service
const cartItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity:  { type: Number, required: true, min: [1, 'Quantity can not be less then 1.'] },
    price:    { type: Number, required: true },
    name:     { type: String, required: true }
}, { _id: false });

const cartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [cartItemSchema]
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
const Cart    = mongoose.model('Cart', cartSchema);

// ─── HÀM KẾT NỐI DB ─────────────────────────────────────────
/**
 * Kết nối MongoDB Replica Set với readPreference: 'primary'
 * → Đảm bảo seed data luôn ghi thẳng vào Primary node
 * → writeConcern: majority để chờ replicate xong mới xác nhận
 */
async function connectDB() {
    try {
        await mongoose.connect(MONGO_URI, {
            readPreference: 'primary',          // Ghi/đọc trên Primary
            writeConcern: { w: 'majority' },    // Chờ majority nodes xác nhận
            readConcern: { level: 'majority' }, // Đọc dữ liệu đã commit trên majority
            retryWrites: true,                  // Tự retry khi Primary failover
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ Kết nối MongoDB Replica Set thành công (readPreference: primary)');
    } catch (err) {
        console.error('❌ Kết nối thất bại:', err.message);
        process.exit(1);
    }
}

// ─── HÀM FETCH DỮ LIỆU TỪ DUMMYJSON ────────────────────────
/**
 * Lấy 50 sản phẩm từ DummyJSON API
 * Response format: { products: [...], total, skip, limit }
 */
async function fetchProducts() {
    console.log(`\n📡 Đang fetch dữ liệu từ ${DUMMYJSON_URL}...`);
    const { data } = await axios.get(DUMMYJSON_URL);
    console.log(`   → Nhận được ${data.products.length} sản phẩm từ API.`);
    return data.products;
}

// ─── HÀM MAP DỮ LIỆU ────────────────────────────────────────
/**
 * Chuyển đổi dữ liệu DummyJSON → Product Schema
 * 
 * Quy tắc:
 *   - title       → name       (String)
 *   - description → description (String)
 *   - price       → price      (Number)
 *   - stock       → quantity   (Number)
 *   - images      → images     (Array<String>)
 *   - category    → category   (String)
 *   - KHÔNG lấy trường `id` — để MongoDB tự sinh _id (ObjectId)
 */
function mapToSchema(dummyProducts) {
    return dummyProducts.map(p => ({
        name:        String(p.title),
        description: String(p.description || ''),
        price:       Number(p.price),
        quantity:    Number(p.stock),
        images:      Array.isArray(p.images) ? p.images.map(String) : [],
        category:    String(p.category || 'uncategorized')
        // version (__v) sẽ được Mongoose khởi tạo mặc định = 0
    }));
}

// ─── HÀM SEED PRODUCTS ───────────────────────────────────────
async function seedProducts() {
    console.log('\n🌱 Bắt đầu Seed Products...');

    // Bước 1: Xóa sạch dữ liệu cũ
    const deleteResult = await Product.deleteMany({});
    console.log(`   🗑️  Đã xóa ${deleteResult.deletedCount} sản phẩm cũ.`);

    // Bước 2: Fetch từ API
    const rawProducts = await fetchProducts();

    // Bước 3: Map dữ liệu sang Schema
    const mappedProducts = mapToSchema(rawProducts);

    // Bước 4: Bulk insert (insertMany tối ưu hơn save từng document)
    const insertedProducts = await Product.insertMany(mappedProducts, {
        ordered: false // Không dừng lại nếu 1 document lỗi, tiếp tục insert phần còn lại
    });

    console.log(`   ✅ Đã insert thành công ${insertedProducts.length} sản phẩm vào MongoDB.`);
    console.log(`      → writeConcern: majority — Dữ liệu đã được replicate sang Secondary nodes.`);

    return insertedProducts;
}

// ─── HÀM SEED CART MẪU ───────────────────────────────────────
/**
 * Tạo 1 bản ghi Cart mẫu với snapshot price/name từ sản phẩm thật
 * Điều này chứng minh cross-service data integrity
 */
async function seedSampleCart(products) {
    console.log('\n🛒 Tạo Cart mẫu...');

    // Xóa cart cũ
    await Cart.deleteMany({});

    // Chọn userId — nếu không có sẵn, tạo ObjectId giả lập
    const userId = SAMPLE_USER_ID
        ? new mongoose.Types.ObjectId(SAMPLE_USER_ID)
        : new mongoose.Types.ObjectId();

    // Chọn 3 sản phẩm ngẫu nhiên để bỏ vào giỏ
    const selectedProducts = products.slice(0, 3);

    const cartItems = selectedProducts.map(p => ({
        productId: p._id,              // ObjectId thật từ MongoDB
        quantity:  Math.floor(Math.random() * 3) + 1, // Random 1-3
        price:     p.price,            // Snapshot giá tại thời điểm thêm giỏ
        name:      p.name             // Snapshot tên sản phẩm
    }));

    const cart = await Cart.create({
        userId,
        items: cartItems
    });

    console.log(`   ✅ Đã tạo Cart cho userId: ${userId}`);
    console.log(`   📦 Giỏ hàng có ${cart.items.length} sản phẩm:`);
    cart.items.forEach((item, i) => {
        console.log(`      ${i + 1}. ${item.name} — SL: ${item.quantity} — Giá: ${item.price.toLocaleString('vi-VN')}đ`);
    });

    return cart;
}

// ─── HÀM XÁC NHẬN REPLICATION ────────────────────────────────
/**
 * Đọc lại dữ liệu với readPreference: secondaryPreferred
 * để xác nhận rằng data đã được replicate thành công sang Secondary
 */
async function verifyReplication() {
    console.log('\n🔍 Xác nhận Replication...');

    // Đọc từ secondary nếu có (fallback sang primary nếu chỉ có 1 node)
    const count = await Product.countDocuments({}).read('secondaryPreferred');
    console.log(`   ✅ Đọc từ Secondary/Primary: ${count} sản phẩm được tìm thấy.`);

    // Hiển thị Replica Set status
    const admin = mongoose.connection.db.admin();
    try {
        const rsStatus = await admin.command({ replSetGetStatus: 1 });
        console.log(`\n📊 Replica Set "${rsStatus.set}" — Trạng thái các node:`);
        rsStatus.members.forEach(member => {
            const role = member.stateStr;
            const health = member.health === 1 ? '🟢' : '🔴';
            console.log(`   ${health} ${member.name} — ${role}`);
        });
    } catch (err) {
        console.log(`   ⚠️  Không thể lấy rs.status() (có thể chỉ có 1 node): ${err.message}`);
    }
}

// ─── HIỂN THỊ BÁO CÁO ───────────────────────────────────────
function printReport(products, cart) {
    console.log('\n' + '═'.repeat(60));
    console.log('  📋 BÁO CÁO SEED DATA');
    console.log('═'.repeat(60));
    console.log(`  📦 Tổng sản phẩm đã seed:    ${products.length}`);
    console.log(`  🏷️  Danh mục (categories):     ${[...new Set(products.map(p => p.category))].length}`);
    console.log(`  💰 Giá thấp nhất:             ${Math.min(...products.map(p => p.price)).toLocaleString('vi-VN')}đ`);
    console.log(`  💎 Giá cao nhất:              ${Math.max(...products.map(p => p.price)).toLocaleString('vi-VN')}đ`);
    console.log(`  📸 Tổng ảnh sản phẩm:         ${products.reduce((sum, p) => sum + p.images.length, 0)}`);
    if (cart) {
        console.log(`  🛒 Cart mẫu:                 ${cart.items.length} sản phẩm`);
    }
    console.log(`  ✍️  writeConcern:              majority (đã replicate)`);
    console.log('═'.repeat(60));

    // In 5 sản phẩm đầu tiên làm mẫu
    console.log('\n📝 5 sản phẩm đầu tiên (sample):');
    products.slice(0, 5).forEach((p, i) => {
        console.log(`   ${i + 1}. [${p._id}] ${p.name}`);
        console.log(`      Giá: ${p.price.toLocaleString('vi-VN')}đ | Kho: ${p.quantity} | Category: ${p.category}`);
        console.log(`      Ảnh: ${p.images.length} file(s) | Version: ${p.__v}`);
    });
}

// ─── MAIN ─────────────────────────────────────────────────────
async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║        SHOPEE MICROSERVICES — DATA SEEDER v1.0          ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    try {
        // 1. Kết nối DB
        await connectDB();

        // 2. Seed Products
        const products = await seedProducts();

        // 3. Seed Cart mẫu
        const cart = await seedSampleCart(products);

        // 4. Xác nhận Replication
        await verifyReplication();

        // 5. Báo cáo
        printReport(products, cart);

        console.log('\n🎉 Seed hoàn tất! Dữ liệu sẵn sàng để sử dụng.\n');
    } catch (err) {
        console.error('\n❌ Seed thất bại:', err.message);
        if (err.response) {
            console.error('   API Response:', err.response.status, err.response.statusText);
        }
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Đã ngắt kết nối MongoDB.');
        process.exit(0);
    }
}

main();
