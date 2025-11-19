'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';

// Common African timezones for dropdown
const COMMON_TIMEZONES = [
  'Africa/Accra', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg',
  'Africa/Cairo', 'Africa/Casablanca', 'Africa/Addis_Ababa', 'Africa/Kampala',
  'Africa/Dar_es_Salaam', 'Africa/Abidjan', 'Africa/Algiers'
];

// Common African currencies
const COMMON_CURRENCIES = [
  { code: 'GHS', name: 'Ghana Cedi (₵)' },
  { code: 'NGN', name: 'Nigerian Naira (₦)' },
  { code: 'KES', name: 'Kenyan Shilling (KSh)' },
  { code: 'UGX', name: 'Ugandan Shilling (USh)' },
  { code: 'TZS', name: 'Tanzanian Shilling (TSh)' },
  { code: 'ZAR', name: 'South African Rand (R)' },
  { code: 'USD', name: 'US Dollar ($)' },
  { code: 'EUR', name: 'Euro (€)' }
];

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    businessName: '',
    ownerName: '', // CHANGED: single ownerName instead of firstName + lastName
    email: '',
    password: '',
    timezone: 'Africa/Accra', // ADDED: required timezone
    currency: 'GHS', // ADDED: currency with default
  });
  const [error, setError] = useState('');

  const { register, isLoading } = useAuth();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await register(formData);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <Input
            label="Business Name"
            name="businessName"
            value={formData.businessName}
            onChange={handleChange}
            required
          />

          {/* CHANGED: Single ownerName field */}
          <Input
            label="Owner Full Name"
            name="ownerName"
            value={formData.ownerName}
            onChange={handleChange}
            required
            placeholder="Enter your full name"
          />

          <Input
            label="Email address"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            autoComplete="new-password"
            minLength={8}
          />

          {/* ADDED: Timezone selection */}
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
              Timezone *
            </label>
            <select
              id="timezone"
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Select your business timezone for proper scheduling</p>
          </div>

          {/* ADDED: Currency selection */}
          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <select
              id="currency"
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {COMMON_CURRENCIES.map(currency => (
                <option key={currency.code} value={currency.code}>
                  {currency.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isLoading}
            className="w-full"
          >
            Create Business Account
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
