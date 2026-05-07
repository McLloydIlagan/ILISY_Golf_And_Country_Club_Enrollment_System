// In API/routes/users.js or add to existing route
router.get('/:userId/membership-status', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Verify the user is requesting their own status or is admin
        if (req.user.userId !== userId && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        
        const user = await User.findById(userId).select('membershipStatus membershipExpiration');
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
            isMember: status === 'active'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});