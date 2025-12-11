import bcrypt from 'bcryptjs';

// Get hash from database - you'll need to fill this in
const storedHash = '$2b$10$BwEVm1FdWa/xlGj3lkzRLuTIIBXVS5ULuoypm2h237KISC.MfVy.O'; // Copy the hash from Step 1

// Test password
const testPassword = 'manager123';

console.log('Testing password:', testPassword);
console.log('Hash prefix:', storedHash.substring(0, 30));

bcrypt.compare(testPassword, storedHash)
  .then(isValid => {
    console.log('Password valid:', isValid);
  })
  .catch(err => {
    console.error('Error:', err);
  });
