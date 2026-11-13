/**
 * Floating Voice Widget – BookShop assistant
 *
 * Styled for book e-commerce: warm brand palette, clear "voice assistant" affordance.
 * Minimize/expand, connection status, recording, audio level.
 */

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useGeminiLive } from '../../hooks/useGeminiLive';

/** Dispatched from anywhere (e.g. home "Try the Demo") to focus the widget and start recording */
export const START_VOICE_DEMO_EVENT = 'startVoiceDemo';

interface FloatingVoiceWidgetProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  defaultMinimized?: boolean;
}

export function FloatingVoiceWidget({
  position = 'bottom-right',
  defaultMinimized = false
}: FloatingVoiceWidgetProps) {
  const {
    isConnected,
    connectionStatus,
    isRecording,
    audioLevel,
    connect,
    startRecording,
    stopRecording,
    error: hookError,
    clearError: clearHookError
  } = useGeminiLive();

  // Remove manual minimize state - the widget is now always "just a button" that expands when active
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  const [demoHighlight, setDemoHighlight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const recordingToggleRef = useRef<() => void>(() => {});

  /**
   * Auto-connect on mount. Cleanup uses deferred disconnect in useGeminiLive
   * so React Strict Mode does not close the socket on double mount.
   */
  useEffect(() => {
    connect().catch(err => {
      console.error('[FloatingWidget] Failed to connect:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle recording toggle.
   * Request microphone permission first (in direct response to click) so the browser shows the prompt.
   */
  const handleRecordingToggle = async () => {
    setMicErrorMessage(null);
    clearHookError();
    if (isRecording) {
      stopRecording();
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        const suggested =
          host === '127.0.0.1'
            ? 'Open http://localhost:' + (window.location.port || '5173') + ' instead of 127.0.0.1.'
            : 'Use HTTPS or open the app at http://localhost:' + (window.location.port || '5173') + '.';
        const msg = 'Microphone not available in this context. ' + suggested;
        setMicErrorMessage(msg);
        console.error('[FloatingWidget]', msg);
        return;
      }
      // Request mic as the first async operation from the click so the browser shows the permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });
      await startRecording(stream);
    } catch (err) {
      console.error('[FloatingWidget] Failed to start recording:', err);
      setMicErrorMessage(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  recordingToggleRef.current = handleRecordingToggle;

  /**
   * When "Try the Demo" (or similar) fires startVoiceDemo: scroll widget into view, pulse, then start recording.
   */
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const handler = () => {
      setDemoHighlight(true);
      timeoutId = setTimeout(() => setDemoHighlight(false), 2000);
      if (!isRecording) {
        recordingToggleRef.current();
      }
    };
    window.addEventListener(START_VOICE_DEMO_EVENT, handler);
    return () => {
      window.removeEventListener(START_VOICE_DEMO_EVENT, handler);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [isRecording]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-success';
      case 'connecting':
        return 'bg-warning animate-pulse';
      case 'error':
        return 'bg-error';
      default:
        return 'bg-mist-600';
    }
  };

  /**
   * Get position classes
   */
  const getPositionClasses = () => {
    switch (position) {
      case 'bottom-right':
        return 'bottom-8 right-8';
      case 'bottom-left':
        return 'bottom-8 left-8';
      case 'top-right':
        return 'top-8 right-8';
      case 'top-left':
        return 'top-8 left-8';
      default:
        return 'bottom-8 right-8';
    }
  };

  // Error state helper
  const hasError = !!(micErrorMessage || hookError);

  return (
    <div ref={containerRef} className={`fixed ${getPositionClasses()} z-[9999] flex flex-col items-end gap-2`}>

      {/* Error Toast (Floating above) */}
      {hasError && (
        <div className="bg-error-surface text-error-surfaceText text-xs px-3 py-1.5 rounded-lg border border-error/20 shadow-lg animate-fade-in mb-2 max-w-[200px] text-center">
          {micErrorMessage || hookError}
        </div>
      )}

      {/* Main Smart Pill */}
      <div className={`relative group rounded-full ${demoHighlight ? 'animate-widget-attention ring-4 ring-brand-red/50 ring-offset-2 ring-offset-mist-50' : ''}`}>

        {/* Status indicator (Connection dot) - always visible on the edge */}
        <div className={`absolute -top-1 -right-1 z-20 w-3 h-3 rounded-full border-2 border-mist-50 ${getStatusColor()} shadow-[0_0_8px_currentColor] pointer-events-none transition-all duration-300`} />

        {/* Audio Glow Ring (Only when recording) */}
        {isRecording && (
          <div
            className="absolute inset-0 rounded-full bg-brand-red/20 blur-lg transition-all duration-100 will-change-transform"
            style={{ transform: `scale(${1 + (audioLevel / 100) * 0.8})` }}
          />
        )}

        <button
          onClick={handleRecordingToggle}
          className={`
                relative z-10
                h-16 rounded-full
                flex items-center justify-center
                shadow-2xl shadow-mist-900/20 border border-mist-900/10
                transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                overflow-hidden
                ${isRecording
              ? 'w-48 bg-mist-100/95' // Pill shape when recording
              : 'w-16 bg-gradient-to-br from-mist-100 to-mist-50 hover:scale-105' // Circle when idle
            }
            `}
        >
          {/* Inner Layout */}
          <div className="flex items-center justify-center gap-3 min-w-max px-4">

            {/* Icon Container */}
            <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300
                    ${isRecording ? 'bg-error/10 text-error' : 'bg-brand-coral/10 text-brand-red'}
                `}>
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </div>

            {/* Text (Only visible when expanded/recording) */}
            <span className={`
                    text-sm font-medium tracking-wide text-mist-900/90 whitespace-nowrap
                    transition-all duration-300 delay-75
                    ${isRecording ? 'opacity-100 translate-x-0 w-auto' : 'opacity-0 -translate-x-4 w-0 hidden'}
                `}>
              {isRecording ? "Listening..." : ""}
            </span>

            {/* Waveform Animation (Fake or Real based on audioLevel) */}
            {isRecording && (
              <div className="flex items-center gap-0.5 h-4 ml-1">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-1 bg-brand-red rounded-full animate-pulse"
                    style={{
                      height: `${Math.max(20, Math.min(100, audioLevel * (1 + i * 0.5)))}%`, // Simple visualizer
                      animationDelay: `${i * 0.1}s`
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
