'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Filter, Calendar, User, History, Eye,
  CheckCircle, XCircle, Clock, RefreshCw
} from 'lucide-react';
import { PermissionAuditLog as AuditLogType } from '@/types/permissions';
import { formatDate } from '@/lib/date-format';

interface PermissionAuditLogProps {
  logs: AuditLogType[];
}

export default function PermissionAuditLog({ logs }: PermissionAuditLogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Extract unique actions for filter
  const uniqueActions = Array.from(new Set(logs.map(log => log.action)));

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = searchTerm === '' ||
      log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resource_type.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = selectedAction === 'all' || log.action === selectedAction;

    const matchesDate = (!startDate || new Date(log.created_at) >= new Date(startDate)) &&
                       (!endDate || new Date(log.created_at) <= new Date(endDate));

    return matchesSearch && matchesAction && matchesDate;
  });

  const toggleExpand = (logId: string) => {
    setExpandedLog(expandedLog === logId ? null : logId);
  };

  const getActionBadge = (action: string) => {
    if (action.includes('create') || action.includes('add') || action.includes('grant')) {
      return <Badge variant="success" className="gap-1"><CheckCircle className="h-3 w-3" />{action}</Badge>;
    } else if (action.includes('delete') || action.includes('remove') || action.includes('revoke')) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{action}</Badge>;
    } else if (action.includes('update') || action.includes('modify')) {
      return <Badge variant="warning" className="gap-1"><RefreshCw className="h-3 w-3" />{action}</Badge>;
    } else {
      return <Badge variant="outline">{action}</Badge>;
    }
  };

  const formatJson = (data: any) => {
    if (!data) return 'No data';
    return JSON.stringify(data, null, 2);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Permission Audit Trail
              <Badge variant="secondary">
                {filteredLogs.length} logs
              </Badge>
            </CardTitle>
            <CardDescription>
              Track all permission changes, grants, and revocations
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Export Logs
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by user or action..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={selectedAction} onValueChange={setSelectedAction}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {uniqueActions.map(action => (
                <SelectItem key={action} value={action}>
                  {action}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            placeholder="Start date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full"
          />

          <Input
            type="date"
            placeholder="End date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Logs Table */}
        <div className="space-y-4">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No audit logs found</p>
              <p className="text-sm mt-2">Try adjusting your filters</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <Card key={log.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Log Header */}
                  <div
                    className="p-4 hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => toggleExpand(log.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium">{log.user_email || 'System'}</div>
                            <div className="text-sm text-muted-foreground">
                              {log.resource_type} • {log.resource_id.substring(0, 8)}...
                            </div>
                          </div>
                        </div>
                        <div className="ml-11">
                          {getActionBadge(log.action)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-medium">{formatDate(log.created_at)}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedLog === log.id && (
                    <div className="border-t p-4 bg-muted/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Old Values */}
                        <div>
                          <h4 className="font-medium text-sm mb-2">Previous Values</h4>
                          <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-40">
                            {formatJson(log.old_values)}
                          </pre>
                          {!log.old_values && (
                            <div className="text-xs text-muted-foreground italic mt-1">
                              No previous values
                            </div>
                          )}
                        </div>

                        {/* New Values */}
                        <div>
                          <h4 className="font-medium text-sm mb-2">New Values</h4>
                          <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-40">
                            {formatJson(log.new_values)}
                          </pre>
                          {!log.new_values && (
                            <div className="text-xs text-muted-foreground italic mt-1">
                              No new values
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
                        <div>
                          <div className="text-xs text-muted-foreground">Log ID</div>
                          <div className="text-sm font-mono">{log.id.substring(0, 12)}...</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Resource ID</div>
                          <div className="text-sm font-mono">{log.resource_id}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Timestamp</div>
                          <div className="text-sm">{new Date(log.created_at).toISOString()}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
