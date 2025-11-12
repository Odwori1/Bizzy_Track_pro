-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Businesses table (tenant isolation)
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  currency VARCHAR(3) DEFAULT 'GHS',
  currency_symbol VARCHAR(5) DEFAULT '₵',
  timezone VARCHAR(50) DEFAULT 'Africa/Accra',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Users table (staff accounts)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'staff',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, email)
);

-- Enable RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (we'll enhance these later)
CREATE POLICY businesses_isolation_policy ON businesses
  FOR ALL USING (true); -- Temporary, will be updated

CREATE POLICY users_isolation_policy ON users
  FOR ALL USING (true); -- Temporary, will be updated
