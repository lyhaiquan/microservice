const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const Order = require('../models/order.model');

// Mock Kafka module
jest.mock('../config/kafka', () => {
    return {
        producer: {
            send: jest.fn().mockResolvedValue({})
        },
        connectProducer: jest.fn().mockResolvedValue({})
    };
});

// Import sau khi mock
const { producer } = require('../config/kafka');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    await Order.deleteMany({});
    jest.clearAllMocks();
});

describe('Order Service', () => {
    it('should create an order and emit kafka event successfully', async () => {
        const userId = new mongoose.Types.ObjectId().toString();
        const productId = new mongoose.Types.ObjectId().toString();
        const payload = {
            userId: userId,
            items: [
                {
                    productId: productId,
                    quantity: 2,
                    price: 1500,
                    name: 'Test Product'
                }
            ],
            totalAmount: 3000
        };

        const res = await request(app)
            .post('/api/orders')
            .send(payload);

        // API assertions
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.userId).toBe(userId);
        expect(res.body.data.status).toBe('PENDING');

        // Verify Database
        const orderInDb = await Order.findById(res.body.data._id);
        expect(orderInDb).not.toBeNull();
        expect(orderInDb.totalAmount).toBe(3000);

        // Verify Kafka Producer called
        expect(producer.send).toHaveBeenCalledTimes(1);
        
        // Assert Kafka payload format
        const sendArgs = producer.send.mock.calls[0][0];
        expect(sendArgs.topic).toBe('order-events');
        expect(sendArgs.messages).toHaveLength(1);
        
        const messageValue = JSON.parse(sendArgs.messages[0].value);
        expect(messageValue.type).toBe('ORDER_CREATED');
        expect(messageValue.orderId).toBe(res.body.data._id);
        expect(messageValue.userId).toBe(userId);
        expect(messageValue.items).toHaveLength(1);
        expect(messageValue.totalAmount).toBe(3000);
        expect(messageValue.status).toBe('PENDING');
        expect(messageValue.timestamp).toBeDefined();
    });

    it('should return 400 for missing required fields', async () => {
        const res = await request(app)
            .post('/api/orders')
            .send({
                userId: 'user1'
                // thiếu items, totalAmount
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        // Producer không được phép gọi nếu validate failed
        expect(producer.send).not.toHaveBeenCalled();
    });
});
