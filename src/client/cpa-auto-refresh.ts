/**
 * Browser-side auto-refresh driver for the CPA add-on.
 *
 * The Host half refreshes the model catalog and the account/quota snapshot on
 * its own timer (see `src/index.js` / `src/index.ts`), but those results only
 * update the Host's in-memory account cache — nothing pushes them to the Web
 * client. The Settings surface and the composer indicator therefore showed
 * stale quota/status until the user manually opened the menu or clicked
 * Refresh.
 *
 * This driver polls the Host's cached account snapshot (`/cpa` `accounts`
 * RPC, which is cache-friendly and does not start another upstream refresh)
 * on the configured `refreshIntervalMs`. Manual mode (`0`) disables polling,
 * changing the interval re-arms the next tick, and background failures are
 * silent — the next tick retries.
 */
import type { CpaClient } from './cpa-client.ts'

/** The minimal CpaClient surface this driver depends on (test-seam friendly). */
export interface CpaAutoRefreshSource {
  store: {
    getSnapshot(): { refreshIntervalMs: number; managementKeyConfigured?: boolean }
    subscribe(listener: () => void): () => void
  }
  pullAccounts(): Promise<unknown>
}

export type Schedule = (callback: () => void, delay: number) => unknown
export type Cancel = (handle: unknown) => void

const defaultSchedule: Schedule = (callback, delay) => setTimeout(callback, delay)
const defaultCancel: Cancel = (handle) => {
  clearTimeout(handle as ReturnType<typeof setTimeout>)
}

export class CpaAutoRefresh {
  private timer: unknown | undefined
  private running = false
  private stopped = false
  private armedInterval = 0
  private readonly unsubscribe: () => void

  constructor(
    private readonly cpa: CpaAutoRefreshSource,
    private readonly schedule: Schedule = defaultSchedule,
    private readonly cancel: Cancel = defaultCancel,
  ) {
    // Re-arm whenever the interval changes (the Settings dropdown writes the
    // new value through `set-refresh-interval` and updates the client store).
    this.unsubscribe = cpa.store.subscribe(() => this.arm())
    this.arm()
  }

  /** Whether background polling should run at all right now. */
  private active(): boolean {
    const state = this.cpa.store.getSnapshot()
    return state.refreshIntervalMs > 0 && state.managementKeyConfigured !== false
  }

  private arm(): void {
    if (this.stopped) return
    if (!this.active()) {
      if (this.timer !== undefined) {
        this.cancel(this.timer)
        this.timer = undefined
      }
      return
    }
    const interval = this.cpa.store.getSnapshot().refreshIntervalMs
    if (this.timer !== undefined && interval !== this.armedInterval) {
      this.cancel(this.timer)
      this.timer = undefined
    }
    if (this.timer !== undefined) return
    this.armedInterval = interval
    this.timer = this.schedule(() => {
      this.timer = undefined
      void this.tick()
    }, interval)
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) return
    this.running = true
    try {
      await this.cpa.pullAccounts()
    } catch {
      // A background pull must not interrupt the UI. The next tick retries.
    } finally {
      this.running = false
      this.arm()
    }
  }

  dispose(): void {
    this.stopped = true
    this.unsubscribe()
    if (this.timer !== undefined) {
      this.cancel(this.timer)
      this.timer = undefined
    }
  }
}

/** Construct a driver for a full CpaClient instance. */
export function startCpaAutoRefresh(
  cpa: CpaClient,
  schedule?: Schedule,
  cancel?: Cancel,
): CpaAutoRefresh {
  return new CpaAutoRefresh(cpa, schedule, cancel)
}
