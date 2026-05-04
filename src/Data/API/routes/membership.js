const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const Application = require('../models/Application');

// 2.0 Membership Application
router.post('/apply', async (req, res) => {
    try {
        const { userId, firstName, lastName, email, phone, gender, age, address } = req.body;

        // Validate application details (Level 3: 2.2.1)
        if (!firstName || !lastName || !email || !phone) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Check membership status (Level 3: 2.2.1)
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Create application
        const application = new Application({
            userId,
            firstName,
            lastName,
            email,
            phone,
            type: 'membership',
            details: { gender, age, address },
            status: 'pending'
        });

        await application.save();

        res.json({ 
            message: 'Membership application submitted',
            applicationId: application._id,
            amount: 1000000 // PHP
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Process membership payment (Level 3: 3.8.1 Validate Payment Details)
router.post('/payment', async (req, res) => {
    try {
        const { userId, paymentMethod, accountNumber, amount } = req.body;

        // Validate payment details
        if (!paymentMethod || !amount) {
            return res.status(400).json({ message: 'Invalid payment details' });
        }

        // Create payment record
        const payment = new Payment({
            userId,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            paymentMethod,
            accountNumber,
            amount,
            transactionType: 'membership',
            paymentStatus: 'processing',
            transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });

        await payment.save();

        // Update user membership status
        await User.findByIdAndUpdate(userId, {
            membershipStatus: 'active',
            membershipExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });

        res.json({ 
            message: 'Payment processed successfully',
            paymentId: payment._id,
            transactionId: payment.transactionId
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;