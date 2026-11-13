/**
 * Audio Recording Hook using Web Audio API
 *
 * Features:
 * - Captures microphone audio as raw PCM (16-bit, 16kHz)
 * - Streams Base64-encoded PCM chunks to backend via WebSocket
 * - Handles microphone permissions and errors
 * - Manages recording state
 * - Audio level monitoring for visualization
 * - AudioContext initialization for autoplay policies
 * - Downsampling from browser sample rate (typically 48kHz) to 16kHz
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface UseAudioRecordingProps {
  onAudioChunk: (base64Data: string) => void;
  onError: (error: string) => void;
  isConnected: boolean;
}

interface UseAudioRecordingReturn {
  isRecording: boolean;
  audioLevel: number;
  /** Start recording. Pass a MediaStream to use an already-granted stream (e.g. from click handler). */
  startRecording: (stream?: MediaStream) => Promise<void>;
  stopRecording: () => void;
  error: string | null;
}

/**
 * Convert Float32Array PCM audio to Base64-encoded 16-bit PCM
 */
function pcmToBase64(float32Array: Float32Array): string {
  // Convert Float32 (-1 to 1) to Int16 (-32768 to 32767)
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  // Convert to Base64
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

export function useAudioRecording({
  onAudioChunk,
  onError,
  isConnected
}: UseAudioRecordingProps): UseAudioRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Ref so the audio callback always sees current connection state (avoids stale closure)
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  // Refs for cleanup
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunkCountRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);

  /**
   * Monitor audio level for visualization
   */
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      if (!isRecording) return;

      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume (0-255)
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const average = sum / dataArray.length;

      // Convert to percentage (0-100)
      const level = Math.min(100, (average / 255) * 100);
      setAudioLevel(level);

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, [isRecording]);

  /**
   * Start recording from microphone.
   * If stream is provided (e.g. from click handler), use it so the browser already showed the permission prompt.
   */
  const startRecording = useCallback(async (providedStream?: MediaStream) => {
    try {
      setError(null);

      if (!isConnected) {
        const errorMsg = 'Cannot start recording: Not connected to backend';
        setError(errorMsg);
        onError(errorMsg);
        return;
      }

      let stream: MediaStream;
      if (providedStream) {
        stream = providedStream;
        console.log('[Audio] Using provided microphone stream');
      } else {
        if (!navigator.mediaDevices?.getUserMedia) {
          const errorMsg =
            'Microphone not available. Use HTTPS or open the app at http://localhost (not 127.0.0.1 or another host).';
          setError(errorMsg);
          onError(errorMsg);
          return;
        }
        console.log('[Audio] Requesting microphone permission...');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000
          }
        });
        console.log('[Audio] Microphone access granted');
      }

      mediaStreamRef.current = stream;

      // Initialize AudioContext for audio analysis and autoplay policy compliance
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      // Resume AudioContext if suspended (autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('[Audio] AudioContext resumed');
      }

      // Set up audio context and nodes
      const audioContext = audioContextRef.current;
      const source = audioContext.createMediaStreamSource(stream);

      // Create analyser for visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Resample to 16kHz (Gemini requirement)
      // Use ScriptProcessorNode for PCM extraction
      const bufferSize = 4096; // Process in chunks
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      chunkCountRef.current = 0;

      processor.onaudioprocess = (event) => {
        if (!isConnectedRef.current) return;

        // Get PCM audio data (Float32Array, -1 to 1)
        const inputData = event.inputBuffer.getChannelData(0);

        // Downsample from context rate to 16kHz (Gemini requirement)
        const targetSampleRate = 16000;
        const sourceSampleRate = audioContext.sampleRate;
        const ratio = sourceSampleRate / targetSampleRate;
        const resampledLength = Math.floor(inputData.length / ratio);
        const resampled = new Float32Array(resampledLength);

        for (let i = 0; i < resampledLength; i++) {
          const sourceIndex = Math.floor(i * ratio);
          resampled[i] = inputData[sourceIndex];
        }

        // Convert to Base64-encoded 16-bit PCM
        const base64Data = pcmToBase64(resampled);

        // Send to backend
        onAudioChunk(base64Data);
        ++chunkCountRef.current;
      };

      processorNodeRef.current = processor;

      // Connect: source → analyser → processor → destination
      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      console.log('[Audio] Recording started (PCM 16kHz)');

      // Start audio level monitoring
      monitorAudioLevel();

    } catch (err: any) {
      console.error('[Audio] Failed to start recording:', err);

      let errorMsg = 'Failed to access microphone';

      if (err.name === 'NotAllowedError') {
        errorMsg = 'Microphone permission denied. Please allow microphone access.';
      } else if (err.name === 'NotFoundError') {
        errorMsg = 'No microphone found. Please connect a microphone.';
      } else if (err.name === 'NotReadableError') {
        errorMsg = 'Microphone is already in use by another application.';
      } else if (err.message) {
        errorMsg = err.message;
      }

      setError(errorMsg);
      onError(errorMsg);
    }
  }, [isConnected, onAudioChunk, onError, monitorAudioLevel]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    console.log('[Audio] Stopping recording...');

    // Disconnect and clean up ScriptProcessorNode
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current = null;
    }

    // Stop all media stream tracks (releases microphone)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[Audio] Stopped track:', track.kind);
      });
      mediaStreamRef.current = null;
    }

    // Stop audio level monitoring
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clean up analyzer (but keep AudioContext for future use)
    analyserRef.current = null;

    setIsRecording(false);
    setAudioLevel(0);
    console.log('[Audio] Recording stopped');
  }, []);

  /**
   * Stop recording if connection is lost
   */
  useEffect(() => {
    if (!isConnected && isRecording) {
      console.warn('[Audio] Connection lost during recording - stopping');
      stopRecording();
      const errorMsg = 'Connection lost during recording';
      setError(errorMsg);
      onError(errorMsg);
    }
  }, [isConnected, isRecording, stopRecording, onError]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      console.log('[Audio] Cleaning up audio recording resources');
      stopRecording();

      // Close AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopRecording]);

  return {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
    error
  };
}
