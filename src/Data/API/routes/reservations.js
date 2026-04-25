const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const { authMiddleware } = require('../middleware/auth');


// Get availability for a month
router.get('/availability/month', authMiddleware, async (req, res) => {
    try {
        const { start, end, typeId } = req.query;
        
        if (!start || !end) {
            return res.status(400).json({ message: 'Start and end dates required' });
        }
        
        const startDate = new Date(start);
        const endDate = new Date(end);
        
        // Get all confirmed reservations in date range
        const reservations = await Reservation.find({
            date: { $gte: startDate, $lte: endDate },
            status: { $in: ['confirmed', 'approved'] }
        });
        
        // Group by date
        const availability = {};
        reservations.forEach(res => {
            const dateKey = res.date.toISOString().split('T')[0];
            if (!availability[dateKey]) {
                availability[dateKey] = { bookedCount: 0, totalSlots: 10, reservations: [] };
            }
            availability[dateKey].bookedCount++;
            availability[dateKey].reservations.push(res);
        });
        
        res.json(availability);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

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
            paymentMethod, accountNumber, referenceNumber, amount, reservationTypeName  
        } = req.body;

        console.log('Received reservation application:', { 
            userId, firstName, lastName, email, phone, date, timeSlot,
            paymentMethod, amount: amount || 'NOT PROVIDED'
        });

        if (!userId || !firstName || !lastName || !email || !phone || !date || !timeSlot) {
            return res.status(400).json({ message: 'Missing required fields: userId, firstName, lastName, email, phone, date, timeSlot' });
        }

        if (!paymentMethod || !accountNumber || !referenceNumber || !amount) {
            return res.status(400).json({ message: 'Payment details are required: paymentMethod, accountNumber, referenceNumber, amount' });
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
            userId, 
            firstName, 
            lastName, 
            email, 
            phone,
            type: 'reservation',
            reservationTypeName: reservationTypeName || req.body.reservationType?.name || 'Reservation',
            details: { date, timeSlot },
            paymentMethod,
            accountNumber,
            referenceNumber,
            amount: Number(amount),
            status: 'pending',
            paymentStatus: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await application.save();

        res.json({
            message: 'Reservation application submitted. Admin will verify your payment.',
            applicationId: application._id,
            amount: amount,
            status: 'pending_verification'
        });
    } catch (error) {
        console.error('❌ RESERVATION APPLY ERROR:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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
