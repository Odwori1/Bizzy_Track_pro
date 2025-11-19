import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function JobCalendarPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Calendar</h1>
          <p className="text-gray-600">View and manage job schedules</p>
        </div>
        <Link href="/dashboard/management/jobs/new">
          <Button variant="primary">
            Create New Job
          </Button>
        </Link>
      </div>

      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Calendar View</h2>
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg mb-4">
              🗓️ Calendar View Coming Soon
            </div>
            <p className="text-gray-600 mb-6">
              Interactive calendar for scheduling and viewing jobs will be implemented here.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-blue-600 text-sm font-medium">Today</div>
                <div className="text-2xl font-bold mt-2">3</div>
                <div className="text-gray-600 text-sm">Jobs Scheduled</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-green-600 text-sm font-medium">This Week</div>
                <div className="text-2xl font-bold mt-2">12</div>
                <div className="text-gray-600 text-sm">Total Jobs</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-purple-600 text-sm font-medium">Next Week</div>
                <div className="text-2xl font-bold mt-2">8</div>
                <div className="text-gray-600 text-sm">Jobs Booked</div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
