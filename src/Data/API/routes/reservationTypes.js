const express = require('express');
const router = express.Router();
const ReservationType = require('../models/ReservationType');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// ──────────────────────────────────────────────────────────────────
// Public Routes (User Portal)
// ──────────────────────────────────────────────────────────────────

// Get all active reservation types for user
router.get('/active', async (req, res) => {
    try {
        const types = await ReservationType.find({ isActive: true })
            .select('name category icon description basePrice options timeSlots');
        res.json(types);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get availability for specific type and date
router.get('/availability/:typeId/:date', async (req, res) => {
    try {
        const { typeId, date } = req.params;
        const reservationType = await ReservationType.findById(typeId);
        
        if (!reservationType) {
            return res.status(404).json({ message: 'Reservation type not found' });
        }
        
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);
        
        // Check for date override
        const dateOverride = reservationType.dateOverrides.find(
            d => new Date(d.date).toDateString() === targetDate.toDateString()
        );
        
        let availableSlots = [];
        
        if (dateOverride && dateOverride.customTimeSlots) {
            availableSlots = reservationType.timeSlots.filter(slot => 
                dateOverride.customTimeSlots.includes(slot.time) && slot.isAvailable
            );
        } else if (dateOverride && dateOverride.isClosed) {
            availableSlots = [];
        } else {
            availableSlots = reservationType.timeSlots.filter(slot => slot.isAvailable);
        }
        
        // Calculate remaining capacity
        const slotsWithCapacity = availableSlots.map(slot => ({
            time: slot.time,
            remaining: slot.capacity - slot.booked,
            isAvailable: (slot.capacity - slot.booked) > 0
        }));
        
        res.json({
            date: targetDate,
            availableSlots: slotsWithCapacity,
            isClosed: dateOverride?.isClosed || false
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ──────────────────────────────────────────────────────────────────
// Admin Routes
// ──────────────────────────────────────────────────────────────────

// Get all reservation types (admin)
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const types = await ReservationType.find().sort({ createdAt: -1 });
        res.json(types);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new reservation type
router.post('/admin/create', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, category, icon, description, basePrice, options, timeSlots } = req.body;
        
        const existing = await ReservationType.findOne({ name });
        if (existing) {
            return res.status(400).json({ message: 'Reservation type already exists' });
        }
        
        const reservationType = new ReservationType({
            name, category, icon, description, basePrice,
            options: options || [],
            timeSlots: timeSlots || [],
            createdBy: req.user.userId
        });
        
        await reservationType.save();
        res.status(201).json({ message: 'Reservation type created', data: reservationType });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update reservation type
router.put('/admin/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        updates.updatedAt = new Date();
        
        const reservationType = await ReservationType.findByIdAndUpdate(id, updates, { new: true });
        if (!reservationType) {
            return res.status(404).json({ message: 'Reservation type not found' });
        }
        
        res.json({ message: 'Reservation type updated', data: reservationType });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update time slot capacity
router.patch('/admin/:id/time-slots/:slotIndex', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id, slotIndex } = req.params;
        const { capacity, isAvailable, time } = req.body;
        
        const reservationType = await ReservationType.findById(id);
        if (!reservationType) {
            return res.status(404).json({ message: 'Reservation type not found' });
        }
        
        if (reservationType.timeSlots[slotIndex]) {
            if (capacity !== undefined) reservationType.timeSlots[slotIndex].capacity = capacity;
            if (isAvailable !== undefined) reservationType.timeSlots[slotIndex].isAvailable = isAvailable;
            if (time) reservationType.timeSlots[slotIndex].time = time;
            await reservationType.save();
        }
        
        res.json({ message: 'Time slot updated', data: reservationType });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add new time slot
router.post('/admin/:id/time-slots', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { time, capacity } = req.body;
        
        const reservationType = await ReservationType.findById(id);
        if (!reservationType) {
            return res.status(404).json({ message: 'Reservation type not found' });
        }
        
        reservationType.timeSlots.push({ time, capacity, booked: 0, isAvailable: true });
        await reservationType.save();
        
        res.json({ message: 'Time slot added', data: reservationType });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete time slot
router.delete('/admin/:id/time-slots/:slotIndex', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id, slotIndex } = req.params;
        
        const reservationType = await ReservationType.findById(id);
        if (!reservationType) {
            return res.status(404).json({ message: 'Reservation type not found' });
        }
        
        reservationType.timeSlots.splice(slotIndex, 1);
        await reservationType.save();
        
        res.json({ message: 'Time slot deleted', data: reservationType });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Toggle reservation type active status
router.patch('/admin/:id/toggle', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const reservationType = await ReservationType.findById(id);
        
        if (!reservationType) {
            return res.status(404).json({ message: 'Reservation type not found' });
        }
        
        reservationType.isActive = !reservationType.isActive;
        await reservationType.save();
        
        res.json({ message: `Reservation type ${reservationType.isActive ? 'activated' : 'deactivated'}`, data: reservationType });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete reservation type
router.delete('/admin/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await ReservationType.findByIdAndDelete(id);
        res.json({ message: 'Reservation type deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;