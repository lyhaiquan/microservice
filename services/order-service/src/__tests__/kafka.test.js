/**
 * Unit Tests cho Kafka connectKafka() — Order Service
 * 
 * Test coverage:
 * 1. Kết nối thành công lần đầu
 * 2. Retry logic khi fail → thành công sau vài lần  
 * 3. THROW error khi hết retries (Bug #3 fix verification)
 * 4. Producer & Consumer đều được connect
 */

// Mock kafkajs trước khi import
jest.mock('kafkajs', () => {
    const mockProducerConnect = jest.fn();
    const mockConsumerConnect = jest.fn();

    return {
        Kafka: jest.fn().mockImplementation(() => ({
            producer: jest.fn().mockReturnValue({
                connect: mockProducerConnect,
                send: jest.fn()
            }),
            consumer: jest.fn().mockReturnValue({
                connect: mockConsumerConnect,
                subscribe: jest.fn(),
                run: jest.fn()
            })
        })),
        Partitioners: {
            DefaultPartitioner: jest.fn()
        },
        _mocks: { mockProducerConnect, mockConsumerConnect }
    };
});

const { _mocks } = require('kafkajs');
const { connectKafka, producer, consumer } = require('../config/kafka');

describe('connectKafka — Order Service', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =============================================
    // Test 1: Kết nối thành công lần đầu
    // =============================================
    it('should connect producer and consumer on first attempt', async () => {
        _mocks.mockProducerConnect.mockResolvedValueOnce({});
        _mocks.mockConsumerConnect.mockResolvedValueOnce({});

        await connectKafka();

        expect(_mocks.mockProducerConnect).toHaveBeenCalledTimes(1);
        expect(_mocks.mockConsumerConnect).toHaveBeenCalledTimes(1);
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Kafka Producer & Consumer connected successfully')
        );
    });

    // =============================================
    // Test 2: Retry khi producer fail
    // =============================================
    it('should retry when connection fails and succeed eventually', async () => {
        _mocks.mockProducerConnect
            .mockRejectedValueOnce(new Error('Broker not available'))
            .mockResolvedValueOnce({});
        _mocks.mockConsumerConnect.mockResolvedValue({});

        await connectKafka();

        // Phải gọi producer.connect 2 lần
        expect(_mocks.mockProducerConnect).toHaveBeenCalledTimes(2);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Retries left: 4')
        );
    }, 15000);

    // =============================================
    // Test 3: CRITICAL — Throw khi hết retries (Bug #3)
    // =============================================
    it('should THROW error after 5 failed attempts (Bug #3 fix)', async () => {
        _mocks.mockProducerConnect.mockRejectedValue(new Error('Connection refused'));
        _mocks.mockConsumerConnect.mockRejectedValue(new Error('Connection refused'));

        await expect(connectKafka())
            .rejects
            .toThrow('Cannot connect to Kafka after 5 attempts');

        expect(_mocks.mockProducerConnect).toHaveBeenCalledTimes(5);
    }, 60000);

    // =============================================
    // Test 4: Consumer fail cũng trigger retry
    // =============================================
    it('should retry if consumer connection fails', async () => {
        _mocks.mockProducerConnect.mockResolvedValue({});
        _mocks.mockConsumerConnect
            .mockRejectedValueOnce(new Error('Consumer group error'))
            .mockResolvedValueOnce({});

        await connectKafka();

        // Consumer được gọi 2 lần, producer cũng bị gọi lại vì chúng nằm cùng try block
        expect(_mocks.mockConsumerConnect).toHaveBeenCalledTimes(2);
    }, 15000);
});
