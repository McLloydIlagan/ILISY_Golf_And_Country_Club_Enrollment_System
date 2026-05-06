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
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'Email or username already exists' });
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
            userId: user._id
        });
    } catch (error) {
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

        const user = await User.findOne({
            $or: [{ username }, { email: username }]
        });

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

module.exports = router;
