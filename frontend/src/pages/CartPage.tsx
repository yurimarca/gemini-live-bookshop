/**
 * Cart: line items, total, Checkout / Register.
 */

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useEcommerceStore } from '../hooks/useEcommerceStore';

interface CartLine {
  bookId: string;
  title: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export function CartPage() {
  const { cart, user, removeFromCart, getBookById } = useEcommerceStore();
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    const load = async () => {
      const result: CartLine[] = [];
      for (const item of cart) {
        const book = await getBookById(item.bookId);
        const price = book?.price ?? 0;
        result.push({
          bookId: item.bookId,
          title: book?.title ?? item.bookId,
          price,
          quantity: item.quantity,
          subtotal: price * item.quantity
        });
      }
      setLines(result);
    };
    load();
  }, [cart, getBookById]);

  const total = lines.reduce((s, l) => s + l.subtotal, 0);

  if (cart.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-24 h-24 bg-mist-900/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-mist-900/10">
          <span className="text-4xl">🛒</span>
        </div>
        <h2 className="text-3xl font-bold text-mist-900 mb-4">Your cart is empty</h2>
        <p className="text-mist-700 mb-8">Looks like you haven't added any books yet.</p>
        <Link to="/" className="inline-block px-8 py-3 bg-mist-900/10 text-mist-900 font-semibold rounded-xl border border-mist-900/10 hover:bg-mist-900/20 transition-all">
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h2 className="text-3xl font-display font-bold text-mist-900 mb-8 flex items-center gap-3">
        <span className="p-2 rounded-lg bg-brand-coral/20 text-brand-coral">
          🛒
        </span>
        Shopping Cart
      </h2>

      <div className="bg-mist-900/5 backdrop-blur-xl rounded-2xl border border-mist-900/10 overflow-hidden shadow-xl mb-8">
        <ul className="divide-y divide-mist-900/10">
          {lines.map((line) => (
            <li key={line.bookId} className="flex items-center justify-between p-6 hover:bg-mist-900/5 transition-colors">
              <div>
                <p className="font-bold text-lg text-mist-900 mb-1">{line.title}</p>
                <div className="flex items-center gap-3 text-sm text-mist-700">
                  <span className="font-mono text-brand-red">${line.price.toFixed(2)}</span>
                  <span>×</span>
                  <span className="text-mist-900">{line.quantity}</span>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-bold text-xl text-mist-900">${line.subtotal.toFixed(2)}</span>
                <button
                  onClick={() => removeFromCart(line.bookId)}
                  className="px-3 py-1.5 text-xs font-semibold text-error-foreground bg-error-light border border-error-border rounded-lg hover:bg-error/20 hover:text-error-foreground transition-colors"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="p-6 bg-mist-100/50 border-t border-mist-900/10 flex justify-between items-center">
          <span className="text-mist-700 font-medium">Total Amount</span>
          <span className="text-3xl font-bold text-brand-red">${total.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-end">
        {user ? (
          <Link
            to="/checkout"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-brand-red to-brand-coral text-primary-foreground font-bold rounded-xl shadow-lg shadow-brand-coral/25 hover:scale-105 transition-all duration-300"
          >
            Proceed to Checkout →
          </Link>
        ) : (
          <div className="flex flex-col items-end gap-3">
            <p className="text-mist-700 text-sm">Please register to complete your purchase.</p>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-8 py-4 bg-brand-red text-primary-foreground font-bold rounded-xl border border-brand-red/20 hover:bg-brand-red/90 transition-all duration-300"
            >
              Register Account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
