const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/product.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/products', productRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: 'Internal Server Error', message: err.message });
});

module.exports = app;
