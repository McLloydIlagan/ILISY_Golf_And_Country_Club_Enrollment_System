const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    paymentMethod: {
        type: String,
        enum: ['GCash', 'Maya', 'BPI', 'BDO', 'Cash', 'Metrobank', 'Card'],
        required: true
    },
    cardToken: { type: String },
    maskedCard: { type: String },
    amount: { type: Number, required: true },
    transactionType: {
        type: String,
        enum: ['membership', 'reservation'],
        required: true
    },
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation' },
    paymentStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    transactionId: { type: String, unique: true },
    receiptUrl: { type: String },

    // NEW: Price breakdown for transparency
    basePrice: { type: Number, default: 0 },
    addOnsTotal: { type: Number, default: 0 },
    serviceCharge: { type: Number, default: 0, description: '10% service charge' },
    memberDiscount: { type: Number, default: 0, description: '20% member discount if applicable' },

    refundReason: { type: String },
    createdAt: { type: Date, default: Date.now },
    processedAt: { type: Date }
});

module.exports = mongoose.model('Payment', paymentSchema);