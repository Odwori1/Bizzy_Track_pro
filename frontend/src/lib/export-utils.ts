import { apiClient } from './api';

/**
 * Export financial report as PDF
 */
export const exportAsPDF = async (reportType: string, filters?: { start_date?: string; end_date?: string }) => {
  try {
    // Create a custom fetch for blob responses since our apiClient might not handle blobs
    const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    
    const requestBody: any = {
      report_type: reportType
    };

    // Only add date filters for reports that require them
    if (reportType !== 'monthly-summary' && filters?.start_date && filters?.end_date) {
      requestBody.start_date = filters.start_date;
      requestBody.end_date = filters.end_date;
    }

    console.log('PDF Export Request:', {
      reportType,
      filters,
      requestBody
    });

    const response = await fetch(`${baseURL}/api/financial-reports/export/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('PDF Export Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PDF export failed with response:', errorText);
      throw new Error(`PDF export failed: ${response.status} ${response.statusText}`);
    }

    // Create blob and download
    const blob = await response.blob();
    
    // Check if blob is valid
    if (blob.size === 0) {
      throw new Error('Empty PDF file received');
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true };
  } catch (error: any) {
    console.error('PDF export failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Export financial report as Excel
 */
export const exportAsExcel = async (reportType: string, filters?: { start_date?: string; end_date?: string }) => {
  try {
    // Create a custom fetch for blob responses
    const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    
    const requestBody: any = {
      report_type: reportType
    };

    // Only add date filters for reports that require them
    if (reportType !== 'monthly-summary' && filters?.start_date && filters?.end_date) {
      requestBody.start_date = filters.start_date;
      requestBody.end_date = filters.end_date;
    }

    console.log('Excel Export Request:', {
      reportType,
      filters,
      requestBody
    });

    const response = await fetch(`${baseURL}/api/financial-reports/export/excel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Excel Export Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Excel export failed with response:', errorText);
      throw new Error(`Excel export failed: ${response.status} ${response.statusText}`);
    }

    // Create blob and download
    const blob = await response.blob();
    
    // Check if blob is valid
    if (blob.size === 0) {
      throw new Error('Empty Excel file received');
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true };
  } catch (error: any) {
    console.error('Excel export failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Print current page or specific element
 */
export const printReport = (elementId?: string) => {
  if (elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Financial Report</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .print-header { text-align: center; margin-bottom: 20px; }
                .print-section { margin-bottom: 15px; }
                .print-table { width: 100%; border-collapse: collapse; }
                .print-table th, .print-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                .print-table th { background-color: #f5f5f5; }
                .positive { color: green; }
                .negative { color: red; }
              </style>
            </head>
            <body>
              ${element.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      }
    }
  } else {
    window.print();
  }
};
