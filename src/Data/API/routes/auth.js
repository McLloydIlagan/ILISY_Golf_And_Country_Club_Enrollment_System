const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

// ── Simple in-memory rate limiter (no extra package needed) ──────
// Tracks failed login attempts per IP. Resets after WINDOW_MS.
const loginAttempts = new Map(); // ip -> { count, firstAttempt }
const MAX_ATTEMPTS  = 10;        // max failures before lockout
const WINDOW_MS     = 15 * 60 * 1000; // 15-minute window
const LOCKOUT_MS    = 15 * 60 * 1000; // 15-minute lockout

function getClientIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function checkLoginRateLimit(ip) {
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (!record) return { blocked: false };
    // Reset window if expired
    if (now - record.firstAttempt > WINDOW_MS) {
        loginAttempts.delete(ip);
        return { blocked: false };
    }
    if (record.count >= MAX_ATTEMPTS) {
        const remaining = Math.ceil((record.firstAttempt + LOCKOUT_MS - now) / 60000);
        return { blocked: true, remaining };
    }
    return { blocked: false };
}

function recordFailedLogin(ip) {
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (!record || now - record.firstAttempt > WINDOW_MS) {
        loginAttempts.set(ip, { count: 1, firstAttempt: now });
    } else {
        record.count++;
    }
}

function clearLoginAttempts(ip) {
    loginAttempts.delete(ip);
}
// ─────────────────────────────────────────────────────────────────

// 1.0 Register Account (Level 2 & Level 3: 1.3.1 Validate Credentials)
router.post('/register', [
    body('firstName').notEmpty().withMessage('First name is required').trim(),
    body('lastName').notEmpty().withMessage('Last name is required').trim(),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('username').notEmpty().withMessage('Username is required').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('captcha').notEmpty().withMessage('CAPTCHA verification required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Return detailed validation errors
            return res.status(400).json({ 
                message: 'Validation failed',
                errors: errors.array().map(err => ({
                    field: err.path,
                    message: err.msg
                }))
            });
        }

        const { firstName, lastName, email, username, password, phone } = req.body;

        // Normalize email and username to lowercase
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedUsername = username.trim().toLowerCase();

        console.log('Registration attempt:', { firstName, lastName, email: normalizedEmail, username: normalizedUsername, phone });

        // Check email first
        const existingEmail = await User.findOne({ email: normalizedEmail });
        if (existingEmail) {
            console.log('Email already exists:', existingEmail.email);
            // Use the same message whether the account is archived or active
            // to avoid leaking account existence
            return res.status(409).json({
                message: 'This email is not available. Please use a different email.',
                field: 'email'
            });
        }

        // Check username
        const existingUsername = await User.findOne({ username: normalizedUsername });
        if (existingUsername) {
            console.log('Username already exists:', existingUsername.username);
            return res.status(409).json({
                message: 'This username is not available. Please choose a different username.',
                field: 'username'
            });
        }

        console.log('Creating new user...');

        // Create user with normalized email and username
        const user = new User({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: normalizedEmail,
            username: normalizedUsername,
            password: password,
            phone: phone.trim(),
            termsAccepted: true,
            membershipStatus: 'none'
        });

        await user.save();
        
        console.log('User created successfully:', user._id);

        res.status(201).json({
            message: 'Account created successfully',
            userId: user._id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        console.error('Registration error:', error);
        
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

// 1.0 Login Account - Case-Insensitive Version
router.post('/login', async (req, res) => {
    try {
        const ip = getClientIp(req);
        const { blocked, remaining } = checkLoginRateLimit(ip);
        if (blocked) {
            return res.status(429).json({ message: `Too many failed login attempts. Please try again in ${remaining} minute(s).` });
        }

        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const normalizedInput = username.trim().toLowerCase();
        
        const user = await User.findOne({
            $or: [
                { username: { $regex: `^${normalizedInput}$`, $options: 'i' } },
                { email: normalizedInput }
            ]
        });

        if (!user || !(await user.comparePassword(password))) {
            recordFailedLogin(ip);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check if account is archived
        if (user.isArchived) {
            return res.status(403).json({ message: 'This account has been deactivated. Please contact the administrator for assistance.' });
        }

        // Check if user is blocked
        if (user.isBlocked) {
            return res.status(403).json({ message: `Your account has been blocked. Reason: ${user.blockReason || 'Contact admin for details.'}` });
        }

        // Successful login — clear failed attempts
        clearLoginAttempts(ip);

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
        console.error('Login error:', error);
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
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            // Same message for both active and archived — don't leak account status
            return res.json({ 
                available: false, 
                message: 'This email is not available. Please use a different email.' 
            });
        }

        return res.json({ 
            available: true, 
            message: 'Email is available' 
        });
    } catch (error) {
        console.error('Error checking email:', error);
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
        const existingUser = await User.findOne({ username: normalizedUsername });

        if (existingUser) {
            // Same message for both active and archived — don't leak account status
            return res.json({ 
                available: false, 
                message: 'This username is not available. Please choose a different username.' 
            });
        }

        return res.json({ 
            available: true, 
            message: 'Username is available' 
        });
    } catch (error) {
        console.error('Error checking username:', error);
        res.status(500).json({ available: false, message: error.message });
    }
});

// DEBUG: Get all users — REMOVED for security
// router.get('/debug-users', ...) — intentionally removed

module.exports = router;