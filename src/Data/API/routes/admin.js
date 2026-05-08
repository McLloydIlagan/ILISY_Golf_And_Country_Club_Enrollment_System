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
        const users = await User.find({ isArchived: { $ne: true } }, '-password');
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

// Archive account (soft delete) > D1
router.delete('/users/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.isArchived = true;
        user.archivedAt = new Date();
        user.archivedReason = req.body.reason || 'Archived by admin';
        await user.save();
        res.json({ message: 'User archived successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ─── 2.0 Assess Reservation ──────────────────────────────────────────────────

router.get('/applications', async (req, res) => {
    try {
        // Get applications from Application collection
        const applications = await Application.find().sort({ createdAt: -1 });
        
        // Get confirmed reservations from Reservation collection
        const reservations = await Reservation.find().sort({ createdAt: -1 });
        
        // Transform reservations to match application format for display
        const formattedReservations = reservations.map(res => ({
            _id: res._id,
            userId: res.userId,
            firstName: res.firstName,
            lastName: res.lastName,
            email: res.email,
            phone: res.phone,
            type: 'reservation',
            reservationTypeName: res.reservationTypeName || res.type || 'Reservation',  // ADD THIS
            reservationCategory: res.category || 'golf',  // ADD THIS
            status: res.status,
            paymentStatus: res.paymentStatus || 'completed',
            amount: res.amount,
            details: {
                date: res.date,
                timeSlot: res.timeSlot
            },
            createdAt: res.createdAt,
            source: 'reservation'
        }));
        
        // Combine both arrays
        const allItems = [...applications, ...formattedReservations];
        
        // Sort by createdAt descending (newest first)
        allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json(allItems);
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ message: error.message });
    }
});

// Level 3: 2.2.1 - Validate Reservation Details > Confirm > D6
router.post('/reservations/:appId/approve', async (req, res) => {
    try {
        const { appId } = req.params;
        
        // Try to find in Application collection first
        let application = await Application.findById(appId);
        let isReservationCollection = false;
        let reservation = null;
        
        // If not found, try Reservation collection
        if (!application) {
            reservation = await Reservation.findById(appId);
            if (reservation) {
                isReservationCollection = true;
                application = reservation;
            }
        }
        
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }
        
        if (isReservationCollection) {
            // Update status in Reservation collection
            reservation.status = 'confirmed';
            await reservation.save();
            
            res.json({
                message: 'Reservation confirmed successfully',
                applicationId: reservation._id
            });
        } else {
            // Original logic for Application collection
            const conflict = await Reservation.findOne({
                date: application.details.date,
                timeSlot: application.details.timeSlot,
                status: { $in: ['approved', 'confirmed'] }
            });
            if (conflict) {
                return res.status(400).json({ message: 'Time slot is no longer available' });
            }
            
            application.status = 'approved';
            await application.save();
            
            res.json({
                message: 'Reservation approved. Confirmation sent.',
                applicationId: application._id
            });
        }
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ message: error.message });
    }
});

