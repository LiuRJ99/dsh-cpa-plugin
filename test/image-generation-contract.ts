import { IMAGE_GENERATION_SERVICE } from '@LiuRJ99/dsh-cpa-plugin/image-generation'
import type {
  CpaGeneratedImage,
  CpaImageEditRequest,
  CpaImageGenerationRequest,
  CpaImageGenerationService,
  CpaReferenceImage,
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

const reference: CpaReferenceImage = {
  data: new Uint8Array([1]),
  mediaType: 'image/png',
}

const editRequest: CpaImageEditRequest = {
  engine,
  prompt: 'edit consumer image',
  referenceImages: [reference],
  signal: new AbortController().signal,
}

const service: CpaImageGenerationService = {
  async generate(input) {
    const normalized: CpaImageGenerationRequest = input
    normalized.prompt satisfies string
    return generated
  },
  async edit(input) {
    const normalized: CpaImageEditRequest = input
    normalized.referenceImages satisfies readonly CpaReferenceImage[]
    return generated
  },
}

service.generate(request) satisfies Promise<CpaGeneratedImage>
service.edit?.(editRequest) satisfies Promise<CpaGeneratedImage> | undefined
IMAGE_GENERATION_SERVICE satisfies 'dshCpaImageGeneration'

type PublicContractModule = typeof import('@LiuRJ99/dsh-cpa-plugin/image-generation')
// @ts-expect-error Host-only factory must not be exported on the stable consumer subpath.
type HiddenFactory = PublicContractModule['createCpaImageGenerationService']

export {}
