'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { formatCurrency } from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { StaffProfile, StaffProfileUpdateData } from '@/types/workforce';

export default function EditStaffProfilePage() {
  const router = useRouter();
  const params = useParams();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchStaffProfiles, updateStaffProfile, loading: workforceLoading } = useWorkforce();

  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<StaffProfileUpdateData>({
    job_title: '',
    employment_type: 'full_time',
    base_wage_rate: 0,
    wage_type: 'hourly',
    overtime_rate: 0,
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    skills: [],
    certifications: [],
    max_hours_per_week: 40,
    is_active: true
  });

  const [skillsInput, setSkillsInput] = useState('');
  const [certificationsInput, setCertificationsInput] = useState('');

  const staffId = params.id as string;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadStaffProfile();
  }, [authLoading, isAuthenticated, router, staffId]);

  const loadStaffProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      const profiles = await fetchStaffProfiles();
      const profile = profiles.find(p => p.id === staffId);

      if (!profile) {
        setError('Staff profile not found');
        return;
      }

      setStaffProfile(profile);

      // Initialize form data
      setFormData({
        job_title: profile.job_title || '',
        employment_type: profile.employment_type || 'full_time',
        base_wage_rate: parseFloat(profile.base_wage_rate) || 0,
        wage_type: profile.wage_type || 'hourly',
        overtime_rate: parseFloat(profile.overtime_rate) || 0,
        emergency_contact_name: profile.emergency_contact_name || '',
        emergency_contact_phone: profile.emergency_contact_phone || '',
        emergency_contact_relationship: profile.emergency_contact_relationship || '',
        skills: profile.skills || [],
        certifications: profile.certifications || [],
        max_hours_per_week: profile.max_hours_per_week || 40,
        is_active: profile.is_active
      });

      setSkillsInput(profile.skills?.join(', ') || '');
      setCertificationsInput(profile.certifications?.join(', ') || '');
    } catch (err: any) {
      console.error('Error loading staff profile:', err);
      setError(err.message || 'Failed to load staff profile');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof StaffProfileUpdateData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSkillsChange = (value: string) => {
    setSkillsInput(value);
    const skillsArray = value.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
    handleInputChange('skills', skillsArray);
  };

  const handleCertificationsChange = (value: string) => {
    setCertificationsInput(value);
    const certsArray = value.split(',').map(cert => cert.trim()).filter(cert => cert.length > 0);
    handleInputChange('certifications', certsArray);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateStaffProfile(staffId, formData);
      setSuccess('Staff profile updated successfully!');

      // Redirect back after 2 seconds
      setTimeout(() => {
        router.push(`/dashboard/management/workforce/staff/profiles/${staffId}`);
      }, 2000);
    } catch (err: any) {
      console.error('Error updating staff profile:', err);
      setError(err.message || 'Failed to update staff profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push(`/dashboard/management/workforce/staff/profiles/${staffId}`);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading staff profile...</div>
      </div>
    );
  }

  if (error || !staffProfile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-red-800">Staff Profile Not Found</h3>
              <p className="text-red-700 mt-1">{error || 'The requested staff profile does not exist.'}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => router.push('/dashboard/management/workforce/staff/profiles')}
              >
                ← Back to Staff Profiles
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/dashboard/management/workforce/staff/profiles/${staffId}`)}
              className="mb-2"
            >
              ← Back to Profile
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">Edit Workforce Profile</h1>
            <p className="text-gray-600 mt-1">
              Edit workforce details for {staffProfile.user_full_name || 'Unknown Staff'}
            </p>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-green-600">✓</span>
            </div>
            <div className="ml-3">
              <p className="text-green-800">{success}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-red-600">⚠️</span>
            </div>
            <div className="ml-3">
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Employment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Employment Details</CardTitle>
              <CardDescription>Basic employment information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="job_title">Job Title</Label>
                <Input
                  id="job_title"
                  value={formData.job_title || ''}
                  onChange={(e) => handleInputChange('job_title', e.target.value)}
                  placeholder="e.g., Field Technician, Supervisor"
                  className="w-full"
                />
              </div>

              <div>
                <Label htmlFor="employment_type">Employment Type</Label>
                <select
                  id="employment_type"
                  value={formData.employment_type}
                  onChange={(e) => handleInputChange('employment_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="full_time">Full Time</option>
                  <option value="part_time">Part Time</option>
                  <option value="contract">Contract</option>
                  <option value="temporary">Temporary</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Label htmlFor="is_active">Employment Status</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => handleInputChange('is_active', checked)}
                  />
                  <span className="text-sm">{formData.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="max_hours_per_week">Maximum Hours Per Week</Label>
                <Input
                  id="max_hours_per_week"
                  type="number"
                  min="1"
                  max="168"
                  value={formData.max_hours_per_week || 40}
                  onChange={(e) => handleInputChange('max_hours_per_week', parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>

          {/* Compensation */}
          <Card>
            <CardHeader>
              <CardTitle>Compensation</CardTitle>
              <CardDescription>Wage and rate information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="wage_type">Wage Type</Label>
                <select
                  id="wage_type"
                  value={formData.wage_type}
                  onChange={(e) => handleInputChange('wage_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                  <option value="commission">Commission</option>
                </select>
              </div>

              <div>
                <Label htmlFor="base_wage_rate">
                  Base Wage Rate ({formatCurrency(0, business).split(' ')[0]})
                </Label>
                <Input
                  id="base_wage_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.base_wage_rate || 0}
                  onChange={(e) => handleInputChange('base_wage_rate', parseFloat(e.target.value))}
                  placeholder="0.00"
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.wage_type === 'hourly' ? 'Per hour' : 'Per pay period'}
                </p>
              </div>

              <div>
                <Label htmlFor="overtime_rate">
                  Overtime Rate ({formatCurrency(0, business).split(' ')[0]})
                </Label>
                <Input
                  id="overtime_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.overtime_rate || 0}
                  onChange={(e) => handleInputChange('overtime_rate', parseFloat(e.target.value))}
                  placeholder="0.00"
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Per hour (for hourly employees)</p>
              </div>
            </CardContent>
          </Card>

          {/* Skills & Certifications */}
          <Card>
            <CardHeader>
              <CardTitle>Skills & Certifications</CardTitle>
              <CardDescription>Staff competencies and qualifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="skills">Skills</Label>
                <Textarea
                  id="skills"
                  value={skillsInput}
                  onChange={(e) => handleSkillsChange(e.target.value)}
                  placeholder="Enter skills separated by commas (e.g., Plumbing, Electrical, Customer Service)"
                  rows={3}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.skills?.length || 0} skill(s) entered
                </p>
              </div>

              <div>
                <Label htmlFor="certifications">Certifications</Label>
                <Textarea
                  id="certifications"
                  value={certificationsInput}
                  onChange={(e) => handleCertificationsChange(e.target.value)}
                  placeholder="Enter certifications separated by commas (e.g., OSHA Certified, First Aid, HVAC Certified)"
                  rows={3}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.certifications?.length || 0} certification(s) entered
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Emergency Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Emergency Contact</CardTitle>
              <CardDescription>Emergency contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="emergency_contact_name">Contact Name</Label>
                <Input
                  id="emergency_contact_name"
                  value={formData.emergency_contact_name || ''}
                  onChange={(e) => handleInputChange('emergency_contact_name', e.target.value)}
                  placeholder="Full name of emergency contact"
                  className="w-full"
                />
              </div>

              <div>
                <Label htmlFor="emergency_contact_phone">Phone Number</Label>
                <Input
                  id="emergency_contact_phone"
                  value={formData.emergency_contact_phone || ''}
                  onChange={(e) => handleInputChange('emergency_contact_phone', e.target.value)}
                  placeholder="Phone number with country code"
                  className="w-full"
                />
              </div>

              <div>
                <Label htmlFor="emergency_contact_relationship">Relationship</Label>
                <Input
                  id="emergency_contact_relationship"
                  value={formData.emergency_contact_relationship || ''}
                  onChange={(e) => handleInputChange('emergency_contact_relationship', e.target.value)}
                  placeholder="e.g., Spouse, Parent, Sibling"
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Form Actions */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </Button>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/dashboard/management/workforce/staff/profiles/${staffId}`)}
                disabled={saving}
              >
                View Profile
              </Button>
              <Button
                type="submit"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
