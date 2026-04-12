/**
 * Unit Tests cho Resilient MongoDB Connection (database.js)
 * 
 * Test coverage:
 * 1. Kết nối thành công lần đầu
 * 2. Retry logic khi fail → thành công sau vài lần
 * 3. Throw error sau khi hết 5 retries
 * 4. Mongoose options đúng cho Replica Set
 * 5. Event listeners được đăng ký
 */
const mongoose = require('mongoose');

// Mock mongoose.connect
jest.mock('mongoose', () => {
    const originalModule = jest.requireActual('mongoose');
    
    // Mock tất cả event listeners
    const listeners = {};
    const mockConnection = {
        on: jest.fn((event, handler) => {
            listeners[event] = handler;
        }),
        _listeners: listeners
    };
    
    return {
        ...originalModule,
        connect: jest.fn(),
        connection: mockConnection,
    };
});

// Import sau khi mock
const connectDB = require('../database');

describe('connectDB — Resilient MongoDB Connection', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset console spies
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =============================================
    // Test 1: Kết nối thành công ngay lần đầu
    // =============================================
    it('should connect successfully on first attempt', async () => {
        mongoose.connect.mockResolvedValueOnce({});

        await connectDB('mongodb://localhost:27017/test');

        expect(mongoose.connect).toHaveBeenCalledTimes(1);
        expect(mongoose.connect).toHaveBeenCalledWith(
            'mongodb://localhost:27017/test',
            expect.objectContaining({
                readPreference: 'primary',
                retryWrites: true,
                retryReads: true,
                serverSelectionTimeoutMS: 10000,
                heartbeatFrequencyMS: 5000,
                maxPoolSize: 10,
                minPoolSize: 2,
            })
        );
    });

    // =============================================
    // Test 2: writeConcern & readConcern cho Replica Set
    // =============================================
    it('should use majority write/read concern for Replica Set consistency', async () => {
        mongoose.connect.mockResolvedValueOnce({});

        await connectDB('mongodb://node1,node2,node3/shopee?replicaSet=dbrs');

        const callOptions = mongoose.connect.mock.calls[0][1];
        expect(callOptions.writeConcern).toEqual({ w: 'majority' });
        expect(callOptions.readConcern).toEqual({ level: 'majority' });
    });

    // =============================================
    // Test 3: Retry logic — fail 2 lần, thành công lần 3
    // =============================================
    it('should retry on failure and succeed on third attempt', async () => {
        mongoose.connect
            .mockRejectedValueOnce(new Error('ECONNREFUSED'))
            .mockRejectedValueOnce(new Error('ReplicaSetNoPrimary'))
            .mockResolvedValueOnce({});

        await connectDB('mongodb://localhost/test');

        // Phải gọi connect đúng 3 lần
        expect(mongoose.connect).toHaveBeenCalledTimes(3);
        // Phải log lỗi 2 lần
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Retries left: 4'),
            // Không check exact message vì format khác nhau
        );
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Retries left: 3'),
        );
    }, 30000); // Timeout dài vì có delay 3s giữa retries

    // =============================================
    // Test 4: Throw error sau 5 lần fail
    // =============================================
    it('should throw error after exhausting all 5 retries', async () => {
        const connectionError = new Error('connect ECONNREFUSED 127.0.0.1:27017');
        mongoose.connect.mockRejectedValue(connectionError);

        await expect(connectDB('mongodb://localhost/test'))
            .rejects
            .toThrow('Cannot connect to MongoDB after 5 attempts');

        // Phải gọi connect đúng 5 lần
        expect(mongoose.connect).toHaveBeenCalledTimes(5);
    }, 60000);

    // =============================================
    // Test 5: Event listeners được đăng ký
    // =============================================
    it('should register all Mongoose event listeners', async () => {
        mongoose.connect.mockResolvedValueOnce({});

        await connectDB('mongodb://localhost/test');

        // 4 events phải được đăng ký
        expect(mongoose.connection.on).toHaveBeenCalledWith('connected', expect.any(Function));
        expect(mongoose.connection.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
        expect(mongoose.connection.on).toHaveBeenCalledWith('reconnected', expect.any(Function));
        expect(mongoose.connection.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    // =============================================
    // Test 6: Connection pool config
    // =============================================
    it('should configure connection pool correctly', async () => {
        mongoose.connect.mockResolvedValueOnce({});

        await connectDB('mongodb://localhost/test');

        const callOptions = mongoose.connect.mock.calls[0][1];
        expect(callOptions.maxPoolSize).toBe(10);
        expect(callOptions.minPoolSize).toBe(2);
        expect(callOptions.connectTimeoutMS).toBe(10000);
        expect(callOptions.socketTimeoutMS).toBe(45000);
    });

    // =============================================
    // Test 7: Timeout settings cho Primary discovery
    // =============================================
    it('should set proper timeout for server selection (Primary discovery)', async () => {
        mongoose.connect.mockResolvedValueOnce({});

        await connectDB('mongodb://localhost/test');

        const callOptions = mongoose.connect.mock.calls[0][1];
        expect(callOptions.serverSelectionTimeoutMS).toBe(10000);
        expect(callOptions.heartbeatFrequencyMS).toBe(5000);
    });
});
