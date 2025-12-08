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
    console.log('Registration attempt:', req.body);

    const { name, email, phone, password } = req.body;

    // === Input Validation ===
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (typeof password !== 'string' || password.trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cleanName = name.trim();
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    // === Check if user already exists ===
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [cleanEmail]
    );

    if (existingUser.rows.length > 0) {
      console.log('Duplicate email attempt:', cleanEmail);
      return res.status(400).json({ error: 'Email already registered' });
    }

    // === Hash password ===
    const hashedPassword = await bcrypt.hash(password.trim(), 12);

    // === Insert new user ===
    const result = await db.query(
      `INSERT INTO users (name, email, phone, password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, name, email, phone`,
      [cleanName, cleanEmail, cleanPhone, hashedPassword]
    );

    const user = result.rows[0];
    console.log('New user created:', user.id, user.email);

    // === CRITICAL: Verify JWT_SECRET exists ===
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 20) {
      console.error('FATAL: JWT_SECRET is missing or too short!');
      return res.status(500).json({ error: 'Server configuration error. Contact admin.' });
    }

    // === Generate JWT ===
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // === SUCCESS ===
    return res.status(201).json({
      message: 'Registration successful!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error('REGISTRATION FAILED:', error.message);
    console.error('Full error object:', error);

    // PostgreSQL unique constraint violation
    if (error.code === '23505') {
      if (error.constraint?.includes('email')) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      if (error.constraint?.includes('phone')) {
        return res.status(400).json({ error: 'Phone number already in use' });
      }
    }

    // JWT errors
    if (error.name === 'JsonWebTokenError' || error.message.includes('secret')) {
      return res.status(500).json({ error: 'Authentication system error' });
    }

    return res.status(500).json({
      error: 'Registration failed. Please try again later.',
      // Remove this line in production
      // debug: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    const cleanEmail = email.toLowerCase().trim();

    const result = await db.query(
      'SELECT id, name, email, phone, password FROM users WHERE email = $1',
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET missing during login');
      return res.status(500).json({ error: 'Server error' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error('LOGIN FAILED:', error);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ==================== GET CURRENT USER ====================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await db.query(
      'SELECT id, name, email, phone, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });

  } catch (error) {
    console.error('GET /me error:', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;