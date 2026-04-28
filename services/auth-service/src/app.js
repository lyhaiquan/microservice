const express = require('express');
const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '../internal_debug.log');
function log(msg) { fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`); }
log('App starting...');

const cors = require('cors');
const authRoutes = require('./routes/auth.routes');

const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    log(`Global Error Handler: ${err.message}\nStack: ${err.stack}`);
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

module.exports = app;
