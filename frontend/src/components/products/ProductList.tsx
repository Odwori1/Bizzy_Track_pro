'use client';

import { useProducts } from '@/hooks/week8/useProducts';
import { useCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';

export const ProductList: React.FC = () => {
  const { products, loading, error, refetch } = useProducts();
  const { format } = useCurrency();

  if (loading) return <Loading />;
  if (error) return <div className="text-red-600">Error: {error}</div>;

  return (
    <Card>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Products</h2>
          <Button onClick={refetch} variant="outline">
            Refresh
          </Button>
        </div>
        
        <div className="space-y-4">
          {products.map(product => (
            <div key={product.id} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{product.name}</h3>
                  <p className="text-gray-600 text-sm">SKU: {product.sku}</p>
                  <p className="text-gray-600 text-sm">Category: {product.category_name}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">{format(product.selling_price)}</div>
                  <div className="text-sm text-gray-600">Stock: {product.current_stock}</div>
                  <div className={`text-xs ${
                    product.stock_status === 'low' ? 'text-yellow-600' : 
                    product.stock_status === 'out' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {product.stock_status.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {products.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No products found. Create your first product to get started.
          </div>
        )}
      </div>
    </Card>
  );
};
