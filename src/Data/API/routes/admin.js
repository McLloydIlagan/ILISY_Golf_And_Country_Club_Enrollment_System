const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const Message = require('../models/Message');
const Application = require('../models/Application');

// 1.0 Manage Registered Accounts
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.put('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;
        
        // Validate Account Information (Level 3: 1.2.1)
        const user = await User.findByIdAndUpdate(userId, updates, { new: true });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.delete('/users/:userId', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.userId);
        res.json({ message: 'User removed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 2.0 Assess Reservation
router.get('/applications', async (req, res) => {
    try {
        const applications = await Application.find({ status: 'pending' });
        res.json(applications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/reservations/:appId/approve', async (req, res) => {
    try {
        const { appId } = req.params;
        const application = await Application.findById(appId);
        
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }

        // Validate reservation details (Level 3: 2.2.1)
        const newReservation = new Reservation({
            userId: application.userId,
            firstName: application.firstName,
            lastName: application.lastName,
            email: application.email,
            phone: application.phone,
            date: application.details.date,
            timeSlot: application.details.timeSlot,
            status: 'approved',
            amount: 500
        });

        await newReservation.save();
        application.status = 'approved';
        await application.save();

        res.json({ message: 'Reservation approved', reservationId: newReservation._id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 3.0 Manage Payments
router.get('/payments', async (req, res) => {
    try {
        const payments = await Payment.find().populate('userId', 'firstName lastName email');
        res.json(payments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/payments/:paymentId/refund', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { refundReason } = req.body;

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        payment.paymentStatus = 'refunded';
        payment.refundReason = refundReason;
        await payment.save();

        res.json({ message: 'Refund processed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 4.0 Acknowledge Client Concerns
router.get('/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/messages/:messageId/respond', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { response, resolution } = req.body;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        message.conversation.push({
            sender: 'admin',
            message: response,
            timestamp: new Date()
        });
        message.response = response;
        message.resolution = resolution;
        message.status = 'resolved';
        message.resolvedAt = new Date();
        await message.save();

        res.json({ message: 'Response sent successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Dashboard stats
router.get('/dashboard', async (req, res) => {
    try {
        const memberCount = await User.countDocuments({ membershipStatus: 'active' });
        const reservationCount = await Reservation.countDocuments({ status: 'confirmed' });
        const payments = await Payment.find({ paymentStatus: 'completed' });
        const totalIncome = payments.reduce((sum, p) => sum + p.amount, 0);

        res.json({
            members: memberCount,
            reservations: reservationCount,
            income: totalIncome,
            payments: payments
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;