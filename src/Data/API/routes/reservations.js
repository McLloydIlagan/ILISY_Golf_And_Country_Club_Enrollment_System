const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const ReservationType = require('../models/ReservationType');
const { authMiddleware } = require('../middleware/auth');


// Get availability for a month — returns per-date slot status for calendar coloring
router.get('/availability/month', authMiddleware, async (req, res) => {
    try {
        const { start, end } = req.query;
        
        if (!start || !end) {
            return res.status(400).json({ message: 'Start and end dates required' });
        }
        
        const startDate = new Date(start);
        const endDate = new Date(end);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        // Total slots per day = 3 fixed time slots
        const TOTAL_SLOTS_PER_DAY = 3;
        
        // Get all confirmed/approved reservations in date range
        const reservations = await Reservation.find({
            date: { $gte: startDate, $lte: endDate },
            status: { $in: ['confirmed', 'approved'] }
        }).select('date timeSlot');
        
        // Group by date → count unique booked time slots
        const slotsByDate = {};
        reservations.forEach(res => {
            const dateKey = new Date(res.date).toISOString().split('T')[0];
            if (!slotsByDate[dateKey]) slotsByDate[dateKey] = new Set();
            slotsByDate[dateKey].add(res.timeSlot);
        });

        // Build response: available / partial / full
        const availability = {};
        Object.entries(slotsByDate).forEach(([dateKey, slots]) => {
            const bookedCount = slots.size;
            availability[dateKey] = {
                bookedSlots: bookedCount,
                totalSlots: TOTAL_SLOTS_PER_DAY,
                status: bookedCount >= TOTAL_SLOTS_PER_DAY ? 'full' : bookedCount > 0 ? 'partial' : 'available'
            };
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
            firstName, lastName, email, phone, date, timeSlot,
            paymentMethod, accountNumber, referenceNumber, amount, reservationTypeName  
        } = req.body;

        // Always use the authenticated user's ID — never trust userId from body
        const userId = req.user.userId;

        console.log('Received reservation application:', { 
            userId, firstName, lastName, email, phone, date, timeSlot,
            paymentMethod, amount: amount || 'NOT PROVIDED'
        });

        if (!userId || !firstName || !lastName || !email || !phone || !date || !timeSlot) {
            return res.status(400).json({ message: 'Missing required fields: firstName, lastName, email, phone, date, timeSlot' });
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

        // Check if time slot is still available (use date range to avoid timezone issues)
        const reservationDate = new Date(date);
        const dayStart = new Date(reservationDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(reservationDate);
        dayEnd.setHours(23, 59, 59, 999);

        const conflict = await Reservation.findOne({
            date: { $gte: dayStart, $lte: dayEnd },
            timeSlot,
            status: { $in: ['confirmed', 'approved'] }
        });
        if (conflict) {
            return res.status(400).json({ message: 'This time slot is already fully booked. Please choose a different time.' });
        }

        // Block duplicate pending reservation applications for same date+slot
        const dupApp = await Application.findOne({
            userId,
            type: 'reservation',
            status: { $in: ['pending', 'processing', 'approved'] },
            'details.timeSlot': timeSlot,
            'details.date': { $gte: dayStart, $lte: dayEnd }
        });
        if (dupApp) {
            return res.status(400).json({ message: 'You already have a pending application for this date and time slot.' });
        }

        // Validate submitted amount against the reservation type's base price
        // Prevents users from submitting a manipulated (lower) amount
        const submittedAmount = Number(amount);
        if (isNaN(submittedAmount) || submittedAmount <= 0) {
            return res.status(400).json({ message: 'Invalid payment amount.' });
        }
        if (reservationTypeName) {
            const rType = await ReservationType.findOne({ name: reservationTypeName, isActive: true });
            if (rType) {
                // Allow member discount (min 80% of base price) but reject anything lower
                const minAcceptable = Math.floor(rType.basePrice * 0.75); // 25% tolerance for options/discounts
                if (submittedAmount < minAcceptable) {
                    return res.status(400).json({ message: 'Payment amount does not match the reservation price.' });
                }
            }
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
            amount: submittedAmount,
            status: 'pending',
            paymentStatus: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await application.save();

        res.json({
            message: 'Reservation application submitted. Admin will verify your payment.',
            applicationId: application._id,
            amount: submittedAmount,
            status: 'pending_verification'
        });
    } catch (error) {
        console.error('❌ RESERVATION APPLY ERROR:', error);
        // Never leak stack traces to the client
        res.status(500).json({ message: 'An error occurred while submitting your reservation. Please try again.' });
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
