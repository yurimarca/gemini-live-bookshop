/**
 * Main App: router, layout, voice widget, function feedback.
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Layout } from './components/Layout/Layout';
import { PageTransition } from './components/Layout/PageTransition';
import { FloatingVoiceWidget } from './components/VoiceSession/FloatingVoiceWidget';
import { HomePage } from './pages/HomePage';
import { SearchResultsPage } from './pages/SearchResultsPage';
import { BookDetailPage } from './pages/BookDetailPage';
import { CartPage } from './pages/CartPage';
import { RegisterPage } from './pages/RegisterPage';
import { CheckoutPage } from './pages/CheckoutPage';

function NavigateListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: CustomEvent<{ path: string }>) => {
      const path = e.detail?.path;
      if (path) navigate(path);
    };
    window.addEventListener('navigate', handler as EventListener);
    return () => window.removeEventListener('navigate', handler as EventListener);
  }, [navigate]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}


function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Layout />}>
          <Route index element={
            <PageTransition>
              <HomePage />
            </PageTransition>
          } />
          <Route path="search" element={
            <PageTransition>
              <SearchResultsPage />
            </PageTransition>
          } />
          <Route path="book/:id" element={
            <PageTransition>
              <BookDetailPage />
            </PageTransition>
          } />
          <Route path="cart" element={
            <PageTransition>
              <CartPage />
            </PageTransition>
          } />
          <Route path="register" element={
            <PageTransition>
              <RegisterPage />
            </PageTransition>
          } />
          <Route path="checkout" element={
            <PageTransition>
              <CheckoutPage />
            </PageTransition>
          } />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <NavigateListener />
      <ScrollToTop />
      <div className="min-h-screen">
        <AnimatedRoutes />
      </div>
      <FloatingVoiceWidget position="bottom-right" />
    </BrowserRouter>
  );
}

export default App;
