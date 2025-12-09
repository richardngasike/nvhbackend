// backend/config/database.js
const { Pool } = require('pg');

// Configuration for the pool
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  min: 2, // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection not established
  maxUses: 7500, // Close and replace a connection after it has been used this many times
};

const pool = new Pool(poolConfig);

// Handle successful connections
pool.on('connect', (client) => {
  console.log('✅ New client connected to PostgreSQL database');
});

// Handle connection errors
pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle PostgreSQL client:', err.message);
  console.error('Error details:', err);
  // Don't exit the process - let it try to reconnect
});

// Handle client removal
pool.on('remove', () => {
  console.log('Client removed from pool');
});

// Test the connection on startup
const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connection test successful!');
    console.log('   Current time:', result.rows[0].current_time);
    console.log('   PostgreSQL version:', result.rows[0].pg_version.split(',')[0]);
    return true;
  } catch (err) {
    console.error('❌ Database connection test failed!');
    console.error('   Error:', err.message);
    console.error('   Code:', err.code);
    
    // Provide helpful error messages
    if (err.code === 'ENOTFOUND') {
      console.error('   → Database host not found. Check your DATABASE_URL host.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('   → Connection refused. Check your DATABASE_URL port (should be 5432).');
    } else if (err.message.includes('password authentication failed')) {
      console.error('   → Password authentication failed. Check your database password.');
    } else if (err.message.includes('SSL')) {
      console.error('   → SSL connection issue. Make sure SSL is properly configured.');
    }
    
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Run connection test
testConnection().then((success) => {
  if (!success) {
    console.error('\n⚠️  WARNING: Database connection failed. Please check your configuration.');
    console.error('   DATABASE_URL format should be:');
    console.error('   postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres\n');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing database pool');
  await pool.end();
  console.log('Database pool closed');
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing database pool');
  await pool.end();
  console.log('Database pool closed');
  process.exit(0);
});

// Export query function with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error:', error.message);
    console.error('Query text:', text);
    throw error;
  }
};

module.exports = {
  query,
  pool,
  // Helper function for transactions
  getClient: () => pool.connect(),
};