/**
 * Function Executor Service
 *
 * Executes e-commerce functions requested by the AI agent: search, book details,
 * cart, checkout, and navigation. Keeps the agent focused on useful actions only.
 */

import * as ecommerce from '../store/ecommerce';

export interface FunctionExecutorResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
  suggestions?: string[];
}

export class FunctionExecutor {
  /**
   * Emit function execution event for feedback display
   */
  private emitFunctionEvent(functionName: string, result: FunctionExecutorResult) {
    window.dispatchEvent(new CustomEvent('functionExecuted', {
      detail: {
        functionName,
        success: result.success,
        message: result.message,
        error: result.error
      }
    }));
  }

  /**
   * Main entry point for executing any function
   */
  async execute(
    name: string,
    parameters: Record<string, unknown>
  ): Promise<FunctionExecutorResult> {
    let result: FunctionExecutorResult;
    try {
      // E-commerce functions only
      switch (name) {
        case 'searchBooks':
          result = await this.searchBooks(parameters);
          break;
        case 'getBookDetails':
          result = await this.getBookDetails(parameters);
          break;
        case 'addToCart':
          result = await this.addToCart(parameters);
          break;
        case 'removeFromCart':
          result = await this.removeFromCart(parameters);
          break;
        case 'getCart':
          result = await this.getCart(parameters);
          break;
        case 'checkout':
          result = await this.checkout(parameters);
          break;
        case 'confirmPurchase':
          result = await this.confirmPurchase(parameters);
          break;
        case 'setUserInfo':
          result = await this.setUserInfo(parameters);
          break;
        case 'focusPasswordField':
          result = await this.focusPasswordField(parameters);
          break;
        case 'navigateTo':
          result = await this.navigateTo(parameters);
          break;
        case 'getViewDetails':
          result = await this.getViewDetails(parameters);
          break;
        case 'highlightCapabilities':
          result = await this.highlightCapabilities(parameters);
          break;
        case 'highlightWhyVoice':
          result = await this.highlightWhyVoice(parameters);
          break;
        case 'highlightDemoStep':
          result = await this.highlightDemoStep(parameters);
          break;
        case 'highlightDemoFlowScroll':
          result = await this.highlightDemoFlowScroll(parameters);
          break;
        default:
          result = {
            success: false,
            error: `Unknown function: ${name}`
          };
      }
    } catch (error) {
      result = this.handleUnexpectedError(error, name);
    }

    // Emit event for feedback display
    this.emitFunctionEvent(name, result);

    return result;
  }

