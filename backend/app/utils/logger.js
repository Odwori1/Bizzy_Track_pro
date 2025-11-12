export const log = {
  info: (message, meta = {}) => {
    console.log(`ℹ️  ${new Date().toISOString()} INFO: ${message}`, Object.keys(meta).length > 0 ? meta : '');
  },
  error: (message, error = {}) => {
    console.error(`❌ ${new Date().toISOString()} ERROR: ${message}`, error.message || error);
  },
  warn: (message, meta = {}) => {
    console.warn(`⚠️  ${new Date().toISOString()} WARN: ${message}`, Object.keys(meta).length > 0 ? meta : '');
  },
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🐛 ${new Date().toISOString()} DEBUG: ${message}`, Object.keys(meta).length > 0 ? meta : '');
    }
  }
};
