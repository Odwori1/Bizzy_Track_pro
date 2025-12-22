// Quick test script to verify API connectivity
const axios = require('axios');

const API_BASE = 'http://localhost:8002/api';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiNGFmMTY5OS0wMTQ5LTQ3ZTItYmM1NS02NjIxNGMwNTcyYmEiLCJidXNpbmVzc0lkIjoiMjQzYTE1YjUtMjU1YS00ODUyLTgzYmYtNWNiNDZhYTYyYjVlIiwiZW1haWwiOiJmaXhlZEB0ZXN0LmNvbSIsInJvbGUiOiJvd25lciIsInRpbWV6b25lIjoiQWZyaWNhL05haXJvYmkiLCJpYXQiOjE3NjYzOTE4NTYsImV4cCI6MTc2Njk5NjY1Nn0.wLE6bguJ121nvRiaZZC4W81GV32efqidZvMmnSoES0o'; // Get from localStorage or login

async function testEndpoints() {
  const headers = {
    'Authorization': `Bearer ${TOKEN}`
  };

  console.log('Testing Workforce API Endpoints...\n');

  try {
    // Test 1: Staff Profiles
    console.log('1. Testing /workforce/staff-profiles...');
    const staffRes = await axios.get(`${API_BASE}/workforce/staff-profiles`, { headers });
    console.log(`   ✓ Success: ${staffRes.data.data.length} staff profiles\n`);

    // Test 2: Shifts
    console.log('2. Testing /workforce/shifts...');
    const shiftsRes = await axios.get(`${API_BASE}/workforce/shifts?start_date=2025-01-01&end_date=2025-12-31`, { headers });
    console.log(`   ✓ Success: ${shiftsRes.data.data.length} shifts\n`);

    // Test 3: Timesheets
    console.log('3. Testing /workforce/timesheets...');
    const timesheetsRes = await axios.get(`${API_BASE}/workforce/timesheets`, { headers });
    console.log(`   ✓ Success: ${timesheetsRes.data.data.length} timesheets\n`);

    // Test 4: Performance
    console.log('4. Testing /workforce/performance...');
    const performanceRes = await axios.get(`${API_BASE}/workforce/performance`, { headers });
    console.log(`   ✓ Success: ${performanceRes.data.data.length} performance metrics\n`);

    // Test 5: Availability
    console.log('5. Testing /workforce/availability...');
    const availabilityRes = await axios.get(`${API_BASE}/workforce/availability`, { headers });
    console.log(`   ✓ Success: ${availabilityRes.data.data.length} availability records\n`);

    console.log('✅ All API endpoints working correctly!');

  } catch (error) {
    console.error('❌ API Test failed:', error.response?.data || error.message);
  }
}

// Run test
testEndpoints();
