/**
 * Helper to run a MongoDB transaction with automatic retries for transient errors.
 * 
 * @param {import('mongoose')} mongoose - Mongoose instance
 * @param {Function} operations - Async function containing the transaction logic, taking the session as argument
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 */
const runTransactionWithRetry = async (mongoose, operations, maxRetries = 3) => {
    let retries = 0;
    while (true) {
        const session = await mongoose.startSession();
        session.startTransaction({
            readPreference: 'primary',
            readConcern: { level: 'local' },
            // j:true yêu cầu flush xuống disk vật lý trên TỪNG node cross-region
            // trước khi ack → bottleneck lớn khi replication HN-DN-HCM.
            // Bỏ j:true: chỉ cần majority nodes xác nhận đã ghi vào RAM/journal buffer,
            // không cần flush disk đồng bộ → giảm latency ~200-500ms mỗi transaction.
            // Trade-off: mất an toàn nếu cả primary + majority secondary crash đồng thời
            // (xác suất cực thấp trong thực tế production).
            writeConcern: { w: 'majority' }
        });

        try {
            const result = await operations(session);
            await commitWithRetry(session);
            return result;
        } catch (error) {
            await session.abortTransaction();
            
            // Handle TransientTransactionError or Optimistic Locking Failure
            const isTransient = error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError');
            const isOptimisticFail = error.isConcurrentUpdate === true;

            if ((isTransient || isOptimisticFail) && retries < maxRetries) {
                retries++;
                const errType = isOptimisticFail ? 'ConcurrentUpdateError' : 'TransientTransactionError';
                console.warn(`[Transaction] ${errType} caught. Retrying transaction (Attempt ${retries}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 500 * retries)); // Exponential backoff
                continue;
            }
            
            // Re-throw if it's not transient or max retries reached
            throw error;
        } finally {
            await session.endSession();
        }
    }
};

/**
 * Helper to commit a transaction with retry logic for UnknownTransactionCommitResult
 */
const commitWithRetry = async (session) => {
    while (true) {
        try {
            await session.commitTransaction();
            console.log('[Transaction] Committed successfully.');
            break;
        } catch (error) {
            if (error.hasErrorLabel && error.hasErrorLabel('UnknownTransactionCommitResult')) {
                console.warn('[Transaction] UnknownTransactionCommitResult. Retrying commit...');
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
            throw error;
        }
    }
};

module.exports = {
    runTransactionWithRetry
};
