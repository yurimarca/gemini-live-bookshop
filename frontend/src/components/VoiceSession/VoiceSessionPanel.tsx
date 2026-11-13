/**
 * Voice Session Panel Component
 *
 * Main UI for voice interaction with Gemini Live API.
 * Features:
 * - Connection status indicator
 * - Recording controls (start/stop)
 * - Real-time audio visualization
 * - Transcript display
 * - Error handling and display
 */

import { useEffect } from 'react';
import { Mic, MicOff, Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useGeminiLive } from '../../hooks/useGeminiLive';

export function VoiceSessionPanel() {
  const {
    isConnected,
    connectionStatus,
    isRecording,
    isPlaying,
    audioLevel,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    transcripts,
    error,
    clearError
  } = useGeminiLive();

  /**
   * Auto-connect on mount
   */
  useEffect(() => {
    connect().catch(err => {
      console.error('Failed to connect:', err);
    });

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle recording toggle
   */
  const handleRecordingToggle = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      try {
        await startRecording();
      } catch (err) {
        console.error('Failed to start recording:', err);
      }
    }
  };

  /**
   * Get connection status color and icon
   */
  const getConnectionDisplay = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          color: 'text-success-foreground',
          bgColor: 'bg-success-light border-success-border',
          icon: <CheckCircle2 className="w-5 h-5" />,
          text: 'Connected'
        };
      case 'connecting':
        return {
          color: 'text-warning-foreground',
          bgColor: 'bg-warning-light border-warning-border',
          icon: <Loader2 className="w-5 h-5 animate-spin" />,
          text: 'Connecting...'
        };
      case 'disconnected':
        return {
          color: 'text-mist-600',
          bgColor: 'bg-mist-200 border-mist-300',
          icon: <XCircle className="w-5 h-5" />,
          text: 'Disconnected'
        };
      case 'error':
        return {
          color: 'text-error-foreground',
          bgColor: 'bg-error-light border-error-border',
          icon: <AlertCircle className="w-5 h-5" />,
          text: 'Connection Error'
        };
      default:
        return {
          color: 'text-mist-600',
          bgColor: 'bg-mist-200 border-mist-300',
          icon: <XCircle className="w-5 h-5" />,
          text: 'Unknown'
        };
    }
  };

  const connectionDisplay = getConnectionDisplay();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-display font-bold text-mist-900 tracking-tight">
          Voice AI Assistant
        </h1>
        <p className="text-mist-700 text-lg">
          Talk to Gemini using your voice
        </p>
      </div>

      {/* Connection Status */}
      <div className={`flex items-center justify-center gap-3 p-4 rounded-xl border backdrop-blur-sm transition-all ${connectionDisplay.bgColor}`}>
        <span className={connectionDisplay.color}>
          {connectionDisplay.icon}
        </span>
        <span className={`font-medium ${connectionDisplay.color}`}>
          {connectionDisplay.text}
        </span>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-error-light border border-error-border rounded-xl backdrop-blur-sm animate-fade-in">
          <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-error-foreground font-medium">Error</p>
            <p className="text-error/80 text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="text-error hover:text-error-foreground font-medium text-sm transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Recording Controls */}
      <div className="bg-mist-900/5 backdrop-blur-xl border border-mist-900/10 rounded-3xl p-10 shadow-2xl">
        <div className="flex flex-col items-center space-y-10">
          {/* Audio Visualizer */}
          {isRecording && (
            <div className="w-full max-w-md space-y-3">
              <div className="h-4 bg-mist-50 rounded-full overflow-hidden border border-mist-900/5 shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-brand-red via-brand-coral to-brand-red transition-all duration-75 ease-out shadow-[0_0_15px_rgba(206,69,50,0.4)]"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
              <p className="text-sm text-brand-red text-center font-mono">
                Signal Level: {Math.round(audioLevel)}%
              </p>
            </div>
          )}

          {/* Recording Button */}
          <button
            onClick={handleRecordingToggle}
            disabled={!isConnected}
            className={`
              relative flex items-center justify-center gap-4
              px-10 py-5 rounded-full font-bold text-xl
              transition-all duration-300 transform
              disabled:opacity-50 disabled:cursor-not-allowed
              ${isRecording
                ? 'bg-gradient-to-r from-error-foreground to-error text-primary-foreground shadow-lg shadow-error/30 hover:shadow-error/50 hover:scale-105'
                : 'bg-gradient-to-r from-brand-red to-brand-coral text-primary-foreground shadow-lg shadow-brand-coral/30 hover:shadow-brand-coral/50 hover:scale-105 hover:-translate-y-1'
              }
            `}
          >
            {isRecording ? (
              <>
                <MicOff className="w-7 h-7" />
                <span>Stop Recording</span>
                {/* Animated recording indicator */}
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-5 w-5 bg-error"></span>
                </span>
              </>
            ) : (
              <>
                <Mic className="w-7 h-7" />
                <span>Start Recording</span>
              </>
            )}
          </button>

          {/* Status Text */}
          <div className="text-center space-y-2 h-8">
            {isRecording && (
              <p className="text-lg font-bold text-error animate-pulse flex items-center gap-2">
                <span className="w-2 h-2 bg-error rounded-full"></span>
                Recording...
              </p>
            )}
            {isPlaying && (
              <p className="text-lg font-bold text-brand-red flex items-center gap-2">
                <span className="w-2 h-2 bg-brand-red rounded-full animate-bounce"></span>
                Gemini is speaking...
              </p>
            )}
            {!isRecording && !isPlaying && isConnected && (
              <p className="text-mist-700">
                Click the button to start talking
              </p>
            )}
            {!isConnected && (
              <p className="text-mist-700 animate-pulse">
                Waiting for connection...
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Transcripts */}
      {transcripts.length > 0 && (
        <div className="bg-mist-900/5 backdrop-blur-xl border border-mist-900/10 rounded-3xl p-8 shadow-xl">
          <h2 className="text-xl font-bold text-mist-900 mb-6 flex items-center gap-2">
            <span className="w-1 h-6 bg-brand-coral rounded-full"></span>
            Conversation History
          </h2>
          <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {transcripts.map((transcript) => (
              <div
                key={transcript.id}
                className={`flex ${transcript.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-5 shadow-lg ${transcript.role === 'user'
                      ? 'bg-gradient-to-br from-brand-red to-brand-coral text-primary-foreground rounded-tr-none'
                      : 'bg-mist-100 border border-mist-900/10 text-mist-900 rounded-tl-none'
                    }`}
                >
                  <p className={`text-xs font-bold mb-2 uppercase tracking-wider ${transcript.role === 'user' ? 'text-primary-foreground/70' : 'text-brand-red'
                    }`}>
                    {transcript.role === 'user' ? 'You' : 'Gemini'}
                  </p>
                  <p className="text-base leading-relaxed">{transcript.text}</p>
                  <p className={`text-xs mt-3 ${transcript.role === 'user' ? 'text-primary-foreground/50' : 'text-mist-600'
                    }`}>
                    {transcript.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-mist-100 border border-mist-300 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="font-bold text-brand-red mb-3 text-lg">How to use:</h3>
        <ul className="text-mist-700 space-y-2">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-mist-200 text-brand-red flex items-center justify-center text-xs font-bold">1</span>
            Click "Start Recording" to begin speaking
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-mist-200 text-brand-red flex items-center justify-center text-xs font-bold">2</span>
            Speak naturally to Gemini
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-mist-200 text-brand-red flex items-center justify-center text-xs font-bold">3</span>
            Click "Stop Recording" when done
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-mist-200 text-brand-red flex items-center justify-center text-xs font-bold">4</span>
            Wait for Gemini's voice response
          </li>
        </ul>
      </div>
    </div>
  );
}
