const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const { authMiddleware } = require('../middleware/auth');

// 2.0 Membership Application - Level 3: 2.2.1 Validate Application Details
router.post('/apply', authMiddleware, async (req, res) => {
    try {
        const { userId, firstName, lastName, email, phone, gender, age, address } = req.body;

        if (!firstName || !lastName || !email || !phone || !userId) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        const phoneRegex = /^[0-9+\-\s]{7,15}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ message: 'Invalid phone number format' });
        }

        // Level 3: 2.2.1 - Check membership status > D1: Registered Accounts
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (user.membershipStatus === 'active') {
            return res.status(400).json({ message: 'User already has an active membership' });
        }

        const application = new Application({
            userId, firstName, lastName, email, phone,
            type: 'membership',
            details: { gender, age, address },
            status: 'pending'
        });

        await application.save();

        res.json({
            message: 'Membership application submitted',
            applicationId: application._id,
            amount: 1000000
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 2.0 Process Membership Payment - Level 3: 3.8.1 Validate Payment Details
router.post('/payment', authMiddleware, async (req, res) => {
    try {
        const { userId, applicationId, paymentMethod, accountNumber, amount, firstName, lastName } = req.body;

        if (!paymentMethod || !amount || !userId || !applicationId) {
            return res.status(400).json({ message: 'Invalid payment details' });
        }

        if (amount <= 0 || typeof amount !== 'number') {
            return res.status(400).json({ message: 'Invalid payment amount' });
        }

        const validMethods = ['GCash', 'Maya', 'BPI', 'BDO', 'Cash'];
        if (!validMethods.includes(paymentMethod)) {
            return res.status(400).json({ message: 'Invalid payment method' });
        }

        const application = await Application.findById(applicationId);
        if (!application || application.status !== 'pending') {
            return res.status(400).json({ message: 'Invalid or already processed application' });
        }

        const payment = new Payment({
            userId, firstName, lastName, paymentMethod, accountNumber, amount,
            transactionType: 'membership',
            paymentStatus: 'processing',
            transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });

        await payment.save();

        // Level 2: 2.0 - Validate payment > Payment data stored > D3: Payments
        payment.paymentStatus = 'completed';
        payment.processedAt = new Date();
        await payment.save();

        // Level 2: 2.0 - Membership recorded > Account Data Updated > D1: Registered Accounts
        await User.findByIdAndUpdate(userId, {
            membershipStatus: 'active',
            membershipExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });

        application.status = 'approved';
        await application.save();

        res.json({
            message: 'Payment processed successfully. Receipt will be sent to your email.',
            paymentId: payment._id,
            transactionId: payment.transactionId
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
