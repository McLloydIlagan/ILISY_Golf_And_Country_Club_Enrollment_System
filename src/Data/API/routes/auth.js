const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken')

// 1.0 Register Account - Complete Level 2 & 3 DFD implementation

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Validate input
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }
        
        // Find user by username or email
        const user = await User.findOne({ 
            $or: [{ username: username }, { email: username }] 
        });
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // Check password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id, 
                username: user.username, 
                isAdmin: user.isAdmin 
            },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '24h' }
        );
        
        // Return user data (excluding password)
        res.json({
            id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            isAdmin: user.isAdmin,
            membershipStatus: user.membershipStatus,
            token: token // Send token for authenticated API calls
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


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