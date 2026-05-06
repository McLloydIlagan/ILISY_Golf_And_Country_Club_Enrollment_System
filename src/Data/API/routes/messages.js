const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');

// 4.0 Submit Concerns - Send inquiry > store message data > D4: Messages
// FIXED: Now checks for existing conversation first
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

        // Check if there's an existing OPEN conversation for this user
        let existingConversation = await Message.findOne({
            userId: userId,
            status: { $in: ['pending', 'acknowledged'] } // Only open conversations
        }).sort({ createdAt: -1 });

        if (existingConversation) {
            // Add message to existing conversation
            existingConversation.conversation.push({
                sender: 'user',
                message: message,
                timestamp: new Date()
            });
            existingConversation.message = message; // Update latest message
            existingConversation.status = 'pending'; // Reset to pending for new message
            await existingConversation.save();

            res.json({
                message: 'Concern submitted successfully',
                concernId: existingConversation._id,
                acknowledgement: 'We have received your concern and will respond shortly'
            });
        } else {
            // Create new conversation
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
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add this new endpoint to get ALL messages (not just latest)
router.get('/user/:userId/all', authMiddleware, async (req, res) => {
    try {
        const conversations = await Message.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 4.0 Get user's concerns - Receive response / Receive resolution
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        // Get only the most recent active conversation
        const concerns = await Message.find({ 
            userId: req.params.userId,
            status: { $in: ['pending', 'acknowledged', 'resolved'] }
        }).sort({ createdAt: -1 });
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
        concern.message = message; // Update latest message
        concern.status = 'pending';
        await concern.save();

        res.json({ message: 'Follow-up submitted', concernId: concern._id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;