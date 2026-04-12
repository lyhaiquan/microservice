const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Order = require('../models/order.model');
const OrderConsumer = require('../services/order.consumer');

// Mock Kafka
jest.mock('../config/kafka', () => ({
    consumer: {
        subscribe: jest.fn().mockResolvedValue({}),
        run: jest.fn().mockResolvedValue({})
    }
}));

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

describe('Order Saga Consumer', () => {
    it('should update status to CANCELLED when STOCK_FAILED event is received', async () => {
        // 1. Create a pending order
        const order = await Order.create({
            userId: new mongoose.Types.ObjectId(),
            items: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 100, name: 'Test' }],
            totalAmount: 100,
            status: 'PENDING'
        });

        // 2. Mock event data
        const eventData = {
            orderId: order._id.toString(),
            status: 'FAILED',
            reason: 'Out of stock'
        };

        // 3. Call handler directly (Testing the logic unit-wise)
        await OrderConsumer.handleStockEvent(eventData);

        // 4. Verify DB
        const updatedOrder = await Order.findById(order._id);
        expect(updatedOrder.status).toBe('CANCELLED');
    });

    it('should log but not change status when STOCK_RESERVED event is received', async () => {
        const order = await Order.create({
            userId: new mongoose.Types.ObjectId(),
            items: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 100, name: 'Test' }],
            totalAmount: 100,
            status: 'PENDING'
        });

        const eventData = {
            orderId: order._id.toString(),
            status: 'RESERVED'
        };

        await OrderConsumer.handleStockEvent(eventData);

        const updatedOrder = await Order.findById(order._id);
        expect(updatedOrder.status).toBe('PENDING'); // Should stay PENDING until payment or manual update
    });
});
