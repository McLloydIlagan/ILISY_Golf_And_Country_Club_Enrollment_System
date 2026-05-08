const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const { authMiddleware } = require('../middleware/auth');

// Assess Payment Records > retrieve payment data > D3: Payments
// Admin-only: requires both auth + admin role
router.get('/', authMiddleware, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }
        const payments = await Payment.find().populate('userId', 'firstName lastName email');
        res.json(payments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get single payment record > D3
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id).populate('userId', 'firstName lastName email');
        if (!payment) return res.status(404).json({ message: 'Payment not found' });
        // Only admin or the payment owner can view
        if (!req.user.isAdmin && String(payment.userId?._id || payment.userId) !== req.user.userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        res.json(payment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Level 3: 3.2.1 - Verify Transactions > Confirm > Record > D3 — Admin only
router.post('/:id/verify', authMiddleware, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });

        if (!['membership', 'reservation'].includes(payment.transactionType)) {
            return res.status(400).json({ message: 'Unknown transaction type' });
        }

        payment.paymentStatus = 'completed';
        payment.processedAt = new Date();
        await payment.save();

        res.json({ message: 'Transaction verified and recorded', payment });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
