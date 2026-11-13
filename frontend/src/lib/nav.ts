/** Lets non-React code (the voice controller) navigate. The router registers itself on mount. */
let navigate: ((path: string) => void) | null = null

export function setNavigator(fn: ((path: string) => void) | null): void {
  navigate = fn
}

export function go(path: string): void {
  navigate?.(path)
}
