const mongoose = require('mongoose');
const Product = require('../models/product.model');
const StockConsumer = require('../services/stock.consumer');
const { producer, consumer } = require('../config/kafka');

// Mock Kafka
jest.mock('../config/kafka', () => ({
    producer: {
        send: jest.fn().mockResolvedValue({})
    },
    consumer: {
        subscribe: jest.fn().mockResolvedValue({}),
        run: jest.fn()
    }
}));

// Mock Product Model
jest.mock('../models/product.model');

describe('Product Stock Saga Consumer (Unit Mocked)', () => {
    let mockSession;
    
    beforeEach(() => {
        mockSession = {
            startTransaction: jest.fn(),
            commitTransaction: jest.fn(),
            abortTransaction: jest.fn(),
            endSession: jest.fn(),
            inTransaction: jest.fn().mockReturnValue(true)
        };
        jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
        jest.clearAllMocks();
    });

    afterEach(() => {
        mongoose.startSession.mockRestore();
    });

    it('should reserve stock and emit STOCK_RESERVED when all items are sufficient', async () => {
        // Setup Mocks
        Product.findOneAndUpdate.mockResolvedValue({ _id: 'prod1', quantity: 8 });

        consumer.run.mockImplementation(async ({ eachMessage }) => {
            const message = {
                value: Buffer.from(JSON.stringify({
                    type: 'ORDER_CREATED',
                    orderId: 'order123',
                    totalAmount: 1000,
                    items: [{
                        productId: 'prod1',
                        quantity: 2,
                        name: 'Laptop'
                    }]
                }))
            };
            await eachMessage({ topic: 'order-events', partition: 0, message });
        });

        await StockConsumer.listenOrderEvents();

        // Verify findOneAndUpdate called with session
        expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ _id: 'prod1', quantity: { $gte: 2 } }),
            expect.any(Object),
            expect.objectContaining({ session: mockSession })
        );

        // Verify Success Emission
        const sendArgs = producer.send.mock.calls[0][0];
        const payload = JSON.parse(sendArgs.messages[0].value);
        expect(payload.status).toBe('RESERVED');
        expect(mockSession.commitTransaction).toHaveBeenCalled();
    });

    it('should rollback and emit STOCK_FAILED when any item is insufficient', async () => {
        // Setup Mocks: Second call fails (returns null)
        Product.findOneAndUpdate.mockResolvedValueOnce({ _id: 'prod1', quantity: 9 })
                                 .mockResolvedValueOnce(null);

        consumer.run.mockImplementation(async ({ eachMessage }) => {
            const message = {
                value: Buffer.from(JSON.stringify({
                    type: 'ORDER_CREATED',
                    orderId: 'order456',
                    totalAmount: 2000,
                    items: [
                        { productId: 'prod1', quantity: 1, name: 'Item 1' },
                        { productId: 'prod2', quantity: 5, name: 'Item 2' }
                    ]
                }))
            };
            await eachMessage({ topic: 'order-events', partition: 0, message });
        });

        await StockConsumer.listenOrderEvents();

        // Verify Abort and Failure Emission
        expect(mockSession.abortTransaction).toHaveBeenCalled();
        const sendArgs = producer.send.mock.calls[0][0];
        const payload = JSON.parse(sendArgs.messages[0].value);
        expect(payload.status).toBe('FAILED');
        expect(payload.reason).toContain('không đủ tồn kho');
    });
});
