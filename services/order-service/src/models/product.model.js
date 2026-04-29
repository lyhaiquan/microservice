const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
    skuId: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    totalStock: { type: Number, required: true, min: 0, default: 0 },
    availableStock: { type: Number, required: true, min: 0, default: 0 },
    reservedStock: { type: Number, required: true, min: 0, default: 0 },
    version: { type: Number, default: 1 }
}, { _id: false });

const productSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    sellerId: { type: String, required: true, index: true },
    sellerRegion: { type: String, enum: ['NORTH', 'CENTRAL', 'SOUTH'], required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    categoryId: { type: String, required: true },
    variants: [variantSchema],
    status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'BANNED'],
        default: 'ACTIVE'
    },
    rating: { type: Number, default: 0, index: true },
    numReviews: { type: Number, default: 0 }
}, {

    timestamps: true
});

productSchema.index({ categoryId: 1, status: 1, 'variants.0.price': 1 });
productSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
productSchema.index({ sellerRegion: 1, status: 1 });
productSchema.index({ status: 1, createdAt: -1 }); // Index cho Admin Stats
productSchema.index({ name: 'text' });


const Product = mongoose.model('Product', productSchema);

module.exports = Product;
