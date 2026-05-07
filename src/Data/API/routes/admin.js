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

// GET all messages - FIXED to get from messages collection
router.get('/messages', async (req, res) => {
    try {
        const messages = await Message.find()
            .sort({ createdAt: -1 })
            .populate('userId', 'firstName lastName email username');
        res.json(messages);
    } catch (error) {
        console.error('Error loading messages:', error);
        res.status(500).json({ message: error.message });
    }
});

// Respond to message - FIXED to update messages and optionally archive to records
router.post('/messages/:messageId/respond', async (req, res) => {
    try {
        const { response, resolution, feedback } = req.body;
        if (!response) return res.status(400).json({ message: 'Response is required' });

        const message = await Message.findByIdAndUpdate(
            req.params.messageId,
            {
                $push: { conversation: { sender: 'admin', message: response, timestamp: new Date() } },
                $set: {
                    response,
                    resolution: resolution || null,
                    status: resolution ? 'resolved' : 'acknowledged',
                    resolvedAt: resolution ? new Date() : null
                }
            },
            { new: true }
        );
        if (!message) return res.status(404).json({ message: 'Message not found' });

        // Update or create record in records collection for archiving
        let record = await Record.findOne({ messageId: message._id });
        
        if (record) {
            // Update existing record
            await Record.findByIdAndUpdate(record._id, {
                $set: {
                    conversation: message.conversation,
                    feedback: feedback || response,
                    resolution: resolution || null,
                    recordedAt: new Date()
                }
            });
        } else {
            // Create new record only if it doesn't exist
            record = new Record({
                messageId: message._id,
                userId: message.userId,
                concernType: message.concernType,
                issue: message.message,
                feedback: feedback || response,
                resolution: resolution || null,
                conversation: message.conversation
            });
            await record.save();
        }

        res.json({ message: 'Response sent and concern recorded successfully' });
    } catch (error) {
        console.error('Respond error:', error);
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

router.get('/pending-applications', async (req, res) => {
    try {
        const applications = await Application.find({ 
            status: 'pending',
            paymentStatus: 'pending'
        }).sort({ createdAt: 1 });
        res.json(applications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get application by ID with full details
router.get('/application/:appId', async (req, res) => {
    try {
        const application = await Application.findById(req.params.appId);
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }
        res.json(application);
    } catch (error) {
        console.error('Error getting application:', error);
        res.status(500).json({ message: error.message });
    }
});

// Verify payment and approve application
router.post('/applications/:appId/verify-payment', async (req, res) => {
    try {
        const { appId } = req.params;
        const { adminNotes } = req.body;
        
        const application = await Application.findById(appId);
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }

        // Update application status
        application.paymentStatus = 'verified';
        application.status = 'approved';
        application.adminNotes = adminNotes || 'Payment verified';
        application.verifiedBy = req.user.userId;
        application.verifiedAt = new Date();
        await application.save();

        // Create payment record
        const payment = new Payment({
            userId: application.userId,
            firstName: application.firstName,
            lastName: application.lastName,
            paymentMethod: application.paymentMethod,
            accountNumber: application.accountNumber,
            amount: application.amount,
            transactionType: application.type,
            paymentStatus: 'completed',
            transactionId: application.referenceNumber,
            processedAt: new Date()
        });
        await payment.save();

        // Handle membership vs reservation differently
        if (application.type === 'membership') {
            // Activate membership
            await User.findByIdAndUpdate(application.userId, {
                membershipStatus: 'active',
                membershipExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                membershipType: 'annual'
            });
        } else if (application.type === 'reservation') {
            // Create confirmed reservation
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
                amount: application.amount
            });
            await reservation.save();
        }

        res.json({ 
            message: `Payment verified and ${application.type} approved successfully`,
            applicationId: application._id,
            paymentId: payment._id
        });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Reject application with reason
router.post('/applications/:appId/reject', async (req, res) => {
    try {
        const { appId } = req.params;
        const { rejectionReason } = req.body;
        
        const application = await Application.findById(appId);
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }

        application.status = 'rejected';
        application.paymentStatus = 'rejected';
        application.adminNotes = rejectionReason || 'Payment verification failed';
        application.verifiedBy = req.user.userId;
        application.verifiedAt = new Date();
        await application.save();

        res.json({ 
            message: 'Application rejected',
            applicationId: application._id
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/reservations/calendar', async (req, res) => {
    try {
        const { year, month } = req.query;
        const targetDate = new Date();
        
        let startDate, endDate;
        
        if (year && month) {
            startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            endDate = new Date(parseInt(year), parseInt(month), 0);
        } else {
            // Default to current month
            startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
            endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
        }
        
        const reservations = await Reservation.find({
            date: { $gte: startDate, $lte: endDate },
            status: { $in: ['confirmed', 'approved'] }
        }).select('date timeSlot firstName lastName status');
        
        res.json(reservations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get reservations by specific date
router.get('/reservations/by-date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);
        
        const reservations = await Reservation.find({
            date: { $gte: startDate, $lt: endDate },
            status: { $in: ['confirmed', 'approved'] }
        }).select('date timeSlot firstName lastName status phone email');
        
        res.json(reservations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;