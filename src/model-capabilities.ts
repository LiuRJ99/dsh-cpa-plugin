/**
 * Provider-neutral capability service shared with optional client plugins.
 *
 * CPA owns the upstream fetch and cache; consumers only see this stable shape
 * and must treat the service as optional.
 */

export const MODEL_CAPABILITY_SERVICE = 'dshModelCapabilities'
export const PRIORITY_SERVICE_TIER = 'priority'

export interface ModelServiceTier {
  id: string
  name?: string
  description?: string
}

export interface ModelCapability {
  provider: string
  model: string
  serviceTiers: readonly ModelServiceTier[]
  /** True when this model can produce an image through a provider image service. */
  imageGeneration?: boolean
  /** Image protocol family for image-capable models. */
  imageEngine?: 'gpt' | 'gemini'
  /** Explicit image editing capability, when known. */
  imageEdit?: boolean
}

export interface ModelCapabilityProvider {
  listModelCapabilities(signal?: AbortSignal): Promise<readonly ModelCapability[]>
}
