// File: backend/app/middleware/accountingSetup.js
// Purpose: Gate transaction-creating routes (POS sale, invoice, refund, etc.)
// on whether the business has actually completed minimum accounting setup.
//
// Backed by get_business_setup_completeness() (migration 1510, fixed in 1511),
// which computes readiness live from chart_of_accounts and opening_balances —
// not from the cached business_accounting_status flags alone, since those
// were found to be unreliable in isolation (see migrations 1510/1511 for the
// two status-tracking bugs this was built to work around).
//
// Deliberately different from requirePermission() in two ways:
//   1. No owner bypass — setup completeness is a business-state question,
//      not a user-permission question. An owner is just as blocked as
//      anyone else if the business itself isn't ready to transact.
//   2. Fails CLOSED on error, not open — if the completeness check itself
//      breaks, letting a possibly-unready business transact anyway is the
//      wrong default; better to block and surface the error.

import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const requireAccountingSetup = () => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const businessId = req.user.businessId || req.user.business_id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found in user session'
        });
      }

      const result = await query(
        'SELECT * FROM get_business_setup_completeness($1)',
        [businessId]
      );

      if (result.rows.length === 0) {
        log.error('Accounting setup check returned no rows', { businessId });
        return res.status(500).json({
          success: false,
          error: 'Unable to verify accounting setup status'
        });
      }

      const status = result.rows[0];

      if (!status.is_ready_to_transact) {
        log.warn('Accounting setup incomplete, blocking transaction', {
          businessId,
          userId: req.user.userId,
          path: req.path,
          hasChartOfAccounts: status.has_chart_of_accounts,
          hasOpeningBalances: status.has_opening_balances,
          openingBalancesPosted: status.opening_balances_posted,
          reasons: status.reasons
        });

        return res.status(403).json({
          success: false,
          error: 'Accounting setup is not complete',
          reasons: status.reasons,
          setupStatus: {
            hasChartOfAccounts: status.has_chart_of_accounts,
            chartOfAccountsCount: status.chart_of_accounts_count,
            hasOpeningBalances: status.has_opening_balances,
            openingBalancesPosted: status.opening_balances_posted
          }
        });
      }

      log.debug('Accounting setup verified', {
        businessId,
        path: req.path
      });

      next();
    } catch (error) {
      log.error('Accounting setup check failed', error);

      // Fail CLOSED: unlike requirePermission's owner fallback, a broken
      // completeness check should not let a possibly-unready business
      // transact. Block and surface the error instead.
      return res.status(500).json({
        success: false,
        error: 'Accounting setup verification failed'
      });
    }
  };
};
