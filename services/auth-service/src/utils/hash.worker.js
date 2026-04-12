const { parentPort, workerData } = require('worker_threads');
const bcrypt = require('bcryptjs');

// Nhận job từ Main Thread
const run = async () => {
    try {
        const { password, saltRounds } = workerData;
        const salt = await bcrypt.genSalt(saltRounds);
        const hash = await bcrypt.hash(password, salt);
        1
        // Trả kết quả về cho Main Thread
        parentPort.postMessage({ success: true, hash });
    } catch (error) {
        parentPort.postMessage({ success: false, error: error.message });
    }
};

run();
