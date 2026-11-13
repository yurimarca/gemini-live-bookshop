/**
 * Register: form; on submit set user and redirect.
 * Name, email, and address are controlled and synced from store so when the agent
 * calls setUserInfo the form fields fill in; then agent focuses password for the user to type.
 */

import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useEcommerceStore } from '../hooks/useEcommerceStore';

export function RegisterPage() {
  const navigate = useNavigate();
  const { user: storeUser, setUser } = useEcommerceStore();
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  // When the agent calls setUserInfo, store updates; sync into form so fields are filled
  useEffect(() => {
    if (storeUser) {
      setName(storeUser.name);
      setEmail(storeUser.email);
      setAddress(storeUser.address ?? '');
    }
  }, [storeUser]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUser({ name, email, address: address || undefined });
    setSubmitted(true);
    navigate('/checkout');
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-display font-bold text-mist-900 mb-2">Create Account</h2>
        <p className="text-mist-700">Join today to start shopping</p>
      </div>

      {submitted ? (
        <div className="p-6 bg-success-light border border-success-border rounded-xl text-center">
          <p className="text-success-foreground font-medium">Redirecting to checkout...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-mist-900/5 backdrop-blur-xl p-8 rounded-3xl border border-mist-900/10 shadow-2xl space-y-6">
          <div>
            <label htmlFor="name-input" className="block text-sm font-medium text-mist-700 mb-2">Full Name</label>
            <input
              id="name-input"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 placeholder-mist-600 focus:ring-2 focus:ring-brand-coral/50 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label htmlFor="email-input" className="block text-sm font-medium text-mist-700 mb-2">Email</label>
            <input
              id="email-input"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 placeholder-mist-600 focus:ring-2 focus:ring-brand-coral/50 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label htmlFor="address-input" className="block text-sm font-medium text-mist-700 mb-2">Address</label>
            <input
              id="address-input"
              name="address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, City, State"
              className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 placeholder-mist-600 focus:ring-2 focus:ring-brand-coral/50 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label htmlFor="password-input" className="block text-sm font-medium text-mist-700 mb-2">Password</label>
            <input
              id="password-input"
              name="password"
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 placeholder-mist-600 focus:ring-2 focus:ring-brand-coral/50 focus:border-transparent outline-none transition-all"
            />
          </div>
          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-brand-red to-brand-coral text-primary-foreground font-bold rounded-xl shadow-lg shadow-brand-coral/25 hover:shadow-brand-coral/40 hover:-translate-y-1 transition-all duration-300"
          >
            Create Account
          </button>
        </form>
      )}
      <p className="mt-8 text-center text-sm text-mist-700">
        Already have an account? <Link to="/" className="text-brand-red hover:text-mist-900 transition-colors font-medium">Continue as guest</Link>
      </p>
    </div>
  );
}
