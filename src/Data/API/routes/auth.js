const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { body, validationResult } = require('express-validator');

// 1.0 Register Account - Complete Level 2 & 3 DFD implementation
router.post('/register', [
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
    body('email').isEmail().normalizeEmail(),
    body('username').notEmpty().trim(),
    body('password').isLength({ min: 6 }),
    body('phone').notEmpty(),
    body('captcha').notEmpty()
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { firstName, lastName, email, username, password, phone, captcha } = req.body;

        // Check account duplication (Level 3: 1.3.1)
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'Email or username already exists' });
        }

        // Create new account (Account data stored > D1)
        const user = new User({
            firstName,
            lastName,
            email,
            username,
            password,
            phone
        });

        await user.save();

        res.status(201).json({ 
            message: 'Account created successfully',
            userId: user._id 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        res.json({
            id: user._id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin,
            membershipStatus: user.membershipStatus
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;