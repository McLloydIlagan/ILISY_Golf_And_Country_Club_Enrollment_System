const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const Application = require('../models/Application');

// Get available slots
router.get('/availability/:date', async (req, res) => {
    try {
        const date = new Date(req.params.date);
        const bookedSlots = await Reservation.find({ 
            date: { $gte: date, $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000) },
            status: { $in: ['approved', 'confirmed'] }
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

// 3.0 Make a reservation (Level 3: 3.3.1)
router.post('/apply', async (req, res) => {
    try {
        const { userId, firstName, lastName, email, phone, date, timeSlot } = req.body;

        // Validate reservation availability
        const existingReservation = await Reservation.findOne({ date, timeSlot, status: 'confirmed' });
        if (existingReservation) {
            return res.status(400).json({ message: 'Time slot not available' });
        }

        // Create reservation application
        const application = new Application({
            userId,
            firstName,
            lastName,
            email,
            phone,
            type: 'reservation',
            details: { date, timeSlot },
            status: 'pending'
        });

        await application.save();

        res.json({ 
            message: 'Reservation application submitted',
            applicationId: application._id,
            amount: 500
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Process reservation payment
router.post('/payment/:reservationId', async (req, res) => {
    try {
        const { reservationId } = req.params;
        const { paymentMethod, accountNumber, amount } = req.body;

        const payment = new Payment({
            userId: req.body.userId,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            paymentMethod,
            accountNumber,
            amount,
            transactionType: 'reservation',
            reservationId,
            paymentStatus: 'completed',
            transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });

        await payment.save();

        // Confirm reservation
        await Reservation.findByIdAndUpdate(reservationId, { 
            status: 'confirmed',
            paymentId: payment._id 
        });

        res.json({ message: 'Payment successful', paymentId: payment._id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;