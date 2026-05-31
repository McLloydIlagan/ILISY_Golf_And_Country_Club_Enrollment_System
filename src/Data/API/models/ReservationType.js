const mongoose = require('mongoose');

const reservationTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    category: { 
        type: String, 
        enum: ['golf', 'amenities', 'events', 'accommodation', 'premium'],
        required: true 
    },
    icon: { type: String, default: '🏌️' },
    description: { type: String },
    basePrice: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    
    // Dynamic options
    options: [{
        optionName: { type: String, required: true },
        optionValues: [{
            value: { type: String, required: true },
            price: { type: Number, required: true },
            capacity: { type: Number },
            isAvailable: { type: Boolean, default: true }
        }]
    }],
    
    // Time slots management
    timeSlots: [{
        time: { type: String, required: true },
        capacity: { type: Number, default: 10 },
        booked: { type: Number, default: 0 },
        isAvailable: { type: Boolean, default: true }
    }],
    
    // Date-specific availability
    dateOverrides: [{
        date: { type: Date },
        isClosed: { type: Boolean, default: false },
        customCapacity: { type: Number },
        customTimeSlots: [{ type: String }]
    }],
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReservationType', reservationTypeSchema);