router.post('/reservations/:appId/reject', async (req, res) => {
    try {
        const { appId } = req.params;
        const { rejectionReason } = req.body;
        
        // Try Application collection first
        let application = await Application.findById(appId);
        let isReservationCollection = false;
        let reservation = null;
        
        if (!application) {
            reservation = await Reservation.findById(appId);
            if (reservation) {
                isReservationCollection = true;
                application = reservation;
            }
        }
        
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }
        
        if (isReservationCollection) {
            reservation.status = 'cancelled';
            await reservation.save();
            
            res.json({ message: 'Reservation cancelled' });
        } else {
            application.status = 'rejected';
            application.adminNotes = rejectionReason || 'Application rejected';
            await application.save();
            
            res.json({ message: 'Reservation rejected' });
        }
    } catch (error) {
        console.error('Reject error:', error);
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
            .populate('userId', 'firstName lastName email username isBlocked blockReason');
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
        const { appId } = req.params;
        
        // First try to find in Application collection
        let application = await Application.findById(appId);
        
        // If not found, try Reservation collection
        if (!application) {
            const reservation = await Reservation.findById(appId);
            if (reservation) {
                application = {
                    _id: reservation._id,
                    userId: reservation.userId,
                    firstName: reservation.firstName,
                    lastName: reservation.lastName,
                    email: reservation.email,
                    phone: reservation.phone,
                    type: 'reservation',
                    reservationTypeName: reservation.reservationTypeName || reservation.type || 'Reservation',  // ADD THIS
                    status: reservation.status,
                    amount: reservation.amount,
                    details: {
                        date: reservation.date,
                        timeSlot: reservation.timeSlot
                    },
                    createdAt: reservation.createdAt,
                    source: 'reservation'
                };
            }
        }
        
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
        const { year, month, filterType, filterValue } = req.query;
        
        let startDate, endDate;
        
        if (year && month) {
            startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
            endDate = new Date(parseInt(year), parseInt(month), 0);
        } else {
            const targetDate = new Date();
            startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
            endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
        }
        
        // Get ALL reservations (confirmed and approved)
        let reservations = await Reservation.find({
            date: { $gte: startDate, $lte: endDate },
            status: { $in: ['confirmed', 'approved'] }
        });
        
        // Get applications with reservation details
        let applications = await Application.find({
            type: 'reservation',
            status: { $in: ['pending', 'approved', 'confirmed'] },
            'details.date': { $gte: startDate, $lte: endDate }
        });
        
        // Amount to Reservation Type Name mapping
        const amountToTypeMap = {
            240: 'Swimming Pool',
            300: 'Swimming Pool',
            640: 'Spa / Massage',
            800: 'Spa / Massage',
            160: 'Gym / Fitness',
            200: 'Gym / Fitness',
            400: 'Driving Range',
            500: 'Driving Range',
            4000: 'Ballroom / Function Hall',
            5000: 'Ballroom / Function Hall',
            2000: 'Villas / Guest Rooms',
            2500: 'Villas / Guest Rooms',
            0: 'Restaurant Reservation'
        };
        
        // Combine and format
        let allItems = [];
        
        reservations.forEach(res => {
            // Try to get type name from multiple sources
            let typeName = res.reservationTypeName || 
                          res.reservationType || 
                          res.type || 
                          null;
            
            // If no type name found, infer from amount
            if (!typeName || typeName === 'Reservation') {
                typeName = amountToTypeMap[res.amount] || 'Reservation';
            }
            
            allItems.push({
                date: res.date,
                timeSlot: res.timeSlot,
                firstName: res.firstName,
                lastName: res.lastName,
                status: res.status,
                reservationTypeName: typeName,
                amount: res.amount,
                source: 'reservation'
            });
        });
        
        applications.forEach(app => {
            if (app.details && app.details.date) {
                let typeName = app.reservationTypeName || 
                              app.details.reservationType || 
                              null;
                
                // If no type name found, infer from amount
                if (!typeName || typeName === 'Reservation') {
                    typeName = amountToTypeMap[app.amount] || 'Reservation';
                }
                
                allItems.push({
                    date: new Date(app.details.date),
                    timeSlot: app.details.timeSlot,
                    firstName: app.firstName,
                    lastName: app.lastName,
                    status: app.status,
                    reservationTypeName: typeName,
                    amount: app.amount,
                    source: 'application'
                });
            }
        });
        
        // ========== FILTERING LOGIC ==========
        
        // Case 1: Filter by specific reservation type NAME
        if (filterType === 'type_name' && filterValue) {
            const searchName = filterValue.toLowerCase().trim();
            allItems = allItems.filter(item => {
                const itemName = (item.reservationTypeName || 'Reservation').toLowerCase().trim();
                return itemName === searchName;
            });
            console.log(`📅 Filtered by type_name "${filterValue}": ${allItems.length} items`);
            
            // Log what was found for debugging
            if (allItems.length > 0) {
                console.log('Found items:', allItems.map(i => ({ 
                    date: i.date, 
                    type: i.reservationTypeName, 
                    amount: i.amount 
                })));
            }
        }
        
        // Case 2: Filter by category
        else if (filterType === 'category' && filterValue) {
            const searchCategory = filterValue.toLowerCase().trim();
            allItems = allItems.filter(item => {
                const itemName = (item.reservationTypeName || 'Reservation').toLowerCase();
                return itemName.includes(searchCategory);
            });
            console.log(`📅 Filtered by category "${filterValue}": ${allItems.length} items`);
        }
        
        // Case 3: Filter by type ID
        else if (filterType === 'type_id' && filterValue) {
            try {
                const ReservationType = require('../models/ReservationType');
                const reservationType = await ReservationType.findById(filterValue);
                if (reservationType) {
                    const typeName = reservationType.name.toLowerCase().trim();
                    allItems = allItems.filter(item => {
                        const itemName = (item.reservationTypeName || 'Reservation').toLowerCase().trim();
                        return itemName === typeName;
                    });
                    console.log(`📅 Filtered by type_id "${reservationType.name}": ${allItems.length} items`);
                }
            } catch (err) {
                console.error('Error looking up reservation type:', err);
            }
        }
        
        // Case 4: No filter (all items)
        else {
            console.log(`📅 No filter applied, showing ${allItems.length} total items`);
        }
        
        res.json(allItems);
    } catch (error) {
        console.error('Calendar error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get reservations by specific date
router.get('/reservations/by-date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        
        // Create date range for the entire day
        const startDate = new Date(date);
        startDate.setUTCHours(0, 0, 0, 0);
        
        const endDate = new Date(date);
        endDate.setUTCHours(23, 59, 59, 999);
        
        console.log('Searching for reservations between:', startDate, 'and', endDate);
        
        // Search in Reservation collection
        const reservations = await Reservation.find({
            date: { $gte: startDate, $lte: endDate },
            status: { $in: ['confirmed', 'approved'] }
        }).select('date timeSlot firstName lastName status phone email amount reservationTypeName');
        
        // Also search in Application collection for pending/approved applications
        const applications = await Application.find({
            type: 'reservation',
            status: { $in: ['pending', 'approved'] },
            'details.date': { $gte: startDate, $lte: endDate }
        });
        
        // Format applications to match reservation structure
        const formattedApplications = applications.map(app => ({
            date: app.details.date,
            timeSlot: app.details.timeSlot,
            firstName: app.firstName,
            lastName: app.lastName,
            email: app.email,
            phone: app.phone,
            status: app.status,
            amount: app.amount,
            reservationTypeName: app.reservationTypeName || 'Reservation'
        }));
        
        // Combine both arrays
        const allReservations = [...reservations, ...formattedApplications];
        
        console.log(`Found ${allReservations.length} reservations for ${date}`);
        
        res.json(allReservations);
    } catch (error) {
        console.error('Error getting reservations by date:', error);
        res.status(500).json({ message: error.message });
    }
});

// Block a user from messaging
router.patch('/users/:userId/block', async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.isBlocked = true;
        user.blockReason = reason || 'Blocked by admin';
        user.blockedAt = new Date();
        await user.save();

        res.json({ message: 'User blocked from messaging', userId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Unblock a user
router.patch('/users/:userId/unblock', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.isBlocked = false;
        user.blockReason = undefined;
        user.blockedAt = undefined;
        await user.save();

        res.json({ message: 'User unblocked', userId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.patch('/users/:userId/revoke-membership', async (req, res) => {    try {
        const { userId } = req.params;
        const { reason } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Store previous status for audit
        const previousStatus = user.membershipStatus;
        
        // Revoke membership
        user.membershipStatus = 'expired';
        user.adminNotes = `Membership revoked on ${new Date().toISOString()}. Reason: ${reason || 'Not specified'}. Previous status: ${previousStatus}`;
        await user.save();
        
        res.json({ 
            message: 'Membership revoked successfully',
            previousStatus: previousStatus,
            newStatus: 'expired'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;