// AudioWorklet: forwards microphone samples to the main thread in batches of about 40 ms.
// It replaces the deprecated ScriptProcessorNode and does no processing of its own, so the audio
// thread stays cheap; resampling to 16 kHz happens in resample.ts, where it is unit-tested.
const BATCH = 2048

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(BATCH)
    this.filled = 0
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input) return true
    let offset = 0
    while (offset < input.length) {
      const take = Math.min(input.length - offset, BATCH - this.filled)
      this.buffer.set(input.subarray(offset, offset + take), this.filled)
      this.filled += take
      offset += take
      if (this.filled === BATCH) {
        const out = this.buffer
        this.port.postMessage(out, [out.buffer])
        this.buffer = new Float32Array(BATCH)
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCapture)
