const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// 4.0 Submit Concerns
router.post('/submit', async (req, res) => {
    try {
        const { userId, userName, message, concernType } = req.body;

        const concern = new Message({
            userId,
            userName,
            message,
            concernType,
            conversation: [{
                sender: 'user',
                message,
                timestamp: new Date()
            }],
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

// Get user's concerns
router.get('/user/:userId', async (req, res) => {
    try {
        const concerns = await Message.find({ userId: req.params.userId })
            .sort({ createdAt: -1 });
        res.json(concerns);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Follow up inquiry (Level 2: 4.0)
router.post('/followup/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { message } = req.body;

        const concern = await Message.findById(messageId);
        if (!concern) {
            return res.status(404).json({ message: 'Concern not found' });
        }

        concern.conversation.push({
            sender: 'user',
            message,
            timestamp: new Date()
        });
        concern.status = 'pending';
        await concern.save();

        res.json({ message: 'Follow-up submitted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;