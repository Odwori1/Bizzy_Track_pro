import { query, getClient } from '../utils/database.js';
import { hashPassword, generateToken } from '../utils/security.js';
import { log } from '../utils/logger.js';

// Timezone validation utility
const isValidTimezone = (timezone) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (e) {
    return false;
  }
};

// Currency configuration
const getAfricanCurrencies = () => {
  return {
    'GHS': { symbol: '₵', name: 'Ghana Cedi' },
    'NGN': { symbol: '₦', name: 'Nigerian Naira' },
    'KES': { symbol: 'KSh', name: 'Kenyan Shilling' },
    'UGX': { symbol: 'USh', name: 'Ugandan Shilling' },
    'TZS': { symbol: 'TSh', name: 'Tanzanian Shilling' },
    'ZAR': { symbol: 'R', name: 'South African Rand' },
    'ETB': { symbol: 'Br', name: 'Ethiopian Birr' },
    'RWF': { symbol: 'FRw', name: 'Rwandan Franc' },
    'XOF': { symbol: 'CFA', name: 'West African CFA Franc' },
    'XAF': { symbol: 'FCFA', name: 'Central African CFA Franc' },
    'USD': { symbol: '$', name: 'US Dollar' },
    'EUR': { symbol: '€', name: 'Euro' },
    'GBP': { symbol: '£', name: 'British Pound' }
  };
};

const getCurrencySymbol = (currencyCode) => {
  const currencies = getAfricanCurrencies();
  return currencies[currencyCode]?.symbol || currencyCode;
};

const isValidCurrency = (currencyCode) => {
  const currencies = getAfricanCurrencies();
  return !!currencies[currencyCode];
};