  private handleUnexpectedError(error: unknown, functionName: string): FunctionExecutorResult {
    console.error(`[FunctionExecutor] Unexpected error in ${functionName}:`, error);
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  /** Normalize string param: trim whitespace; null/undefined/empty string become undefined. */
  private normalizeString(v: unknown): string | undefined {
    if (v == null) return undefined;
    const s = typeof v === 'string' ? v.trim() : String(v).trim();
    return s === '' ? undefined : s;
  }

  /** Normalize number param; invalid values become undefined. */
  private normalizeNumber(v: unknown): number | undefined {
    if (v == null) return undefined;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }

  /** Detect placeholder bookId (model sent example text instead of real id from search). */
  private looksLikePlaceholderBookId(bookId: string): boolean {
    const lower = bookId.toLowerCase();
    return (
      lower.includes('from_search') ||
      lower.includes('placeholder') ||
      lower === 'book_id' ||
      lower === '<id>' ||
      /^book_id[_\-]?(from_)?search$/i.test(bookId)
    );
  }

  // ========== E-commerce functions ==========

  private async searchBooks(params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const query = this.normalizeString(params.query);
    const category = this.normalizeString(params.category);
    try {
      const books = await ecommerce.searchBooks(query, category);
      ecommerce.setLastSearchResults(books);
      ecommerce.setLastSearchQuery([query, category].filter(Boolean).join(' ') || '');
      const summary = books.slice(0, 20).map((b, i) => ({
        index: i + 1,
        id: b.id,
        title: b.title,
        price: b.price,
        category: b.category
      }));
      return {
        success: true,
        message: `Found ${books.length} book(s)`,
        data: {
          total: books.length,
          books: summary,
          messageForUser: books.length === 0
            ? 'No books found.'
            : `Found ${books.length} books. First results: ${summary.map((s) => `${s.index}. ${s.title} ($${s.price})`).join('; ')}`
        }
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        suggestions: ['Try a different category or search query.']
      };
    }
  }

  private async getBookDetails(params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const bookId = this.normalizeString(params.bookId);
    const title = this.normalizeString(params.title);
    try {
      if (bookId && this.looksLikePlaceholderBookId(bookId)) {
        return {
          success: false,
          error: `"${bookId}" is placeholder text, not a real book id.`,
          suggestions: [
            'Use the exact "id" from the searchBooks result (e.g. data.books[0].id). Never use placeholders like "book_id_from_search".'
          ]
        };
      }
      let book;
      if (bookId) {
        book = await ecommerce.getBookById(bookId);
      } else if (title) {
        book = await ecommerce.getBookByTitle(title);
      } else {
        return {
          success: false,
          error: 'Provide bookId or title.',
          suggestions: ['Call searchBooks first, then use the bookId from the results (e.g. first result = index 1).']
        };
      }
      if (!book) {
        return {
          success: false,
          error: bookId ? `Book not found: ${bookId}` : `Book not found: ${title}`,
          suggestions: ['Try searchBooks to find valid book ids or titles.']
        };
      }
      const messageForUser = `${book.title}, $${book.price}. ${book.stock ? `In stock.` : 'Low stock.'} ${book.description ? book.description.slice(0, 120) + '...' : ''}`;
      return {
        success: true,
        message: `Book: ${book.title}`,
        data: {
          id: book.id,
          title: book.title,
          price: book.price,
          rating: book.rating,
          category: book.category,
          stock: book.stock,
          book_url: book.book_url,
          messageForUser,
          ...(book.description !== undefined && { description: book.description }),
          ...(book.productInformation !== undefined && { productInformation: book.productInformation }),
          ...(book.imageUrl !== undefined && { imageUrl: book.imageUrl })
        }
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        suggestions: ['Use a bookId from search results or getBookDetails.']
      };
    }
  }

  private async addToCart(params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const bookId = this.normalizeString(params.bookId);
    const quantityRaw = this.normalizeNumber(params.quantity);
    const quantity = quantityRaw != null && quantityRaw >= 1 ? quantityRaw : 1;
    if (!bookId) {
      return {
        success: false,
        error: 'bookId is required.',
        suggestions: ['Use the bookId from the last search results (e.g. the first book = index 1).']
      };
    }
    if (this.looksLikePlaceholderBookId(bookId)) {
      return {
        success: false,
        error: `"${bookId}" is placeholder text, not a real book id.`,
        suggestions: [
          'Use the exact "id" value from the searchBooks result (e.g. from data.books[0].id, like "book-science-fiction-1"). Never use placeholders like "book_id_from_search".'
        ]
      };
    }
    try {
      const book = await ecommerce.getBookById(bookId);
      if (!book) {
        return {
          success: false,
          error: `Book not found: ${bookId}`,
          suggestions: ['Ask the user to search for books first, or use a bookId from a previous search.']
        };
      }
      ecommerce.addToCart(bookId, quantity);
      const msg = `Added "${book.title}" to cart (quantity: ${quantity})`;
      const cart = await this.buildCartSnapshot();
      return {
        success: true,
        message: msg,
        data: {
          bookId,
          title: book.title,
          quantity,
          messageForUser: msg,
          items: cart.items,
          total: cart.total
        }
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        suggestions: ['Use bookId from the last search or getBookDetails result.']
      };
    }
  }

  private async removeFromCart(params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const bookId = this.normalizeString(params.bookId);
    const index = this.normalizeNumber(params.index);
    if (bookId !== undefined && bookId !== '') {
      ecommerce.removeFromCart(bookId);
      const msg = `Removed item from cart`;
      const cart = await this.buildCartSnapshot();
      return {
        success: true,
        message: msg,
        data: { removed: bookId, messageForUser: msg, items: cart.items, total: cart.total }
      };
    }
    if (index !== undefined && index >= 1) {
      ecommerce.removeFromCart(index);
      const msg = `Removed item at position ${index} from cart`;
      const cart = await this.buildCartSnapshot();
      return {
        success: true,
        message: msg,
        data: { removedIndex: index, messageForUser: msg, items: cart.items, total: cart.total }
      };
    }
    return {
      success: false,
      error: 'Provide bookId or index (1-based position in cart).',
      suggestions: ['Use getCart to see items, then remove by bookId or by index (1 = first item).']
    };
  }

  /** Build cart snapshot (items + total) for backend cache and responses. */
  private async buildCartSnapshot(): Promise<{
    items: Array<{ index: number; bookId: string; title: string; price: number; quantity: number; subtotal: number }>;
    total: number;
    messageForUser: string;
  }> {
    const items = ecommerce.getCart();
    const lines: Array<{ index: number; bookId: string; title: string; price: number; quantity: number; subtotal: number }> = [];
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const book = await ecommerce.getBookById(item.bookId);
      const title = book?.title ?? item.bookId;
      const price = book?.price ?? 0;
      const subtotal = price * item.quantity;
      total += subtotal;
      lines.push({
        index: i + 1,
        bookId: item.bookId,
        title,
        price,
        quantity: item.quantity,
        subtotal
      });
    }
    const totalRounded = Math.round(total * 100) / 100;
    const messageForUser =
      items.length === 0 ? 'Your cart is empty.' : `Cart has ${items.length} item(s), total $${totalRounded.toFixed(2)}.`;
    return { items: lines, total: totalRounded, messageForUser };
  }

