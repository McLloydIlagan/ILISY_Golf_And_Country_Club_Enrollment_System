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

        // Verify the user from token matches the userId
        if (req.user.userId !== userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Check if there's an existing OPEN conversation for this user
        let existingConversation = await Message.findOne({
            userId: userId,
            status: { $in: ['pending', 'acknowledged'] }
        }).sort({ createdAt: -1 });

        if (existingConversation) {
            // Add message to existing conversation
            existingConversation.conversation.push({
                sender: 'user',
                message: message,
                timestamp: new Date()
            });
            existingConversation.message = message;
            existingConversation.status = 'pending';
            await existingConversation.save();

            return res.json({
                message: 'Concern submitted successfully',
                concernId: existingConversation._id,
                acknowledgement: 'We have received your concern and will respond shortly'
            });
        } else {
            // Create new conversation
            const concern = new Message({
                userId,
                userName,
                message,
                concernType,
                conversation: [{ sender: 'user', message, timestamp: new Date() }],
                status: 'pending'
            });

            await concern.save();

            return res.json({
                message: 'Concern submitted successfully',
                concernId: concern._id,
                acknowledgement: 'We have received your concern and will respond shortly'
            });
        }
    } catch (error) {
        console.error('Submit error:', error);
        res.status(500).json({ message: error.message });
    }
});

// 4.0 Follow up inquiry - ADD TO EXISTING CONVERSATION
router.post('/followup/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ message: 'Follow-up message is required' });
        }

        // Validate messageId format
        if (!messageId || messageId.length !== 24) {
            return res.status(400).json({ message: 'Invalid conversation ID' });
        }

        const concern = await Message.findById(messageId);
        if (!concern) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        // Verify the user owns this conversation
        if (concern.userId.toString() !== req.user.userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        concern.conversation.push({ 
            sender: 'user', 
            message: message, 
            timestamp: new Date() 
        });
        concern.message = message;
        concern.status = 'pending';
        await concern.save();

        res.json({ 
            message: 'Follow-up submitted', 
            concernId: concern._id 
        });
    } catch (error) {
        console.error('Followup error:', error);
        res.status(500).json({ message: error.message });
    }
});

// 4.0 Get user's conversations
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        // Verify the user is requesting their own conversations
        if (req.user.userId !== req.params.userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const conversations = await Message.find({ 
            userId: req.params.userId
        }).sort({ updatedAt: -1 });
        
        res.json(conversations);
    } catch (error) {
        console.error('Get user messages error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get single conversation by ID
router.get('/conversation/:messageId', authMiddleware, async (req, res) => {
    try {
        const conversation = await Message.findById(req.params.messageId);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }
        
        // Verify ownership
        if (conversation.userId.toString() !== req.user.userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        
        res.json(conversation);
    } catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;