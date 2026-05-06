// src/Data/API/controllers/reservationController.js
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const { processBankPayment, sendEmail } = require('../utils/externalServices');

exports.getAvailability = async (req, res) => {
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
};

exports.applyForReservation = async (req, res) => {
    try {
        const { userId, firstName, lastName, email, phone, date, timeSlot } = req.body;

        const existingReservation = await Reservation.findOne({ date, timeSlot, status: 'confirmed' });
        if (existingReservation) {
            return res.status(400).json({ message: 'Time slot not available' });
        }

        // D5: Reservation applications
        const application = new Application({
            userId, firstName, lastName, email, phone,
            type: 'reservation',
            details: { date, timeSlot },
            status: 'pending'
        });
        await application.save();

        await sendEmail(email, 'Reservation Application Received', `We have received your application for ${date} at ${timeSlot}. Please proceed to payment to confirm.`);

        res.json({ 
            message: 'Reservation application submitted. Please proceed to payment.',
            applicationId: application._id,
            amount: 500
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.processReservationPayment = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const { paymentMethod, accountNumber, amount } = req.body;

        const application = await Application.findById(applicationId);
        if (!application) return res.status(404).json({ message: 'Application not found' });

        // 1. Bank Services Mock
        const bankResponse = await processBankPayment({ paymentMethod, accountNumber, amount });

        // 2. D3: Payments Store
        const payment = new Payment({
            userId: application.userId,
            firstName: application.firstName,
            lastName: application.lastName,
            paymentMethod, accountNumber, amount,
            transactionType: 'reservation',
            paymentStatus: 'completed',
            transactionId: bankResponse.bankRef
        });
        await payment.save();

        // 3. D6: Reservation Update/Creation
        const newReservation = new Reservation({
            userId: application.userId,
            firstName: application.firstName,
            lastName: application.lastName,
            email: application.email,
            phone: application.phone,
            date: application.details.date,
            timeSlot: application.details.timeSlot,
            status: 'confirmed',
            paymentId: payment._id,
            amount: amount
        });
        await newReservation.save();

        application.status = 'approved';
        await application.save();

        // 4. Email Services Mock
        const emailBody = `Your reservation for ${newReservation.date.toDateString()} at ${newReservation.timeSlot} is confirmed. Payment Ref: ${payment.transactionId}`;
        await sendEmail(application.email, 'ILISY Reservation Confirmed & Receipt', emailBody);

        res.json({ 
            message: 'Payment successful, reservation confirmed.', 
            reservationId: newReservation._id,
            paymentId: payment._id 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};