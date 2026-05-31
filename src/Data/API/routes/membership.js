const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const { authMiddleware } = require('../middleware/auth');

// 2.0 Membership Application - Level 3: 2.2.1 Validate Application Details
router.post('/apply', authMiddleware, async (req, res) => {
    try {
        const { 
            firstName, lastName, email, phone, gender, age, address,
            paymentMethod, accountNumber, referenceNumber, amount
        } = req.body;

        // Always use the authenticated user's ID — never trust userId from body
        const userId = req.user.userId;

        if (!firstName || !lastName || !email || !phone) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        if (!paymentMethod || !accountNumber || !referenceNumber || !amount) {
            return res.status(400).json({ message: 'Payment details are required' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        const phoneRegex = /^[0-9+\-\s]{7,15}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ message: 'Invalid phone number format' });
        }

        // Check if user already has active membership
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (user.membershipStatus === 'active') {
            return res.status(400).json({ message: 'User already has an active membership' });
        }

        // Block duplicate pending applications
        const existingPending = await Application.findOne({
            userId,
            type: 'membership',
            status: { $in: ['pending', 'processing'] }
        });
        if (existingPending) {
            return res.status(400).json({ message: 'You already have a pending membership application. Please wait for admin review.' });
        }

        // Validate amount — membership fee must be a positive number
        // The canonical fee is stored in MembershipSettings; we do a basic sanity check here.
        // Admin verifies the actual receipt, so this just blocks obviously wrong values.
        const submittedAmount = Number(amount);
        if (isNaN(submittedAmount) || submittedAmount <= 0) {
            return res.status(400).json({ message: 'Invalid payment amount.' });
        }

        // Create application with payment details (PENDING admin validation)
        const application = new Application({
            userId, firstName, lastName, email, phone,
            type: 'membership',
            details: { gender, age, address },
            paymentMethod,
            accountNumber,
            referenceNumber,
            amount: submittedAmount,
            status: 'pending',
            paymentStatus: 'pending'
        });

        await application.save();

        res.json({
            message: 'Membership application submitted. Admin will verify your payment.',
            applicationId: application._id,
            status: 'pending_verification'
        });
    } catch (error) {
        console.error('Membership apply error:', error);
        res.status(500).json({ message: 'An error occurred while submitting your application. Please try again.' });
    }
});

router.get('/my-applications', authMiddleware, async (req, res) => {
    try {
        const applications = await Application.find({ 
            userId: req.user.userId,
            type: 'membership'
        }).sort({ createdAt: -1 });
        res.json(applications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// NOTE: The /payment route below is DISABLED — membership activation is handled
// exclusively by admin via POST /api/admin/applications/:appId/verify-payment
// Keeping the route stub to avoid 404 but it returns 403 to prevent bypass.
router.post('/payment', authMiddleware, async (req, res) => {
    return res.status(403).json({ message: 'Direct payment processing is not allowed. Please submit an application and wait for admin verification.' });
});

module.exports = router;
