/**
 * App layout: header with logo, search, cart, nav; main content area.
 */

import { Link, useNavigate, Outlet } from 'react-router-dom';
import { ShoppingCart, BookOpen, LogOut } from 'lucide-react';
import { useEcommerceStore } from '../../hooks/useEcommerceStore';
import { useState, FormEvent, useEffect } from 'react';

export function Layout() {
  const { cartCount, lastSearchQuery, setLastSearchResults, setLastSearchQuery, searchBooks, user, setUser } = useEcommerceStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setSearchQuery(lastSearchQuery);
  }, [lastSearchQuery]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setLastSearchResults([]);
      setLastSearchQuery('');
      navigate('/search');
      return;
    }
    const books = await searchBooks(q);
    setLastSearchResults(books);
    setLastSearchQuery(q);
    navigate('/search');
  };

  return (
    <div className="min-h-screen bg-mist-50 text-mist-900 selection:bg-brand-red/20">
      <header className={`sticky top-0 z-40 border-b border-mist-900/10 bg-mist-50/80 backdrop-blur-md transition-shadow duration-300 ${scrolled ? 'shadow-[0_1px_0_0_rgba(233,123,98,0.25)]' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 text-mist-900 font-display font-bold text-xl hover:text-brand-red transition-colors">
            <div className="p-1.5 bg-gradient-to-tr from-brand-red to-brand-coral rounded-lg">
              <BookOpen className="w-6 h-6 text-primary-foreground" />
            </div>
            <span>BookShop</span>
          </Link>

          <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-4">
            <div className="relative group focus-within:ring-1 focus-within:ring-brand-coral/40 rounded-lg">
              <input
                type="search"
                placeholder="Search books..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-mist-100/50 border border-mist-900/10 rounded-lg text-sm text-mist-900 placeholder-mist-600 focus:ring-0 focus:border-brand-coral/50 outline-none transition-all group-hover:bg-mist-100"
              />
            </div>
          </form>

          <nav className="flex items-center gap-4">
            <Link to="/cart" className="relative p-2 text-mist-600 hover:text-mist-900 transition-colors hover:bg-mist-900/5 rounded-lg">
              <ShoppingCart className="w-6 h-6" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center text-xs font-bold text-primary-foreground bg-brand-red rounded-full shadow-lg shadow-brand-red/40">
                  {cartCount}
                </span>
              )}
            </Link>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-mist-600 max-w-[120px] truncate" title={user.name}>
                  Hi, {user.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setUser(null);
                    navigate('/');
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-mist-700 hover:text-mist-900 transition-colors p-2 rounded-lg hover:bg-mist-900/5"
                  aria-label="Log out"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            ) : (
              <Link to="/register" className="text-sm font-medium text-mist-700 hover:text-mist-900 transition-colors">
                Register
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="relative min-h-[calc(100vh-4rem)]">
        <Outlet />
      </main>
    </div>
  );
}
