const mongoose = require('mongoose');

// Singleton document — only one settings record ever exists (upserted by key)
const membershipSettingsSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },

    // Pricing
    annualFee: { type: Number, default: 1000000 },   // ₱ membership fee
    currency: { type: String, default: 'PHP' },

    // Member discount applied to reservation prices (0–1, e.g. 0.8 = 20% off)
    memberDiscountRate: { type: Number, default: 0.8, min: 0, max: 1 },

    // Membership duration in days
    durationDays: { type: Number, default: 365 },

    // Perks / incentives list
    perks: {
        type: [String],
        default: [
            '20% discount on all facility reservations',
            'Priority booking for tee times',
            'Access to exclusive member-only events',
            'Complimentary use of driving range (2 hrs/day)',
            'Free locker room access',
            'Guest passes (2 per year)'
        ]
    },

    // Membership tier label shown to users
    tierName: { type: String, default: 'Annual Member' },
    tierDescription: { type: String, default: 'Full access to all ILISY Golf & Country Club facilities for one year.' },

    // Whether new membership applications are currently open
    enrollmentOpen: { type: Boolean, default: true },

    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('MembershipSettings', membershipSettingsSchema);
