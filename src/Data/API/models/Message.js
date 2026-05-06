const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    message: { type: String, required: true },
    response: { type: String },
    status: {
        type: String,
        enum: ['pending', 'acknowledged', 'resolved', 'closed'],
        default: 'pending'
    },
    concernType: {
        type: String,
        enum: ['refund', 'payment', 'reservation', 'general', 'membership'],
        required: true
    },
    conversation: [{
        sender: { type: String, enum: ['user', 'admin'] },
        message: String,
        timestamp: { type: Date, default: Date.now }
    }],
    resolution: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date }
});

// Update the updatedAt field on save
messageSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Message', messageSchema);