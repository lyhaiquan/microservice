/**
 * Unit Tests cho Kafka connectKafka() — Payment Service
 *
 * Mirrors order-service kafka test for consistency.
 */

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
const { connectKafka } = require('../config/kafka');

describe('connectKafka — Payment Service', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should connect successfully on first attempt', async () => {
        _mocks.mockProducerConnect.mockResolvedValueOnce({});
        _mocks.mockConsumerConnect.mockResolvedValueOnce({});

        await connectKafka();

        expect(_mocks.mockProducerConnect).toHaveBeenCalledTimes(1);
        expect(_mocks.mockConsumerConnect).toHaveBeenCalledTimes(1);
    });

    it('should THROW after 5 failed retries (Bug #3 fix)', async () => {
        _mocks.mockProducerConnect.mockRejectedValue(new Error('Broker unreachable'));

        await expect(connectKafka())
            .rejects
            .toThrow('Cannot connect to Kafka after 5 attempts');

        expect(_mocks.mockProducerConnect).toHaveBeenCalledTimes(5);
    }, 60000);

    it('should retry and succeed on second attempt', async () => {
        _mocks.mockProducerConnect
            .mockRejectedValueOnce(new Error('Timeout'))
            .mockResolvedValueOnce({});
        _mocks.mockConsumerConnect.mockResolvedValue({});

        await connectKafka();

        expect(_mocks.mockProducerConnect).toHaveBeenCalledTimes(2);
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('connected successfully')
        );
    }, 15000);
});
