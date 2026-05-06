const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const { authMiddleware } = require('../middleware/auth');

// Check reservation availability > D2: Reservations
router.get('/availability/:date', async (req, res) => {
    try {
        const date = new Date(req.params.date);
        const bookedSlots = await Reservation.find({
            date: { $gte: date, $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000) },
            status: { $in: ['confirmed'] }
        });

        const slots = ['10:00 AM - 12:00 PM', '12:30 PM - 2:30 PM', '3:00 PM - 5:00 PM'];
        const availableSlots = slots.filter(slot =>
            !bookedSlots.some(r => r.timeSlot === slot)
        );

        res.json({ availableSlots, bookedSlots: bookedSlots.length });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 3.0 Make a Reservation - Level 3: 3.3.1 Validate Reservation Application
router.post('/apply', authMiddleware, async (req, res) => {
    try {
        const { 
            userId, firstName, lastName, email, phone, date, timeSlot,
            paymentMethod, accountNumber, referenceNumber, amount
        } = req.body;

        if (!userId || !firstName || !lastName || !email || !phone || !date || !timeSlot) {
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

        // Check if time slot is still available
        const conflict = await Reservation.findOne({
            date, timeSlot,
            status: 'confirmed'
        });
        if (conflict) {
            return res.status(400).json({ message: 'Time slot not available' });
        }

        // Create application with payment details (PENDING admin validation)
        const application = new Application({
            userId, firstName, lastName, email, phone,
            type: 'reservation',
            details: { date, timeSlot },
            paymentMethod,
            accountNumber,
            referenceNumber,
            amount,
            status: 'pending',
            paymentStatus: 'pending'
        });

        await application.save();

        res.json({
            message: 'Reservation application submitted. Admin will verify your payment.',
            applicationId: application._id,
            amount: 500,
            status: 'pending_verification'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 3.0 Process Reservation Payment - Level 3: 3.8.1 Validate Payment Details
router.post('/payment/:applicationId', authMiddleware, async (req, res) => {
    try {
        const { applicationId } = req.params;
        const { userId, firstName, lastName, paymentMethod, accountNumber, amount } = req.body;

        if (!paymentMethod || !amount || !userId) {
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
        if (!application || application.status !== 'approved') {
            return res.status(400).json({ message: 'Application not found or not yet approved by admin' });
        }

        const payment = new Payment({
            userId, firstName, lastName, paymentMethod, accountNumber, amount,
            transactionType: 'reservation',
            paymentStatus: 'processing',
            transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });

        await payment.save();

        // Level 2: 3.0 - Validate payment > Payment data stored > D3: Payments
        payment.paymentStatus = 'completed';
        payment.processedAt = new Date();
        await payment.save();

        // Level 2: 3.0 - Reservation recorded > D6: Reservation
        const reservation = new Reservation({
            userId: application.userId,
            firstName: application.firstName,
            lastName: application.lastName,
            email: application.email,
            phone: application.phone,
            date: application.details.date,
            timeSlot: application.details.timeSlot,
            status: 'confirmed',
            paymentId: payment._id,
            amount
        });

        await reservation.save();
        application.status = 'approved';
        await application.save();

        res.json({
            message: 'Payment successful. Receipt will be sent to your email.',
            paymentId: payment._id,
            reservationId: reservation._id
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/my-applications', authMiddleware, async (req, res) => {
    try {
        const applications = await Application.find({ 
            userId: req.user.userId,
            type: 'reservation'
        }).sort({ createdAt: -1 });
        res.json(applications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
