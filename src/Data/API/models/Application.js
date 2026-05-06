const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    type: {
        type: String,
        enum: ['membership', 'reservation'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'processing', 'completed'],
        default: 'pending'
    },
    details: { type: mongoose.Schema.Types.Mixed },
    
    // NEW: Payment fields for admin validation
    paymentMethod: { type: String, enum: ['GCash', 'Maya', 'BPI', 'BDO', 'Cash'] },
    accountNumber: { type: String },
    referenceNumber: { type: String },
    receiptUrl: { type: String },
    amount: { type: Number },
    paymentStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
    },
    adminNotes: { type: String },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Application', applicationSchema);