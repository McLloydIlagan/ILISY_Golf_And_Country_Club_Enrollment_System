const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const Message = require('../models/Message');
const Application = require('../models/Application');
const Record = require('../models/Record');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware, adminMiddleware);

// ─── 1.0 Manage Registered Accounts ─────────────────────────────────────────

router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Level 3: 1.2.1 - Validate Account Information > Update > D1
router.put('/users/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const updates = req.body;
        if (updates.membershipStatus && !['active', 'pending', 'expired', 'none'].includes(updates.membershipStatus)) {
            return res.status(400).json({ message: 'Invalid membership status' });
        }

        delete updates.password;
        const updatedUser = await User.findByIdAndUpdate(req.params.userId, updates, { new: true, select: '-password' });
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Remove unwanted accounts > D1
router.delete('/users/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        await User.findByIdAndDelete(req.params.userId);
        res.json({ message: 'User removed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ─── 2.0 Assess Reservation ──────────────────────────────────────────────────

router.get('/applications', async (req, res) => {
    try {
        const applications = await Application.find({ status: 'pending' });
        res.json(applications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Level 3: 2.2.1 - Validate Reservation Details > Confirm > D6
router.post('/reservations/:appId/approve', async (req, res) => {
    try {
        const application = await Application.findById(req.params.appId);
        if (!application) return res.status(404).json({ message: 'Application not found' });

        const conflict = await Reservation.findOne({
            date: application.details.date,
            timeSlot: application.details.timeSlot,
            status: { $in: ['approved', 'confirmed'] }
        });
        if (conflict) return res.status(400).json({ message: 'Time slot is no longer available' });

        application.status = 'approved';
        await application.save();

        res.json({
            message: 'Reservation approved. Confirmation and payment form sent to client email.',
            applicationId: application._id
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/reservations/:appId/reject', async (req, res) => {
    try {
        const application = await Application.findById(req.params.appId);
        if (!application) return res.status(404).json({ message: 'Application not found' });
        application.status = 'rejected';
        await application.save();
        res.json({ message: 'Reservation rejected' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ─── 3.0 Manage Payments ─────────────────────────────────────────────────────

router.get('/payments', async (req, res) => {
    try {
        const payments = await Payment.find().populate('userId', 'firstName lastName email');
        res.json(payments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Level 3: 3.2.1 - Verify Transactions > Record > D3
router.post('/payments/:paymentId/verify', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.paymentId);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });

        if (!['membership', 'reservation'].includes(payment.transactionType)) {
            return res.status(400).json({ message: 'Unknown transaction type' });
        }

        payment.paymentStatus = 'completed';
        payment.processedAt = new Date();
        await payment.save();

        res.json({ message: 'Transaction verified', paymentId: payment._id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Manage payment issues > update payment status > D3
router.patch('/payments/:paymentId/status', async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'processing', 'completed', 'failed', 'refunded'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid payment status' });
        }
        const payment = await Payment.findByIdAndUpdate(req.params.paymentId, { paymentStatus: status }, { new: true });
        if (!payment) return res.status(404).json({ message: 'Payment not found' });
        res.json({ message: 'Payment status updated', payment });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Process Refunds > External Entity: Bank Services
router.post('/payments/:paymentId/refund', async (req, res) => {
    try {
        const { refundReason } = req.body;
        const payment = await Payment.findById(req.params.paymentId);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });

        payment.paymentStatus = 'refunded';
        payment.refundReason = refundReason;
        await payment.save();

        res.json({ message: 'Refund processed successfully. Receipt will be sent via email.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ─── 4.0 Acknowledge Client Concerns ─────────────────────────────────────────

router.get('/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Level 2: 4.0 - Respond > Record concern > D7 | End conversation > D7
router.post('/messages/:messageId/respond', async (req, res) => {
    try {
        const { response, resolution, feedback } = req.body;
        if (!response) return res.status(400).json({ message: 'Response is required' });

        const message = await Message.findById(req.params.messageId);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        message.conversation.push({ sender: 'admin', message: response, timestamp: new Date() });
        message.response = response;
        message.resolution = resolution || null;
        message.status = resolution ? 'resolved' : 'acknowledged';
        message.resolvedAt = resolution ? new Date() : null;
        await message.save();

        // Record concern > store record > D7: Records
        const record = new Record({
            messageId: message._id,
            userId: message.userId,
            concernType: message.concernType,
            issue: message.message,
            feedback: feedback || response,
            resolution: resolution || null,
            conversation: message.conversation
        });
        await record.save();

        res.json({ message: 'Response sent and concern recorded successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
    try {
        const memberCount = await User.countDocuments({ membershipStatus: 'active' });
        const reservationCount = await Reservation.countDocuments({ status: 'confirmed' });
        const payments = await Payment.find({ paymentStatus: 'completed' });
        const totalIncome = payments.reduce((sum, p) => sum + p.amount, 0);

        res.json({ members: memberCount, reservations: reservationCount, income: totalIncome, payments });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
