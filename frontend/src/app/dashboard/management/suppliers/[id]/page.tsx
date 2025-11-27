// Supplier Details
export default function SupplierDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <h1>Supplier Details</h1>
      <p>Supplier ID: {params.id}</p>
    </div>
  );
}
