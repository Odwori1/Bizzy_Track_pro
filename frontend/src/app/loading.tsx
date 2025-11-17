import { Loading } from '@/components/ui/Loading';

export default function GlobalLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loading size="lg" />
    </div>
  );
}