  private async getCart(params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const { items, total, messageForUser } = await this.buildCartSnapshot();
    const user = ecommerce.getUser();
    const data: Record<string, unknown> = {
      itemCount: items.length,
      items,
      total,
      messageForUser
    };
    if (user) {
      data.user = { name: user.name, email: user.email, ...(user.address != null && { address: user.address }) };
    }
    return {
      success: true,
      message: items.length === 0 ? 'Cart is empty' : `Cart has ${items.length} item(s), total $${total.toFixed(2)}`,
      data
    };
  }

  private async setUserInfo(params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const name = this.normalizeString(params.name);
    const email = this.normalizeString(params.email);
    const address = this.normalizeString(params.address);
    if (!name || !email) {
      return {
        success: false,
        error: 'name and email are required.',
        suggestions: ['Ask the user for their full name and email, then call setUserInfo again.']
      };
    }
    ecommerce.setUser({ name, email, address: address ?? undefined });
    const user = { name, email, ...(address != null && address !== '' && { address }) };
    const messageForUser = `Saved: ${name}, ${email}${address ? `, ${address}` : ''}`;
    return {
      success: true,
      message: messageForUser,
      data: { user, messageForUser }
    };
  }

  private async focusPasswordField(_params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const el = document.querySelector<HTMLInputElement>('#password-input');
    if (el) {
      el.focus();
    }
    const messageForUser = "The password field is focused. Please type your password there; I won't see or store it.";
    return {
      success: true,
      message: messageForUser,
      data: { messageForUser }
    };
  }

  private async checkout(_params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const items = ecommerce.getCart();
    if (items.length === 0) {
      return {
        success: false,
        error: 'Your cart is empty. Add items before checking out.',
        suggestions: ['Ask the user to add books to the cart first, or navigate to search.']
      };
    }
    if (!ecommerce.getUser()) {
      return {
        success: false,
        error: 'The user must register before checking out.',
        suggestions: ["Navigate to the registration page and ask for name, email, and address, then call setUserInfo."]
      };
    }
    const normalized = '/checkout';
    window.dispatchEvent(new CustomEvent('navigate', { detail: { path: normalized } }));
    const messageForUser = "You're on the checkout page. Say 'confirm purchase' when you're ready.";
    return {
      success: true,
      message: messageForUser,
      data: { path: normalized, messageForUser }
    };
  }

