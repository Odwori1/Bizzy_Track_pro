// Product Details
export default function ProductDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <h1>Product Details</h1>
      <p>Product ID: {params.id}</p>
    </div>
  );
}
