/**
 * Checkout: order summary, Confirm purchase; on confirm clear cart and show thank-you.
 * Requires user to be registered; redirects to register when cart has items but no user.
 */

import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useEcommerceStore } from '../hooks/useEcommerceStore';

interface Line {
  bookId: string;
  title: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, user, orderComplete, checkout, getBookById } = useEcommerceStore();
  const [lines, setLines] = useState<Line[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (cart.length > 0 && !user) {
      navigate('/register', { replace: true });
    }
  }, [cart.length, user, navigate]);

  useEffect(() => {
    const load = async () => {
      const result: Line[] = [];
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

  const handleConfirm = () => {
    const orderId = `ord-${Date.now()}`;
    const mockEmailPayload = {
      to: user?.email ?? '',
      subject: 'Order confirmation',
      orderId,
      items: lines.map((l) => ({ title: l.title, quantity: l.quantity, subtotal: l.subtotal })),
      total,
      address: user?.address ?? ''
    };
    console.log('[Mock email]', mockEmailPayload);
    const message = user?.email
      ? `Order complete. A confirmation email would be sent to ${user.email} with payment instructions (mock).`
      : 'Order complete. Confirmation email would be sent (mock).';
    window.dispatchEvent(
      new CustomEvent('functionExecuted', {
        detail: { functionName: 'confirmPurchase', success: true, message }
      })
    );
    checkout();
    setConfirmed(true);
  };

  if (orderComplete || confirmed) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-24 h-24 bg-success-light rounded-full flex items-center justify-center mx-auto mb-6 border border-success-border">
          <span className="text-4xl text-success">✓</span>
        </div>
        <h2 className="text-3xl font-bold text-mist-900 mb-4">Thank you for your order!</h2>
        <p className="text-mist-700 mb-8 text-lg">Your purchase is complete and confirmation has been sent.</p>
        <Link to="/" className="inline-block px-8 py-3 bg-mist-900/10 text-mist-900 font-semibold rounded-xl border border-mist-900/10 hover:bg-mist-900/20 transition-all">
          Continue Shopping
        </Link>
      </div>
    );
  }

  if (cart.length === 0 && !orderComplete) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-mist-900 mb-4">Your cart is empty</h2>
        <Link to="/" className="text-brand-red font-medium hover:underline">Continue shopping</Link>
      </div>
    );
  }

  if (cart.length > 0 && !user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-24 h-24 bg-warning-light rounded-full flex items-center justify-center mx-auto mb-6 border border-warning-border">
          <span className="text-4xl">🔒</span>
        </div>
        <h2 className="text-2xl font-bold text-mist-900 mb-4">Please register to complete your purchase</h2>
        <p className="text-mist-700 mb-8">Create an account so we can send your order confirmation and delivery details.</p>
        <Link
          to="/register"
          className="inline-flex items-center justify-center px-8 py-4 bg-brand-coral text-primary-foreground font-bold rounded-xl hover:bg-brand-coral/90 transition-colors"
        >
          Register now
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h2 className="text-3xl font-bold text-mist-900 mb-8 border-b border-mist-900/10 pb-4">Checkout</h2>

      {user && (
        <div className="bg-mist-900/5 border border-mist-900/10 rounded-xl p-4 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-red to-brand-coral flex items-center justify-center text-primary-foreground font-bold">
            {user.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-mist-900 font-medium">Ordering as {user.name}</p>
            <p className="text-mist-700 text-sm">{user.email}</p>
            {user.address && (
              <p className="text-mist-700 text-sm mt-1">Delivery: {user.address}</p>
            )}
          </div>
        </div>
      )}

      <div className="bg-mist-900/5 backdrop-blur-xl rounded-2xl border border-mist-900/10 p-8 shadow-2xl mb-8">
        <h3 className="text-lg font-semibold text-mist-700 mb-4 uppercase tracking-wider text-xs">Order Summary</h3>
        <ul className="space-y-4 mb-6">
          {lines.map((l) => (
            <li key={l.bookId} className="flex justify-between text-mist-700 border-b border-mist-900/5 pb-4 last:border-0">
              <span>{l.title} <span className="text-mist-600">× {l.quantity}</span></span>
              <span className="font-mono text-mist-900">${l.subtotal.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between items-center pt-4 border-t border-mist-900/10">
          <span className="text-xl font-bold text-mist-900">Total</span>
          <span className="text-2xl font-bold text-brand-red">${total.toFixed(2)}</span>
        </div>
      </div>

      <button
        onClick={handleConfirm}
        className="w-full py-4 bg-gradient-to-r from-brand-red to-brand-coral text-primary-foreground font-bold text-lg rounded-xl shadow-lg shadow-brand-red/20 hover:shadow-brand-red/40 hover:-translate-y-1 transition-all duration-300"
      >
        Confirm Purchase
      </button>
    </div>
  );
}
