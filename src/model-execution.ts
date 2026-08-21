/** Optional provider-neutral bridge for syncing task execution state. */

export const MODEL_EXECUTION_SERVICE = 'dshModelExecution'

export type ModelExecutionSpeed = 'standard' | 'fast'

export interface ModelExecutionProvider {
  setSessionSpeed(
    sessionId: string,
    provider: string,
    model: string,
    speed: ModelExecutionSpeed,
  ): void | Promise<void>
}
