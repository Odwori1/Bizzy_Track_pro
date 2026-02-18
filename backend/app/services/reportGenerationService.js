// File: backend/app/services/reportGenerationService.js
import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

/**
 * REPORT GENERATION SERVICE - Generates tax reports in multiple formats
 * Phase 8: Tax Dashboard & Reporting
 */
export class ReportGenerationService {

    /**
     * Parse date to YYYY-MM-DD format
     */
    static parseAsDateOnly(dateInput) {
        if (!dateInput) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            return dateInput;
        }

        const date = new Date(dateInput);
        if (isNaN(date.getTime())) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Get default date range (last 12 months)
     */
    static getDefaultDateRange() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        
        return {
            startDate: this.parseAsDateOnly(startDate),
            endDate: this.parseAsDateOnly(endDate)
        };
    }

    // =========================================================================
    // REPORT 1: SALES TAX SUMMARY
    // =========================================================================

    /**
     * Generate Sales Tax Summary Report
     * Data source: vat_return_sales table (joined with vat_returns for business_id)
     */
    static async generateSalesTaxReport(businessId, params = {}) {
        const client = await getClient();

        try {
            const dateRange = {
                startDate: params.startDate || this.getDefaultDateRange().startDate,
                endDate: params.endDate || this.getDefaultDateRange().endDate
            };

            log.info('Generating sales tax report', {
                businessId,
                startDate: dateRange.startDate,
                endDate: dateRange.endDate
            });

            // Query sales data from vat_return_sales, joining with vat_returns to filter by business_id
            const salesQuery = await client.query(`
                SELECT 
                    vrs.vat_category,
                    DATE_TRUNC('month', vrs.transaction_date) as month,
                    COUNT(*) as transaction_count,
                    COALESCE(SUM(vrs.amount_exclusive), 0) as total_exclusive,
                    COALESCE(SUM(vrs.vat_amount), 0) as total_vat,
                    COALESCE(SUM(vrs.amount_inclusive), 0) as total_inclusive
                FROM vat_return_sales vrs
                INNER JOIN vat_returns vr ON vrs.vat_return_id = vr.id
                WHERE vr.business_id = $1
                    AND vrs.transaction_date BETWEEN $2 AND $3
                GROUP BY vrs.vat_category, DATE_TRUNC('month', vrs.transaction_date)
                ORDER BY month DESC, vrs.vat_category
            `, [businessId, dateRange.startDate, dateRange.endDate]);

            // Calculate totals
            const totals = {
                transaction_count: 0,
                total_exclusive: 0,
                total_vat: 0,
                total_inclusive: 0
            };

            salesQuery.rows.forEach(row => {
                totals.transaction_count += parseInt(row.transaction_count || 0);
                totals.total_exclusive += parseFloat(row.total_exclusive || 0);
                totals.total_vat += parseFloat(row.total_vat || 0);
                totals.total_inclusive += parseFloat(row.total_inclusive || 0);
            });

            // Group by category
            const categorySummary = {};
            salesQuery.rows.forEach(row => {
                if (!categorySummary[row.vat_category]) {
                    categorySummary[row.vat_category] = {
                        category: row.vat_category,
                        transaction_count: 0,
                        total_exclusive: 0,
                        total_vat: 0,
                        total_inclusive: 0
                    };
                }
                categorySummary[row.vat_category].transaction_count += parseInt(row.transaction_count || 0);
                categorySummary[row.vat_category].total_exclusive += parseFloat(row.total_exclusive || 0);
                categorySummary[row.vat_category].total_vat += parseFloat(row.total_vat || 0);
                categorySummary[row.vat_category].total_inclusive += parseFloat(row.total_inclusive || 0);
            });

            const report = {
                report_name: 'Sales Tax Summary',
                generated_at: new Date().toISOString(),
                period: dateRange,
                business_id: businessId,
                summary: {
                    ...totals,
                    effective_vat_rate: totals.total_exclusive > 0 
                        ? (totals.total_vat / totals.total_exclusive * 100).toFixed(2)
                        : 0
                },
                by_category: Object.values(categorySummary),
                monthly_breakdown: salesQuery.rows.map(row => ({
                    month: this.parseAsDateOnly(row.month),
                    category: row.vat_category,
                    transaction_count: parseInt(row.transaction_count),
                    total_exclusive: parseFloat(row.total_exclusive),
                    total_vat: parseFloat(row.total_vat),
                    total_inclusive: parseFloat(row.total_inclusive)
                }))
            };

            return report;

        } catch (error) {
            log.error('Error generating sales tax report:', {
                error: error.message,
                businessId,
                params
            });
            throw new Error(`Failed to generate sales tax report: ${error.message}`);
        } finally {
            client.release();
        }
    }

    // =========================================================================
    // REPORT 2: WHT CERTIFICATE REGISTER
    // =========================================================================

    /**
     * Generate WHT Certificate Register
     * Data source: withholding_tax_certificates and purchase_wht_certificates
     */
    static async generateWHTRegister(businessId, params = {}) {
        const client = await getClient();

        try {
            const {
                startDate = this.getDefaultDateRange().startDate,
                endDate = this.getDefaultDateRange().endDate,
                type = 'all' // 'customer', 'supplier', or 'all'
            } = params;

            log.info('Generating WHT register', { businessId, startDate, endDate, type });

            let results = [];

            // Get customer WHT certificates (withholding tax collected from customers)
            if (type === 'all' || type === 'customer') {
                const customerWHT = await client.query(`
                    SELECT
                        'customer' as certificate_type,
                        certificate_number,
                        supplier_name as counterparty_name,
                        supplier_tin as counterparty_tin,
                        transaction_date,
                        service_amount as gross_amount,
                        withholding_rate,
                        withholding_amount,
                        status,
                        issued_date,
                        created_at,
                        notes
                    FROM withholding_tax_certificates
                    WHERE business_id = $1
                        AND issued_date BETWEEN $2 AND $3
                    ORDER BY issued_date DESC
                `, [businessId, startDate, endDate]);

                results = results.concat(customerWHT.rows);
            }

            // Get supplier WHT certificates (withholding tax deducted from payments to suppliers)
            if (type === 'all' || type === 'supplier') {
                const supplierWHT = await client.query(`
                    SELECT
                        'supplier' as certificate_type,
                        pwc.certificate_number,
                        s.name as counterparty_name,
                        s.tax_id as counterparty_tin,  -- Using tax_id from suppliers table
                        pwc.transaction_date,
                        pwc.payment_amount as gross_amount,
                        pwc.wht_rate as withholding_rate,
                        pwc.wht_amount,
                        pwc.status,
                        pwc.created_at as issued_date,
                        pwc.created_at,
                        pwc.notes
                    FROM purchase_wht_certificates pwc
                    LEFT JOIN suppliers s ON pwc.supplier_id = s.id
                    WHERE pwc.business_id = $1
                        AND pwc.created_at::DATE BETWEEN $2 AND $3
                    ORDER BY pwc.created_at DESC
                `, [businessId, startDate, endDate]);

                results = results.concat(supplierWHT.rows);
            }

            // Sort by date (most recent first)
            results.sort((a, b) => new Date(b.issued_date) - new Date(a.issued_date));

            // Calculate totals
            const totals = {
                customer_count: results.filter(r => r.certificate_type === 'customer').length,
                supplier_count: results.filter(r => r.certificate_type === 'supplier').length,
                customer_amount: results
                    .filter(r => r.certificate_type === 'customer')
                    .reduce((sum, r) => sum + parseFloat(r.withholding_amount || 0), 0),
                supplier_amount: results
                    .filter(r => r.certificate_type === 'supplier')
                    .reduce((sum, r) => sum + parseFloat(r.wht_amount || 0), 0),
                total_count: results.length,
                total_amount: results.reduce((sum, r) => sum + parseFloat(r.withholding_amount || r.wht_amount || 0), 0)
            };

            const report = {
                report_name: 'WHT Certificate Register',
                generated_at: new Date().toISOString(),
                period: { startDate, endDate },
                business_id: businessId,
                type_filter: type,
                summary: totals,
                certificates: results.map(r => ({
                    certificate_type: r.certificate_type,
                    certificate_number: r.certificate_number,
                    counterparty_name: r.counterparty_name,
                    counterparty_tin: r.counterparty_tin,
                    transaction_date: this.parseAsDateOnly(r.transaction_date),
                    gross_amount: parseFloat(r.gross_amount || 0),
                    withholding_rate: parseFloat(r.withholding_rate || 0),
                    wht_amount: parseFloat(r.withholding_amount || r.wht_amount || 0),
                    status: r.status,
                    issued_date: this.parseAsDateOnly(r.issued_date),
                    notes: r.notes
                }))
            };

            return report;

        } catch (error) {
            log.error('Error generating WHT register:', {
                error: error.message,
                businessId,
                params
            });
            throw new Error(`Failed to generate WHT register: ${error.message}`);
        } finally {
            client.release();
        }
    }

    // =========================================================================
    // REPORT 3: VAT RETURNS HISTORY
    // =========================================================================

    /**
     * Generate VAT Returns History Report
     * Data source: vat_returns
     */
    static async generateVATReturnsHistory(businessId, params = {}) {
        const client = await getClient();

        try {
            const {
                startDate = this.getDefaultDateRange().startDate,
                endDate = this.getDefaultDateRange().endDate,
                status = 'all'
            } = params;

            log.info('Generating VAT returns history', { businessId, startDate, endDate, status });

            let query = `
                SELECT
                    return_number,
                    return_type,
                    period_start,
                    period_end,
                    due_date,
                    filing_date,
                    status,
                    total_sales_exclusive,
                    total_sales_vat,
                    total_sales_inclusive,
                    total_purchases_exclusive,
                    total_purchases_vat,
                    total_purchases_inclusive,
                    net_vat_payable,
                    credit_brought_forward,
                    credit_carried_forward,
                    late_filing_penalty,
                    late_payment_penalty,
                    interest_amount,
                    total_amount_due,
                    paid_amount,
                    paid_at,
                    ura_receipt_number,
                    submitted_at,
                    approved_at,
                    created_at
                FROM vat_returns
                WHERE business_id = $1
                    AND period_start BETWEEN $2 AND $3
            `;

            const queryParams = [businessId, startDate, endDate];

            if (status !== 'all') {
                query += ` AND status = $4`;
                queryParams.push(status);
            }

            query += ` ORDER BY period_start DESC`;

            const returns = await client.query(query, queryParams);

            // Calculate statistics
            const stats = {
                total_returns: returns.rows.length,
                total_vat_payable: 0,
                total_vat_paid: 0,
                total_penalties: 0,
                on_time_filing: 0,
                late_filing: 0,
                by_status: {}
            };

            returns.rows.forEach(row => {
                const netVat = parseFloat(row.net_vat_payable || 0);
                const paidAmount = parseFloat(row.paid_amount || 0);
                const penalties = parseFloat(row.late_filing_penalty || 0) +
                                 parseFloat(row.late_payment_penalty || 0) +
                                 parseFloat(row.interest_amount || 0);

                stats.total_vat_payable += netVat;
                stats.total_vat_paid += paidAmount;
                stats.total_penalties += penalties;

                if (row.filing_date && row.due_date) {
                    if (new Date(row.filing_date) <= new Date(row.due_date)) {
                        stats.on_time_filing++;
                    } else {
                        stats.late_filing++;
                    }
                }

                stats.by_status[row.status] = (stats.by_status[row.status] || 0) + 1;
            });

            const report = {
                report_name: 'VAT Returns History',
                generated_at: new Date().toISOString(),
                period: { startDate, endDate },
                business_id: businessId,
                statistics: stats,
                returns: returns.rows.map(row => ({
                    ...row,
                    total_sales_exclusive: parseFloat(row.total_sales_exclusive || 0),
                    total_sales_vat: parseFloat(row.total_sales_vat || 0),
                    total_sales_inclusive: parseFloat(row.total_sales_inclusive || 0),
                    total_purchases_exclusive: parseFloat(row.total_purchases_exclusive || 0),
                    total_purchases_vat: parseFloat(row.total_purchases_vat || 0),
                    total_purchases_inclusive: parseFloat(row.total_purchases_inclusive || 0),
                    net_vat_payable: parseFloat(row.net_vat_payable || 0),
                    credit_brought_forward: parseFloat(row.credit_brought_forward || 0),
                    credit_carried_forward: parseFloat(row.credit_carried_forward || 0),
                    late_filing_penalty: parseFloat(row.late_filing_penalty || 0),
                    late_payment_penalty: parseFloat(row.late_payment_penalty || 0),
                    interest_amount: parseFloat(row.interest_amount || 0),
                    total_amount_due: parseFloat(row.total_amount_due || 0),
                    paid_amount: parseFloat(row.paid_amount || 0)
                }))
            };

            return report;

        } catch (error) {
            log.error('Error generating VAT returns history:', {
                error: error.message,
                businessId,
                params
            });
            throw new Error(`Failed to generate VAT returns history: ${error.message}`);
        } finally {
            client.release();
        }
    }

    // =========================================================================
    // REPORT 4: TAX CREDIT REPORT
    // =========================================================================

    /**
     * Generate Tax Credit Report
     * Data source: purchase_tax_credits
     */
    static async generateTaxCreditReport(businessId, params = {}) {
        const client = await getClient();

        try {
            const {
                status = 'active',
                startDate = this.getDefaultDateRange().startDate,
                endDate = this.getDefaultDateRange().endDate
            } = params;

            log.info('Generating tax credit report', { businessId, status, startDate, endDate });

            let query = `
                SELECT
                    pc.*,
                    s.name as supplier_name,
                    s.tax_id as supplier_tin,  -- Using tax_id from suppliers table
                    po.po_number
                FROM purchase_tax_credits pc
                LEFT JOIN suppliers s ON pc.supplier_id = s.id
                LEFT JOIN purchase_orders po ON pc.purchase_order_id = po.id
                WHERE pc.business_id = $1
            `;

            const queryParams = [businessId];

            if (status !== 'all') {
                query += ` AND pc.status = $2`;
                queryParams.push(status);
            }

            if (startDate && endDate) {
                query += ` AND pc.created_at::DATE BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
                queryParams.push(startDate, endDate);
            }

            query += ` ORDER BY pc.expiry_date`;

            const credits = await client.query(query, queryParams);

            // Calculate statistics
            const now = new Date();
            const stats = {
                total_credits: credits.rows.length,
                total_amount: 0,
                total_utilized: 0,
                total_remaining: 0,
                by_status: {},
                expiring_soon: {
                    within_30_days: 0,
                    within_60_days: 0,
                    within_90_days: 0,
                    amount_30_days: 0,
                    amount_60_days: 0,
                    amount_90_days: 0
                }
            };

            credits.rows.forEach(row => {
                const amount = parseFloat(row.credit_amount || 0);
                const utilized = parseFloat(row.utilized_amount || 0);
                const remaining = parseFloat(row.remaining_amount || 0);

                stats.total_amount += amount;
                stats.total_utilized += utilized;
                stats.total_remaining += remaining;
                stats.by_status[row.status] = (stats.by_status[row.status] || 0) + 1;

                // Check expiring credits
                if (row.expiry_date) {
                    const daysUntilExpiry = Math.ceil((new Date(row.expiry_date) - now) / (1000 * 60 * 60 * 24));

                    if (daysUntilExpiry <= 30) {
                        stats.expiring_soon.within_30_days++;
                        stats.expiring_soon.amount_30_days += remaining;
                    } else if (daysUntilExpiry <= 60) {
                        stats.expiring_soon.within_60_days++;
                        stats.expiring_soon.amount_60_days += remaining;
                    } else if (daysUntilExpiry <= 90) {
                        stats.expiring_soon.within_90_days++;
                        stats.expiring_soon.amount_90_days += remaining;
                    }
                }
            });

            const report = {
                report_name: 'Tax Credit Report',
                generated_at: new Date().toISOString(),
                business_id: businessId,
                filters: { status, startDate, endDate },
                summary: stats,
                credits: credits.rows.map(row => ({
                    id: row.id,
                    supplier_name: row.supplier_name,
                    supplier_tin: row.supplier_tin,
                    po_number: row.po_number,
                    credit_amount: parseFloat(row.credit_amount || 0),
                    utilized_amount: parseFloat(row.utilized_amount || 0),
                    remaining_amount: parseFloat(row.remaining_amount || 0),
                    status: row.status,
                    issue_date: this.parseAsDateOnly(row.created_at),
                    expiry_date: row.expiry_date ? this.parseAsDateOnly(row.expiry_date) : null,
                    days_until_expiry: row.expiry_date
                        ? Math.ceil((new Date(row.expiry_date) - now) / (1000 * 60 * 60 * 24))
                        : null,
                    tax_type_code: row.tax_type_code,
                    tax_period: row.tax_period,
                    notes: row.notes
                }))
            };

            return report;

        } catch (error) {
            log.error('Error generating tax credit report:', {
                error: error.message,
                businessId,
                params
            });
            throw new Error(`Failed to generate tax credit report: ${error.message}`);
        } finally {
            client.release();
        }
    }

    // =========================================================================
    // REPORT 5: SUPPLIER COMPLIANCE REPORT
    // =========================================================================

    /**
     * Generate Supplier Compliance Report
     * Data source: suppliers table
     */
    static async generateSupplierComplianceReport(businessId, params = {}) {
        const client = await getClient();

        try {
            const {
                minComplianceScore = 0,
                riskLevel = 'all',
                tinVerified = 'all' // 'yes', 'no', 'all'
            } = params;

            log.info('Generating supplier compliance report', {
                businessId,
                minComplianceScore,
                riskLevel,
                tinVerified
            });

            let query = `
                SELECT
                    s.id,
                    s.name,
                    s.tax_id as tin,  -- Using tax_id as tin
                    s.email,
                    s.phone,
                    s.tin_verified,
                    s.tin_verified_at,
                    s.tin_verification_status,
                    s.compliance_score,
                    s.risk_level,
                    s.last_compliance_check,
                    s.created_at,
                    s.updated_at,
                    
                    -- Additional stats from related tables
                    (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id) as po_count,
                    (SELECT COUNT(*) FROM purchase_wht_certificates pwc WHERE pwc.supplier_id = s.id) as wht_certificate_count,
                    (SELECT COALESCE(SUM(wht_amount), 0) FROM purchase_wht_certificates pwc WHERE pwc.supplier_id = s.id) as total_wht_deducted
                    
                FROM suppliers s
                WHERE s.business_id = $1
            `;

            const queryParams = [businessId];
            let paramIndex = 2;

            if (minComplianceScore > 0) {
                query += ` AND s.compliance_score >= $${paramIndex}`;
                queryParams.push(minComplianceScore);
                paramIndex++;
            }

            if (riskLevel !== 'all') {
                query += ` AND s.risk_level = $${paramIndex}`;
                queryParams.push(riskLevel);
                paramIndex++;
            }

            if (tinVerified !== 'all') {
                const verified = tinVerified === 'yes';
                query += ` AND s.tin_verified = $${paramIndex}`;
                queryParams.push(verified);
                paramIndex++;
            }

            query += ` ORDER BY s.compliance_score ASC`;

            const suppliers = await client.query(query, queryParams);

            // Calculate overall statistics
            const stats = {
                total_suppliers: suppliers.rows.length,
                tin_verified: suppliers.rows.filter(s => s.tin_verified).length,
                tin_unverified: suppliers.rows.filter(s => !s.tin_verified).length,
                by_risk_level: {
                    low: suppliers.rows.filter(s => s.risk_level === 'low').length,
                    medium: suppliers.rows.filter(s => s.risk_level === 'medium').length,
                    high: suppliers.rows.filter(s => s.risk_level === 'high').length
                },
                average_compliance_score: suppliers.rows.length > 0
                    ? suppliers.rows.reduce((sum, s) => sum + parseFloat(s.compliance_score || 0), 0) / suppliers.rows.length
                    : 0,
                total_wht_deducted: suppliers.rows.reduce((sum, s) => sum + parseFloat(s.total_wht_deducted || 0), 0)
            };

            const report = {
                report_name: 'Supplier Compliance Report',
                generated_at: new Date().toISOString(),
                business_id: businessId,
                filters: { minComplianceScore, riskLevel, tinVerified },
                summary: stats,
                suppliers: suppliers.rows.map(s => ({
                    id: s.id,
                    name: s.name,
                    tin: s.tin,  // This is actually tax_id from the query
                    email: s.email,
                    phone: s.phone,
                    tin_verified: s.tin_verified,
                    tin_verification_status: s.tin_verification_status,
                    compliance_score: parseFloat(s.compliance_score || 0),
                    risk_level: s.risk_level,
                    last_compliance_check: s.last_compliance_check,
                    created_at: s.created_at,
                    po_count: parseInt(s.po_count || 0),
                    wht_certificate_count: parseInt(s.wht_certificate_count || 0),
                    total_wht_deducted: parseFloat(s.total_wht_deducted || 0),
                    compliance_status: this.getComplianceStatus(s.compliance_score, s.tin_verified)
                }))
            };

            return report;

        } catch (error) {
            log.error('Error generating supplier compliance report:', {
                error: error.message,
                businessId,
                params
            });
            throw new Error(`Failed to generate supplier compliance report: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Helper to determine compliance status
     */
    static getComplianceStatus(score, tinVerified) {
        if (!tinVerified) return 'TIN Not Verified';
        if (score >= 80) return 'Compliant';
        if (score >= 50) return 'Partially Compliant';
        return 'Non-Compliant';
    }

    // =========================================================================
    // EXPORT FORMATTERS
    // =========================================================================

    /**
     * Format report as JSON
     */
    static formatAsJSON(report) {
        return {
            format: 'json',
            data: report,
            generated_at: new Date().toISOString()
        };
    }

    /**
     * Format report as CSV
     */
    static formatAsCSV(report) {
        // Extract the main data array from the report
        let dataArray = [];
        let reportName = 'report';

        if (report.certificates) {
            dataArray = report.certificates;
            reportName = 'wht_certificates';
        } else if (report.returns) {
            dataArray = report.returns;
            reportName = 'vat_returns';
        } else if (report.credits) {
            dataArray = report.credits;
            reportName = 'tax_credits';
        } else if (report.suppliers) {
            dataArray = report.suppliers;
            reportName = 'suppliers';
        } else if (report.by_category) {
            dataArray = report.by_category;
            reportName = 'sales_tax_summary';
        } else if (report.monthly_breakdown) {
            dataArray = report.monthly_breakdown;
            reportName = 'monthly_breakdown';
        }

        if (dataArray.length === 0) {
            return {
                format: 'csv',
                data: 'No data available',
                filename: `${reportName}_${this.parseAsDateOnly(new Date())}.csv`
            };
        }

        // Get headers from first object
        const headers = Object.keys(dataArray[0]).filter(key => 
            typeof dataArray[0][key] !== 'object' || dataArray[0][key] === null
        );

        // Create CSV rows
        const csvRows = [];
        csvRows.push(headers.join(','));

        for (const row of dataArray) {
            const values = headers.map(header => {
                const value = row[header];
                if (value === null || value === undefined) return '';
                if (typeof value === 'string' && value.includes(',')) {
                    return `"${value}"`; // Wrap in quotes if contains comma
                }
                return value;
            });
            csvRows.push(values.join(','));
        }

        return {
            format: 'csv',
            data: csvRows.join('\n'),
            filename: `${reportName}_${this.parseAsDateOnly(new Date())}.csv`
        };
    }

    /**
     * Export report in requested format
     */
    static async exportReport(report, format = 'json') {
        switch (format.toLowerCase()) {
            case 'json':
                return this.formatAsJSON(report);
            case 'csv':
                return this.formatAsCSV(report);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
}

export default ReportGenerationService;
