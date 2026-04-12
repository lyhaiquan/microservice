const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    password: {
        type: String,
        required: true,
        select: false // Do not return password by default
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    }
}, {
    timestamps: true,
    versionKey: '__v'
});

const { Worker } = require('worker_threads');
const path = require('path');

// Hash password before saving using a dedicated Worker Thread
userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;

    // Wrap worker inside a Promise for clean async/await with Mongoose
    const hash = await new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, '../utils/hash.worker.js'), {
            workerData: { password: this.password, saltRounds: 10 }
        });

        worker.on('message', (msg) => {
            if (msg.success) {
                resolve(msg.hash);
            } else {
                reject(new Error('Hashing failed in worker thread: ' + msg.error));
            }
        });

        worker.on('error', (err) => reject(err));
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });

    this.password = hash;
});

// Method to compare password for login
userSchema.methods.comparePassword = async function(candidatePassword) {
    return require('bcryptjs').compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
