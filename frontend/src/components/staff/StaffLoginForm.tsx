'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { staffApi } from '@/lib/api/staff';
import { StaffLoginData } from '@/types/staff';

interface StaffLoginFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function StaffLoginForm({ onSuccess, onError }: StaffLoginFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<StaffLoginData>({
    email: '',
    password: '',
    business_id: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.email || !formData.password || !formData.business_id) {
        throw new Error('All fields are required');
      }

      // Call staff login API
      const response = await staffApi.staffLogin(formData);
      
      // Store token and user data
      localStorage.setItem('staff_token', response.token);
      localStorage.setItem('staff_user', JSON.stringify(response.user));
      localStorage.setItem('staff_business', JSON.stringify(response.business));
      
      // Call success callback or redirect
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/dashboard');
      }
      
    } catch (error: any) {
      console.error('Staff login error:', error);
      const errorMessage = error.message || 'Login failed. Please check your credentials.';
      
      if (onError) {
        onError(errorMessage);
      } else {
        alert(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="business_id" className="block text-sm font-medium text-gray-700 mb-1">
          Business ID
        </label>
        <Input
          id="business_id"
          name="business_id"
          type="text"
          required
          value={formData.business_id}
          onChange={handleChange}
          placeholder="Enter business ID"
          className="w-full"
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email Address
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          value={formData.email}
          onChange={handleChange}
          placeholder="staff@example.com"
          className="w-full"
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          value={formData.password}
          onChange={handleChange}
          placeholder="Enter your password"
          className="w-full"
          disabled={loading}
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={loading}
      >
        {loading ? 'Logging in...' : 'Sign in as Staff'}
      </Button>
    </form>
  );
}
