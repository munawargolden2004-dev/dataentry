/**
 * Shared pagination control — 10 records per page across employee list pages.
 * Renders nothing when there's only a single page.
 */
export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage = 10,
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
      <div className="text-sm text-neutral-600">
        Showing {(currentPage - 1) * itemsPerPage + 1}–
        {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-md hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let pageNum;
          if (totalPages <= 5) pageNum = i + 1;
          else if (currentPage <= 3) pageNum = i + 1;
          else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
          else pageNum = currentPage - 2 + i;
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                currentPage === pageNum
                  ? "bg-neutral-900 text-white shadow-md"
                  : "text-neutral-700 bg-neutral-100 border border-neutral-200 hover:bg-neutral-200"
              }`}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-md hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
