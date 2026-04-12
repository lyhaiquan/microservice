const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const axios = require('axios');
const Cart = require('../models/cart.model');

jest.mock('axios');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    await Cart.deleteMany({});
    jest.clearAllMocks();
});

describe('Cart Service', () => {
    const mockProduct = {
        data: {
            data: {
                _id: 'prod123',
                name: 'Test Product',
                price: 1500,
                quantity: 10
            }
        }
    };

    it('should add item to cart successfully', async () => {
        axios.get.mockResolvedValue(mockProduct);

        const res = await request(app)
            .post('/api/cart')
            .send({
                userId: 'user1',
                productId: 'prod123',
                quantity: 2
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].quantity).toBe(2);
        expect(res.body.data.items[0].name).toBe('Test Product');
        expect(res.body.data.items[0].price).toBe(1500);
        
        const cartInDb = await Cart.findOne({ userId: 'user1' });
        expect(cartInDb.items[0].quantity).toBe(2);
    });

    it('should return 400 if validation fails', async () => {
        const res = await request(app)
            .post('/api/cart')
            .send({
                userId: 'user1',
                // Missing productId
                quantity: 2
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return error if product not found', async () => {
        axios.get.mockRejectedValue({ response: { status: 404 } });

        const res = await request(app)
            .post('/api/cart')
            .send({
                userId: 'user1',
                productId: 'prod999',
                quantity: 1
            });

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Product not found');
    });

    it('should return error if requested quantity exceeds stock', async () => {
        axios.get.mockResolvedValue(mockProduct);

        const res = await request(app)
            .post('/api/cart')
            .send({
                userId: 'user1',
                productId: 'prod123',
                quantity: 15 // Exceeds 10
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Insufficient stock');
    });

    it('should increment quantity if product already exists in cart', async () => {
        axios.get.mockResolvedValue(mockProduct);

        await request(app).post('/api/cart').send({
            userId: 'user1',
            productId: 'prod123',
            quantity: 3
        });

        const res = await request(app).post('/api/cart').send({
            userId: 'user1',
            productId: 'prod123',
            quantity: 4
        });

        expect(res.status).toBe(200);
        expect(res.body.data.items[0].quantity).toBe(7);
        
        const cart = await Cart.findOne({ userId: 'user1' });
        expect(cart.items[0].quantity).toBe(7);
    });

    it('should return error if incrementing exceeds product stock', async () => {
        axios.get.mockResolvedValue(mockProduct); // Stock 10

        await request(app).post('/api/cart').send({
            userId: 'user1',
            productId: 'prod123',
            quantity: 8
        });

        const res = await request(app).post('/api/cart').send({
            userId: 'user1',
            productId: 'prod123',
            quantity: 3
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('exceeds available stock');
    });
});
