// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ==================== REGISTER ====================
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Input validation
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const trimmedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [trimmedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Optional: Check phone uniqueness (uncomment if needed)
    // const phoneCheck = await db.query('SELECT id FROM users WHERE phone = $1', [phone.trim()]);
    // if (phoneCheck.rows.length > 0) {
    //   return res.status(400).json({ error: 'Phone number already in use' });
    // }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const result = await db.query(
      `INSERT INTO users (name, email, phone, password, created_at) 
       VALUES ($1, $2, $3, $4, NOW()) 
       RETURNING id, name, email, phone`,
      [name.trim(), trimmedEmail, phone.trim(), hashedPassword]
    );

    const user = result.rows[0];

    // Critical: Check if JWT_SECRET exists
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is missing in .env file!');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Success response
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      },
      token
    });

  } catch (error) {
    console.error('Registration Error:', error.message);
    console.error('Full error:', error);

    // Handle specific PostgreSQL errors
    if (error.code === '23505') { // Unique violation
      if (error.constraint?.includes('email')) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      if (error.constraint?.includes('phone')) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    }

    // JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(500).json({ error: 'Authentication system error' });
    }

    res.status(500).json({ 
      error: 'Registration failed. Please try again later.',
      // Remove this line in production
      // debug: error.message 
    });
  }
});

// ==================== LOGIN ====================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const trimmedEmail = email.toLowerCase().trim();

    // Find user
    const result = await db.query(
      'SELECT id, name, email, phone, password FROM users WHERE email = $1',
      [trimmedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Compare password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET missing!');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      },
      token
    });

  } catch (error) {
    console.error('Login Error:', error.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ==================== GET CURRENT USER (Protected) ====================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, phone, created_at FROM users WHERE id = $1',
      [req.user.userId]  // Fixed: use req.user.userId from authMiddleware
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

module.exports = router;