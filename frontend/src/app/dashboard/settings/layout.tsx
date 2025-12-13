import React from 'react';
import { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Users, FolderTree, History, Settings } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Business Settings - Permission Management',
  description: 'Manage RBAC and ABAC permissions for your business',
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Business Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure RBAC roles, ABAC user permissions, and business rules
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Settings Navigation
              </CardTitle>
              <CardDescription>
                Manage your business configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <nav className="space-y-2">
                <a
                  href="/dashboard/settings"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors bg-accent text-accent-foreground"
                >
                  <Shield className="h-4 w-4" />
                  Permissions
                </a>
                <a
                  href="/dashboard/settings/security"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Users className="h-4 w-4" />
                  Security & Access
                </a>
                <a
                  href="/dashboard/settings/roles"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <FolderTree className="h-4 w-4" />
                  Role Management
                </a>
                <a
                  href="/dashboard/settings/audit"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <History className="h-4 w-4" />
                  Audit Logs
                </a>
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {children}
        </div>
      </div>
    </div>
  );
}