export const businessService = {
  async registerBusiness(businessData) {
    const { businessName, ownerName, email, password, currency, timezone } = businessData;

    log.info('Starting business registration', { businessName, email, timezone });

    // Validate timezone before proceeding
    if (!isValidTimezone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    // Validate currency
    if (!isValidCurrency(currency)) {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get currency symbol dynamically
      const currencySymbol = getCurrencySymbol(currency);

      // 1. Create business with client-provided timezone
      const businessResult = await client.query(
        `INSERT INTO businesses (name, currency, currency_symbol, timezone)
         VALUES ($1, $2, $3, $4) RETURNING id, name, currency, currency_symbol, timezone, created_at`,
        [businessName, currency, currencySymbol, timezone]
      );

      const business = businessResult.rows[0];
      log.info('Business created', {
        businessId: business.id,
        timezone: business.timezone,
        currency: business.currency
      });

      // 2. Hash password and create owner user
      const hashedPassword = await hashPassword(password);

      const userResult = await client.query(
        `INSERT INTO users (business_id, email, full_name, password_hash, role, timezone)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, full_name, role, timezone`,
        [business.id, email, ownerName, hashedPassword, 'owner', timezone]
      );

      const user = userResult.rows[0];
      log.info('Owner user created', {
        userId: user.id,
        userTimezone: user.timezone
      });

      // 3. CREATE DEFAULT ROLES AND PERMISSIONS FOR THE BUSINESS
      log.info('Creating default roles and permissions', { businessId: business.id });
      
      const defaultRoles = [
        {
          name: 'owner',
          description: 'Full system access with all permissions',
          permissions: [
            'customer:create', 'customer:read', 'customer:update', 'customer:delete',
            'service:create', 'service:read', 'service:update', 'service:delete',
            'category:create', 'category:read', 'category:update', 'category:delete'
          ]
        },
        {
          name: 'manager', 
          description: 'Management access without business settings',
          permissions: [
            'customer:create', 'customer:read', 'customer:update',
            'service:create', 'service:read', 'service:update', 
            'category:create', 'category:read', 'category:update'
          ]
        },
        {
          name: 'staff',
          description: 'Basic operational access',
          permissions: [
            'customer:read', 'customer:create',
            'service:read',
            'category:read'
          ]
        }
      ];

      // Copy system permissions to business-specific permissions
      const systemPermissionsResult = await client.query(
        'SELECT name, category, description, resource_type, action FROM permissions WHERE business_id IS NULL'
      );

      for (const systemPermission of systemPermissionsResult.rows) {
        await client.query(
          `INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
           VALUES ($1, $2, $3, $4, $5, $6, false)`,
          [business.id, systemPermission.name, systemPermission.category, 
           systemPermission.description, systemPermission.resource_type, systemPermission.action]
        );
      }

      // Create roles and assign permissions
      for (const roleData of defaultRoles) {
        const roleResult = await client.query(
          `INSERT INTO roles (business_id, name, description, is_system_role) 
           VALUES ($1, $2, $3, true) RETURNING id`,
          [business.id, roleData.name, roleData.description]
        );
        
        const roleId = roleResult.rows[0].id;
        
        // Assign permissions to role
        for (const permissionName of roleData.permissions) {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id)
             SELECT $1, id FROM permissions 
             WHERE name = $2 AND business_id = $3`,
            [roleId, permissionName, business.id]
          );
        }

        log.info(`Default role created: ${roleData.name}`, { 
          businessId: business.id, 
          roleId,
          permissionsCount: roleData.permissions.length 
        });
      }

      // 4. Generate JWT token with timezone info
      const token = generateToken({
        userId: user.id,
        businessId: business.id,
        email: user.email,
        role: user.role,
        timezone: user.timezone
      });

      await client.query('COMMIT');

      log.info('Business registration completed successfully', {
        businessId: business.id,
        timezone: business.timezone,
        currency: business.currency,
        rolesCreated: defaultRoles.length
      });

      return {
        success: true,
        business: {
          id: business.id,
          name: business.name,
          currency: business.currency,
          currencySymbol: business.currency_symbol,
          timezone: business.timezone,
          createdAt: business.created_at
        },
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          timezone: user.timezone
        },
        token,
        timezoneInfo: {
          detected: timezone,
          currentTime: new Date().toLocaleString('en-US', { timeZone: timezone }),
          isValid: true
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Business registration failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getBusinessProfile(businessId) {
    log.info('Fetching business profile', { businessId });

    const result = await query(
      'SELECT id, name, currency, currency_symbol, timezone, created_at FROM businesses WHERE id = $1',
      [businessId]
    );

    return result.rows[0];
  },

  // Get system configuration
  async getSystemConfig() {
    const commonTimezones = [
      'Africa/Abidjan', 'Africa/Accra', 'Africa/Addis_Ababa', 'Africa/Algiers',
      'Africa/Asmara', 'Africa/Bamako', 'Africa/Bangui', 'Africa/Banjul',
      'Africa/Bissau', 'Africa/Blantyre', 'Africa/Brazzaville', 'Africa/Bujumbura',
      'Africa/Cairo', 'Africa/Casablanca', 'Africa/Ceuta', 'Africa/Conakry',
      'Africa/Dakar', 'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Douala',
      'Africa/El_Aaiun', 'Africa/Freetown', 'Africa/Gaborone', 'Africa/Harare',
      'Africa/Johannesburg', 'Africa/Juba', 'Africa/Kampala', 'Africa/Khartoum',
      'Africa/Kigali', 'Africa/Kinshasa', 'Africa/Lagos', 'Africa/Libreville',
      'Africa/Lome', 'Africa/Luanda', 'Africa/Lubumbashi', 'Africa/Lusaka',
      'Africa/Malabo', 'Africa/Maputo', 'Africa/Maseru', 'Africa/Mbabane',
      'Africa/Mogadishu', 'Africa/Monrovia', 'Africa/Nairobi', 'Africa/Ndjamena',
      'Africa/Niamey', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Africa/Porto-Novo',
      'Africa/Sao_Tome', 'Africa/Tripoli', 'Africa/Tunis', 'Africa/Windhoek'
    ];

    return {
      timezones: {
        common: commonTimezones,
        autoDetect: true,
        validation: true
      },
      currencies: getAfricanCurrencies(),
      features: {
        clientTimezoneDetection: true,
        dynamicCurrencySymbols: true,
        timezoneAwareDates: true
      }
    };
  }
};
