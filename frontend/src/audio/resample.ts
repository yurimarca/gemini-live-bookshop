export const TARGET_RATE = 16000

/**
 * Streaming linear-interpolation resampler to 16 kHz PCM16. Keeps its position across blocks,
 * so block boundaries add no clicks. Linear interpolation is enough for speech at these rates.
 */
export function createResampler(inputRate: number, targetRate = TARGET_RATE) {
  const step = inputRate / targetRate
  let t = 0        // position of the next output sample, in input samples, relative to this block
  let previous = 0 // last sample of the previous block (index -1)

  return function push(input: Float32Array): { pcm: Int16Array; peak: number } {
    const n = input.length
    const out = new Int16Array(Math.ceil((n - t) / step) + 1)
    let count = 0
    let peak = 0
    while (t < n - 1) {
      const i = Math.floor(t)
      const left = i < 0 ? previous : input[i]
      const right = input[i + 1]
      const sample = Math.max(-1, Math.min(1, left + (right - left) * (t - i)))
      peak = Math.max(peak, Math.abs(sample))
      out[count++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      t += step
    }
    t -= n
    if (n > 0) previous = input[n - 1]
    return { pcm: out.subarray(0, count), peak }
  }
}
