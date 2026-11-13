/**
 * Unit tests for FunctionExecutor (e-commerce tools used by the voice agent).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionExecutor } from './functionExecutor';

const mockBook = {
  id: 'book-science-fiction-1',
  title: 'Test Book',
  price: 12.99,
  category: 'Science Fiction',
  stock: 'In stock',
  rating: 4,
  book_url: '/book/book-science-fiction-1',
};

vi.mock('../store/ecommerce', () => ({
  searchBooks: vi.fn(),
  setLastSearchResults: vi.fn(),
  setLastSearchQuery: vi.fn(),
  getBookById: vi.fn(),
  getBookByTitle: vi.fn(),
  addToCart: vi.fn(),
  removeFromCart: vi.fn(),
  getCart: vi.fn(),
  getUser: vi.fn(),
  setUser: vi.fn(),
  checkout: vi.fn(),
}));

describe('FunctionExecutor', () => {
  let executor: FunctionExecutor;
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    executor = new FunctionExecutor();
    dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
    const ecommerce = await import('../store/ecommerce');
    vi.mocked(ecommerce.searchBooks).mockResolvedValue([mockBook]);
    vi.mocked(ecommerce.getBookById).mockResolvedValue(mockBook);
    vi.mocked(ecommerce.getBookByTitle).mockResolvedValue(mockBook);
    vi.mocked(ecommerce.getCart).mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    dispatchSpy.mockRestore();
  });

  it('searchBooks returns success and messageForUser', async () => {
    const result = await executor.execute('searchBooks', { category: 'Science Fiction' });
    expect(result.success).toBe(true);
    expect(result.data?.messageForUser).toBeDefined();
    expect(result.data?.books).toBeDefined();
  });

  it('searchBooks normalizes empty/whitespace params', async () => {
    const result = await executor.execute('searchBooks', { query: '  ', category: '' });
    expect(result.success).toBe(true);
  });

  it('getBookDetails with bookId returns details and messageForUser', async () => {
    const result = await executor.execute('getBookDetails', { bookId: mockBook.id });
    expect(result.success).toBe(true);
    expect(result.data?.messageForUser).toBeDefined();
    expect(result.data?.id).toBe(mockBook.id);
  });

  it('getBookDetails with neither bookId nor title returns error with suggestions', async () => {
    const result = await executor.execute('getBookDetails', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('bookId or title');
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });

  it('addToCart with bookId returns success and messageForUser', async () => {
    const result = await executor.execute('addToCart', { bookId: mockBook.id });
    expect(result.success).toBe(true);
    expect(result.data?.messageForUser).toBeDefined();
  });

  it('addToCart without bookId returns error with suggestions', async () => {
    const result = await executor.execute('addToCart', {});
    expect(result.success).toBe(false);
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });

  it('addToCart with placeholder bookId returns explicit error', async () => {
    const result = await executor.execute('addToCart', { bookId: 'book_id_from_search' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('placeholder');
    expect(result.suggestions?.some((s) => s.includes('exact'))).toBe(true);
  });

  it('getCart returns messageForUser', async () => {
    const result = await executor.execute('getCart', {});
    expect(result.success).toBe(true);
    expect(result.data?.messageForUser).toBeDefined();
  });

  it('checkout with empty cart returns error', async () => {
    const result = await executor.execute('checkout', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('checkout with items but no user returns error', async () => {
    const ecommerce = await import('../store/ecommerce');
    vi.mocked(ecommerce.getCart).mockReturnValue([{ bookId: mockBook.id, quantity: 1 }]);
    vi.mocked(ecommerce.getUser).mockReturnValue(null);
    const result = await executor.execute('checkout', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('register');
  });

  it('checkout with items and user navigates to checkout and returns messageForUser', async () => {
    const ecommerce = await import('../store/ecommerce');
    vi.mocked(ecommerce.getCart).mockReturnValue([{ bookId: mockBook.id, quantity: 1 }]);
    vi.mocked(ecommerce.getUser).mockReturnValue({ name: 'Jane', email: 'jane@example.com' });
    const result = await executor.execute('checkout', {});
    expect(result.success).toBe(true);
    expect(result.data?.messageForUser).toContain('checkout');
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigate',
        detail: { path: '/checkout' },
      })
    );
  });

  it('setUserInfo stores name and email and returns user in data', async () => {
    const result = await executor.execute('setUserInfo', {
      name: 'Jane Doe',
      email: 'jane@example.com',
      address: '123 Main St'
    });
    expect(result.success).toBe(true);
    expect(result.data?.user).toEqual({ name: 'Jane Doe', email: 'jane@example.com', address: '123 Main St' });
    const ecommerce = await import('../store/ecommerce');
    expect(ecommerce.setUser).toHaveBeenCalledWith({ name: 'Jane Doe', email: 'jane@example.com', address: '123 Main St' });
  });

  it('setUserInfo without name or email returns error', async () => {
    const result = await executor.execute('setUserInfo', { name: 'Jane' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('name and email');
  });

  it('focusPasswordField returns messageForUser', async () => {
    const result = await executor.execute('focusPasswordField', {});
    expect(result.success).toBe(true);
    expect(result.data?.messageForUser).toContain('password');
  });

  it('confirmPurchase without user returns error', async () => {
    const ecommerce = await import('../store/ecommerce');
    vi.mocked(ecommerce.getCart).mockReturnValue([{ bookId: mockBook.id, quantity: 1 }]);
    vi.mocked(ecommerce.getUser).mockReturnValue(null);
    const result = await executor.execute('confirmPurchase', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('registered');
    expect(ecommerce.checkout).not.toHaveBeenCalled();
  });

  it('confirmPurchase with user completes order and returns messageForUser', async () => {
    const ecommerce = await import('../store/ecommerce');
    vi.mocked(ecommerce.getCart).mockReturnValue([{ bookId: mockBook.id, quantity: 1 }]);
    vi.mocked(ecommerce.getUser).mockReturnValue({ name: 'Jane', email: 'jane@example.com' });
    const result = await executor.execute('confirmPurchase', {});
    expect(result.success).toBe(true);
    expect(result.data?.orderComplete).toBe(true);
    expect(ecommerce.checkout).toHaveBeenCalled();
  });

  it('navigateTo with path returns success and dispatches navigate event', async () => {
    const result = await executor.execute('navigateTo', { path: '/cart' });
    expect(result.success).toBe(true);
    expect(result.data?.messageForUser).toBeDefined();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigate',
        detail: { path: '/cart' },
      })
    );
  });

  it('navigateTo normalizes path without leading slash', async () => {
    await executor.execute('navigateTo', { path: 'checkout' });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigate',
        detail: { path: '/checkout' },
      })
    );
  });

  it('navigateTo without path returns error with suggestions', async () => {
    const result = await executor.execute('navigateTo', {});
    expect(result.success).toBe(false);
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });

  it('getViewDetails with bookId dispatches navigate to /book/<id>', async () => {
    const result = await executor.execute('getViewDetails', { bookId: mockBook.id });
    expect(result.success).toBe(true);
    expect(result.data?.path).toBe(`/book/${mockBook.id}`);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigate',
        detail: { path: `/book/${mockBook.id}` },
      })
    );
  });

  it('getViewDetails without bookId returns error with suggestions', async () => {
    const result = await executor.execute('getViewDetails', {});
    expect(result.success).toBe(false);
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });

  it('getViewDetails with placeholder bookId returns error', async () => {
    const result = await executor.execute('getViewDetails', { bookId: 'book_id_from_search' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('placeholder');
  });

  it('removeFromCart with index returns success', async () => {
    const ecommerce = await import('../store/ecommerce');
    const result = await executor.execute('removeFromCart', { index: 1 });
    expect(result.success).toBe(true);
    expect(ecommerce.removeFromCart).toHaveBeenCalledWith(1);
  });

  it('removeFromCart with bookId returns success', async () => {
    const ecommerce = await import('../store/ecommerce');
    const result = await executor.execute('removeFromCart', { bookId: mockBook.id });
    expect(result.success).toBe(true);
    expect(ecommerce.removeFromCart).toHaveBeenCalledWith(mockBook.id);
  });

  it('removeFromCart with neither bookId nor index returns error with suggestions', async () => {
    const result = await executor.execute('removeFromCart', {});
    expect(result.success).toBe(false);
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });

  it('unknown function returns error', async () => {
    const result = await executor.execute('unknownTool', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown function');
  });

  describe('highlightCapabilities', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, pathname: '/' },
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    it('when on home path dispatches highlightCapabilities immediately and returns success', async () => {
      const result = await executor.execute('highlightCapabilities', {});
      expect(result.success).toBe(true);
      expect(result.data?.messageForUser).toContain('Highlighting capabilities');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'highlightCapabilities',
        })
      );
    });

    it('when not on home path dispatches navigate to / then highlightCapabilities after delay', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, pathname: '/search' },
        writable: true,
      });
      vi.useFakeTimers();
      const resultPromise = executor.execute('highlightCapabilities', {});
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      vi.useRealTimers();
      expect(result.success).toBe(true);
      const calls = dispatchSpy.mock.calls.map((c) => (c[0] as CustomEvent).type);
      expect(calls).toContain('navigate');
      expect(calls).toContain('highlightCapabilities');
      const navigateCall = dispatchSpy.mock.calls.find(
        (c) => (c[0] as CustomEvent).type === 'navigate'
      );
      expect((navigateCall![0] as CustomEvent).detail).toEqual({ path: '/' });
    });
  });

  describe('highlightWhyVoice', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, pathname: '/' },
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    it('when on home path dispatches highlightWhyVoice immediately and returns success', async () => {
      const result = await executor.execute('highlightWhyVoice', {});
      expect(result.success).toBe(true);
      expect(result.data?.messageForUser).toContain('Highlighting why voice');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'highlightWhyVoice',
        })
      );
    });

    it('when not on home path dispatches navigate to / then highlightWhyVoice after delay', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, pathname: '/search' },
        writable: true,
      });
      vi.useFakeTimers();
      const resultPromise = executor.execute('highlightWhyVoice', {});
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      vi.useRealTimers();
      expect(result.success).toBe(true);
      const calls = dispatchSpy.mock.calls.map((c) => (c[0] as CustomEvent).type);
      expect(calls).toContain('navigate');
      expect(calls).toContain('highlightWhyVoice');
      const navigateCall = dispatchSpy.mock.calls.find(
        (c) => (c[0] as CustomEvent).type === 'navigate'
      );
      expect((navigateCall![0] as CustomEvent).detail).toEqual({ path: '/' });
    });
  });

  describe('highlightDemoStep', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, pathname: '/' },
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    it('dispatches highlightDemoStep with step in detail and returns success', async () => {
      const result = await executor.execute('highlightDemoStep', { step: 3 });
      expect(result.success).toBe(true);
      expect(result.data?.step).toBe(3);
      expect(result.data?.messageForUser).toContain('step 3');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'highlightDemoStep',
          detail: { step: 3 },
        })
      );
    });

    it('clamps step to 1-6 and uses default 1 when invalid', async () => {
      await executor.execute('highlightDemoStep', { step: 0 });
      expect((dispatchSpy.mock.calls.find((c) => (c[0] as CustomEvent).type === 'highlightDemoStep')![0] as CustomEvent).detail).toEqual({ step: 1 });
      dispatchSpy.mockClear();
      await executor.execute('highlightDemoStep', { step: 10 });
      expect((dispatchSpy.mock.calls.find((c) => (c[0] as CustomEvent).type === 'highlightDemoStep')![0] as CustomEvent).detail).toEqual({ step: 1 });
    });
  });

  describe('highlightDemoFlowScroll', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, pathname: '/' },
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    it('dispatches highlightDemoFlowScroll and returns success', async () => {
      const result = await executor.execute('highlightDemoFlowScroll', {});
      expect(result.success).toBe(true);
      expect(result.data?.messageForUser).toContain('demo flow');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'highlightDemoFlowScroll',
        })
      );
    });
  });
});
