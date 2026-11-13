/**
 * Search results: book grid from last search, or empty state.
 */

import { Link } from 'react-router-dom';
import { useEcommerceStore } from '../hooks/useEcommerceStore';
import { Search } from 'lucide-react';

function BookCard({ book }: { book: { id: string; title: string; price: number; category: string; imageUrl?: string } }) {
  return (
    <div className="bg-mist-900/5 backdrop-blur-sm rounded-2xl border border-mist-900/10 shadow-lg hover:shadow-brand-coral/20 hover:border-brand-coral/30 transition-all duration-300 p-4 flex flex-col group hover:-translate-y-1">
      {book.imageUrl ? (
        <img
          src={book.imageUrl}
          alt={book.title}
          className="w-full aspect-[3/4] object-cover rounded-xl mb-4 border border-mist-900/5 shadow-inner group-hover:scale-[1.02] transition-transform duration-300"
        />
      ) : (
        <div className="w-full aspect-[3/4] rounded-xl mb-4 bg-mist-100 border border-mist-900/5 flex items-center justify-center text-mist-600 text-sm">
          No image
        </div>
      )}
      <h3 className="font-bold text-mist-900 line-clamp-2 mb-2 group-hover:text-brand-red transition-colors">{book.title}</h3>
      <p className="text-brand-coral font-bold text-lg mb-2">${book.price.toFixed(2)}</p>
      <p className="text-sm text-mist-600 mb-4">{book.category}</p>
      <div className="mt-auto flex gap-2">
        <Link
          to={`/book/${encodeURIComponent(book.id)}`}
          className="w-full py-2.5 text-center text-sm font-semibold rounded-lg bg-mist-900/5 text-mist-900 border border-mist-900/10 hover:bg-brand-coral hover:border-brand-coral hover:text-primary-foreground hover:shadow-lg hover:shadow-brand-coral/20 transition-all duration-300"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}

export function SearchResultsPage() {
  const { lastSearchResults, lastSearchQuery } = useEcommerceStore();
  const hasResults = lastSearchResults.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {hasResults ? (
        <section>
          <h2 className="text-2xl font-bold text-mist-900 mb-6 flex items-center gap-2">
            <span className="w-1 h-6 bg-brand-red rounded-full"></span>
            {lastSearchQuery?.trim()
              ? `Search results for "${lastSearchQuery}" (${lastSearchResults.length})`
              : `Search results (${lastSearchResults.length})`}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-6">
            {lastSearchResults.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </section>
      ) : (
        <section className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <div className="p-4 rounded-2xl bg-mist-900/5 border border-mist-900/10 mb-6">
            <Search className="w-16 h-16 text-brand-red/70" />
          </div>
          <h2 className="text-2xl font-display font-bold text-mist-900 mb-2">No search yet</h2>
          <p className="text-mist-700 max-w-md mb-6">
            Search using the bar above or ask the voice assistant to find books—for example, &ldquo;Show me science fiction books.&rdquo;
          </p>
          <Link
            to="/"
            className="text-brand-red hover:text-brand-red/80 font-medium transition-colors"
          >
            Back to home
          </Link>
        </section>
      )}
    </div>
  );
}
