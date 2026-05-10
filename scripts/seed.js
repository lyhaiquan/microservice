/**
 * Shopee Microservices — Seed Script (8 Collections)
 *
 * - Dùng raw MongoDB driver, KHÔNG qua Mongoose (bỏ qua encrypt/argon2).
 * - Email/phone lưu dạng plain text để dễ query trên Compass/mongosh.
 * - Lấy 50 sản phẩm thật từ DummyJSON API, convert sang VND.
 *
 * Usage: node scripts/seed.js
 * Yêu cầu: npm install mongodb axios (đã có trong root hoặc service nào đó)
 */

const { MongoClient, ObjectId } = require('mongodb');
const https = require('https');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'ecommerce_db';

// ─── helpers ─────────────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max) => parseFloat((Math.random() * (max - min) + min).toFixed(1));
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const hoursLater = (base, h) => new Date(base.getTime() + h * 3600000);

function slugify(text) {
  return text.toLowerCase()
    .replace(/[àáảãạăắặẳẵặâấầẩẫậ]/g, 'a')
    .replace(/[èéẻẽẹêếềểễệ]/g, 'e')
    .replace(/[ìíỉĩị]/g, 'i')
    .replace(/[òóỏõọôốồổỗộơớờởỡợ]/g, 'o')
    .replace(/[ùúủũụưứừửữự]/g, 'u')
    .replace(/[ýỳỷỹỵ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ─── Static data ─────────────────────────────────────────────────────────────
const REGIONS = ['NORTH', 'CENTRAL', 'SOUTH'];
const PROVINCES = {
  NORTH: ['Hà Nội', 'Hải Phòng', 'Bắc Ninh', 'Thái Nguyên', 'Nam Định'],
  CENTRAL: ['Đà Nẵng', 'Thừa Thiên Huế', 'Quảng Nam', 'Nghệ An', 'Thanh Hóa'],
  SOUTH: ['TP. Hồ Chí Minh', 'Bình Dương', 'Đồng Nai', 'Cần Thơ', 'Long An'],
};
const DISTRICTS = ['Quận 1', 'Quận 3', 'Quận 7', 'Bình Thạnh', 'Hoàng Mai', 'Đống Đa', 'Hải Châu', 'Thanh Xuân'];
const WARDS = ['Phường 1', 'Phường 5', 'Phường Bến Nghé', 'Phường Trung Hòa', 'Phường Láng Hạ'];
const STREETS = ['Lê Lợi', 'Nguyễn Huệ', 'Trần Phú', 'Điện Biên Phủ', 'Cách Mạng Tháng 8', 'Lý Thường Kiệt', 'Hai Bà Trưng'];
const FIRST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Dương', 'Phan'];
const LAST = ['Văn An', 'Thị Bình', 'Minh Chiến', 'Thị Dung', 'Văn Đức', 'Thị Phương', 'Quang Hải', 'Thị Hoa', 'Đức Kiên', 'Thị Lan', 'Quốc Toản', 'Thị Mai'];
const VN_CATEGORIES = [
  { _id: 'CAT_VN_001', name: 'Điện thoại', slug: 'dien-thoai', parent: 'CAT_ROOT' },
  { _id: 'CAT_VN_002', name: 'Laptop & Máy tính', slug: 'laptop-may-tinh', parent: 'CAT_ROOT' },
  { _id: 'CAT_VN_003', name: 'Thời trang Nam', slug: 'thoi-trang-nam', parent: 'CAT_ROOT' },
  { _id: 'CAT_VN_004', name: 'Thời trang Nữ', slug: 'thoi-trang-nu', parent: 'CAT_ROOT' },
  { _id: 'CAT_VN_005', name: 'Làm đẹp & Sức khỏe', slug: 'lam-dep-suc-khoe', parent: 'CAT_ROOT' },
  { _id: 'CAT_VN_006', name: 'Thể thao', slug: 'the-thao', parent: 'CAT_ROOT' },
  { _id: 'CAT_VN_007', name: 'Đồ gia dụng', slug: 'do-gia-dung', parent: 'CAT_ROOT' },
  { _id: 'CAT_VN_008', name: 'Sách', slug: 'sach', parent: 'CAT_ROOT' },
];

// ─── Build Users ──────────────────────────────────────────────────────────────
function buildUsers() {
  const users = [];
  let counter = 100001;
  const configs = [
    { roles: ['ADMIN'], count: 2 },
    { roles: ['SELLER'], count: 8 },
    { roles: ['BUYER'], count: 15 },
  ];
  configs.forEach(({ roles, count }) => {
    for (let i = 0; i < count; i++) {
      const region = pick(REGIONS);
      const fname = pick(FIRST);
      const lname = pick(LAST);
      const name = `${fname} ${lname}`;
      const uid = `USR_${counter++}`;
      const prov = pick(PROVINCES[region]);
      users.push({
        _id: new ObjectId(),
        uid,
        email: `${slugify(name)}${uid.slice(-5)}@gmail.com`,
        phone: `09${rand(10000000, 99999999)}`,
        fullName: name,
        region,
        status: rand(1, 10) > 1 ? 'ACTIVE' : 'BANNED',
        roles,
        addresses: [{
          addressId: `ADDR_${uid}_1`,
          receiverName: name,
          province: prov,
          district: pick(DISTRICTS),
          ward: pick(WARDS),
          street: `${rand(1, 500)} đường ${pick(STREETS)}`,
          isDefault: true,
        }],
        credentials: {
          // plain hash placeholder — NOT a real hash, for seed/practice only
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=1$SEED_PLACEHOLDER',
          failedAttempts: 0,
          lockedUntil: null,
          lastPasswordChangedAt: daysAgo(rand(10, 90)),
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
        sessions: [],
        createdAt: daysAgo(rand(30, 365)),
        updatedAt: daysAgo(rand(1, 29)),
        __v: 0,
      });
    }
  });
  return users;
}

// ─── Build Categories from DummyJSON + VN extras ──────────────────────────────
function buildCategories(dummyCategories) {
  const cats = [];
  // Root categories from DummyJSON
  dummyCategories.forEach((catName, i) => {
    const id = `CAT_${String(i + 1).padStart(3, '0')}`;
    cats.push({
      _id: id,
      name: catName,
      slug: slugify(catName),
      parentId: null,
      path: [id],
      level: 0,
      isActive: true,
      createdAt: daysAgo(rand(60, 180)),
      updatedAt: daysAgo(rand(1, 30)),
    });
  });
  // VN-specific categories
  VN_CATEGORIES.forEach((c) => {
    cats.push({
      _id: c._id,
      name: c.name,
      slug: c.slug,
      parentId: null,
      path: [c._id],
      level: 0,
      isActive: true,
      createdAt: daysAgo(rand(60, 180)),
      updatedAt: daysAgo(rand(1, 30)),
    });
  });
  return cats;
}

// ─── Build Products from DummyJSON ────────────────────────────────────────────
function buildProducts(rawProducts, categoryMap, sellers) {
  return rawProducts.map((p, idx) => {
    const pid = `PRD_${100001 + idx}`;
    const seller = sellers[idx % sellers.length];
    const priceVND = Math.round(p.price * 25000 / 1000) * 1000;
    const totalStock = p.stock || rand(50, 300);
    const reserved = rand(0, Math.floor(totalStock * 0.15));
    const slug = `${slugify(p.title)}-${pid.toLowerCase()}`;
    const catId = categoryMap[p.category] || 'CAT_001';

    return {
      _id: pid,
      sellerId: seller.uid,
      sellerRegion: seller.region,
      name: p.title,
      slug,
      categoryId: catId,
      description: p.description,
      thumbnail: p.thumbnail,
      variants: [
        {
          skuId: `${pid}_SKU_001`,
          price: priceVND,
          totalStock,
          availableStock: totalStock - reserved,
          reservedStock: reserved,
          version: 1,
        },
        {
          skuId: `${pid}_SKU_002`,
          price: Math.round(priceVND * 1.1 / 1000) * 1000,
          totalStock: rand(20, 80),
          availableStock: rand(15, 70),
          reservedStock: rand(0, 5),
          version: 1,
        },
      ],
      status: p.stock > 0 ? 'ACTIVE' : 'INACTIVE',
      rating: p.rating || randFloat(3.5, 5.0),
      numReviews: rand(10, 800),
      createdAt: daysAgo(rand(10, 200)),
      updatedAt: daysAgo(rand(0, 9)),
    };
  });
}

// ─── Build Orders ─────────────────────────────────────────────────────────────
function buildOrders(buyers, products) {
  const orders = [];
  const statuses = ['PENDING_PAYMENT', 'PAID', 'SHIPPING', 'COMPLETED', 'CANCELLED'];
  let counter = 100001;

  for (let i = 0; i < 50; i++) {
    const buyer = pick(buyers);
    const addr = buyer.addresses[0];
    const numItems = rand(1, 4);
    const items = [];
    let subtotal = 0;

    for (let j = 0; j < numItems; j++) {
      const prod = products[rand(0, products.length - 1)];
      const variant = prod.variants[0];
      const qty = rand(1, 3);
      const lineTotal = variant.price * qty;
      subtotal += lineTotal;
      items.push({
        skuId: variant.skuId,
        sellerId: prod.sellerId,
        productNameSnapshot: prod.name,
        unitPrice: variant.price,
        quantity: qty,
        lineTotal,
      });
    }

    const shippingFee = subtotal >= 500000 ? 0 : rand(15000, 40000);
    const grandTotal = subtotal + shippingFee;
    const status = pick(statuses);
    const oid = `ORD_${counter++}`;
    const delivRegion = pick(REGIONS);
    const createdAt = daysAgo(rand(0, 90));

    const history = [{ status: 'PENDING_PAYMENT', timestamp: createdAt }];
    if (status !== 'PENDING_PAYMENT' && status !== 'CANCELLED') {
      history.push({ status: 'PAID', timestamp: hoursLater(createdAt, 1) });
    }
    if (status === 'SHIPPING' || status === 'COMPLETED') {
      history.push({ status: 'SHIPPING', timestamp: hoursLater(createdAt, 24) });
    }
    if (status === 'COMPLETED') {
      history.push({ status: 'COMPLETED', timestamp: hoursLater(createdAt, 72) });
    }
    if (status === 'CANCELLED') {
      history.push({ status: 'CANCELLED', timestamp: hoursLater(createdAt, 2) });
    }

    orders.push({
      _id: oid,
      region: buyer.region,
      userId: buyer.uid,
      userRegion: buyer.region,
      deliveryRegion: delivRegion,
      isCrossRegion: buyer.region !== delivRegion,
      status,
      pricing: {
        itemsSubtotal: subtotal,
        shippingFee,
        grandTotal,
        refundedAmount: status === 'CANCELLED' ? grandTotal : 0,
      },
      shippingAddressSnapshot: {
        receiverName: addr.receiverName,
        phoneEncrypted: { iv: 'PLAIN_SEED', ciphertext: buyer.phone },
        fullAddress: `${addr.street}, ${addr.ward}, ${addr.district}, ${addr.province}`,
      },
      items,
      paymentId: status !== 'PENDING_PAYMENT' ? `PAY_${100001 + i}` : null,
      reservationId: `RES_${100001 + i}`,
      statusHistory: history,
      idempotencyKey: `idem_${oid}_${Date.now() + i}`,
      version: 1,
      createdAt,
      updatedAt: history[history.length - 1].timestamp,
    });
  }
  return orders;
}

// ─── Build Payments ───────────────────────────────────────────────────────────
function buildPayments(orders) {
  const providers = ['MOMO', 'VNPAY', 'ZALOPAY', 'COD'];
  return orders
    .filter(o => o.paymentId)
    .map((order, i) => {
      const payStatus = order.status === 'CANCELLED' ? 'REFUNDED'
        : order.status === 'PENDING_PAYMENT' ? 'PENDING'
        : 'SUCCESS';
      return {
        _id: order.paymentId,
        orderId: order._id,
        userId: order.userId,
        userRegion: order.userRegion,
        provider: pick(providers),
        amount: order.pricing.grandTotal,
        refundedAmount: order.status === 'CANCELLED' ? order.pricing.grandTotal : 0,
        status: payStatus,
        retryCount: 0,
        lastRetryAt: null,
        providerRef: `TXN_${Date.now()}_${i}`,
        providerData: {
          bankCode: pick(['VCB', 'ACB', 'TCB', 'BIDV', 'MB']),
          transDate: order.createdAt.toISOString().slice(0, 10),
        },
        version: 1,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });
}

// ─── Build Carts ──────────────────────────────────────────────────────────────
function buildCarts(buyers, products) {
  return buyers.slice(0, 12).map((buyer) => {
    const items = [];
    const count = rand(1, 4);
    for (let i = 0; i < count; i++) {
      const prod = products[rand(0, products.length - 1)];
      const v = prod.variants[0];
      items.push({
        skuId: v.skuId,
        quantity: rand(1, 3),
        selected: Math.random() > 0.2,
        priceSnapshot: v.price,
        productNameSnapshot: prod.name,
        addedAt: daysAgo(rand(0, 7)),
      });
    }
    const createdAt = daysAgo(rand(1, 25));
    return {
      _id: `CART_${buyer.uid}`,
      userId: buyer.uid,
      items,
      expiresAt: new Date(createdAt.getTime() + 30 * 86400000),
      createdAt,
      updatedAt: daysAgo(rand(0, 1)),
    };
  });
}

// ─── Build Refunds ────────────────────────────────────────────────────────────
function buildRefunds(orders) {
  const reasons = ['Khách hàng hủy đơn', 'Hết hàng', 'Sản phẩm lỗi', 'Giao hàng quá chậm', 'Không đúng mô tả'];
  let counter = 100001;
  return orders
    .filter(o => o.status === 'CANCELLED' && o.paymentId)
    .map((order) => {
      const rid = `REF_${counter++}`;
      return {
        _id: rid,
        paymentId: order.paymentId,
        orderId: order._id,
        userId: order.userId,
        amount: order.pricing.grandTotal,
        reason: pick(reasons),
        status: pick(['SUCCESS', 'PROCESSING', 'PENDING']),
        idempotencyKey: `refund_idem_${rid}`,
        providerRefundRef: `REFUND_${rid}`,
        processedAt: daysAgo(rand(0, 5)),
        createdAt: order.updatedAt,
        updatedAt: daysAgo(rand(0, 2)),
      };
    });
}

// ─── Build Notifications ──────────────────────────────────────────────────────
function buildNotifications(orders) {
  const typeMap = {
    COMPLETED: 'ORDER_COMPLETED',
    SHIPPING: 'ORDER_SHIPPED',
    CANCELLED: 'ORDER_CANCELLED',
    PAID: 'PAYMENT_SUCCESS',
    PENDING_PAYMENT: 'ORDER_CREATED',
  };
  const msgMap = {
    ORDER_COMPLETED: 'đã hoàn thành',
    ORDER_SHIPPED: 'đang được giao',
    ORDER_CANCELLED: 'đã bị hủy',
    PAYMENT_SUCCESS: 'đã thanh toán thành công',
    ORDER_CREATED: 'đã được tạo',
  };
  return orders.slice(0, 40).map((order) => {
    const type = typeMap[order.status] || 'ORDER_CREATED';
    return {
      _id: new ObjectId(),
      userId: order.userId,
      type,
      content: `Đơn hàng ${order._id} của bạn ${msgMap[type]}.`,
      metadata: { orderId: order._id, paymentId: order.paymentId },
      isRead: Math.random() > 0.4,
      createdAt: order.updatedAt,
    };
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log('[OK] Connected to MongoDB at', MONGO_URI);
    const db = client.db(DB_NAME);

    // Fetch products from DummyJSON
    console.log('[..] Fetching 50 products from dummyjson.com...');
    const data = await fetchJson('https://dummyjson.com/products?limit=50');
    const rawProducts = data.products;
    console.log(`[OK] Received ${rawProducts.length} products from DummyJSON`);

    // Extract unique categories
    const rawCats = [...new Set(rawProducts.map(p => p.category))];
    const categoryMap = {};
    rawCats.forEach((name, i) => {
      categoryMap[name] = `CAT_${String(i + 1).padStart(3, '0')}`;
    });

    // Build all collections
    const users = buildUsers();
    const sellers = users.filter(u => u.roles.includes('SELLER'));
    const buyers = users.filter(u => u.roles.includes('BUYER'));
    const categories = buildCategories(rawCats);
    const products = buildProducts(rawProducts, categoryMap, sellers);
    const orders = buildOrders(buyers, products);
    const payments = buildPayments(orders);
    const carts = buildCarts(buyers, products);
    const refunds = buildRefunds(orders);
    const notifications = buildNotifications(orders);

    const collections = {
      categories,
      users,
      products,
      orders,
      payments,
      carts,
      refunds,
      notifications,
    };

    // Drop & re-insert each collection
    for (const [col, docs] of Object.entries(collections)) {
      await db.collection(col).drop().catch(() => {});
      if (docs.length > 0) {
        await db.collection(col).insertMany(docs);
        console.log(`  [✓] ${col.padEnd(16)} ${docs.length} docs`);
      } else {
        console.log(`  [~] ${col.padEnd(16)} 0 docs (skipped)`);
      }
    }

    console.log('\n[DONE] Seed complete!');
    console.log('       Compass connection string: mongodb://localhost:27017');
    console.log('       Database: ecommerce_db');
    console.log('\nQuick Compass tips:');
    console.log('  db.products.find({ status: "ACTIVE" }).limit(10)');
    console.log('  db.orders.find({ status: "COMPLETED" }).sort({ createdAt: -1 })');
    console.log('  db.users.find({ roles: "SELLER" })');
    console.log('  db.payments.aggregate([{ $group: { _id: "$provider", total: { $sum: "$amount" } } }])');
  } finally {
    await client.close();
  }
}

main().catch(err => { console.error('[ERROR]', err.message); process.exit(1); });
