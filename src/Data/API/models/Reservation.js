const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    date: { type: Date, required: true },
    timeSlot: { type: String, required: true },
    status: {
        type: String,
        enum: ['pending', 'approved', 'confirmed', 'cancelled', 'completed'],
        default: 'pending'
    },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    amount: { type: Number, required: true },

    // NEW: Price breakdown fields for transparency
    basePrice: { type: Number, default: 0 },
    addOnsTotal: { type: Number, default: 0 },
    serviceCharge: { type: Number, default: 0, description: '10% service charge' },
    memberDiscount: { type: Number, default: 0, description: '20% member discount if applicable' },

    // NEW: Reservation type information
    reservationTypeName: { type: String },
    reservationTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReservationType' },

    // NEW: Payment method tracking
    paymentMethod: { type: String },
    maskedCard: { type: String },
    cardToken: { type: String },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Reservation', reservationSchema);