// Global test setup
import { log } from '../app/utils/logger.js';

// Suppress console logs during tests to keep output clean
console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.error = () => {};

// Suppress the application logger during tests
log.info = () => {};
log.error = () => {};
log.warn = () => {};
log.debug = () => {};

// Note: jest.setTimeout() should be called in jest.config.js, not here
