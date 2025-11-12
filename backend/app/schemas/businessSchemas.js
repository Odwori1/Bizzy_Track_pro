import Joi from 'joi';

export const businessRegistrationSchema = Joi.object({
  businessName: Joi.string().min(2).max(100).required().messages({
    'string.empty': 'Business name is required',
    'string.min': 'Business name must be at least 2 characters',
    'string.max': 'Business name must be less than 100 characters'
  }),
  ownerName: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required().messages({
    'string.min': 'Password must be at least 8 characters'
  }),
  currency: Joi.string().length(3).uppercase().default('GHS'),
  timezone: Joi.string().required().messages({
    'string.empty': 'Timezone is required for proper date handling'
  })
  // REMOVED: clientContext validation
});

export const businessLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Utility functions for dynamic configuration
export const TimezoneService = {
  // Common African timezones for suggestions (not defaults)
  getCommonTimezones() {
    return [
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
  },

  // Validate if timezone exists in IANA database
  isValidTimezone(timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch (e) {
      return false;
    }
  },

  // Get current time in any timezone
  getCurrentTimeInTimezone(timezone) {
    return new Date().toLocaleString('en-US', { timeZone: timezone });
  }
};

export const CurrencyService = {
  // African currencies with auto-symbol detection
  getAfricanCurrencies() {
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
  },

  getCurrencySymbol(currencyCode) {
    const currencies = this.getAfricanCurrencies();
    return currencies[currencyCode]?.symbol || currencyCode;
  },

  isValidCurrency(currencyCode) {
    const currencies = this.getAfricanCurrencies();
    return !!currencies[currencyCode];
  }
};
