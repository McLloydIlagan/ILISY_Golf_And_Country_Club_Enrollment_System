// Validation middleware
const User = require('../models/User');

// Check if email already exists in database
const checkEmailExists = async (email) => {
    const user = await User.findOne({ email: email.toLowerCase() });
    return user !== null;
};

// Check if username already exists in database
const checkUsernameExists = async (username) => {
    const user = await User.findOne({ username: username.toLowerCase() });
    return user !== null;
};

// Check if both email and username are available
const checkEmailAndUsernameAvailable = async (email, username) => {
    const existingUser = await User.findOne({
        $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }]
    });
    
    if (!existingUser) return { available: true };
    
    const issues = [];
    if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        issues.push('email');
    }
    if (existingUser.username.toLowerCase() === username.toLowerCase()) {
        issues.push('username');
    }
    
    return { available: false, issues };
};

const validateRequest = (req, res, next) => {
    next();
};

module.exports = {
    validateRequest,
    checkEmailExists,
    checkUsernameExists,
    checkEmailAndUsernameAvailable
};