import { authenticate } from './auth.js';
import { setRLSContext } from './rlsContext.js';

// Single source of truth: every protected route gets both authentication
// AND tenant context, or neither. There is no longer a way to wire one
// without the other.
export const requireAuth = [authenticate, setRLSContext];
