const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const { authMiddleware } = require('../middleware/auth');

// Assess Payment Records > retrieve payment data > D3: Payments
router.get('/', authMiddleware, async (req, res) => {
    try {
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
        res.json(payment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Level 3: 3.2.1 - Verify Transactions > Confirm > Record > D3
router.post('/:id/verify', authMiddleware, async (req, res) => {
    try {
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
