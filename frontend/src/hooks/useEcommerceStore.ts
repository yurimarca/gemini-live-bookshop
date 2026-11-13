/**
 * React hook to subscribe to e-commerce store (cart, user, search results).
 */

import { useState, useEffect } from 'react';
import {
  subscribe,
  getSnapshot,
  addToCart as addToCartStore,
  removeFromCart as removeFromCartStore,
  clearCart,
  setUser as setUserStore,
  getUser,
  setLastSearchResults,
  setLastSearchQuery,
  checkout as checkoutStore,
  searchBooks,
  getBookById,
  getBookByTitle,
  getCategories,
  getCatalogStats
} from '../store/ecommerce';

export function useEcommerceStore() {
  const [snapshot, setSnapshot] = useState(getSnapshot);

  useEffect(() => {
    const unsub = subscribe(() => setSnapshot(getSnapshot()));
    return unsub;
  }, []);

  return {
    cart: snapshot.items,
    user: snapshot.user,
    orderComplete: snapshot.orderComplete,
    lastSearchResults: snapshot.lastSearchResults,
    lastSearchQuery: snapshot.lastSearchQuery,
    cartCount: snapshot.items.reduce((n, i) => n + i.quantity, 0),
    addToCart: addToCartStore,
    removeFromCart: removeFromCartStore,
    clearCart,
    setUser: setUserStore,
    getUser,
    setLastSearchResults,
    setLastSearchQuery,
    checkout: checkoutStore,
    searchBooks,
    getBookById,
    getBookByTitle,
    getCategories,
    getCatalogStats
  };
}

export type EcommerceStore = ReturnType<typeof useEcommerceStore>;
