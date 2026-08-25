import { IMAGE_GENERATION_SERVICE } from '@LiuRJ99/dsh-cpa-plugin/image-generation'
import type {
  CpaGeneratedImage,
  CpaImageGenerationRequest,
  CpaImageGenerationService,
  ImageEngine,
} from '@LiuRJ99/dsh-cpa-plugin/image-generation'

const engine: ImageEngine = 'gpt'
const request: CpaImageGenerationRequest = {
  engine,
  prompt: 'consumer prompt',
  signal: new AbortController().signal,
}

const generated: CpaGeneratedImage = {
  data: new Uint8Array(),
  mediaType: 'image/png',
}

const service: CpaImageGenerationService = {
  async generate(input) {
    const normalized: CpaImageGenerationRequest = input
    normalized.prompt satisfies string
    return generated
  },
}

service.generate(request) satisfies Promise<CpaGeneratedImage>
IMAGE_GENERATION_SERVICE satisfies 'dshCpaImageGeneration'

type PublicContractModule = typeof import('@LiuRJ99/dsh-cpa-plugin/image-generation')
// @ts-expect-error Host-only factory must not be exported on the stable consumer subpath.
type HiddenFactory = PublicContractModule['createCpaImageGenerationService']

export {}
