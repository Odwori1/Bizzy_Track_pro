'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { apiClient } from '@/lib/api';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

interface Invoice {
  id: string;
  invoice_number: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone?: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  currency_symbol: string;
  due_date: string;
  created_at: string;
  status: string;
  notes?: string;
  terms?: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    service_name?: string;
  }>;
}

export default function InvoicePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/invoices/${invoiceId}`);
      setInvoice(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice');
      console.error('Error fetching invoice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    try {
      setPdfLoading(true);

      // Call the PDF generation endpoint
      const response = await apiClient.get(`/invoices/${invoiceId}/pdf`);

      if (response.success) {
        // Create a download link for the PDF
        const downloadUrl = `http://localhost:8002${response.data.pdf_url}`;

        // Create a temporary anchor element to trigger download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `invoice-${invoice?.invoice_number || invoiceId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('PDF download initiated:', response.data);
      } else {
        throw new Error('Failed to generate PDF');
      }
    } catch (err: any) {
      console.error('PDF generation error:', err);
      alert('PDF download is available but requires the PDF generation service to be fully implemented.');
    } finally {
      setPdfLoading(false);
    }
  };

  const calculateLineTotal = (item: any) => {
    const subtotal = item.quantity * item.unit_price;
    const tax = subtotal * (item.tax_rate / 100);
    return subtotal + tax;
  };

  if (loading) return <Loading />;

  if (error) return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="text-red-700 font-medium">Error loading invoice</div>
      <div className="text-red-600 text-sm mt-1">{error}</div>
      <div className="flex gap-4 mt-4">
        <Button variant="primary" onClick={fetchInvoice}>
          Retry
        </Button>
        <Link href="/dashboard/management/invoices">
          <Button variant="secondary">
            Back to Invoices
          </Button>
        </Link>
      </div>
    </div>
  );

  if (!invoice) return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div className="text-yellow-700">Invoice not found</div>
      <Link href="/dashboard/management/invoices">
        <Button variant="secondary" className="mt-4">
          Back to Invoices
        </Button>
      </Link>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice Preview</h1>
          <p className="text-gray-600">Preview and print invoice #{invoice.invoice_number}</p>
        </div>
        <div className="flex space-x-4">
          <Button variant="secondary" onClick={handlePrint}>
            Print Invoice
          </Button>
          <Button
            variant="primary"
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
          >
            {pdfLoading ? 'Generating PDF...' : 'Download PDF'}
          </Button>
          <Link href={`/dashboard/management/invoices/${invoiceId}`}>
            <Button variant="outline">
              Back to Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Invoice Preview */}
      <Card className="max-w-4xl mx-auto print:shadow-none print:border-0">
        <CardContent className="p-8 print:p-0">
          {/* Invoice Header */}
          <div className="flex justify-between items-start mb-8 print:mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">INVOICE</h1>
              <div className="text-lg text-gray-600">#{invoice.invoice_number}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">Bizzy Track Pro</div>
              <div className="text-gray-600">Business Management System</div>
            </div>
          </div>

          {/* From/To Sections */}
          <div className="grid grid-cols-2 gap-8 mb-8 print:mb-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">From:</h3>
              <div className="text-gray-700">
                <div>Bizzy Track Pro</div>
                <div>123 Business Street</div>
                <div>City, State 12345</div>
                <div>contact@bizzytrackpro.com</div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">To:</h3>
              <div className="text-gray-700">
                <div>{invoice.customer_first_name} {invoice.customer_last_name}</div>
                <div>{invoice.customer_email}</div>
                {invoice.customer_phone && <div>{invoice.customer_phone}</div>}
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-3 gap-4 mb-8 print:mb-6 p-4 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm text-gray-600">Invoice Date</div>
              <div className="font-semibold">
                {new Date(invoice.created_at).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Due Date</div>
              <div className="font-semibold">
                {new Date(invoice.due_date).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Status</div>
              <div className="font-semibold capitalize">{invoice.status}</div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="mb-8 print:mb-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-3 font-semibold text-gray-900">Description</th>
                  <th className="text-right py-3 font-semibold text-gray-900">Quantity</th>
                  <th className="text-right py-3 font-semibold text-gray-900">Unit Price</th>
                  <th className="text-right py-3 font-semibold text-gray-900">Tax</th>
                  <th className="text-right py-3 font-semibold text-gray-900">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-3 text-gray-700">
                      <div className="font-medium">{item.description}</div>
                      {item.service_name && (
                        <div className="text-sm text-gray-600">{item.service_name}</div>
                      )}
                    </td>
                    <td className="py-3 text-right text-gray-700">{item.quantity}</td>
                    <td className="py-3 text-right text-gray-700">
                      {format(item.unit_price.toString())} {/* ✅ CORRECT: Using format function */}
                    </td>
                    <td className="py-3 text-right text-gray-700">{item.tax_rate}%</td>
                    <td className="py-3 text-right font-semibold text-gray-900">
                      {format(calculateLineTotal(item).toString())} {/* ✅ CORRECT: Using format function */}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-8 print:mb-6">
            <div className="w-64">
              <div className="flex justify-between py-2">
                <span className="text-gray-700">Subtotal:</span>
                <span className="font-semibold">
                  {format(invoice.total_amount)} {/* ✅ CORRECT: Using format function */}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-700">Amount Paid:</span>
                <span className="font-semibold text-green-600">
                  {format(invoice.amount_paid)} {/* ✅ CORRECT: Using format function */}
                </span>
              </div>
              <div className="flex justify-between py-3 border-t border-gray-300">
                <span className="font-semibold text-gray-900">Balance Due:</span>
                <span className="font-semibold text-red-600">
                  {format(invoice.balance_due)} {/* ✅ CORRECT: Using format function */}
                </span>
              </div>
            </div>
          </div>

          {/* Notes and Terms */}
          <div className="grid grid-cols-2 gap-8 print:mb-6">
            {invoice.notes && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Notes</h4>
                <p className="text-gray-700">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Terms & Conditions</h4>
                <p className="text-gray-700">{invoice.terms}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-300 pt-6 mt-8 print:mt-6 text-center text-gray-600 text-sm">
            <div>Thank you for your business!</div>
            <div>If you have questions, please contact us at contact@bizzytrackpro.com</div>
          </div>
        </CardContent>
      </Card>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:shadow-none,
          .print\\:shadow-none * {
            visibility: visible;
          }
          .print\\:shadow-none {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
