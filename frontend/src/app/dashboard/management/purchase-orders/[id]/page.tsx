// Purchase Order Details
export default function PurchaseOrderDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <h1>Purchase Order Details</h1>
      <p>Purchase Order ID: {params.id}</p>
    </div>
  );
}
