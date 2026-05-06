const mongoose = require('mongoose');

// D7: Records - stores concern records and resolved conversations
const recordSchema = new mongoose.Schema({
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    concernType: { type: String, required: true },
    issue: { type: String, required: true },
    feedback: { type: String },
    resolution: { type: String },
    conversation: [{
        sender: { type: String, enum: ['user', 'admin'] },
        message: String,
        timestamp: { type: Date, default: Date.now }
    }],
    recordedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Record', recordSchema);