  private async confirmPurchase(_params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const user = ecommerce.getUser();
    if (!user) {
      return {
        success: false,
        error: 'The user must be registered before completing the purchase.',
        suggestions: ['Navigate to the registration page and guide the user to provide name, email, and address, then call setUserInfo.']
      };
    }
    const { items: lines, total } = await this.buildCartSnapshot();
    const orderId = `ord-${Date.now()}`;
    const mockPayload = {
      to: user.email,
      subject: 'Order confirmation',
      orderId,
      items: lines.map((l) => ({ title: l.title, quantity: l.quantity, subtotal: l.subtotal })),
      total,
      address: user.address ?? ''
    };
    console.log('[Mock email]', mockPayload);
    const messageForUser = `Order complete. A confirmation email would be sent to ${user.email} with payment instructions (mock).`;
    ecommerce.checkout();
    return {
      success: true,
      message: messageForUser,
      data: { orderComplete: true, messageForUser, orderId }
    };
  }

  private async navigateTo(params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const path = this.normalizeString(params.path);
    if (!path) {
      return {
        success: false,
        error: 'path is required (e.g. /cart, /book/<id>, /register, /checkout, /).',
        suggestions: ['Use paths like /cart, /book/<bookId>, /checkout, /register, or / for home.']
      };
    }
    const normalized = path.startsWith('/') ? path : `/${path}`;
    window.dispatchEvent(new CustomEvent('navigate', { detail: { path: normalized } }));
    const messageForUser = `Navigating to ${normalized}`;
    return {
      success: true,
      message: messageForUser,
      data: { path: normalized, messageForUser }
    };
  }

  private async getViewDetails(params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const bookId = this.normalizeString(params.bookId);
    if (!bookId) {
      return {
        success: false,
        error: 'bookId is required to open the book details page.',
        suggestions: ['Use the book id from search results or getBookDetails.']
      };
    }
    if (this.looksLikePlaceholderBookId(bookId)) {
      return {
        success: false,
        error: `"${bookId}" is placeholder text, not a real book id.`,
        suggestions: ['Use the exact "id" from the searchBooks or getBookDetails result.']
      };
    }
    const path = `/book/${bookId}`;
    window.dispatchEvent(new CustomEvent('navigate', { detail: { path } }));
    const messageForUser = `Opening book details for ${bookId}`;
    return {
      success: true,
      message: messageForUser,
      data: { path, bookId, messageForUser }
    };
  }

  private async highlightCapabilities(_params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const dispatchHighlight = () => {
      window.dispatchEvent(new CustomEvent('highlightCapabilities'));
    };
    if (window.location.pathname !== '/') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/' } }));
      setTimeout(dispatchHighlight, 400);
    } else {
      dispatchHighlight();
    }
    const messageForUser = 'Highlighting capabilities on the home page.';
    return {
      success: true,
      message: messageForUser,
      data: { messageForUser }
    };
  }

  private async highlightWhyVoice(_params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const dispatchHighlight = () => {
      window.dispatchEvent(new CustomEvent('highlightWhyVoice'));
    };
    if (window.location.pathname !== '/') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/' } }));
      setTimeout(dispatchHighlight, 400);
    } else {
      dispatchHighlight();
    }
    const messageForUser = 'Highlighting why voice + LLM on the home page.';
    return {
      success: true,
      message: messageForUser,
      data: { messageForUser }
    };
  }

  private async highlightDemoStep(params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const raw = params.step != null ? Number(params.step) : NaN;
    const step = Number.isInteger(raw) && raw >= 1 && raw <= 6 ? raw : 1;
    const dispatchHighlight = () => {
      window.dispatchEvent(new CustomEvent('highlightDemoStep', { detail: { step } }));
    };
    if (window.location.pathname !== '/') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/' } }));
      setTimeout(dispatchHighlight, 400);
    } else {
      dispatchHighlight();
    }
    const messageForUser = `Highlighting demo step ${step} on the home page.`;
    return {
      success: true,
      message: messageForUser,
      data: { step, messageForUser }
    };
  }

  private async highlightDemoFlowScroll(_params: Record<string, unknown>): Promise<FunctionExecutorResult> {
    const dispatchScroll = () => {
      window.dispatchEvent(new CustomEvent('highlightDemoFlowScroll'));
    };
    if (window.location.pathname !== '/') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/' } }));
      setTimeout(dispatchScroll, 400);
    } else {
      dispatchScroll();
    }
    const messageForUser = 'Scrolling through the demo flow on the home page.';
    return {
      success: true,
      message: messageForUser,
      data: { messageForUser }
    };
  }
}
