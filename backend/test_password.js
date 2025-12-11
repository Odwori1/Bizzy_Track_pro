const bcrypt = require('bcryptjs');

// Get the stored hash for manager@new.com
const storedHash = ''; // Get this from database

// Test password
const testPassword = 'manager123';

// Manually test
bcrypt.compare(testPassword, storedHash)
  .then(isValid => {
    console.log('Password valid:', isValid);
  })
  .catch(err => {
    console.error('Error:', err);
  });
