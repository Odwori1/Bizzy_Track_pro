// File: ~/Bizzy_Track_pro/backend/app/services/discountAccountingService.js
// PURPOSE: Create journal entries for discounts (GAAP compliance)
// PHASE 10.7: Following patterns from completed discount services
// DEPENDS ON: discountCore.js, discountAllocationService.js, chart_of_accounts table

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { DiscountCore } from './discountCore.js';
import { DiscountAllocationService } from './discountAllocationService.js';

export class DiscountAccountingService {

    /**
     * =====================================================
     * SECTION 1: ACCOUNT DETERMINATION
     * =====================================================
     */

    /**
     * Account code mapping by discount type
     * 4110 - Sales Discounts (default)
     * 4111 - Volume Discounts
     * 4112 - Early Payment Discounts
     * 4113 - Promotional Discounts
     */
    static getDiscountAccountByType(ruleType) {
        const accountMap = {
            'PROMOTIONAL': '4113',
            'VOLUME': '4111',
            'EARLY_PAYMENT': '4112',
            'CATEGORY': '4110',
            'PRICING_RULE': '4110',
            'GENERAL': '4110'
        };
        return accountMap[ruleType] || '4110';
    }

    /**
     * Get discount account ID from database
     */
    static async getDiscountAccountId(businessId, accountCode) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT id FROM chart_of_accounts
                 WHERE business_id = $1 AND account_code = $2 AND is_active = true`,
                [businessId, accountCode]
            );

            if (result.rows.length === 0) {
                // Try to create the account if it doesn't exist
                await client.query(
                    `INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type)
                     VALUES ($1, $2, $3, 'expense')
                     ON CONFLICT (business_id, account_code) DO NOTHING`,
                    [businessId, accountCode, `Sales Discounts - ${accountCode}`]
                );
                
                // Try again
                const retryResult = await client.query(
                    `SELECT id FROM chart_of_accounts
                     WHERE business_id = $1 AND account_code = $2 AND is_active = true`,
                    [businessId, accountCode]
                );
                
                if (retryResult.rows.length === 0) {
                    throw new Error(`Discount account ${accountCode} could not be created for business`);
                }
                
                return retryResult.rows[0].id;
            }

            return result.rows[0].id;

        } catch (error) {
            log.error('Error getting discount account ID', { error: error.message, accountCode });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get revenue account ID (usually 4100 - Sales Revenue)
     */
    static async getRevenueAccountId(businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT id FROM chart_of_accounts
                 WHERE business_id = $1 AND account_code = '4100' AND is_active = true`,
                [businessId]
            );

            if (result.rows.length === 0) {
                // Try to create the account if it doesn't exist
                await client.query(
                    `INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type)
                     VALUES ($1, '4100', 'Sales Revenue', 'revenue')
                     ON CONFLICT (business_id, account_code) DO NOTHING`,
                    [businessId]
                );
                
                // Try again
                const retryResult = await client.query(
                    `SELECT id FROM chart_of_accounts
                     WHERE business_id = $1 AND account_code = '4100' AND is_active = true`,
                    [businessId]
                );
                
                if (retryResult.rows.length === 0) {
                    throw new Error('Revenue account (4100) could not be created for business');
                }
                
                return retryResult.rows[0].id;
            }

            return result.rows[0].id;

        } catch (error) {
            log.error('Error getting revenue account ID', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 2: JOURNAL ENTRY CREATION
     * =====================================================
     */

    /**
     * Generate unique journal reference number
     * Format: JE-YYYY-MM-XXXXX
     */
    static async _generateJournalReferenceNumber(businessId) {
        const client = await getClient();

        try {
            const year = new Date().getFullYear();
            const month = String(new Date().getMonth() + 1).padStart(2, '0');

            const result = await client.query(
                `SELECT COUNT(*) + 1 as next_num
                 FROM journal_entries
                 WHERE business_id = $1
                    AND reference_number LIKE $2`,
                [businessId, `JE-${year}-${month}-%`]
            );

            const nextNum = String(result.rows[0].next_num).padStart(5, '0');
            return `JE-${year}-${month}-${nextNum}`;

        } catch (error) {
            log.error('Error generating journal reference number', { error: error.message });
            return `JE-${new Date().toISOString().slice(0,7)}-${Date.now()}`;
        } finally {
            client.release();
        }
    }

    /**
     * Create journal entry for a single discount
     */
    static async createDiscountJournalEntry(transaction, discountInfo, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const businessId = transaction.business_id;

            // Get appropriate discount account based on discount type
            const accountCode = this.getDiscountAccountByType(discountInfo.rule_type);
            const discountAccountId = await this.getDiscountAccountId(businessId, accountCode);
            const revenueAccountId = await this.getRevenueAccountId(businessId);

            // Generate journal reference number
            const referenceNumber = await this._generateJournalReferenceNumber(businessId);

            // Create journal entry
            const journalResult = await client.query(
                `INSERT INTO journal_entries (
                    business_id, journal_date, reference_number, description,
                    reference_type, reference_id, total_amount, status, 
                    created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                RETURNING id, reference_number`,
                [
                    businessId,
                    new Date().toISOString().split('T')[0],
                    referenceNumber,
                    `Discount applied - ${discountInfo.rule_type} - ${discountInfo.name || discountInfo.code || ''}`,
                    transaction.type || 'TRANSACTION',
                    transaction.id,
                    discountInfo.discount_amount,
                    'draft',
                    userId
                ]
            );

            const journalId = journalResult.rows[0].id;

            // Create journal lines (debit discount account, credit revenue account)
            await client.query(
                `INSERT INTO journal_entry_lines (
                    business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                ) VALUES 
                    ($1, $2, $3, 'debit', $4, $5, NOW()),
                    ($1, $2, $6, 'credit', $4, $7, NOW())`,
                [
                    businessId,
                    journalId,
                    discountAccountId,
                    discountInfo.discount_amount,
                    `${discountInfo.rule_type} discount`,
                    revenueAccountId,
                    `Revenue reduction from ${discountInfo.rule_type} discount`
                ]
            );

            // Link allocation to journal entry if allocation exists
            if (discountInfo.allocation_id) {
                await client.query(
                    `UPDATE discount_allocations
                     SET journal_entry_id = $1, updated_at = NOW()
                     WHERE id = $2 AND business_id = $3`,
                    [journalId, discountInfo.allocation_id, businessId]
                );
            }

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_accounting.journal_created',
                resourceType: 'journal_entry',
                resourceId: journalId,
                newValues: {
                    reference_number: referenceNumber,
                    discount_amount: discountInfo.discount_amount,
                    account_code: accountCode,
                    rule_type: discountInfo.rule_type
                }
            });

            log.info('Discount journal entry created', {
                businessId,
                userId,
                journalId,
                referenceNumber,
                discountAmount: discountInfo.discount_amount,
                accountCode
            });

            await client.query('COMMIT');

            return {
                journal_id: journalId,
                reference_number: referenceNumber,
                discount_amount: discountInfo.discount_amount,
                account_code: accountCode,
                lines: [
                    { account_id: discountAccountId, line_type: 'debit', amount: discountInfo.discount_amount },
                    { account_id: revenueAccountId, line_type: 'credit', amount: discountInfo.discount_amount }
                ]
            };

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error creating discount journal entry', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Create journal entry for multiple discounts (stacked)
     */
    static async createBulkDiscountJournalEntries(transaction, discounts, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const businessId = transaction.business_id;
            const revenueAccountId = await this.getRevenueAccountId(businessId);

            // Group discounts by account code
            const discountsByAccount = {};
            let totalDiscount = 0;

            for (const discount of discounts) {
                const accountCode = this.getDiscountAccountByType(discount.rule_type);
                if (!discountsByAccount[accountCode]) {
                    discountsByAccount[accountCode] = {
                        accountCode,
                        total: 0,
                        discounts: []
                    };
                }
                discountsByAccount[accountCode].total += discount.discount_amount;
                discountsByAccount[accountCode].discounts.push(discount);
                totalDiscount += discount.discount_amount;
            }

            // Generate journal reference number
            const referenceNumber = await this._generateJournalReferenceNumber(businessId);

            // Create journal entry
            const journalResult = await client.query(
                `INSERT INTO journal_entries (
                    business_id, journal_date, reference_number, description,
                    reference_type, reference_id, total_amount, status, 
                    created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                RETURNING id, reference_number`,
                [
                    businessId,
                    new Date().toISOString().split('T')[0],
                    referenceNumber,
                    `Multiple discounts applied - ${discounts.length} discounts`,
                    transaction.type || 'TRANSACTION',
                    transaction.id,
                    totalDiscount,
                    'draft',
                    userId
                ]
            );

            const journalId = journalResult.rows[0].id;

            // Create debit lines for each discount account
            for (const [accountCode, data] of Object.entries(discountsByAccount)) {
                const accountId = await this.getDiscountAccountId(businessId, accountCode);

                await client.query(
                    `INSERT INTO journal_entry_lines (
                        business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                    ) VALUES ($1, $2, $3, 'debit', $4, $5, NOW())`,
                    [
                        businessId,
                        journalId,
                        accountId,
                        data.total,
                        `${data.discounts.length} ${accountCode} discounts`
                    ]
                );

                // Link allocations to journal entry
                for (const discount of data.discounts) {
                    if (discount.allocation_id) {
                        await client.query(
                            `UPDATE discount_allocations
                             SET journal_entry_id = $1, updated_at = NOW()
                             WHERE id = $2 AND business_id = $3`,
                            [journalId, discount.allocation_id, businessId]
                        );
                    }
                }
            }

            // Create credit line for revenue account
            await client.query(
                `INSERT INTO journal_entry_lines (
                    business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                ) VALUES ($1, $2, $3, 'credit', $4, $5, NOW())`,
                [
                    businessId,
                    journalId,
                    revenueAccountId,
                    totalDiscount,
                    `Revenue reduction from ${discounts.length} discounts`
                ]
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_accounting.bulk_journal_created',
                resourceType: 'journal_entry',
                resourceId: journalId,
                newValues: {
                    reference_number: referenceNumber,
                    total_discount: totalDiscount,
                    discount_count: discounts.length,
                    accounts: Object.keys(discountsByAccount)
                }
            });

            log.info('Bulk discount journal entries created', {
                businessId,
                userId,
                journalId,
                referenceNumber,
                totalDiscount,
                discountCount: discounts.length
            });

            await client.query('COMMIT');

            return {
                journal_id: journalId,
                reference_number: referenceNumber,
                total_discount: totalDiscount,
                discount_count: discounts.length,
                accounts: Object.keys(discountsByAccount)
            };

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error creating bulk discount journal entries', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Create reversing journal entry for voided discount
     */
    static async createVoidJournalEntry(allocation, reason, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const businessId = allocation.business_id;

            // Get the original journal entry
            const originalJournal = await client.query(
                `SELECT * FROM journal_entries WHERE id = $1`,
                [allocation.journal_entry_id]
            );

            if (originalJournal.rows.length === 0) {
                throw new Error('Original journal entry not found');
            }

            // Check if original can be voided
            if (originalJournal.rows[0].status === 'posted') {
                throw new Error('Cannot void a posted journal entry - create reversal instead');
            }

            // Generate reversal reference number
            const referenceNumber = await this._generateJournalReferenceNumber(businessId);

            // Create reversal journal entry
            const journalResult = await client.query(
                `INSERT INTO journal_entries (
                    business_id, journal_date, reference_number, description,
                    reference_type, reference_id, total_amount, status, 
                    created_by, created_at, updated_at, voided_at, voided_by, void_reason
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW(), $10, $11)
                RETURNING id, reference_number`,
                [
                    businessId,
                    new Date().toISOString().split('T')[0],
                    `REV-${referenceNumber}`,
                    `Reversal of discount allocation ${allocation.allocation_number} - ${reason}`,
                    'ALLOCATION',
                    allocation.id,
                    allocation.total_discount_amount,
                    'void',
                    userId,
                    userId,
                    reason
                ]
            );

            const reversalId = journalResult.rows[0].id;

            // Get original journal lines and reverse them (swap debit/credit)
            const lines = await client.query(
                `SELECT * FROM journal_entry_lines WHERE journal_entry_id = $1`,
                [allocation.journal_entry_id]
            );

            for (const line of lines.rows) {
                // Swap line_type for reversal
                const reversalType = line.line_type === 'debit' ? 'credit' : 'debit';
                
                await client.query(
                    `INSERT INTO journal_entry_lines (
                        business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                    [
                        businessId,
                        reversalId,
                        line.account_id,
                        reversalType,
                        line.amount,
                        `REVERSAL: ${line.description}`
                    ]
                );
            }

            // Update allocation status
            await client.query(
                `UPDATE discount_allocations
                 SET status = 'VOID',
                     void_reason = $2,
                     voided_by = $3,
                     voided_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $1 AND business_id = $4`,
                [allocation.id, reason, userId, businessId]
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_accounting.reversal_created',
                resourceType: 'journal_entry',
                resourceId: reversalId,
                newValues: {
                    reference_number: referenceNumber,
                    original_journal: allocation.journal_entry_id,
                    reason: reason
                }
            });

            log.info('Discount reversal journal entry created', {
                businessId,
                userId,
                reversalId,
                referenceNumber,
                originalJournal: allocation.journal_entry_id,
                allocationId: allocation.id
            });

            await client.query('COMMIT');

            return {
                reversal_id: reversalId,
                reference_number: referenceNumber,
                original_journal: allocation.journal_entry_id,
                allocation_id: allocation.id
            };

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error creating void journal entry', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 3: ALLOCATION INTEGRATION
     * =====================================================
     */

    /**
     * Link allocation to journal entry
     */
    static async linkAllocationToJournal(allocationId, journalId, businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `UPDATE discount_allocations
                 SET journal_entry_id = $1, updated_at = NOW()
                 WHERE id = $2 AND business_id = $3
                 RETURNING *`,
                [journalId, allocationId, businessId]
            );

            if (result.rows.length === 0) {
                throw new Error('Allocation not found');
            }

            log.debug('Allocation linked to journal', {
                allocationId,
                journalId,
                businessId
            });

            return result.rows[0];

        } catch (error) {
            log.error('Error linking allocation to journal', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get journal entries for an allocation
     */
    static async getJournalEntriesForAllocation(allocationId, businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT je.*
                 FROM journal_entries je
                 JOIN discount_allocations da ON je.id = da.journal_entry_id
                 WHERE da.id = $1 AND da.business_id = $2`,
                [allocationId, businessId]
            );

            return result.rows;

        } catch (error) {
            log.error('Error getting journal entries for allocation', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 4: RECONCILIATION
     * =====================================================
     */

    /**
     * Reconcile discounts with journal entries
     * Verifies every discount has a corresponding journal entry
     */
    static async reconcileDiscounts(businessId, date) {
        const client = await getClient();

        try {
            const reconciliationDate = DiscountCore.parseAsDateOnly(date);

            // Find allocations without journal entries
            const unlinkedResult = await client.query(
                `SELECT
                    da.*,
                    CASE
                        WHEN da.pos_transaction_id IS NOT NULL THEN 'POS'
                        WHEN da.invoice_id IS NOT NULL THEN 'INVOICE'
                    END as source_type
                 FROM discount_allocations da
                 WHERE da.business_id = $1
                    AND da.status = 'APPLIED'
                    AND da.journal_entry_id IS NULL
                    AND DATE(da.applied_at) <= $2`,
                [businessId, reconciliationDate]
            );

            // Find allocations with journal entries but different amounts
            const mismatchedResult = await client.query(
                `SELECT
                    da.id as allocation_id,
                    da.allocation_number,
                    da.total_discount_amount as allocation_amount,
                    je.id as journal_id,
                    je.reference_number,
                    SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as journal_debit_total
                 FROM discount_allocations da
                 JOIN journal_entries je ON da.journal_entry_id = je.id
                 JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
                 WHERE da.business_id = $1
                    AND da.status = 'APPLIED'
                    AND DATE(da.applied_at) <= $2
                 GROUP BY da.id, da.allocation_number, da.total_discount_amount, je.id, je.reference_number
                 HAVING ABS(da.total_discount_amount - SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END)) > 0.01`,
                [businessId, reconciliationDate]
            );

            // Get summary statistics
            const summaryResult = await client.query(
                `SELECT
                    COUNT(*) as total_allocations,
                    SUM(CASE WHEN journal_entry_id IS NOT NULL THEN 1 ELSE 0 END) as linked_allocations,
                    SUM(CASE WHEN journal_entry_id IS NULL THEN 1 ELSE 0 END) as unlinked_allocations,
                    COALESCE(SUM(total_discount_amount), 0) as total_discount_amount,
                    COALESCE(SUM(CASE WHEN journal_entry_id IS NOT NULL THEN total_discount_amount ELSE 0 END), 0) as linked_amount,
                    COALESCE(SUM(CASE WHEN journal_entry_id IS NULL THEN total_discount_amount ELSE 0 END), 0) as unlinked_amount
                 FROM discount_allocations
                 WHERE business_id = $1
                    AND status = 'APPLIED'
                    AND DATE(applied_at) <= $2`,
                [businessId, reconciliationDate]
            );

            return {
                reconciliation_date: reconciliationDate,
                summary: summaryResult.rows[0],
                unlinked_allocations: unlinkedResult.rows,
                mismatched_allocations: mismatchedResult.rows,
                is_reconciled: unlinkedResult.rows.length === 0 && mismatchedResult.rows.length === 0
            };

        } catch (error) {
            log.error('Error reconciling discounts', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Find unaccounted discounts (allocations without journal entries)
     */
    static async findUnaccountedDiscounts(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT
                    da.*,
                    CASE
                        WHEN da.pos_transaction_id IS NOT NULL THEN
                            (SELECT transaction_number FROM pos_transactions WHERE id = da.pos_transaction_id)
                        WHEN da.invoice_id IS NOT NULL THEN
                            (SELECT invoice_number FROM invoices WHERE id = da.invoice_id)
                    END as source_number,
                    CASE
                        WHEN da.pos_transaction_id IS NOT NULL THEN 'POS'
                        WHEN da.invoice_id IS NOT NULL THEN 'INVOICE'
                    END as source_type
                 FROM discount_allocations da
                 WHERE da.business_id = $1
                    AND da.status = 'APPLIED'
                    AND da.journal_entry_id IS NULL
                    AND da.applied_at BETWEEN $2 AND $3
                 ORDER BY da.applied_at DESC`,
                [businessId, startDate, endDate]
            );

            return result.rows;

        } catch (error) {
            log.error('Error finding unaccounted discounts', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Generate reconciliation report
     */
    static async generateReconciliationReport(businessId, date) {
        const reconciliation = await this.reconcileDiscounts(businessId, date);

        // Get additional details for the report
        const client = await getClient();

        try {
            // Get daily totals
            const dailyTotals = await client.query(
                `SELECT
                    DATE(applied_at) as date,
                    COUNT(*) as allocation_count,
                    SUM(total_discount_amount) as daily_discount_total
                 FROM discount_allocations
                 WHERE business_id = $1
                    AND status = 'APPLIED'
                    AND DATE(applied_at) <= $2
                 GROUP BY DATE(applied_at)
                 ORDER BY date DESC`,
                [businessId, date]
            );

            // Get account distribution
            const accountDistribution = await client.query(
                `SELECT
                    je.id as journal_id,
                    je.reference_number,
                    je.journal_date,
                    a.account_code,
                    a.account_name,
                    SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debit
                 FROM discount_allocations da
                 JOIN journal_entries je ON da.journal_entry_id = je.id
                 JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
                 JOIN chart_of_accounts a ON jel.account_id = a.id
                 WHERE da.business_id = $1
                    AND da.status = 'APPLIED'
                    AND DATE(da.applied_at) <= $2
                    AND jel.line_type = 'debit'
                 GROUP BY je.id, je.reference_number, je.journal_date, a.account_code, a.account_name
                 ORDER BY je.journal_date DESC`,
                [businessId, date]
            );

            return {
                report_date: date,
                business_id: businessId,
                reconciliation_summary: reconciliation.summary,
                is_reconciled: reconciliation.is_reconciled,
                daily_totals: dailyTotals.rows,
                account_distribution: accountDistribution.rows,
                unlinked_count: reconciliation.unlinked_allocations.length,
                mismatched_count: reconciliation.mismatched_allocations.length,
                report_generated_at: new Date().toISOString()
            };

        } catch (error) {
            log.error('Error generating reconciliation report', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 5: TAX IMPLICATIONS
     * =====================================================
     */

    /**
     * Calculate tax impact of discounts
     * Discounts reduce taxable amount, so tax liability decreases
     */
    static async calculateTaxImpact(discountAmount, taxRate) {
        if (!discountAmount || discountAmount <= 0) {
            return {
                discountAmount: 0,
                taxRate: 0,
                taxImpact: 0
            };
        }

        const taxImpact = discountAmount * (taxRate / 100);

        return {
            discountAmount,
            taxRate,
            taxImpact: Math.round(taxImpact * 100) / 100,
            description: `Discount reduces taxable amount by ${discountAmount}, reducing tax by ${taxImpact}`
        };
    }

    /**
     * Adjust tax entries for discounts
     * Creates adjusting entries for tax accounts when discounts are applied
     */
    static async adjustTaxEntries(discountId, businessId, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Get discount allocation details
            const allocation = await client.query(
                `SELECT * FROM discount_allocations WHERE id = $1 AND business_id = $2`,
                [discountId, businessId]
            );

            if (allocation.rows.length === 0) {
                throw new Error('Discount allocation not found');
            }

            const discount = allocation.rows[0];

            // Get tax rate from transaction (you'll need to implement this based on your tax system)
            // This is a placeholder - adjust based on your actual tax implementation
            const taxRate = 18; // Example: 18% VAT
            const taxImpact = await this.calculateTaxImpact(discount.total_discount_amount, taxRate);

            if (taxImpact.taxImpact === 0) {
                return {
                    adjusted: false,
                    reason: 'No tax impact',
                    taxImpact
                };
            }

            // Get tax liability account (usually 2200 - VAT Payable)
            const taxAccountResult = await client.query(
                `SELECT id FROM chart_of_accounts
                 WHERE business_id = $1 AND account_code = '2200' AND is_active = true`,
                [businessId]
            );

            if (taxAccountResult.rows.length === 0) {
                throw new Error('Tax liability account (2200) not found');
            }

            const taxAccountId = taxAccountResult.rows[0].id;

            // Generate adjustment reference number
            const referenceNumber = await this._generateJournalReferenceNumber(businessId);

            // Create tax adjustment journal entry
            const journalResult = await client.query(
                `INSERT INTO journal_entries (
                    business_id, journal_date, reference_number, description,
                    reference_type, reference_id, total_amount, status, 
                    created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                RETURNING id, reference_number`,
                [
                    businessId,
                    new Date().toISOString().split('T')[0],
                    `TAX-${referenceNumber}`,
                    `Tax adjustment for discount ${discount.allocation_number}`,
                    'DISCOUNT',
                    discountId,
                    taxImpact.taxImpact,
                    'draft',
                    userId
                ]
            );

            const journalId = journalResult.rows[0].id;

            // Create tax adjustment lines
            // Debit: Tax Liability (reduce what you owe)
            // Credit: Discount Account (or separate tax discount account)
            await client.query(
                `INSERT INTO journal_entry_lines (
                    business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                ) VALUES
                    ($1, $2, $3, 'debit', $4, 'Tax reduction from discount', NOW()),
                    ($1, $2, $5, 'credit', $4, 'Discount tax adjustment', NOW())`,
                [
                    businessId,
                    journalId,
                    taxAccountId,
                    taxImpact.taxImpact,
                    await this.getDiscountAccountId(businessId, '4110') // Use default discount account
                ]
            );

            log.info('Tax adjustment created for discount', {
                businessId,
                userId,
                discountId,
                journalId,
                taxImpact: taxImpact.taxImpact
            });

            await client.query('COMMIT');

            return {
                adjusted: true,
                journal_id: journalId,
                reference_number: referenceNumber,
                taxImpact
            };

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error adjusting tax entries', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 6: REPORTING & ANALYTICS
     * =====================================================
     */

    /**
     * Get discount journal entries for a period
     */
    static async getDiscountJournalEntries(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT
                    je.*,
                    COUNT(jel.id) as line_count,
                    SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debit,
                    SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credit,
                    STRING_AGG(DISTINCT a.account_code, ', ') as accounts_used
                 FROM journal_entries je
                 JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
                 JOIN chart_of_accounts a ON jel.account_id = a.id
                 WHERE je.business_id = $1
                    AND je.journal_date BETWEEN $2 AND $3
                    AND (je.description ILIKE '%discount%' OR je.reference_type = 'DISCOUNT')
                 GROUP BY je.id
                 ORDER BY je.journal_date DESC, je.created_at DESC`,
                [businessId, startDate, endDate]
            );

            return result.rows;

        } catch (error) {
            log.error('Error getting discount journal entries', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Export discount journal entries to CSV
     */
    static async exportDiscountJournalEntries(businessId, startDate, endDate) {
        const entries = await this.getDiscountJournalEntries(businessId, startDate, endDate);

        const csvRows = [];

        // Headers
        csvRows.push([
            'Reference Number', 'Date', 'Description', 'Reference Type',
            'Reference ID', 'Status', 'Total Debit', 'Total Credit',
            'Accounts', 'Created At'
        ].join(','));

        // Data rows
        for (const entry of entries) {
            csvRows.push([
                entry.reference_number,
                entry.journal_date,
                `"${entry.description.replace(/"/g, '""')}"`,
                entry.reference_type || '',
                entry.reference_id || '',
                entry.status,
                entry.total_debit || 0,
                entry.total_credit || 0,
                `"${entry.accounts_used}"`,
                new Date(entry.created_at).toISOString()
            ].join(','));
        }

        return csvRows.join('\n');
    }
}

export default DiscountAccountingService;
