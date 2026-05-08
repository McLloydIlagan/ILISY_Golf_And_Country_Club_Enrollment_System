const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// Get user's membership status
router.get('/:userId/membership-status', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Verify the user is requesting their own status or is admin
        if (req.user.userId !== userId && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        
        const user = await User.findById(userId).select('membershipStatus membershipExpiration firstName lastName');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Check if membership has expired
        let status = user.membershipStatus;
        if (status === 'active' && user.membershipExpiration && new Date() > user.membershipExpiration) {
            status = 'expired';
            await User.findByIdAndUpdate(userId, { membershipStatus: 'expired' });
        }
        
        res.json({ 
            membershipStatus: status,
            membershipExpiration: user.membershipExpiration,
            isMember: status === 'active',
            firstName: user.firstName,
            lastName: user.lastName
        });
    } catch (error) {
        console.error('Error getting membership status:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get user's block status
router.get('/:userId/block-status', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.userId !== userId && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const user = await User.findById(userId).select('isBlocked blockReason blockedAt');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            isBlocked: !!user.isBlocked,
            blockReason: user.blockReason || null,
            blockedAt: user.blockedAt || null
        });
    } catch (error) {
        console.error('Error getting block status:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;