const OUTPUT_RATE = 24000

interface UtteranceClock { receivedMs: number; firstStart: number | null }

/**
 * Plays the agent's PCM16 24 kHz audio gaplessly and can drop everything at once on barge-in.
 * It also keeps a clock per utterance (milliseconds received and played), which the transcript
 * uses to reveal the agent's text in step with its voice.
 */
export class PcmPlayer {
  private context: AudioContext | null = null
  private nextStart = 0
  private sources = new Set<AudioBufferSourceNode>()
  private clocks = new Map<string, UtteranceClock>()
  private current: string | null = null

  /** Call inside a user gesture so the context is allowed to start. */
  unlock(): void {
    this.context ??= new AudioContext()
    if (this.context.state === 'suspended') void this.context.resume()
  }

  startUtterance(utteranceId: string): void {
    this.current = utteranceId
    this.clocks.set(utteranceId, { receivedMs: 0, firstStart: null })
    if (this.clocks.size > 20) this.clocks.delete(this.clocks.keys().next().value as string)
  }

  play(pcm: ArrayBuffer): void {
    const context = this.context
    if (!context || pcm.byteLength < 2) return
    const samples = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2))
    const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const start = Math.max(this.nextStart, context.currentTime + 0.02)
    source.start(start)
    this.nextStart = start + buffer.duration
    this.sources.add(source)
    source.onended = () => this.sources.delete(source)

    const clock = this.current ? this.clocks.get(this.current) : undefined
    if (clock) {
      clock.firstStart ??= start
      clock.receivedMs += buffer.duration * 1000
    }
  }

  /** Fraction of the received audio of an utterance that has been played, 0 to 1. */
  progress(utteranceId: string): number {
    const clock = this.clocks.get(utteranceId)
    if (!clock || !this.context || clock.firstStart === null || clock.receivedMs === 0) return clock ? 0 : 1
    const playedMs = (this.context.currentTime - clock.firstStart) * 1000
    return Math.max(0, Math.min(1, playedMs / clock.receivedMs))
  }

  /** Barge-in: stop everything that is playing or scheduled, now. */
  flush(): void {
    this.sources.forEach((source) => {
      source.onended = null
      try { source.stop() } catch { /* already stopped */ }
    })
    this.sources.clear()
    this.nextStart = 0
    this.current = null
  }

  close(): void {
    this.flush()
    this.clocks.clear()
    void this.context?.close()
    this.context = null
  }
}
