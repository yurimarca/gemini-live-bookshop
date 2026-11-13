/**
 * Function Feedback Display Component
 *
 * Toast-style notifications showing real-time function execution.
 * Features:
 * - Auto-dismiss after 5 seconds
 * - Stack notifications (max 3)
 * - Color-coded by status
 * - Shows function name and results
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  functionName: string;
  message: string;
  timestamp: number;
}

export function FunctionFeedbackDisplay() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  /**
   * Listen for custom function execution events
   */
  useEffect(() => {
    const handleFunctionExecution = (event: Event) => {
      const customEvent = event as CustomEvent<{
        functionName: string;
        success: boolean;
        message?: string;
        error?: string;
      }>;

      const { functionName, success, message, error } = customEvent.detail;

      const notification: Notification = {
        id: `${Date.now()}-${Math.random()}`,
        type: success ? 'success' : 'error',
        functionName,
        message: success ? (message || 'Function executed successfully') : (error || 'Function failed'),
        timestamp: Date.now()
      };

      setNotifications(prev => {
        // Keep only last 3 notifications
        const updated = [notification, ...prev].slice(0, 3);
        return updated;
      });

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 5000);
    };

    window.addEventListener('functionExecuted', handleFunctionExecution);

    return () => {
      window.removeEventListener('functionExecuted', handleFunctionExecution);
    };
  }, []);

  /**
   * Manual dismiss notification
   */
  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  /**
   * Get notification styles
   */
  const getNotificationStyles = (type: string) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-mist-50/90 border-success-border backdrop-blur-md',
          text: 'text-success-foreground',
          icon: <CheckCircle2 className="w-5 h-5 text-success-foreground" />
        };
      case 'error':
        return {
          bg: 'bg-mist-50/90 border-error-border backdrop-blur-md',
          text: 'text-error-foreground',
          icon: <XCircle className="w-5 h-5 text-error-foreground" />
        };
      case 'info':
        return {
          bg: 'bg-mist-50/90 border-brand-red/50 backdrop-blur-md',
          text: 'text-brand-red',
          icon: <Info className="w-5 h-5 text-brand-red" />
        };
      default:
        return {
          bg: 'bg-mist-50/90 border-mist-300 backdrop-blur-md',
          text: 'text-mist-700',
          icon: <Info className="w-5 h-5 text-mist-600" />
        };
    }
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-[9998] space-y-3 max-w-sm">
      {notifications.map((notification) => {
        const styles = getNotificationStyles(notification.type);

        return (
          <div
            key={notification.id}
            className={`
              ${styles.bg} border rounded-lg p-4 shadow-lg
              animate-in slide-in-from-right duration-300
              flex items-start gap-3
            `}
          >
            {/* Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {styles.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`font-semibold ${styles.text} text-sm`}>
                {notification.functionName}
              </p>
              <p className={`${styles.text} text-xs mt-1 opacity-90`}>
                {notification.message}
              </p>
            </div>

            {/* Dismiss Button */}
            <button
              onClick={() => dismissNotification(notification.id)}
              className={`flex-shrink-0 ${styles.text} opacity-60 hover:opacity-100 transition-opacity`}
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
