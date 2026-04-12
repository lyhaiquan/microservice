/**
 * Unit Tests cho Error Handling Middleware & Controller Pattern
 * 
 * Test coverage:
 * 1. Error handler middleware nhận đúng (err, req, res, next)
 * 2. next(error) trong controller chuyển lỗi đến error handler
 * 3. Error handler trả đúng format JSON
 * 4. Status code được truyền đúng từ error.status
 * 5. Async errors trong controller KHÔNG crash process
 */
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/User');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
});

afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany();
    }
});

describe('Auth Error Handling (Bug #2 fix — next(error) pattern)', () => {

    // =============================================
    // Test 1: Error handler middleware có format đúng
    // =============================================
    it('should return JSON error response via error handler middleware', async () => {
        // Gửi request thiếu fields → expect controlled 400, KHÔNG crash
        const res = await request(app)
            .post('/api/auth/register')
            .send({}); // Thiếu tất cả fields

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('message', 'Missing required fields');
    });

    // =============================================
    // Test 2: next(error) không crash khi DB error
    // =============================================
    it('should handle database errors gracefully via next(error)', async () => {
        // Tạo user trùng email → lần 2 phải trả 400, KHÔNG crash
        const user = {
            name: 'Test',
            email: 'dup@test.com',
            password: 'password123'
        };

        const first = await request(app)
            .post('/api/auth/register')
            .send(user);
        expect(first.status).toBe(201);

        const second = await request(app)
            .post('/api/auth/register')
            .send(user);
        expect(second.status).toBe(400);
        expect(second.body.message).toBe('User already exists');
    });

    // =============================================
    // Test 3: Login error delegation
    // =============================================
    it('should delegate login errors through next(error) without crashing', async () => {
        // Login user không tồn tại
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'nonexistent@nowhere.com',
                password: 'whatever'
            });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('message', 'Invalid credentials');
    });

    // =============================================
    // Test 4: Multiple sequential errors KHÔNG crash
    // =============================================
    it('should handle multiple sequential errors without process crash', async () => {
        // Fire 10 bad requests liên tiếp → process vẫn sống
        const promises = Array.from({ length: 10 }, () =>
            request(app)
                .post('/api/auth/register')
                .send({}) // Invalid payload
        );

        const results = await Promise.all(promises);

        results.forEach(res => {
            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Missing required fields');
        });
    });

    // =============================================
    // Test 5: Error handler trả đúng status code từ error.status  
    // =============================================
    it('should pass custom status codes through the error handler', async () => {
        // Login với password sai → 401, không 500
        const user = {
            name: 'Status Test',
            email: 'status@test.com',
            password: 'correct123'
        };
        await request(app).post('/api/auth/register').send(user);

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'status@test.com',
                password: 'wrong_pass'
            });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid credentials');
    });

    // =============================================
    // Test 6: Successful flow vẫn hoạt động bình thường
    // =============================================
    it('should still handle successful register + login flow correctly', async () => {
        const user = {
            name: 'Happy Path',
            email: 'happy@test.com',
            password: 'secure123'
        };

        const regRes = await request(app)
            .post('/api/auth/register')
            .send(user);
        expect(regRes.status).toBe(201);
        expect(regRes.body).toHaveProperty('token');
        expect(regRes.body.user.email).toBe('happy@test.com');

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: user.email, password: user.password });
        expect(loginRes.status).toBe(200);
        expect(loginRes.body).toHaveProperty('token');
        expect(loginRes.body.message).toBe('Login successful');
    });
});
