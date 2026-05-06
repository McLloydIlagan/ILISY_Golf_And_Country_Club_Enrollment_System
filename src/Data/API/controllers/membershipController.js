// src/Data/API/controllers/membershipController.js
const User = require('../models/User');
const Payment = require('../models/Payment');
const Application = require('../models/Application');
const { processBankPayment, sendEmail } = require('../utils/externalServices');

exports.applyForMembership = async (req, res) => {
    try {
        const { userId, firstName, lastName, email, phone, gender, age, address } = req.body;

        // Validate application details
        if (!firstName || !lastName || !email || !phone) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Check user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Create application
        const application = new Application({
            userId, firstName, lastName, email, phone,
            type: 'membership',
            details: { gender, age, address },
            status: 'pending'
        });

        await application.save();

        res.json({ 
            message: 'Membership application submitted',
            applicationId: application._id,
            amount: 1000000 // PHP
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.processMembershipPayment = async (req, res) => {
    try {
        const { userId, paymentMethod, accountNumber, amount } = req.body;

        if (!paymentMethod || !amount) {
            return res.status(400).json({ message: 'Invalid payment details' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // 1. Bank Services Mock
        const bankResponse = await processBankPayment({ paymentMethod, accountNumber, amount });

        // 2. D3: Payments Update
        const payment = new Payment({
            userId,
            firstName: user.firstName,
            lastName: user.lastName,
            paymentMethod,
            accountNumber,
            amount,
            transactionType: 'membership',
            paymentStatus: 'completed',
            transactionId: bankResponse.bankRef
        });
        await payment.save();

        // 3. D1: Registered Accounts Update
        await User.findByIdAndUpdate(userId, {
            membershipStatus: 'active',
            membershipExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });

        // 4. Email Services Mock
        const emailBody = `Dear ${user.firstName}, your payment of PHP ${amount} was successful. Your ILISY membership is now active! Ref: ${payment.transactionId}`;
        await sendEmail(user.email, 'ILISY Membership Payment Receipt', emailBody);

        res.json({ 
            message: 'Payment processed successfully',
            paymentId: payment._id,
            transactionId: payment.transactionId
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};