// User controller - handles user-related operations
const User = require('../models/User');

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { email, username } = req.body;

        // Validate that email and username are provided
        if (!email || !username) {
            return res.status(400).json({ 
                message: 'Email and username are required' 
            });
        }

        // Check if email or username already exists (case-insensitive)
        // Includes archived accounts — their email/username stays reserved
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedUsername = username.trim().toLowerCase();
        
        const existingUser = await User.findOne({ 
            $or: [{ email: normalizedEmail }, { username: normalizedUsername }] 
        }).collation({ locale: 'en', strength: 2 });

        if (existingUser) {
            if (existingUser.email.toLowerCase() === normalizedEmail) {
                return res.status(409).json({ 
                    message: 'Email is not available',
                    field: 'email'
                });
            }
            if (existingUser.username.toLowerCase() === normalizedUsername) {
                return res.status(409).json({ 
                    message: 'Username is not available',
                    field: 'username'
                });
            }
        }

        const user = new User(req.body);
        await user.save();
        res.status(201).json({
            message: 'User created successfully',
            user: {
                _id: user._id,
                email: user.email,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName
            }
        });
    } catch (error) {
        // Handle MongoDB unique constraint errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({ 
                message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
                field: field
            });
        }
        res.status(400).json({ message: error.message });
    }
};