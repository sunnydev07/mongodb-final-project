const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 5000 },
    category: { type: String, required: true },
    subCategory: { type: String, trim: true },
    brand: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    discountedPrice: { type: Number, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    inStock: { type: Boolean, default: true },
    tags: [{ type: String, lowercase: true, trim: true }],
    images: [String],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    seller: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, required: true },
      rating: { type: Number, default: 0, min: 0, max: 5 },
    },
    specifications: {
      warranty: String,
      color: String,
      weight: Number,
      attributes: mongoose.Schema.Types.Mixed,
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes for optimal query performance (ESR-friendly compound indexes).
productSchema.index({ category: 1, price: -1 });
productSchema.index({ brand: 1, price: -1 });
productSchema.index({ tags: 1 });
productSchema.index({ name: 'text', description: 'text', brand: 'text', category: 'text' });
productSchema.index({ location: '2dsphere' });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ isActive: 1, inStock: 1, price: 1 });
productSchema.index({ 'seller.id': 1 });

// Auto-calculate discountedPrice before save.
productSchema.pre('save', function calcDiscount() {
  this.discountedPrice = Math.round(this.price - (this.price * this.discountPercentage) / 100);
  this.inStock = this.stock > 0;
});

module.exports = mongoose.model('Product', productSchema);
