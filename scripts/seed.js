/**
 * ============================================================
 *  SHOPEE MICROSERVICES — ADVANCED SEEDING SCRIPT (11 COLLECTIONS)
 * ============================================================
 */

const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');

// ─── CẤU HÌNH ────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:Lyhaiquan2005%40@157.245.99.196:27000/ecommerce_db?authSource=admin';
const DUMMYJSON_URL = 'https://dummyjson.com/products?limit=50'; // Lấy 50 cái cho nhanh

// ─── MODELS (Import trực tiếp từ source để đảm bảo nhất quán) ──────
// Vì script chạy độc lập, ta định nghĩa lại schema khớp với 11 collections
const categorySchema = new mongoose.Schema({
    _id: String,
    name: String,
    slug: String,
    parentId: String,
    path: [String],
    level: Number,
    isActive: Boolean
});

const productSchema = new mongoose.Schema({
    _id: String,
    sellerId: String,
    sellerRegion: String,
    name: String,
    slug: String,
    categoryId: String,
    variants: [{
        skuId: String,
        price: Number,
        totalStock: Number,
        availableStock: Number,
        reservedStock: Number,
        version: Number
    }],
    status: String
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);
const Product = mongoose.model('Product', productSchema);

// ─── HELPER ──────────────────────────────────────────────────
const slugify = (text) => text.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');

// ─── MAIN LOGIC ──────────────────────────────────────────────
async function seed() {
    try {
        console.log('🚀 [SEED] Bắt đầu quá trình đổ dữ liệu (11 Collections)...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB.');

        // 1. Xóa dữ liệu cũ
        await Category.deleteMany({});
        await Product.deleteMany({});
        console.log('🗑️  Cleaned old Categories and Products.');

        // 2. Fetch từ DummyJSON
        console.log(`📡 Fetching from ${DUMMYJSON_URL}...`);
        const { data } = await axios.get(DUMMYJSON_URL);
        const rawProducts = data.products;
        console.log(`✅ Received ${rawProducts.length} products.`);

        // 3. Xử lý Categories (Materialized Path)
        const rawCategories = [...new Set(rawProducts.map(p => p.category))];
        const categoryMap = {};
        
        console.log('🌱 Seeding Categories...');
        for (let i = 0; i < rawCategories.length; i++) {
            const catName = rawCategories[i];
            const catId = `CAT_${String(i + 1).padStart(3, '0')}`;
            const slug = slugify(catName);
            
            await Category.create({
                _id: catId,
                name: catName,
                slug: slug,
                parentId: 'CAT_ROOT',
                path: ['CAT_ROOT', catId],
                level: 1,
                isActive: true
            });
            categoryMap[catName] = catId;
        }

        // 4. Xử lý Products & Variants
        console.log('📦 Seeding Products...');
        const regions = ['NORTH', 'CENTRAL', 'SOUTH'];
        
        const productData = rawProducts.map((p, index) => {
            const prdId = `PRD_${String(index + 100001)}`;
            const region = regions[Math.floor(Math.random() * regions.length)];
            
            return {
                _id: prdId,
                sellerId: `SELLER_${String(Math.floor(Math.random() * 10) + 1).padStart(3, '0')}`,
                sellerRegion: region,
                name: p.title,
                slug: `${slugify(p.title)}-${prdId.toLowerCase()}`,
                categoryId: categoryMap[p.category] || 'CAT_001',
                variants: [{
                    skuId: `SKU_${prdId}_001`,
                    price: p.price * 23000, // Đổi sang VND (xấp xỉ)
                    totalStock: p.stock,
                    availableStock: p.stock,
                    reservedStock: 0,
                    version: 1
                }],
                status: 'ACTIVE'
            };
        });

        await Product.insertMany(productData);
        console.log(`✅ Successfully seeded ${productData.length} products with variants.`);

        console.log('\n✨ [DONE] Dữ liệu đã được đổ về MongoDB thành công!');
        process.exit(0);
    } catch (error) {
        console.error('❌ [ERROR]', error.message);
        process.exit(1);
    }
}
seed();
