// backend/routes/listings.js
const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all listings
router.get('/', async (req, res) => {
  try {
    const { category, location, search } = req.query;
    let query = `
      SELECT l.*, u.name as owner_name, u.phone as owner_phone 
      FROM listings l 
      JOIN users u ON l.user_id = u.id 
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (category) {
      query += ` AND l.category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (location) {
      query += ` AND l.county = $${paramCount}`;
      params.push(location);
      paramCount++;
    }

    if (search) {
      query += ` AND (l.title ILIKE $${paramCount} OR l.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ' ORDER BY l.created_at DESC';

    const result = await db.query(query, params);
    res.json({ listings: result.rows });
  } catch (error) {
    console.error('Get listings error:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// Get single listing
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT l.*, u.name as owner_name, u.email as owner_email, u.phone as owner_phone 
       FROM listings l 
       JOIN users u ON l.user_id = u.id 
       WHERE l.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    res.json({ listing: result.rows[0] });
  } catch (error) {
    console.error('Get listing error:', error);
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// Create listing
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      custom_category,
      location,
      county,
      phone,
      amenities,
      images
    } = req.body;

    // Validate required fields
    if (!title || !category || !location || !county || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate images (max 5)
    if (!images || images.length === 0 || images.length > 5) {
      return res.status(400).json({ error: 'Please provide 1-5 images' });
    }

    const result = await db.query(
      `INSERT INTO listings 
       (user_id, title, description, category, custom_category, location, county, phone, amenities, images) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [
        req.userId,
        title,
        description,
        category,
        custom_category,
        location,
        county,
        phone,
        amenities || [],
        images
      ]
    );

    res.status(201).json({
      message: 'Listing created successfully',
      listing: result.rows[0]
    });
  } catch (error) {
    console.error('Create listing error:', error);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

// Get user's listings
router.get('/user/my-listings', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM listings WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );

    res.json({ listings: result.rows });
  } catch (error) {
    console.error('Get user listings error:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// Update listing
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      custom_category,
      location,
      county,
      phone,
      amenities,
      images
    } = req.body;

    // Check ownership
    const checkOwnership = await db.query(
      'SELECT user_id FROM listings WHERE id = $1',
      [id]
    );

    if (checkOwnership.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (checkOwnership.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await db.query(
      `UPDATE listings 
       SET title = $1, description = $2, category = $3, custom_category = $4, 
           location = $5, county = $6, phone = $7, amenities = $8, images = $9, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $10 
       RETURNING *`,
      [title, description, category, custom_category, location, county, phone, amenities, images, id]
    );

    res.json({
      message: 'Listing updated successfully',
      listing: result.rows[0]
    });
  } catch (error) {
    console.error('Update listing error:', error);
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// Delete listing
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const checkOwnership = await db.query(
      'SELECT user_id FROM listings WHERE id = $1',
      [id]
    );

    if (checkOwnership.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (checkOwnership.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.query('DELETE FROM listings WHERE id = $1', [id]);

    res.json({ message: 'Listing deleted successfully' });
  } catch (error) {
    console.error('Delete listing error:', error);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

module.exports = router;