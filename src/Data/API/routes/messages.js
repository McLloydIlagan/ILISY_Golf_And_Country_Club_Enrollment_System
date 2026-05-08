const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Message = require('../models/Message');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// ============================================
// CONFIGURE MULTER FOR IMAGE UPLOADS
// ============================================

// Ensure upload directory exists
const uploadDir = './uploads/receipts';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WEBP)'), false);
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

// ============================================
// 4.0 Submit Concerns - Send inquiry
// ============================================

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

        // Check if user is blocked from messaging
        const user = await User.findById(userId).select('isBlocked blockReason');
        if (user && user.isBlocked) {
            return res.status(403).json({
                message: 'You have been blocked from sending messages.',
                reason: user.blockReason || 'Contact the club for more information.',
                blocked: true
            });
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
            existingConversation.updatedAt = new Date();
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

// ============================================
// UPLOAD IMAGE (RECEIPT)
// ============================================

router.post('/upload-image', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        const { userId, userName, conversationId } = req.body;
        
        // Verify user
        if (req.user.userId !== userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Check if user is blocked from messaging
        const blockedUser = await User.findById(userId).select('isBlocked blockReason');
        if (blockedUser && blockedUser.isBlocked) {
            if (req.file && req.file.path) fs.unlinkSync(req.file.path);
            return res.status(403).json({
                message: 'You have been blocked from sending messages.',
                reason: blockedUser.blockReason || 'Contact the club for more information.',
                blocked: true
            });
        }
        
        if (!req.file) {
            return res.status(400).json({ message: 'No image uploaded' });
        }
        
        // Construct image URL (adjust for your deployment)
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const imageUrl = `${baseUrl}/uploads/receipts/${req.file.filename}`;
        
        let message;
        
        if (conversationId) {
            // Add to existing conversation
            message = await Message.findById(conversationId);
            if (!message) {
                // Clean up uploaded file if conversation not found
                fs.unlinkSync(req.file.path);
                return res.status(404).json({ message: 'Conversation not found' });
            }
            
            // Verify ownership
            if (message.userId.toString() !== userId) {
                fs.unlinkSync(req.file.path);
                return res.status(403).json({ message: 'Unauthorized' });
            }
            
            message.conversation.push({
                sender: 'user',
                message: '📎 Sent a receipt image',
                imageUrl: imageUrl,
                timestamp: new Date()
            });
            message.status = 'pending';
            message.updatedAt = new Date();
            await message.save();
        } else {
            // Create new conversation with image
            message = new Message({
                userId,
                userName: userName || 'Member',
                message: '📎 Sent a receipt image',
                imageUrl: imageUrl,
                concernType: 'payment',
                conversation: [{
                    sender: 'user',
                    message: '📎 Sent a receipt image',
                    imageUrl: imageUrl,
                    timestamp: new Date()
                }],
                status: 'pending'
            });
            await message.save();
        }
        
        res.json({
            message: 'Image uploaded successfully',
            conversationId: message._id,
            imageUrl: imageUrl
        });
        
    } catch (error) {
        console.error('Image upload error:', error);
        // Clean up uploaded file if error occurs
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (e) {
                console.error('Error deleting file:', e);
            }
        }
        res.status(500).json({ message: error.message });
    }
});

// ============================================
// 4.0 Follow up inquiry - ADD TO EXISTING CONVERSATION
// ============================================

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
        concern.updatedAt = new Date();
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

// ============================================
// 4.0 Get user's conversations
// ============================================

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

// ============================================
// Get single conversation by ID
// ============================================

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