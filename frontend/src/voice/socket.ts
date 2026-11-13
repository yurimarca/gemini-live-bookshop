import { PROTOCOL_VERSION, parseServerEvent, type ClientEvent, type Locale, type ServerEvent } from '../protocol/events'

export interface LiveSocketHandlers {
  onEvent(event: ServerEvent): void
  onAudio(pcm: ArrayBuffer): void
  /** `endedByServer` is true when a session.ended event arrived before the close. */
  onClose(code: number, endedByServer: boolean): void
}

export interface StartInfo { idToken: string; appCheckToken?: string; locale: Locale; a2uiCapabilities: Record<string, unknown> }

/**
 * Protocol 2 client. The ID token travels in the first frame, never in the URL, because browsers
 * cannot set headers on a WebSocket and query strings end up in request logs.
 */
export class LiveSocket {
  private ws: WebSocket | null = null
  private endedByServer = false
  private heartbeat: ReturnType<typeof setInterval> | null = null

  constructor(private url: string, private handlers: LiveSocketHandlers, private make: (url: string) => WebSocket = (u) => new WebSocket(u)) {}

  connect(start: StartInfo): void {
    const ws = this.make(this.url)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.endedByServer = false
    ws.onopen = () => {
      this.send({
        type: 'session.start', protocol: PROTOCOL_VERSION, id_token: start.idToken, locale: start.locale,
        a2ui_capabilities: start.a2uiCapabilities, ...(start.appCheckToken ? { app_check_token: start.appCheckToken } : {}),
      })
      this.heartbeat = setInterval(() => this.send({ type: 'ping' }), 25_000)
    }
    ws.onmessage = (message: MessageEvent) => {
      if (typeof message.data !== 'string') {
        this.handlers.onAudio(message.data as ArrayBuffer)
        return
      }
      const event = parseServerEvent(message.data)
      if (!event) return
      if (event.type === 'session.ended') this.endedByServer = true
      this.handlers.onEvent(event)
    }
    ws.onclose = (close: CloseEvent) => {
      if (this.heartbeat) clearInterval(this.heartbeat)
      this.heartbeat = null
      if (this.ws === ws) this.ws = null
      if (close.code !== 1000 && !this.endedByServer) {
        // Codes only, no content: the gateway log has the reason (e.g. 4403 = origin or App Check).
        console.warn(`[voice] socket closed: code=${close.code} origin=${location.origin}`)
      }
      this.handlers.onClose(close.code, this.endedByServer)
    }
  }

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  send(event: ClientEvent): void {
    if (this.open) this.ws!.send(JSON.stringify(event))
  }

  sendAudio(pcm: ArrayBuffer): void {
    // Drop audio rather than queue it when the socket is backed up: late audio is worse than none.
    if (this.open && this.ws!.bufferedAmount < 256_000) this.ws!.send(pcm)
  }

  /** Ask the server to end the session; it answers with session.ended and closes. */
  stop(): void {
    if (!this.ws) return
    this.send({ type: 'session.stop' })
    const ws = this.ws
    setTimeout(() => { if (ws.readyState !== WebSocket.CLOSED) ws.close(1000) }, 1500)
  }
}
