// Admin controller
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');

exports.getDashboardStats = async (req, res) => {
    try {
        const memberCount = await User.countDocuments({ membershipStatus: 'active' });
        const reservationCount = await Reservation.countDocuments({ status: 'confirmed' });
        const payments = await Payment.find({ paymentStatus: 'completed' });
        const totalIncome = payments.reduce((sum, p) => sum + p.amount, 0);

        res.json({
            members: memberCount,
            reservations: reservationCount,
            income: totalIncome
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};