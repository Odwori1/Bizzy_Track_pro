import { log } from './logger.js';

export const withPerformanceLogging = (fn, name) => {
  return async (...args) => {
    const start = Date.now();
    try {
      const result = await fn(...args);
      const duration = Date.now() - start;
      
      if (duration > 1000) { // Log slow operations (>1 second)
        log.warn('Slow operation detected', {
          operation: name,
          duration: `${duration}ms`,
          threshold: '1000ms'
        });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      log.error('Operation failed', {
        operation: name,
        duration: `${duration}ms`,
        error: error.message
      });
      throw error;
    }
  };
};
