export default function Loading() {
  return (
    <div className="page" aria-label="Loading" role="status">
      <div className="loading-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    </div>
  );
}
