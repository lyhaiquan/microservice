const express = require('express');
const cors = require('cors');
const orderRoutes = require('./routes/order.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/orders', orderRoutes);

app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Internal Server Error' });
});

module.exports = app;
