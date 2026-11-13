/**
 * Book detail: single book, Add to cart.
 */

import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useEcommerceStore } from '../hooks/useEcommerceStore';
import type { Book } from '../types/book';

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getBookById, addToCart } = useEcommerceStore();
  const [book, setBook] = useState<Book | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!id) return;
    getBookById(id).then(setBook);
  }, [id, getBookById]);

  const handleAddToCart = () => {
    if (!book) return;
    addToCart(book.id, 1);
    setAdded(true);
  };

  if (!id) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-mist-900">
        <p>No book selected.</p>
        <Link to="/" className="text-brand-red hover:underline">Back to home</Link>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-mist-900">
        <p>Loading...</p>
      </div>
    );
  }

  const hasProductInfo = book.productInformation && Object.keys(book.productInformation).length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to="/" className="flex items-center gap-2 text-mist-700 hover:text-mist-900 transition-colors mb-8 group">
        <span className="group-hover:-translate-x-1 transition-transform">←</span>
        Back to home
      </Link>

      <div className="bg-mist-900/5 backdrop-blur-xl rounded-3xl border border-mist-900/10 shadow-2xl p-8 md:p-10">
        <div className="flex flex-col md:flex-row gap-8 lg:gap-12 mb-10">
          {book.imageUrl && (
            <div className="flex-shrink-0 w-full md:w-1/3">
              <img
                src={book.imageUrl}
                alt={book.title}
                className="w-full rounded-2xl border border-mist-900/10 shadow-2xl shadow-mist-900/20"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col">
            <h1 className="text-3xl md:text-4xl font-display font-bold text-mist-900 mb-3 leading-tight">{book.title}</h1>
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-mist-900/10 text-brand-red border border-mist-900/5">
                {book.category}
              </span>
              <span className="text-mist-700 text-sm flex items-center gap-1">
                ⭐ {book.rating}/5
              </span>
              <span className="text-mist-600 text-sm">•</span>
              <span className="text-mist-700 text-sm">
                {book.stock} in stock
              </span>
            </div>

            <div className="mt-auto pt-6 border-t border-mist-900/5">
              <div className="flex items-end justify-between mb-6">
                <div>
                  <p className="text-sm text-mist-700 mb-1">Price</p>
                  <p className="text-4xl font-bold text-brand-red">${book.price.toFixed(2)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleAddToCart}
                  className={`
                    px-6 py-4 font-bold rounded-xl text-lg flex items-center justify-center gap-2 transition-all duration-300
                    ${added
                      ? 'bg-success-light text-success-foreground border border-success-border'
                      : 'bg-gradient-to-r from-brand-red to-brand-coral text-primary-foreground hover:shadow-lg hover:shadow-brand-coral/25 hover:-translate-y-0.5'
                    }
                  `}
                >
                  {added ? (
                    <>
                      <span>✓ Added</span>
                    </>
                  ) : (
                    <>
                      <span>Add to Cart</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => navigate('/cart')}
                  className="px-6 py-4 bg-mist-900/5 text-mist-900 font-semibold rounded-xl border border-mist-900/10 hover:bg-mist-900/10 hover:border-mist-900/20 transition-all hover:-translate-y-0.5"
                >
                  View Cart
                </button>
              </div>
            </div>
          </div>
        </div>

        {book.description && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-mist-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-brand-red rounded-full"></span>
              Description
            </h2>
            <p className="text-mist-700 leading-relaxed text-lg font-light">{book.description}</p>
          </section>
        )}

        {hasProductInfo && (
          <section>
            <h2 className="text-xl font-bold text-mist-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-brand-red rounded-full"></span>
              Product Details
            </h2>
            <div className="rounded-xl border border-mist-900/10 overflow-hidden">
              <table className="w-full">
                <tbody>
                  {Object.entries(book.productInformation!).map(([key, value], index) => (
                    <tr key={key} className={`border-b border-mist-900/5 last:border-0 ${index % 2 === 0 ? 'bg-mist-900/5' : 'bg-transparent'}`}>
                      <td className="px-6 py-4 font-medium text-mist-700 w-1/3">{key}</td>
                      <td className="px-6 py-4 text-mist-900">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
