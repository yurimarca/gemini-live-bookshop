/**
 * WebSocket service for connecting to the FastAPI backend.
 * Handles connection lifecycle, message sending/receiving, and reconnection.
 */

import type { ClientMessage, ServerMessage } from '../types';

type MessageHandler = (message: ServerMessage) => void;
type ConnectionHandler = (status: 'connected' | 'disconnected' | 'error') => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimer: number | null = null;
  private disconnectTimer: number | null = null;
  private intentionalClose = false;

  constructor(url?: string) {
    this.url = url || import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/gemini-live';
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.cancelDisconnect();
        this.intentionalClose = false;

        // Reuse existing socket if open or still connecting (avoids closing on React Strict Mode remount).
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
          resolve();
          return;
        }

        // Close any existing connection that is closed or closing.
        if (this.ws) {
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.onmessage = null;
          this.ws.close();
          this.ws = null;
        }

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected to', this.url);
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.notifyConnectionHandlers('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);
            this.notifyMessageHandlers(message);
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          this.notifyConnectionHandlers('error');
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log('[WebSocket] Disconnected:', event.code, event.reason);
          this.ws = null;
          this.notifyConnectionHandlers('disconnected');

          // Attempt to reconnect if not intentionally closed
          if (!this.intentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        console.error('[WebSocket] Connection failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.cancelReconnect();
    this.cancelDisconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Schedule a disconnect after a delay. Used so React Strict Mode's fake unmount
   * doesn't close the socket; if the component remounts quickly we cancel this.
   */
  scheduleDisconnect(delayMs: number): void {
    this.cancelDisconnect();
    this.disconnectTimer = window.setTimeout(() => {
      this.disconnectTimer = null;
      this.disconnect();
    }, delayMs);
  }

  /**
   * Cancel any scheduled disconnect (e.g. when connect() is called on remount).
   */
  cancelDisconnect(): void {
    if (this.disconnectTimer !== null) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  /**
   * Send a message to the server
   */
  sendMessage(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WebSocket] Cannot send message - not connected');
      throw new Error('WebSocket is not connected');
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[WebSocket] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Subscribe to incoming messages
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    this.cancelReconnect();

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((error) => {
        console.error('[WebSocket] Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Cancel scheduled reconnection
   */
  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Notify all message handlers
   */
  private notifyMessageHandlers(message: ServerMessage): void {
    this.messageHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error('[WebSocket] Message handler error:', error);
      }
    });
  }

  /**
   * Notify all connection handlers
   */
  private notifyConnectionHandlers(status: 'connected' | 'disconnected' | 'error'): void {
    this.connectionHandlers.forEach((handler) => {
      try {
        handler(status);
      } catch (error) {
        console.error('[WebSocket] Connection handler error:', error);
      }
    });
  }
}

// Export singleton instance
export const wsService = new WebSocketService();
