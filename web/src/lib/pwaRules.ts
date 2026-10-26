/** Pure gate for service-worker registration (architect-AC12); unit-tested. */
export interface SwEnv {
  /** `import.meta.env.PROD`: never in Vite dev, so HMR modules can't be pinned. */
  prod: boolean;
  /** `window.isSecureContext`: HTTPS (tailscale serve) or localhost. Plain http://<ip> → false. */
  secure: boolean;
  /** `'serviceWorker' in navigator` */
  hasSw: boolean;
}

export function shouldRegister(env: SwEnv): boolean {
  return env.prod && env.secure && env.hasSw;
}
