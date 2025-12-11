'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rolePermissions';
import { Button } from '@/components/ui/Button';
import { InvitationForm } from '@/components/staff/InvitationForm';
import { staffApi } from '@/lib/api/staff';
import Link from 'next/link';

interface StaffInvitation {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  sent_at: string;
  expires_at: string;
  invited_by_name: string;
}

export default function StaffInvitationsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuthStore();
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (!authLoading && user && !hasPermission(user.role as any, 'staff:create')) {
      router.push('/dashboard/management/staff');
      return;
    }

    fetchInvitations();
  }, [isAuthenticated, authLoading, user, router]);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      // Note: This endpoint might need to be created in backend
      // For now, we'll use a placeholder
      // const data = await staffApi.getInvitations();
      // setInvitations(data);
      
      // Mock data for now
      setInvitations([]);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch invitations:', err);
      setError(err.message || 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    try {
      await staffApi.resendInvitation(invitationId);
      alert('Invitation resent successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to resend invitation');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return;
    
    try {
      // Note: This endpoint might need to be created
      // await staffApi.cancelInvitation(invitationId);
      alert('Invitation cancelled successfully');
      fetchInvitations();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel invitation');
    }
  };

  const handleInvitationSuccess = () => {
    setShowInviteForm(false);
    fetchInvitations();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user || !hasPermission(user.role as any, 'staff:create')) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/dashboard/management/staff')}
            >
              ← Back to Staff
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Staff Invitations</h1>
          </div>
          <p className="text-gray-600">
            Manage pending staff invitations and send new ones
          </p>
        </div>
        
        {!showInviteForm && (
          <Button
            onClick={() => setShowInviteForm(true)}
          >
            Send New Invitation
          </Button>
        )}
      </div>

      {/* Invitation Form */}
      {showInviteForm && (
        <InvitationForm 
          onSuccess={handleInvitationSuccess}
          onCancel={() => setShowInviteForm(false)}
        />
      )}

      {/* Invitations List */}
      {!showInviteForm && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold text-gray-800">
              Pending Invitations ({invitations.length})
            </h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">
              Loading invitations...
            </div>
          ) : invitations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="mb-4">
                <svg className="w-16 h-16 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="mb-4">No pending invitations</p>
              <Button onClick={() => setShowInviteForm(true)}>
                Send Your First Invitation
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invited Person
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {invitation.full_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {invitation.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                          {invitation.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          invitation.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          invitation.status === 'accepted' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(invitation.sent_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(invitation.expires_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium space-x-2">
                        {invitation.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResendInvitation(invitation.id)}
                            >
                              Resend
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleCancelInvitation(invitation.id)}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
