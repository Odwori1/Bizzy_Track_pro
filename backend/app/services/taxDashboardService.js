// File: backend/app/services/taxDashboardService.js
import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

/**
 * TAX DASHBOARD SERVICE - Provides dashboard data and metrics
 * Phase 8: Tax Dashboard & Reporting
 * 
 * UPDATED: Consistent date handling with accounting/invoice services
 * - toUTCISOString() for timestamps
 * - toDateOnlyString() for date-only values
 */
export class TaxDashboardService {

    /**
     * Convert any date input to UTC ISO string for database storage
     * (Matches invoiceService pattern)
     */
    static toUTCISOString(dateInput) {
        if (!dateInput) {
            return new Date().toISOString();
        }

        try {
            // If it's already a string in ISO format, return as-is
            if (typeof dateInput === "string" && dateInput.includes("T")) {
                return dateInput;
            }

            // If it's a date-only string (YYYY-MM-DD), add time component
            if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                return new Date(dateInput + "T00:00:00Z").toISOString();
            }

            // Otherwise, create Date object and convert to ISO
            const date = new Date(dateInput);
            if (isNaN(date.getTime())) {
                return new Date().toISOString();
            }
            return date.toISOString();

        } catch (error) {
            return new Date().toISOString();
        }
    }

    /**
     * Convert any date input to date-only string (YYYY-MM-DD)
     * (Matches invoiceService pattern for tax calculations)
     */
    static toDateOnlyString(dateInput) {
        if (!dateInput) {
            return new Date().toISOString().split("T")[0];
        }

        try {
            const date = new Date(dateInput);
            if (isNaN(date.getTime())) {
                return new Date().toISOString().split("T")[0];
            }
            return date.toISOString().split("T")[0];
        } catch (error) {
            return new Date().toISOString().split("T")[0];
        }
    }

    /**
     * Parse date to YYYY-MM-DD format (legacy method - kept for backward compatibility)
     */
    static parseAsDateOnly(dateInput) {
        return this.toDateOnlyString(dateInput);
    }

    /**
     * Get date range based on period
     */
    static getDateRange(period = 'month', referenceDate = new Date()) {
        const end = new Date(referenceDate);
        let start = new Date(referenceDate);

        switch (period) {
            case 'week':
                start.setDate(end.getDate() - 7);
                break;
            case 'month':
                start.setMonth(end.getMonth() - 1);
                break;
            case 'quarter':
                start.setMonth(end.getMonth() - 3);
                break;
            case 'year':
                start.setFullYear(end.getFullYear() - 1);
                break;
            case 'ytd':
                start = new Date(end.getFullYear(), 0, 1); // Jan 1st
                break;
            default:
                start.setMonth(end.getMonth() - 1); // Default to month
        }

        return {
            startDate: this.toDateOnlyString(start),
            endDate: this.toDateOnlyString(end)
        };
    }

    /**
     * Get dashboard summary with key metrics
     * GET /api/tax/dashboard/summary
     */
    static async getDashboardSummary(businessId, period = 'month') {
        const client = await getClient();

        try {
            log.info('Getting dashboard summary', { businessId, period });

            const dateRange = this.getDateRange(period);

            // Run all queries in parallel for performance
            const [
                taxLiabilities,
                upcomingDeadlines,
                recentReturns,
                complianceScore,
                cashFlowImpact
            ] = await Promise.all([
                this.getTaxLiabilities(businessId, dateRange.endDate),
                this.getUpcomingDeadlines(businessId, 5),
                this.getRecentReturns(businessId, 5),
                this.getComplianceScore(businessId),
                this.getCashFlowImpact(businessId, dateRange)
            ]);

            // Get widget preferences for this user
            // We'll need to pass userId from controller - for now, get first user as fallback
            let preferences = { widget_config: { widgets: [] } };
            try {
                // Try to get any user for this business as fallback
                const userResult = await client.query(`
                    SELECT id FROM users WHERE business_id = $1 LIMIT 1
                `, [businessId]);

                if (userResult.rows.length > 0) {
                    preferences = await this.getUserPreferences(businessId, userResult.rows[0].id);
                }
            } catch (err) {
                log.debug('Could not fetch user preferences', { error: err.message });
            }

            const summary = {
                period: {
                    type: period,
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate
                },
                metrics: {
                    totalOutstanding: taxLiabilities.totalOutstanding,
                    upcomingPayments: taxLiabilities.upcomingPayments,
                    overdueCount: taxLiabilities.overdueCount,
                    deadlinesCount: upcomingDeadlines.length,
                    returnsCount: recentReturns.length,
                    complianceScore: complianceScore.overall
                },
                taxLiabilities: taxLiabilities.breakdown,
                upcomingDeadlines,
                recentReturns,
                compliance: complianceScore,
                cashFlow: cashFlowImpact,
                widgets: preferences.widget_config,
                lastUpdated: this.toUTCISOString(new Date()) // Use ISO format for timestamps
            };

            // Try to cache the result (optional)
            await this.cacheDashboardData(businessId, 'summary', summary, dateRange);

            return summary;

        } catch (error) {
            log.error('Error getting dashboard summary:', {
                error: error.message,
                stack: error.stack,
                businessId,
                period
            });
            throw new Error(`Failed to get dashboard summary: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get current tax liabilities
     * GET /api/tax/dashboard/liabilities
     */
    static async getTaxLiabilities(businessId, asOfDate = null) {
        const client = await getClient();

        try {
            const date = asOfDate || this.toDateOnlyString(new Date());

            log.info('Getting tax liabilities', { businessId, asOfDate: date });

            // Query 1: Unpaid WHT from withholding_tax_certificates
            // Using actual column names: withholding_amount, no paid_at column
            const whtQuery = await client.query(`
                SELECT
                    COALESCE(SUM(withholding_amount), 0) as total_unpaid,
                    COUNT(*) as certificate_count,
                    COUNT(CASE WHEN created_at < $2::DATE - INTERVAL '30 days' THEN 1 END) as overdue_count
                FROM withholding_tax_certificates
                WHERE business_id = $1
                    AND status IN ('generated', 'sent', 'issued')
                    -- No paid_at column, so we assume all are unpaid
            `, [businessId, date]);

            // Query 2: Unpaid VAT from vat_returns - this is correct
            const vatQuery = await client.query(`
                SELECT
                    COALESCE(SUM(total_amount_due - COALESCE(paid_amount, 0)), 0) as total_unpaid,
                    COUNT(*) as return_count,
                    COUNT(CASE WHEN due_date < $2 THEN 1 END) as overdue_count
                FROM vat_returns
                WHERE business_id = $1
                    AND status IN ('submitted', 'calculated', 'approved')
                    AND (paid_at IS NULL OR paid_amount < total_amount_due)
            `, [businessId, date]);

            // Query 3: Unpaid WHT from purchase_wht_certificates
            // Using actual column names: wht_amount
            const purchaseWhtQuery = await client.query(`
                SELECT
                    COALESCE(SUM(wht_amount), 0) as total_unpaid,
                    COUNT(*) as certificate_count
                FROM purchase_wht_certificates
                WHERE business_id = $1
                    AND status IN ('generated', 'sent')
                    AND submitted_to_ura = false
            `, [businessId]);

            // Query 4: Upcoming payments (due in next 30 days)
            const upcomingQuery = await client.query(`
                -- VAT returns due soon
                SELECT
                    'VAT' as tax_type,
                    return_number as reference,
                    due_date,
                    (total_amount_due - COALESCE(paid_amount, 0)) as amount_due
                FROM vat_returns
                WHERE business_id = $1
                    AND status IN ('submitted', 'calculated', 'approved')
                    AND due_date BETWEEN $2 AND $2::DATE + INTERVAL '30 days'
                    AND (paid_at IS NULL OR paid_amount < total_amount_due)

                UNION ALL

                -- WHT certificates (using created_at + 15 days as proxy)
                SELECT
                    'WHT' as tax_type,
                    certificate_number as reference,
                    (created_at::DATE + INTERVAL '15 days')::DATE as due_date,
                    withholding_amount as amount_due
                FROM withholding_tax_certificates
                WHERE business_id = $1
                    AND status IN ('generated', 'sent', 'issued')
                    AND (created_at::DATE + INTERVAL '15 days') BETWEEN $2 AND $2::DATE + INTERVAL '30 days'

                ORDER BY due_date
            `, [businessId, date]);

            const totalOutstanding =
                parseFloat(whtQuery.rows[0]?.total_unpaid || 0) +
                parseFloat(vatQuery.rows[0]?.total_unpaid || 0) +
                parseFloat(purchaseWhtQuery.rows[0]?.total_unpaid || 0);

            const overdueCount =
                parseInt(whtQuery.rows[0]?.overdue_count || 0) +
                parseInt(vatQuery.rows[0]?.overdue_count || 0);

            return {
                totalOutstanding,
                overdueCount,
                upcomingPayments: upcomingQuery.rows.length,
                breakdown: [
                    {
                        taxType: 'Withholding Tax (Customer)',
                        amount: parseFloat(whtQuery.rows[0]?.total_unpaid || 0),
                        count: parseInt(whtQuery.rows[0]?.certificate_count || 0),
                        overdue: parseInt(whtQuery.rows[0]?.overdue_count || 0)
                    },
                    {
                        taxType: 'Value Added Tax',
                        amount: parseFloat(vatQuery.rows[0]?.total_unpaid || 0),
                        count: parseInt(vatQuery.rows[0]?.return_count || 0),
                        overdue: parseInt(vatQuery.rows[0]?.overdue_count || 0)
                    },
                    {
                        taxType: 'Withholding Tax (Supplier)',
                        amount: parseFloat(purchaseWhtQuery.rows[0]?.total_unpaid || 0),
                        count: parseInt(purchaseWhtQuery.rows[0]?.certificate_count || 0),
                        overdue: 0
                    }
                ].filter(item => item.amount > 0 || item.count > 0),
                upcomingPaymentsList: upcomingQuery.rows.map(row => ({
                    ...row,
                    amount_due: parseFloat(row.amount_due),
                    due_date: this.toDateOnlyString(row.due_date),
                    daysUntil: Math.ceil((new Date(row.due_date) - new Date()) / (1000 * 60 * 60 * 24))
                })),
                asOfDate: date
            };

        } catch (error) {
            log.error('Error getting tax liabilities:', {
                error: error.message,
                businessId,
                asOfDate
            });
            throw new Error(`Failed to get tax liabilities: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get upcoming filing deadlines
     * GET /api/tax/dashboard/deadlines
     */
    static async getUpcomingDeadlines(businessId, limit = 10) {
        const client = await getClient();

        try {
            const today = this.toDateOnlyString(new Date());

            log.info('Getting upcoming deadlines', { businessId, limit });

            // Query upcoming VAT deadlines
            const vatDeadlines = await client.query(`
                SELECT
                    'VAT Return' as type,
                    return_number as reference,
                    period_start,
                    period_end,
                    due_date as deadline_date,
                    CASE
                        WHEN status = 'draft' THEN 'Not Started'
                        WHEN status = 'calculated' THEN 'Ready to Submit'
                        WHEN status = 'submitted' THEN 'Awaiting Payment'
                        ELSE status
                    END as status,
                    total_amount_due as amount
                FROM vat_returns
                WHERE business_id = $1
                    AND due_date >= $2
                    AND status NOT IN ('paid', 'void')
                ORDER BY due_date
                LIMIT $3
            `, [businessId, today, limit]);

            // Query WHT return deadlines (from wht_returns table - Phase 5)
            const whtDeadlines = await client.query(`
                SELECT
                    'WHT Return' as type,
                    return_number as reference,
                    period_start,
                    period_end,
                    due_date as deadline_date,
                    CASE
                        WHEN status = 'draft' THEN 'Not Started'
                        WHEN status = 'pending_approval' THEN 'Awaiting Approval'
                        WHEN status = 'approved' THEN 'Ready to File'
                        ELSE status
                    END as status,
                    total_wht_amount as amount
                FROM wht_returns
                WHERE business_id = $1
                    AND due_date >= $2
                    AND status NOT IN ('paid', 'void')
                ORDER BY due_date
                LIMIT $3
            `, [businessId, today, limit]);

            // Combine and sort
            const allDeadlines = [...vatDeadlines.rows, ...whtDeadlines.rows]
                .map(deadline => ({
                    ...deadline,
                    deadline_date: this.toDateOnlyString(deadline.deadline_date),
                    period_start: deadline.period_start ? this.toDateOnlyString(deadline.period_start) : null,
                    period_end: deadline.period_end ? this.toDateOnlyString(deadline.period_end) : null,
                    daysUntil: Math.ceil((new Date(deadline.deadline_date) - new Date()) / (1000 * 60 * 60 * 24)),
                    urgency: this.calculateUrgency(deadline.deadline_date)
                }))
                .sort((a, b) => new Date(a.deadline_date) - new Date(b.deadline_date))
                .slice(0, limit);

            return allDeadlines;

        } catch (error) {
            log.error('Error getting upcoming deadlines:', {
                error: error.message,
                businessId
            });
            throw new Error(`Failed to get upcoming deadlines: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Calculate urgency color based on days until deadline
     */
    static calculateUrgency(deadlineDate) {
        const days = Math.ceil((new Date(deadlineDate) - new Date()) / (1000 * 60 * 60 * 24));

        if (days < 0) return 'overdue';
        if (days <= 3) return 'critical';
        if (days <= 7) return 'warning';
        if (days <= 14) return 'notice';
        return 'normal';
    }

    /**
     * Get recent tax returns
     */
    static async getRecentReturns(businessId, limit = 5) {
        const client = await getClient();

        try {
            // Get recent VAT returns
            const vatReturns = await client.query(`
                SELECT
                    'VAT' as return_type,
                    return_number,
                    period_start,
                    period_end,
                    filing_date,
                    status,
                    total_amount_due as amount,
                    paid_at,
                    created_at
                FROM vat_returns
                WHERE business_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            `, [businessId, limit]);

            // Get recent WHT returns - using wht_returns table
            const whtReturns = await client.query(`
                SELECT
                    'WHT' as return_type,
                    return_number,
                    period_start,
                    period_end,
                    submitted_at as filing_date,
                    status,
                    total_wht_amount as amount,
                    paid_at,
                    created_at
                FROM wht_returns
                WHERE business_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            `, [businessId, limit]);

            // Combine and sort
            const allReturns = [...vatReturns.rows, ...whtReturns.rows]
                .map(ret => ({
                    ...ret,
                    amount: parseFloat(ret.amount || 0),
                    period: `${this.toDateOnlyString(ret.period_start)} to ${this.toDateOnlyString(ret.period_end)}`,
                    period_start: this.toDateOnlyString(ret.period_start),
                    period_end: this.toDateOnlyString(ret.period_end),
                    filing_date: ret.filing_date ? this.toDateOnlyString(ret.filing_date) : null,
                    paid_at: ret.paid_at ? this.toUTCISOString(ret.paid_at) : null,
                    created_at: this.toUTCISOString(ret.created_at)
                }))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, limit);

            return allReturns;

        } catch (error) {
            log.error('Error getting recent returns:', {
                error: error.message,
                businessId
            });
            return []; // Non-critical, return empty array
        } finally {
            client.release();
        }
    }

    /**
     * Get compliance score
     */
    static async getComplianceScore(businessId) {
        const client = await getClient();

        try {
            // Calculate filing compliance (VAT returns)
            const vatCompliance = await client.query(`
                SELECT
                    COUNT(*) as total_returns,
                    COUNT(CASE WHEN filing_date <= due_date THEN 1 END) as on_time_filed,
                    COUNT(CASE WHEN paid_at <= due_date + INTERVAL '15 days' THEN 1 END) as on_time_paid
                FROM vat_returns
                WHERE business_id = $1
                    AND created_at >= NOW() - INTERVAL '12 months'
            `, [businessId]);

            // Calculate WHT compliance from wht_returns
            const whtCompliance = await client.query(`
                SELECT
                    COUNT(*) as total_returns,
                    COUNT(CASE WHEN submitted_at <= due_date THEN 1 END) as on_time_filed,
                    COUNT(CASE WHEN paid_at <= due_date + INTERVAL '15 days' THEN 1 END) as on_time_paid
                FROM wht_returns
                WHERE business_id = $1
                    AND created_at >= NOW() - INTERVAL '12 months'
            `, [businessId]);

            const totalReturns =
                parseInt(vatCompliance.rows[0]?.total_returns || 0) +
                parseInt(whtCompliance.rows[0]?.total_returns || 0);

            const onTimeFiled =
                parseInt(vatCompliance.rows[0]?.on_time_filed || 0) +
                parseInt(whtCompliance.rows[0]?.on_time_filed || 0);

            const onTimePaid =
                parseInt(vatCompliance.rows[0]?.on_time_paid || 0) +
                parseInt(whtCompliance.rows[0]?.on_time_paid || 0);

            const filingScore = totalReturns > 0 ? (onTimeFiled / totalReturns) * 100 : 100;
            const paymentScore = totalReturns > 0 ? (onTimePaid / totalReturns) * 100 : 100;
            const overall = (filingScore * 0.6) + (paymentScore * 0.4);

            return {
                overall: Math.round(overall * 100) / 100,
                filing: {
                    score: Math.round(filingScore * 100) / 100,
                    onTime: onTimeFiled,
                    total: totalReturns
                },
                payment: {
                    score: Math.round(paymentScore * 100) / 100,
                    onTime: onTimePaid,
                    total: totalReturns
                },
                grade: this.getGradeFromScore(overall)
            };

        } catch (error) {
            log.error('Error calculating compliance score:', {
                error: error.message,
                businessId
            });
            return {
                overall: 0,
                filing: { score: 0, onTime: 0, total: 0 },
                payment: { score: 0, onTime: 0, total: 0 },
                grade: 'N/A'
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get grade from compliance score
     */
    static getGradeFromScore(score) {
        if (score >= 95) return 'A+';
        if (score >= 90) return 'A';
        if (score >= 85) return 'B+';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    /**
     * Get cash flow impact of taxes
     */
    static async getCashFlowImpact(businessId, dateRange) {
        const client = await getClient();

        try {
            // Get VAT payments made
            const vatPayments = await client.query(`
                SELECT
                    DATE_TRUNC('month', paid_at) as month,
                    SUM(paid_amount) as amount
                FROM vat_returns
                WHERE business_id = $1
                    AND paid_at BETWEEN $2 AND $3
                    AND paid_amount > 0
                GROUP BY DATE_TRUNC('month', paid_at)
                ORDER BY month
            `, [businessId, dateRange.startDate, dateRange.endDate]);

            // Get WHT payments from wht_returns
            const whtPayments = await client.query(`
                SELECT
                    DATE_TRUNC('month', paid_at) as month,
                    SUM(paid_amount) as amount
                FROM wht_returns
                WHERE business_id = $1
                    AND paid_at BETWEEN $2 AND $3
                    AND paid_amount > 0
                GROUP BY DATE_TRUNC('month', paid_at)
                ORDER BY month
            `, [businessId, dateRange.startDate, dateRange.endDate]);

            // Combine payments by month
            const paymentsByMonth = new Map();

            vatPayments.rows.forEach(row => {
                const month = this.toDateOnlyString(row.month);
                paymentsByMonth.set(month, {
                    month,
                    vat: parseFloat(row.amount || 0),
                    wht: 0,
                    total: parseFloat(row.amount || 0)
                });
            });

            whtPayments.rows.forEach(row => {
                const month = this.toDateOnlyString(row.month);
                if (paymentsByMonth.has(month)) {
                    const existing = paymentsByMonth.get(month);
                    existing.wht = parseFloat(row.amount || 0);
                    existing.total = existing.vat + existing.wht;
                } else {
                    paymentsByMonth.set(month, {
                        month,
                        vat: 0,
                        wht: parseFloat(row.amount || 0),
                        total: parseFloat(row.amount || 0)
                    });
                }
            });

            // Convert to array and sort
            const monthlyBreakdown = Array.from(paymentsByMonth.values())
                .sort((a, b) => a.month.localeCompare(b.month));

            const totalPaid = monthlyBreakdown.reduce((sum, month) => sum + month.total, 0);

            return {
                totalPaid,
                monthlyBreakdown,
                averagePerMonth: monthlyBreakdown.length > 0 ? totalPaid / monthlyBreakdown.length : 0,
                percentageOfRevenue: null,
                period: dateRange
            };

        } catch (error) {
            log.error('Error getting cash flow impact:', {
                error: error.message,
                businessId
            });
            return {
                totalPaid: 0,
                monthlyBreakdown: [],
                averagePerMonth: 0,
                percentageOfRevenue: null,
                period: dateRange
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get tax forecast for upcoming periods
     * GET /api/tax/dashboard/forecast
     */
    static async getTaxForecast(businessId, months = 3) {
        const client = await getClient();

        try {
            log.info('Getting tax forecast', { businessId, months });

            // Get historical VAT payments to identify patterns
            const vatHistory = await client.query(`
                SELECT
                    DATE_TRUNC('month', paid_at) as month,
                    SUM(paid_amount) as amount
                FROM vat_returns
                WHERE business_id = $1
                    AND paid_at IS NOT NULL
                    AND paid_at >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', paid_at)
                ORDER BY month
            `, [businessId]);

            // Get historical WHT payments
            const whtHistory = await client.query(`
                SELECT
                    DATE_TRUNC('month', paid_at) as month,
                    SUM(paid_amount) as amount
                FROM wht_returns
                WHERE business_id = $1
                    AND paid_at IS NOT NULL
                    AND paid_at >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', paid_at)
                ORDER BY month
            `, [businessId]);

            // Calculate average monthly payments
            const vatAvg = vatHistory.rows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0) /
                          Math.max(vatHistory.rows.length, 1);

            const whtAvg = whtHistory.rows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0) /
                          Math.max(whtHistory.rows.length, 1);

            // Generate forecast for next 'months' months
            const forecast = [];
            const today = new Date();

            for (let i = 1; i <= months; i++) {
                const forecastDate = new Date(today);
                forecastDate.setMonth(today.getMonth() + i);

                // Check for known upcoming returns in this month
                const upcomingVAT = await client.query(`
                    SELECT COUNT(*) as count, COALESCE(SUM(total_amount_due), 0) as total
                    FROM vat_returns
                    WHERE business_id = $1
                        AND status IN ('calculated', 'approved')
                        AND DATE_TRUNC('month', due_date) = DATE_TRUNC('month', $2::DATE)
                `, [businessId, forecastDate]);

                const upcomingWHT = await client.query(`
                    SELECT COUNT(*) as count, COALESCE(SUM(total_wht_amount), 0) as total
                    FROM wht_returns
                    WHERE business_id = $1
                        AND status IN ('approved', 'submitted')
                        AND DATE_TRUNC('month', due_date) = DATE_TRUNC('month', $2::DATE)
                `, [businessId, forecastDate]);

                forecast.push({
                    month: this.toDateOnlyString(forecastDate),
                    monthName: forecastDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
                    vat: {
                        projected: Math.round(vatAvg * 100) / 100,
                        confirmed: parseFloat(upcomingVAT.rows[0]?.total || 0),
                        count: parseInt(upcomingVAT.rows[0]?.count || 0)
                    },
                    wht: {
                        projected: Math.round(whtAvg * 100) / 100,
                        confirmed: parseFloat(upcomingWHT.rows[0]?.total || 0),
                        count: parseInt(upcomingWHT.rows[0]?.count || 0)
                    },
                    totalProjected: Math.round((vatAvg + whtAvg) * 100) / 100,
                    totalConfirmed: parseFloat(upcomingVAT.rows[0]?.total || 0) + parseFloat(upcomingWHT.rows[0]?.total || 0)
                });
            }

            return {
                basedOnHistory: {
                    monthsAnalyzed: vatHistory.rows.length,
                    vatAverage: Math.round(vatAvg * 100) / 100,
                    whtAverage: Math.round(whtAvg * 100) / 100
                },
                forecast,
                generatedAt: this.toUTCISOString(new Date()) // Use ISO format for timestamps
            };

        } catch (error) {
            log.error('Error getting tax forecast:', {
                error: error.message,
                businessId
            });
            return {
                basedOnHistory: { monthsAnalyzed: 0, vatAverage: 0, whtAverage: 0 },
                forecast: [],
                generatedAt: this.toUTCISOString(new Date()), // Use ISO format for timestamps
                error: error.message
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get tax alerts and notifications
     * GET /api/tax/dashboard/alerts
     */
    static async getTaxAlerts(businessId) {
        const client = await getClient();

        try {
            log.info('Getting tax alerts', { businessId });

            const today = this.toDateOnlyString(new Date());
            const alerts = [];

            // Alert 1: Overdue returns
            const overdueVAT = await client.query(`
                SELECT
                    'VAT' as type,
                    return_number as reference,
                    due_date,
                    total_amount_due - COALESCE(paid_amount, 0) as amount_due,
                    (EXTRACT(DAY FROM NOW() - due_date))::INTEGER as days_overdue
                FROM vat_returns
                WHERE business_id = $1
                    AND due_date < $2
                    AND status NOT IN ('paid', 'void')
                    AND (paid_at IS NULL OR paid_amount < total_amount_due)
                ORDER BY due_date
                LIMIT 5
            `, [businessId, today]);

            overdueVAT.rows.forEach(row => {
                alerts.push({
                    severity: 'critical',
                    category: 'overdue',
                    title: 'Overdue VAT Return',
                    description: `${row.reference} is ${row.days_overdue} days overdue`,
                    amount: parseFloat(row.amount_due || 0),
                    dueDate: this.toDateOnlyString(row.due_date),
                    daysOverdue: parseInt(row.days_overdue),
                    action: 'file_now',
                    reference: row.reference
                });
            });

            const overdueWHT = await client.query(`
                SELECT
                    'WHT' as type,
                    return_number as reference,
                    due_date,
                    total_wht_amount - COALESCE(paid_amount, 0) as amount_due,
                    (EXTRACT(DAY FROM NOW() - due_date))::INTEGER as days_overdue
                FROM wht_returns
                WHERE business_id = $1
                    AND due_date < $2
                    AND status NOT IN ('paid', 'void')
                    AND (paid_at IS NULL OR paid_amount < total_wht_amount)
                ORDER BY due_date
                LIMIT 5
            `, [businessId, today]);

            overdueWHT.rows.forEach(row => {
                alerts.push({
                    severity: 'critical',
                    category: 'overdue',
                    title: 'Overdue WHT Return',
                    description: `${row.reference} is ${row.days_overdue} days overdue`,
                    amount: parseFloat(row.amount_due || 0),
                    dueDate: this.toDateOnlyString(row.due_date),
                    daysOverdue: parseInt(row.days_overdue),
                    action: 'file_now',
                    reference: row.reference
                });
            });

            // Alert 2: Upcoming deadlines (next 7 days)
            const upcomingVAT = await client.query(`
                SELECT
                    'VAT' as type,
                    return_number as reference,
                    due_date,
                    total_amount_due - COALESCE(paid_amount, 0) as amount_due,
                    (EXTRACT(DAY FROM due_date - NOW()))::INTEGER as days_until
                FROM vat_returns
                WHERE business_id = $1
                    AND due_date BETWEEN $2 AND $2::DATE + INTERVAL '7 days'
                    AND status NOT IN ('paid', 'void')
                    AND (paid_at IS NULL OR paid_amount < total_amount_due)
                ORDER BY due_date
            `, [businessId, today]);

            upcomingVAT.rows.forEach(row => {
                alerts.push({
                    severity: row.days_until <= 3 ? 'warning' : 'info',
                    category: 'upcoming',
                    title: 'VAT Return Due Soon',
                    description: `${row.reference} due in ${row.days_until} days`,
                    amount: parseFloat(row.amount_due || 0),
                    dueDate: this.toDateOnlyString(row.due_date),
                    daysUntil: row.days_until,
                    action: 'prepare_return',
                    reference: row.reference
                });
            });

            // Alert 3: Unreconciled payments
            const unreconciledWHT = await client.query(`
                SELECT COUNT(*) as count
                FROM withholding_tax_certificates
                WHERE business_id = $1
                    AND status IN ('generated', 'sent')
                    AND created_at < $2::DATE - INTERVAL '15 days'
            `, [businessId, today]);

            if (parseInt(unreconciledWHT.rows[0]?.count || 0) > 0) {
                alerts.push({
                    severity: 'warning',
                    category: 'reconciliation',
                    title: 'Unreconciled WHT Certificates',
                    description: `${unreconciledWHT.rows[0].count} certificates pending reconciliation`,
                    action: 'review_certificates',
                    count: parseInt(unreconciledWHT.rows[0].count)
                });
            }

            // Alert 4: Expiring tax credits
            const expiringCredits = await client.query(`
                SELECT
                    COUNT(*) as count,
                    COALESCE(SUM(remaining_amount), 0) as total
                FROM purchase_tax_credits
                WHERE business_id = $1
                    AND status = 'active'
                    AND expiry_date BETWEEN $2 AND $2::DATE + INTERVAL '90 days'
            `, [businessId, today]);

            if (parseInt(expiringCredits.rows[0]?.count || 0) > 0) {
                alerts.push({
                    severity: 'info',
                    category: 'credits',
                    title: 'Tax Credits Expiring Soon',
                    description: `${expiringCredits.rows[0].count} credits worth UGX ${parseFloat(expiringCredits.rows[0].total).toLocaleString()} expiring in next 90 days`,
                    action: 'review_credits',
                    count: parseInt(expiringCredits.rows[0].count),
                    amount: parseFloat(expiringCredits.rows[0].total || 0)
                });
            }

            // Alert 5: Supplier compliance issues
            const nonCompliantSuppliers = await client.query(`
                SELECT COUNT(*) as count
                FROM suppliers
                WHERE business_id = $1
                    AND tin_verified = false
                    AND compliance_score < 50
            `, [businessId]);

            if (parseInt(nonCompliantSuppliers.rows[0]?.count || 0) > 0) {
                alerts.push({
                    severity: 'warning',
                    category: 'suppliers',
                    title: 'Non-Compliant Suppliers',
                    description: `${nonCompliantSuppliers.rows[0].count} suppliers have low compliance scores`,
                    action: 'review_suppliers',
                    count: parseInt(nonCompliantSuppliers.rows[0].count)
                });
            }

            // Sort alerts by severity: critical > warning > info
            const severityOrder = { critical: 0, warning: 1, info: 2 };
            alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

            return {
                total: alerts.length,
                bySeverity: {
                    critical: alerts.filter(a => a.severity === 'critical').length,
                    warning: alerts.filter(a => a.severity === 'warning').length,
                    info: alerts.filter(a => a.severity === 'info').length
                },
                alerts,
                generatedAt: this.toUTCISOString(new Date()) // Use ISO format for timestamps
            };

        } catch (error) {
            log.error('Error getting tax alerts:', {
                error: error.message,
                businessId
            });
            return {
                total: 0,
                bySeverity: { critical: 0, warning: 0, info: 0 },
                alerts: [],
                generatedAt: this.toUTCISOString(new Date()), // Use ISO format for timestamps
                error: error.message
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get user dashboard preferences
     */
    static async getUserPreferences(businessId, userId) {
        const client = await getClient();

        try {
            const result = await client.query(`
                SELECT widget_config, default_date_range, auto_refresh_interval, color_scheme
                FROM dashboard_preferences
                WHERE business_id = $1 AND user_id = $2
            `, [businessId, userId]);

            if (result.rows.length > 0) {
                return result.rows[0];
            }

            // Return defaults if no preferences found
            return {
                widget_config: {
                    widgets: [
                        {"id": "tax_liabilities", "enabled": true, "position": 1, "size": "large"},
                        {"id": "upcoming_deadlines", "enabled": true, "position": 2, "size": "medium"},
                        {"id": "compliance_score", "enabled": true, "position": 3, "size": "medium"},
                        {"id": "recent_returns", "enabled": true, "position": 4, "size": "small"}
                    ]
                },
                default_date_range: 'month',
                auto_refresh_interval: null,
                color_scheme: 'light'
            };

        } catch (error) {
            log.error('Error getting user preferences:', {
                error: error.message,
                businessId,
                userId
            });
            // Return defaults on error
            return {
                widget_config: { widgets: [] },
                default_date_range: 'month',
                auto_refresh_interval: null,
                color_scheme: 'light'
            };
        } finally {
            client.release();
        }
    }

    /**
     * Cache dashboard data (optional performance optimization)
     */
    static async cacheDashboardData(businessId, cacheKey, data, dateRange, ttlMinutes = 15) {
        const client = await getClient();

        try {
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);

            await client.query(`
                INSERT INTO dashboard_cache
                    (business_id, cache_key, cache_data, period_start, period_end, expires_at, generation_time_ms)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (business_id, cache_key, period_start, period_end)
                DO UPDATE SET
                    cache_data = EXCLUDED.cache_data,
                    expires_at = EXCLUDED.expires_at,
                    generated_at = NOW(),
                    generation_time_ms = EXCLUDED.generation_time_ms
            `, [
                businessId,
                cacheKey,
                JSON.stringify(data),
                dateRange.startDate,
                dateRange.endDate,
                this.toUTCISOString(expiresAt),
                data.generationTimeMs || 0
            ]);

        } catch (error) {
            // Non-critical, just log and continue
            log.debug('Failed to cache dashboard data:', {
                error: error.message,
                businessId,
                cacheKey
            });
        } finally {
            client.release();
        }
    }

    /**
     * Get cached dashboard data
     */
    static async getCachedDashboardData(businessId, cacheKey, dateRange) {
        const client = await getClient();

        try {
            const result = await client.query(`
                SELECT cache_data, generated_at
                FROM dashboard_cache
                WHERE business_id = $1
                    AND cache_key = $2
                    AND period_start = $3
                    AND period_end = $4
                    AND expires_at > NOW()
                ORDER BY generated_at DESC
                LIMIT 1
            `, [businessId, cacheKey, dateRange.startDate, dateRange.endDate]);

            if (result.rows.length > 0) {
                return {
                    data: result.rows[0].cache_data,
                    generatedAt: result.rows[0].generated_at,
                    fromCache: true
                };
            }

            return null;

        } catch (error) {
            log.debug('Error getting cached data:', {
                error: error.message,
                businessId,
                cacheKey
            });
            return null;
        } finally {
            client.release();
        }
    }
}

export default TaxDashboardService;
