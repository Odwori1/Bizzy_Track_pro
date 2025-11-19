import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

// Mock data - will be replaced with API calls
const mockJob = {
  id: '1',
  jobNumber: 'JOB-001',
  title: 'Complete Hair Styling Service',
  description: 'Full hair styling with wash and blow dry',
  status: 'in-progress' as const,
  priority: 'high' as const,
  customerFirstName: 'Robert',
  customerLastName: 'Williams',
  customerEmail: 'robert.williams@example.com',
  customerPhone: '+254744538707',
  serviceName: 'Hair Styling',
  serviceBasePrice: '45.00',
  scheduledDate: {
    formatted: 'Today, 2:00 PM'
  },
  estimatedDurationMinutes: 60,
  location: 'Main Salon',
  createdAt: {
    formatted: 'Nov 18, 2025, 08:42 AM'
  }
};

interface JobDetailPageProps {
  params: {
    id: string;
  };
}

export default function JobDetailPage({ params }: JobDetailPageProps) {
  const job = mockJob; // In real app, fetch by params.id

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
          <p className="text-gray-600">Job #{job.jobNumber}</p>
        </div>
        <div className="flex space-x-4">
          <Link href="/dashboard/management/jobs">
            <Button variant="secondary">
              Back to Jobs
            </Button>
          </Link>
          <Button variant="primary">
            Edit Job
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Job Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Information</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Status</label>
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                      job.status === 'completed' ? 'bg-green-100 text-green-800' :
                      job.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                      job.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {job.status}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Priority</label>
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                      job.priority === 'high' ? 'bg-red-100 text-red-800' :
                      job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      job.priority === 'low' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {job.priority}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Scheduled</label>
                    <div className="text-sm mt-1">{job.scheduledDate.formatted}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Duration</label>
                    <div className="text-sm mt-1">{job.estimatedDurationMinutes} minutes</div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-gray-600">Location</label>
                    <div className="text-sm mt-1">{job.location}</div>
                  </div>
                </div>
                
                {job.description && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Description</label>
                    <div className="text-sm text-gray-900 mt-1">{job.description}</div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Timeline</h2>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="text-sm">
                    <span className="font-medium">Job Created</span>
                    <span className="text-gray-600 ml-2">{job.createdAt.formatted}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <div className="text-sm text-gray-600">In Progress - Started today</div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <div className="text-sm text-gray-600">Completion - Pending</div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer</h2>
              <div className="space-y-2">
                <div className="font-medium">{job.customerFirstName} {job.customerLastName}</div>
                <div className="text-sm text-gray-600">{job.customerEmail}</div>
                <div className="text-sm text-gray-600">{job.customerPhone}</div>
              </div>
            </div>
          </Card>

          {/* Service Info */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Service</h2>
              <div className="space-y-2">
                <div className="font-medium">{job.serviceName}</div>
                <div className="text-sm text-gray-600">${job.serviceBasePrice}</div>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-2">
                <Button variant="secondary" size="sm" className="w-full justify-start">
                  Update Status
                </Button>
                <Button variant="secondary" size="sm" className="w-full justify-start">
                  Assign Staff
                </Button>
                <Button variant="secondary" size="sm" className="w-full justify-start">
                  Create Invoice
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
