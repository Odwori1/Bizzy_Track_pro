'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/lib/api';
import TemplateForm from '@/components/invoices/TemplateForm';

interface InvoiceTemplate {
  id: string;
  name: string;
  description: string;
  content: {
    header?: string;
    footer?: string;
    fields?: string[];
    default_terms?: string;
    default_notes?: string;
    include_tax?: boolean;
    include_discount?: boolean;
  };
  is_active: boolean;
  created_at: string;
  created_by: string;
}

export default function InvoiceTemplatesPage() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const router = useRouter();

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/invoice-templates');
      
      // Handle different response structures
      if (response.data) {
        setTemplates(response.data);
      } else if (Array.isArray(response)) {
        setTemplates(response);
      } else {
        setTemplates([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleTemplateCreated = () => {
    fetchTemplates();
  };

  const handleUseTemplate = (templateId: string) => {
    // Navigate to invoice creation with template pre-selected
    router.push(`/dashboard/management/invoices/new?template=${templateId}`);
  };

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (template.description && template.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleTemplateStatus = async (templateId: string, currentStatus: boolean) => {
    try {
      // In a real implementation, this would call the API to update the template status
      console.log(`Would update template ${templateId} status to ${!currentStatus}`);
      // For now, we'll just refetch the data
      await fetchTemplates();
    } catch (err) {
      console.error('Failed to update template status:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-lg text-gray-600">Loading templates...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="text-red-700 font-medium">Error loading templates</div>
        <div className="text-red-600 text-sm mt-1">{error}</div>
        <Button 
          variant="primary" 
          className="mt-4"
          onClick={fetchTemplates}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showCreateForm && (
        <TemplateForm 
          onClose={() => setShowCreateForm(false)}
          onSuccess={handleTemplateCreated}
        />
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice Templates</h1>
          <p className="text-gray-600">Design and manage reusable invoice templates</p>
        </div>
        <div className="flex space-x-4">
          <Button 
            variant="primary"
            onClick={() => setShowCreateForm(true)}
          >
            Create Template
          </Button>
          <Link href="/dashboard/management/invoices">
            <Button variant="secondary">
              Back to Invoices
            </Button>
          </Link>
        </div>
      </div>

      {/* Template Benefits */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-blue-900 mb-2">How Templates Work:</h3>
          <ul className="text-blue-800 text-sm space-y-1">
            <li>• Create custom invoice designs with your branding</li>
            <li>• Set default terms, notes, and fields</li>
            <li>• Apply templates to new invoices for consistency</li>
            <li>• Save time by reusing proven formats</li>
          </ul>
        </CardContent>
      </Card>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant={!searchTerm ? 'primary' : 'outline'} onClick={() => setSearchTerm('')}>
                All Templates
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <CardHeader>
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {template.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-gray-600 mb-4">{template.description || 'No description'}</p>

              <div className="space-y-2 text-sm">
                {template.content?.default_terms && (
                  <div>
                    <span className="font-medium text-gray-700">Default Terms:</span>
                    <p className="text-gray-600 mt-1 text-xs">{template.content.default_terms}</p>
                  </div>
                )}
                {template.content?.default_notes && (
                  <div>
                    <span className="font-medium text-gray-700">Default Notes:</span>
                    <p className="text-gray-600 mt-1 text-xs">{template.content.default_notes}</p>
                  </div>
                )}
                {template.content?.fields && (
                  <div>
                    <span className="font-medium text-gray-700">Fields:</span>
                    <p className="text-gray-600 mt-1 text-xs">
                      {template.content.fields.length} fields included
                    </p>
                  </div>
                )}
                <div className="text-gray-500 text-xs">
                  Created: {new Date(template.created_at).toLocaleDateString()}
                </div>
              </div>
            </CardContent>
            <div className="p-4 border-t border-gray-200">
              <div className="flex justify-between space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => handleUseTemplate(template.id)}
                >
                  Use Template
                </Button>
                <Button
                  variant={template.is_active ? 'secondary' : 'primary'}
                  size="sm"
                  className="flex-1"
                  onClick={() => toggleTemplateStatus(template.id, template.is_active)}
                >
                  {template.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredTemplates.length === 0 && templates.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-gray-500 mb-4">No templates created yet</div>
            <p className="text-sm text-gray-600 mb-4">
              Create your first template to speed up invoice creation and maintain consistency.
            </p>
            <Button 
              variant="primary"
              onClick={() => setShowCreateForm(true)}
            >
              Create Your First Template
            </Button>
          </CardContent>
        </Card>
      )}

      {filteredTemplates.length === 0 && templates.length > 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-gray-500 mb-4">No templates match your search</div>
            <Button variant="outline" onClick={() => setSearchTerm('')}>
              Clear Search
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
