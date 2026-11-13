import workletUrl from './pcm-capture.worklet.js?url'
import { createResampler } from './resample'

export interface Capture {
  stop(): void
}

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  // Echo cancellation stays on: speaker output would otherwise trigger false barge-in.
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
}

/**
 * Start streaming the microphone as 16 kHz mono PCM16. The MediaStream is requested by the caller
 * inside the click handler, so the permission prompt is tied to a user gesture.
 */
export async function startCapture(stream: MediaStream, onChunk: (pcm: ArrayBuffer) => void, onLevel: (level: number) => void): Promise<Capture> {
  const context = new AudioContext()
  await context.audioWorklet.addModule(workletUrl)
  if (context.state === 'suspended') await context.resume()

  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, 'pcm-capture', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 })
  const resample = createResampler(context.sampleRate)
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const { pcm, peak } = resample(event.data)
    onLevel(peak)
    if (pcm.length) onChunk(pcm.slice().buffer)
  }
  source.connect(node)

  return {
    stop() {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    },
  }
}
