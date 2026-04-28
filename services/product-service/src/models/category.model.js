const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Cho phép custom ID như CAT_001
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    parentId: { type: String, default: null, index: true },
    path: [{ type: String }],
    level: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true,
    _id: false // Vô hiệu hóa auto _id (ObjectId) để dùng string ID
});

// Thêm plugin tự gen _id dạng string nếu cần thiết, nhưng ở đây ta set tay
categorySchema.index({ slug: 1 }, { unique: true });

const Category = mongoose.model('Category', categorySchema);
module.exports = Category;
