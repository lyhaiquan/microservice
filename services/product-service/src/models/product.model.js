const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    price: {
        type: Number,
        required: [true, 'Product price is required'],
        min: [0, 'Price must be greater than or equal to 0']
    },
    quantity: {
        type: Number,
        required: [true, 'Stock quantity is required'],
        default: 0,
        min: [0, 'Quantity cannot be negative']
    },
    images: [{
        type: String
    }],
    category: {
        type: String,
        index: true
    }
}, {
    timestamps: true,
    optimisticConcurrency: true // Bật OCC để chống hạ tồn kho sai lệch
});

// Text index để search tên sản phẩm hiệu quả
productSchema.index({ name: 'text', description: 'text' });


const Product = mongoose.model('Product', productSchema);

module.exports = Product;
