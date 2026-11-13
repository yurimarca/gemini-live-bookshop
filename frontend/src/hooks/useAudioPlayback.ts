/**
 * Audio Playback Hook using Web Audio API
 *
 * Features:
 * - Decodes Base64 audio data from Gemini
 * - Plays audio using Web Audio API for better control
 * - Queues multiple audio chunks
 * - Tracks playback state
 * - Handles errors gracefully
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface UseAudioPlaybackReturn {
  isPlaying: boolean;
  playAudio: (base64Data: string) => Promise<void>;
  stopPlayback: () => void;
  error: string | null;
}

/**
 * Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Decode Base64 to binary string
  const binaryString = atob(base64);

  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio context and current source
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Queue for audio chunks
  const audioQueueRef = useRef<string[]>([]);
  const isProcessingQueueRef = useRef(false);

  // Track when next audio should start (for seamless playback)
  const nextStartTimeRef = useRef<number>(0);

  // Track number of scheduled chunks that haven't finished yet
  const scheduledChunksRef = useRef<number>(0);

  /**
   * Initialize AudioContext
   */
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      console.log('[Playback] AudioContext created');
    }

    // Resume if suspended (autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
      console.log('[Playback] AudioContext resumed');
    }

    return audioContextRef.current;
  }, []);

  /**
   * Process audio queue
   */
  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;
    setIsPlaying(true);

    while (audioQueueRef.current.length > 0) {
      const base64Data = audioQueueRef.current.shift();
      if (!base64Data) continue;

      try {

        // Get AudioContext
        const audioContext = getAudioContext();

        // Convert Base64 to ArrayBuffer
        const arrayBuffer = base64ToArrayBuffer(base64Data);

        // Gemini sends raw 16-bit PCM audio at 24kHz (little-endian)
        // We need to manually create an AudioBuffer from raw PCM
        const int16Array = new Int16Array(arrayBuffer);
        const sampleRate = 24000; // Gemini's output sample rate
        const numberOfChannels = 1; // Mono

        // Create AudioBuffer
        const audioBuffer = audioContext.createBuffer(
          numberOfChannels,
          int16Array.length,
          sampleRate
        );

        // Convert Int16 PCM to Float32 (Web Audio API format)
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < int16Array.length; i++) {
          // Convert from -32768...32767 to -1.0...1.0
          channelData[i] = int16Array[i] / 32768.0;
        }

        // Create audio source
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        currentSourceRef.current = source;

        // Calculate when to start this chunk (seamless scheduling)
        const currentTime = audioContext.currentTime;
        const startTime = Math.max(nextStartTimeRef.current, currentTime);

        // Increment scheduled chunks counter
        scheduledChunksRef.current++;

        // Set up event handlers
        source.onended = () => {
          currentSourceRef.current = null;

          // Decrement scheduled chunks counter
          scheduledChunksRef.current--;

          // If no more scheduled chunks and queue is empty, stop playing
          if (scheduledChunksRef.current === 0 && audioQueueRef.current.length === 0) {
            setIsPlaying(false);
          }
        };

        source.onerror = (err) => {
          console.error('[Playback] Source error:', err);
          setError('Audio playback failed');
          // Clear queue on error
          audioQueueRef.current = [];
          scheduledChunksRef.current = 0;
          isProcessingQueueRef.current = false;
          setIsPlaying(false);
        };

        // Start at scheduled time (seamless playback)
        source.start(startTime);

        // Update next start time for next chunk
        nextStartTimeRef.current = startTime + audioBuffer.duration;

      } catch (err: any) {
        console.error('[Playback] Failed to play audio:', err);

        let errorMsg = 'Failed to play audio';

        if (err.name === 'EncodingError') {
          errorMsg = 'Audio format not supported';
        } else if (err.name === 'NotSupportedError') {
          errorMsg = 'Audio decoding not supported';
        } else if (err.message) {
          errorMsg = err.message;
        }

        setError(errorMsg);

        // Clear queue and counters on error
        audioQueueRef.current = [];
        scheduledChunksRef.current = 0;
        break;
      }
    }

    isProcessingQueueRef.current = false;
    // Note: isPlaying will be set to false by the onended handler of the last chunk
  }, [getAudioContext]);

  /**
   * Play audio from Base64 data
   */
  const playAudio = useCallback(async (base64Data: string) => {
    setError(null);

    // Add to queue
    audioQueueRef.current.push(base64Data);

    // Start processing queue if not already processing
    if (!isProcessingQueueRef.current) {
      processQueue();
    }
  }, [processQueue]);

  /**
   * Stop current playback
   */
  const stopPlayback = useCallback(() => {
    console.log('[Playback] Stopping playback');

    // Stop current source
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (err) {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null;
    }

    // Clear queue and counters
    audioQueueRef.current = [];
    isProcessingQueueRef.current = false;
    scheduledChunksRef.current = 0;
    setIsPlaying(false);

    // Reset scheduling for next session
    nextStartTimeRef.current = 0;

    console.log('[Playback] Playback stopped');
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      console.log('[Playback] Cleaning up playback resources');

      stopPlayback();

      // Close AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopPlayback]);

  return {
    isPlaying,
    playAudio,
    stopPlayback,
    error
  };
}
