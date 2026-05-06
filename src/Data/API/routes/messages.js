const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');

// 4.0 Submit Concerns - Send inquiry > store message data > D4: Messages
router.post('/submit', authMiddleware, async (req, res) => {
    try {
        const { userId, userName, message, concernType } = req.body;

        if (!userId || !userName || !message || !concernType) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const validTypes = ['refund', 'payment', 'reservation', 'general', 'membership'];
        if (!validTypes.includes(concernType)) {
            return res.status(400).json({ message: 'Invalid concern type' });
        }

        const concern = new Message({
            userId, userName, message, concernType,
            conversation: [{ sender: 'user', message, timestamp: new Date() }],
            status: 'pending'
        });

        await concern.save();

        res.json({
            message: 'Concern submitted successfully',
            concernId: concern._id,
            acknowledgement: 'We have received your concern and will respond shortly'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 4.0 Get user's concerns - Receive response / Receive resolution
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        const concerns = await Message.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(concerns);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 4.0 Follow up inquiry > store message data > D4: Messages
router.post('/followup/:messageId', authMiddleware, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ message: 'Follow-up message is required' });

        const concern = await Message.findById(req.params.messageId);
        if (!concern) return res.status(404).json({ message: 'Concern not found' });

        concern.conversation.push({ sender: 'user', message, timestamp: new Date() });
        concern.status = 'pending';
        await concern.save();

        res.json({ message: 'Follow-up submitted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
