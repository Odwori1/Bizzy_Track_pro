// POS Transaction Details
export default function POSTransactionDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <h1>POS Transaction Details</h1>
      <p>Transaction ID: {params.id}</p>
    </div>
  );
}
