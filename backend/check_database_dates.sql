-- Check latest invoices and their stored dates
SELECT 
    invoice_number,
    invoice_date,
    due_date,
    created_at,
    EXTRACT(TIMEZONE_HOUR FROM invoice_date) as tz_offset_hours,
    invoice_date AT TIME ZONE 'UTC' as invoice_date_utc,
    invoice_date AT TIME ZONE 'Africa/Nairobi' as invoice_date_nairobi
FROM invoices 
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
ORDER BY created_at DESC 
LIMIT 5;
