require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();

if (!process.env.JWT_SECRET) {
    console.warn('⚠️ JWT_SECRET not set, using default. Please set this in production!');
    process.env.JWT_SECRET = 'ilisy-golf-secret-key-2026';
}

// Middleware
app.use(cors({
    origin: [
        'http://127.0.0.1:5500',
        'http://127.0.0.1:5501',
        'http://localhost:5500', 
        'https://ilisy-golf-frontend.onrender.com',
        'https://ilisy-golf-and-country-club-enrollment.onrender.com'
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Root endpoint - API information
app.get('/', (req, res) => {
    res.json({
        name: 'ILISY Golf Club API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            auth: '/api/auth',
            membership: '/api/membership',
            reservations: '/api/reservations',
            payments: '/api/payments',
            messages: '/api/messages',
            admin: '/api/admin',
            health: '/health'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running!', timestamp: new Date() });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/membership', require('./routes/membership'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/reservation-types', require('./routes/reservationTypes'));
app.use('/api/users', require('./routes/users'));

// 404 handler for undefined routes
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.originalUrl}`
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: err.message 
    });
});

// Serve static files for uploads
app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`❤️  Health check at http://localhost:${PORT}/health`);
});