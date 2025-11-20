'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/lib/api';

interface TemplateFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface TemplateFormData {
  name: string;
  description: string;
  header: string;
  footer: string;
  default_terms: string;
  default_notes: string;
  fields: string[];
  include_tax: boolean;
  include_discount: boolean;
}

export default function TemplateForm({ onClose, onSuccess }: TemplateFormProps) {
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    header: 'INVOICE',
    footer: 'Thank you for your business!',
    default_terms: 'Payment due within 30 days. Late fees may apply for overdue payments.',
    default_notes: 'We appreciate your business. Please contact us with any questions.',
    fields: ['service_description', 'quantity', 'unit_price', 'total'],
    include_tax: true,
    include_discount: false
  });

  const availableFields = [
    { id: 'service_description', label: 'Service Description', default: true },
    { id: 'service_name', label: 'Service Name', default: true },
    { id: 'quantity', label: 'Quantity', default: true },
    { id: 'unit_price', label: 'Unit Price', default: true },
    { id: 'total', label: 'Total', default: true },
    { id: 'tax_rate', label: 'Tax Rate', default: false },
    { id: 'tax_amount', label: 'Tax Amount', default: false },
    { id: 'discount', label: 'Discount', default: false },
    { id: 'hours', label: 'Hours', default: false },
    { id: 'rate', label: 'Rate', default: false }
  ];

  const handleFieldToggle = (fieldId: string) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.includes(fieldId)
        ? prev.fields.filter(f => f !== fieldId)
        : [...prev.fields, fieldId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Create template structure for backend
      const templateData = {
        name: formData.name,
        description: formData.description,
        content: {
          header: formData.header,
          footer: formData.footer,
          default_terms: formData.default_terms,
          default_notes: formData.default_notes,
          fields: formData.fields,
          include_tax: formData.include_tax,
          include_discount: formData.include_discount
        },
        is_active: true
      };

      // Use apiClient instead of direct fetch
      await apiClient.post('/invoice-templates', templateData);
      
      alert('Template created successfully!');
      onSuccess();
      onClose();
    } catch (error: any) {
      alert('Error creating template: ' + error.message);
      console.error('Template creation error:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      {/* Outer container with fixed positioning and proper scrolling */}
      <div className="absolute inset-0 overflow-y-auto">
        {/* Centered content with proper margins */}
        <div className="min-h-full flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            <CardHeader className="flex-shrink-0 bg-white border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Create Invoice Template</h2>
                <Button variant="outline" onClick={onClose}>×</Button>
              </div>
            </CardHeader>
            
            {/* Scrollable content area */}
            <CardContent className="flex-1 overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Template Name *
                    </label>
                    <Input
                      required
                      placeholder="e.g., Standard Service Invoice"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <Input
                      placeholder="Describe when to use this template"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                </div>

                {/* Header & Footer */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Header Text
                    </label>
                    <Input
                      value={formData.header}
                      onChange={(e) => setFormData({...formData, header: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Footer Text
                    </label>
                    <Input
                      value={formData.footer}
                      onChange={(e) => setFormData({...formData, footer: e.target.value})}
                    />
                  </div>
                </div>

                {/* Default Content */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Terms & Conditions
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    value={formData.default_terms}
                    onChange={(e) => setFormData({...formData, default_terms: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Notes
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    value={formData.default_notes}
                    onChange={(e) => setFormData({...formData, default_notes: e.target.value})}
                  />
                </div>

                {/* Fields Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Invoice Fields to Include
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {availableFields.map(field => (
                      <label key={field.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.fields.includes(field.id)}
                          onChange={() => handleFieldToggle(field.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Options */}
                <div className="flex gap-6">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.include_tax}
                      onChange={(e) => setFormData({...formData, include_tax: e.target.checked})}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Include Tax Field</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.include_discount}
                      onChange={(e) => setFormData({...formData, include_discount: e.target.checked})}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Include Discount Field</span>
                  </label>
                </div>

                {/* Preview Section */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Template Preview</h3>
                  <div className="bg-gray-50 p-4 rounded-lg border">
                    <div className="text-center font-bold text-lg mb-2">{formData.header}</div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><strong>Fields:</strong> {formData.fields.map(f => {
                        const field = availableFields.find(af => af.id === f);
                        return field ? field.label : f;
                      }).join(', ')}</p>
                      <p><strong>Terms:</strong> {formData.default_terms.substring(0, 50)}...</p>
                      <p><strong>Footer:</strong> {formData.footer}</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4 pt-4 border-t">
                  <Button 
                    type="submit" 
                    variant="primary"
                    disabled={!formData.name.trim()}
                  >
                    Create Template
                  </Button>
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
