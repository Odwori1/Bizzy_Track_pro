import { Package } from '@/types/packages';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Package as PackageIcon, Settings, Clock, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

interface PackageCardProps {
  package: Package;
}

export function PackageCard({ package: pkg }: PackageCardProps) {
  // Safely handle undefined services array
  const servicesCount = pkg.services?.length || 0;
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  return (
    <Link href={`/dashboard/management/packages/${pkg.id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <PackageIcon size={18} />
              {pkg.name}
            </h3>
            <Badge variant={pkg.is_customizable ? "default" : "secondary"}>
              {pkg.is_customizable ? 'Customizable' : 'Fixed'}
            </Badge>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2">{pkg.description}</p>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <div className="flex items-center gap-1">
              <DollarSign size={14} className="text-green-600" />
              <span>{format(pkg.base_price)}</span> {/* ✅ CORRECT: Using format function */}
            </div>
            <div className="flex items-center gap-1">
              <Clock size={14} className="text-blue-600" />
              <span>{pkg.duration_minutes} min</span>
            </div>
            <div className="flex items-center gap-1">
              <Settings size={14} className="text-purple-600" />
              <span>{servicesCount} services</span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t">
            <Badge variant="outline">{pkg.category}</Badge>
            <span className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View Details →
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
