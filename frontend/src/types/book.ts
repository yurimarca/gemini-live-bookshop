/**
 * Book and e-commerce types for the book store.
 */

export interface Book {
  id: string;
  title: string;
  price: number;
  stock: string;
  rating: number;
  category: string;
  book_url: string;
  description?: string;
  productInformation?: Record<string, string>;
  imageUrl?: string;
}

export interface CartItem {
  bookId: string;
  quantity: number;
}

export interface User {
  name: string;
  email: string;
  address?: string;
}

export interface OrderComplete {
  orderId: string;
  completedAt: number;
}
