const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

// 1.0 Register Account (Level 2 & Level 3: 1.3.1 Validate Credentials)
router.post('/register', [
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
    body('email').isEmail().normalizeEmail(),
    body('username').notEmpty().trim().isLength({ min: 3 }),
    body('password').isLength({ min: 6 }),
    body('phone').notEmpty(),
    body('captcha').notEmpty().withMessage('CAPTCHA verification required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { firstName, lastName, email, username, password, phone } = req.body;

        // Level 3: 1.3.1 - Check account duplication > D1: Registered Accounts
        const existingUser = await User.findOne({ 
            $or: [{ email: email.trim().toLowerCase() }, { username: username.trim().toLowerCase() }] 
        }).collation({ locale: 'en', strength: 2 });
        
        if (existingUser) {
            if (existingUser.email.toLowerCase() === email.trim().toLowerCase()) {
                return res.status(409).json({ 
                    message: 'This email is already registered. Please use a different email or login.',
                    field: 'email'
                });
            }
            if (existingUser.username.toLowerCase() === username.trim().toLowerCase()) {
                return res.status(409).json({ 
                    message: 'This username is already taken. Please choose a different username.',
                    field: 'username'
                });
            }
        }

        // Level 3: 1.3.1 - Create Account > Account data stored > D1: Registered Accounts
        const user = new User({
            firstName,
            lastName,
            email,
            username,
            password,
            phone,
            termsAccepted: true
        });

        await user.save();

        res.status(201).json({
            message: 'Account created successfully',
            userId: user._id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        // Handle MongoDB unique constraint errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            const fieldName = field === 'email' ? 'Email' : 'Username';
            return res.status(409).json({ 
                message: `${fieldName} already exists in the system`,
                field: field
            });
        }
        res.status(500).json({ message: error.message });
    }
});

// 1.0 Login Account > Access Homepage
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const normalizedInput = username.trim().toLowerCase();
        
        // Query with collation for case-insensitive search
        const user = await User.findOne({
            $or: [{ username: normalizedInput }, { email: normalizedInput }]
        }).collation({ locale: 'en', strength: 2 });

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user._id, username: user.username, isAdmin: user.isAdmin },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '24h' }
        );

        res.json({
            id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            isAdmin: user.isAdmin,
            membershipStatus: user.membershipStatus,
            token
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Check if email is available (not already registered)
router.post('/check-email', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ available: false, message: 'Email is required' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        console.log('🔍 Checking email in database:', normalizedEmail);
        
        // Query with collation for case-insensitive search
        const existingUser = await User.findOne({ email: normalizedEmail }).collation({ locale: 'en', strength: 2 });
        
        console.log('📊 Database query result:', existingUser ? 'Found existing user' : 'No user found');

        if (existingUser) {
            console.log('❌ Email already exists:', existingUser.email);
            return res.json({ available: false, message: 'Email already registered' });
        }

        console.log('✅ Email is available');
        return res.json({ available: true, message: 'Email is available' });
    } catch (error) {
        console.error('❌ Error checking email:', error);
        res.status(500).json({ available: false, message: error.message });
    }
});

// Check if username is available (not already taken)
router.post('/check-username', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ available: false, message: 'Username is required' });
        }

        const normalizedUsername = username.trim().toLowerCase();
        console.log('🔍 Checking username in database:', normalizedUsername);
        
        // Query with collation for case-insensitive search
        const existingUser = await User.findOne({ username: normalizedUsername }).collation({ locale: 'en', strength: 2 });
        
        console.log('📊 Database query result:', existingUser ? 'Found existing user' : 'No user found');

        if (existingUser) {
            console.log('❌ Username already exists:', existingUser.username);
            return res.json({ available: false, message: 'Username already taken' });
        }

        console.log('✅ Username is available');
        return res.json({ available: true, message: 'Username is available' });
    } catch (error) {
        console.error('❌ Error checking username:', error);
        res.status(500).json({ available: false, message: error.message });
    }
});

module.exports = router;
