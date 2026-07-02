import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage();

export function getCurrentContext() {
  return requestContext.getStore() || {};
}
