const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Redis = require('ioredis');
const RedisMock = require('ioredis-mock');

// Mock ioredis trước khi import file nào gọi tới redis
jest.mock('ioredis', () => require('ioredis-mock'));

const app = require('../app');
const Product = require('../models/product.model');
const redisClient = require('../config/redis');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    
    // Đảm bảo không dính options cũ
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    await redisClient.quit();
});

beforeEach(async () => {
    // Clear Collections
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
    // Clear mock Redis
    await redisClient.flushall();
});

describe('Product Service Caching Logic (Senior Standards)', () => {

    it('Test 1: GET list should Cache Miss on first attempt, then Cache Hit on second attempt', async () => {
        // Mock data vào memory server
        await Product.create({ name: 'iPhone 15', price: 1000, quantity: 10, category: 'Phone' });

        // First attempt - Phải trả về từ MongoDB (do cache trống)
        const res1 = await request(app).get('/api/products');
        
        expect(res1.status).toBe(200);
        expect(res1.body.success).toBe(true);
        expect(res1.body.meta.source).toBe('mongodb');
        expect(res1.body.data.length).toBe(1);

        // Second attempt - Phải trả về từ Redis, không chạm database
        const res2 = await request(app).get('/api/products');
        
        expect(res2.status).toBe(200);
        expect(res2.body.success).toBe(true);
        expect(res2.body.meta.source).toBe('redis'); // Trúng cache
        expect(res2.body.data[0].name).toBe('iPhone 15');
    });

    it('Test 2: Cache Invalidation when Creating new product', async () => {
        // Fake 1 item, sau đó call GET để ghi vào cache
        await Product.create({ name: 'Macbook M1', price: 800, quantity: 5 });
        await request(app).get('/api/products'); // Cache Miss -> Ghi Cache -> OK
        
        // Đảm bảo cache đã dc tạo
        const cachedData = await redisClient.get('products:all');
        expect(cachedData).toBeTruthy(); // Tồn tại
        
        // POST to create item mới -> phải kích hoạt Cache Invalidation (clear redis)
        const resCreate = await request(app).post('/api/products').send({
            name: 'Macbook M3', price: 1600, quantity: 2
        });
        
        expect(resCreate.status).toBe(201);
        
        // Check cache đã bay chưa
        const cachedDataAfterPost = await redisClient.get('products:all');
        expect(cachedDataAfterPost).toBeNull(); // Cache đã bị flush
        
        // Lần get tiếp theo phải lấy từ Mongo và bao gồm luôn cả con M3
        const resListNew = await request(app).get('/api/products');
        expect(resListNew.body.meta.source).toBe('mongodb');
        expect(resListNew.body.data.length).toBe(2);
    });

    it('Test 3: Cache Invalidation when Updating product detail', async () => {
        const item = await Product.create({ name: 'Airpods', price: 150, quantity: 100 });
        
        // Get cache detail
        await request(app).get(`/api/products/${item._id}`);
        // Get cache list
        await request(app).get('/api/products');
        
        // Bắn PUT để update
        const resUpdate = await request(app).put(`/api/products/${item._id}`).send({
            price: 199 // Update giá
        });
        expect(resUpdate.status).toBe(200);
        
        // Check xem 2 keys kia có mất ko
        const cacheList = await redisClient.get('products:all');
        const cacheDetail = await redisClient.get(`products:detail:${item._id}`);
        
        expect(cacheList).toBeNull();
        expect(cacheDetail).toBeNull();
    });

});
