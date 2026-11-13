import { describe, expect, it } from 'vitest'
import { createResampler } from '../audio/resample'
import { LiveSocket } from '../voice/socket'
import { formatPrice } from '../lib/format'
import { CloseCode, catalogPath, closeKind, parseServerEvent, shouldRetry, type ServerEvent } from './events'

describe('protocol parsing', () => {
  it('parses known events and keeps snake_case fields', () => {
    const event = parseServerEvent('{"type":"tool.started","seq":3,"ts":1.5,"call_id":"c1","agent":"voice","tool":"search_books","behavior":"BLOCKING","runs_on":"gateway"}')
    expect(event).toMatchObject({ type: 'tool.started', call_id: 'c1', seq: 3 })
  })

  it('parses the page-driving events the voice agent sends', () => {
    expect(parseServerEvent('{"type":"ui.locale","locale":"pt-BR","seq":1,"ts":1}')).toMatchObject({ locale: 'pt-BR' })
    expect(parseServerEvent('{"type":"ui.navigate","path":"/","params":{"subject":"Poetry","lang":"por"},"seq":2,"ts":1}'))
      .toMatchObject({ params: { subject: 'Poetry', lang: 'por' } })
    expect(parseServerEvent('{"type":"ui.command","command":"highlight_book","book_id":"OL1W","seq":3,"ts":1}')).not.toBeNull()
  })

  it('builds catalog URLs from known filter keys only', () => {
    expect(catalogPath({ subject: 'Science Fiction', lang: 'eng', sort: 'year_new' })).toBe('/?subject=Science+Fiction&lang=eng&sort=year_new')
    expect(catalogPath({ q: 'machado', sort: 'popular' })).toBe('/?q=machado')
    expect(catalogPath({})).toBe('/')
    expect(catalogPath({ q: 'x', next: '//evil.example' } as never)).toBe('/?q=x')
  })

  it('formats one fictional number as $ in English and R$ in Portuguese, never converted', () => {
    expect(formatPrice(1290, 'en')).toBe('$12.90')
    expect(formatPrice(1290, 'pt-BR')).toBe('R$\u00a012,90')
  })

  it('drops unknown or malformed frames instead of throwing', () => {
    expect(parseServerEvent('{"type":"future.event","seq":1,"ts":1}')).toBeNull()
    expect(parseServerEvent('not json')).toBeNull()
    expect(parseServerEvent('"text"')).toBeNull()
    expect(parseServerEvent('{"seq":1}')).toBeNull()
  })
})

describe('close codes', () => {
  it('never retries a 4xxx close', () => {
    for (const code of [CloseCode.BAD_START, CloseCode.BAD_TOKEN, CloseCode.FORBIDDEN, CloseCode.TIME_LIMIT, CloseCode.QUOTA, CloseCode.AT_CAPACITY]) {
      expect(shouldRetry(code, 0, false)).toBe(false)
    }
    expect(shouldRetry(CloseCode.NORMAL, 0, false)).toBe(false)
  })

  it('retries a dropped connection at most twice, and never after session.ended', () => {
    for (const code of [1006, 1011, 1012]) {
      expect(shouldRetry(code, 0, false)).toBe(true)
      expect(shouldRetry(code, 1, false)).toBe(true)
      expect(shouldRetry(code, 2, false)).toBe(false)
      expect(shouldRetry(code, 0, true)).toBe(false)
    }
  })

  it('maps codes to a message kind', () => {
    expect(closeKind(4408)).toBe('time_limit')
    expect(closeKind(4429)).toBe('quota')
    expect(closeKind(4503)).toBe('capacity')
    expect(closeKind(4401)).toBe('auth')
    expect(closeKind(1006)).toBe('lost')
    expect(closeKind(1000)).toBe('ended')
  })
})

class FakeWebSocket {
  static OPEN = 1
  readyState = 1
  bufferedAmount = 0
  binaryType = ''
  sent: (string | ArrayBuffer)[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  constructor(public url: string) {}
  send(data: string | ArrayBuffer) { this.sent.push(data) }
  close(code = 1000) { this.readyState = 3; this.onclose?.({ code }) }
}

describe('LiveSocket', () => {
  const open = () => {
    const events: ServerEvent[] = []
    const audio: ArrayBuffer[] = []
    const closes: [number, boolean][] = []
    let fake!: FakeWebSocket
    const socket = new LiveSocket('wss://gateway.example/ws/live', {
      onEvent: (e) => events.push(e), onAudio: (a) => audio.push(a), onClose: (code, ended) => closes.push([code, ended]),
    }, (url) => (fake = new FakeWebSocket(url)) as unknown as WebSocket)
    socket.connect({ idToken: 'secret-token', locale: 'pt-BR', a2uiCapabilities: { '1.0': {} } })
    fake.onopen?.()
    return { socket, fake, events, audio, closes }
  }

  it('sends the token in the first frame, never in the URL', () => {
    const { fake } = open()
    expect(fake.url).not.toContain('secret-token')
    expect(fake.binaryType).toBe('arraybuffer')
    expect(JSON.parse(fake.sent[0] as string)).toEqual({ type: 'session.start', protocol: 2, id_token: 'secret-token', locale: 'pt-BR', a2ui_capabilities: { '1.0': {} } })
  })

  it('routes binary frames to audio and text frames to events', () => {
    const { fake, events, audio } = open()
    fake.onmessage?.({ data: new ArrayBuffer(8) })
    fake.onmessage?.({ data: '{"type":"turn.complete","seq":1,"ts":1}' })
    fake.onmessage?.({ data: '{"type":"nonsense"}' })
    expect(audio).toHaveLength(1)
    expect(events.map((e) => e.type)).toEqual(['turn.complete'])
  })

  it('reports whether the server said goodbye before closing', () => {
    const { fake, closes } = open()
    fake.onmessage?.({ data: '{"type":"session.ended","reason":"time_limit","seq":9,"ts":1}' })
    fake.close(4408)
    expect(closes).toEqual([[4408, true]])
  })

  it('drops audio when the socket is backed up', () => {
    const { socket, fake } = open()
    socket.sendAudio(new ArrayBuffer(4))
    fake.bufferedAmount = 1_000_000
    socket.sendAudio(new ArrayBuffer(4))
    expect(fake.sent.filter((s) => typeof s !== 'string')).toHaveLength(1)
  })
})

describe('resampler', () => {
  it('converts 48 kHz to 16 kHz with no drift across uneven blocks', () => {
    const push = createResampler(48000)
    let total = 0
    for (const size of [2048, 2048, 1000, 3049, 128]) total += push(new Float32Array(size).fill(0.5)).pcm.length
    expect(Math.abs(total - (2048 + 2048 + 1000 + 3049 + 128) / 3)).toBeLessThanOrEqual(1)
  })

  it('keeps amplitude, clamps, and reports the peak', () => {
    const { pcm, peak } = createResampler(16000)(new Float32Array([0, 0.5, -0.5, 2, -2, 0]))
    expect(Array.from(pcm.slice(0, 5))).toEqual([0, 16383, -16384, 32767, -32768])
    expect(peak).toBe(1)
  })

  it('interpolates across a block boundary', () => {
    const push = createResampler(32000)
    const first = push(new Float32Array([0, 0.2, 0.4]))
    const second = push(new Float32Array([0.6, 0.8, 1.0]))
    const values = [...first.pcm, ...second.pcm].map((v) => Math.round((v / 0x7fff) * 10) / 10)
    expect(values).toEqual([0, 0.4, 0.8])
  })
})
