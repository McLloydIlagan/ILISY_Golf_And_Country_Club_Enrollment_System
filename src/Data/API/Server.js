require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Basic middleware (these don't need files)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// SIMPLE TEST ROUTE FIRST (to verify server works)
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running!' });
});

// COMMENT OUT all route imports for now
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/membership', require('./routes/membership'));
// app.use('/api/reservations', require('./routes/reservations'));
// app.use('/api/payments', require('./routes/payments'));
// app.use('/api/messages', require('./routes/messages'));
// app.use('/api/admin', require('./routes/admin'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});