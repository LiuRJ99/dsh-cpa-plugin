import test from 'node:test'
import assert from 'node:assert/strict'
import { isHiddenImageModel, modelProfileOf, readCodexCatalog } from '../src/catalog.js'
import {
  buildImageRequest,
  imageAttachmentRefLike,
  imageGenerationsURL,
  isImageGenerationModel,
  latestUserPrompt,
  streamCpaImage,
} from '../src/cpa-image-stream.js'

const PNG_B64 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
).toString('base64')

function fakeAttachments(stored = []) {
  return {
    saved: stored,
    saveImage(input) {
      const ref = imageAttachmentRefLike({ bytes: input.data?.length ?? 1, mediaType: input.mediaType })
      stored.push({ input, ref })
      return Promise.resolve(ref)
    },
  }
}

test('catalog re-admits hidden gpt-image-2 and gpt-image-1.5 models', () => {
  const models = readCodexCatalog({
    models: [
      { slug: 'gpt-5.6-sol', display_name: 'GPT 5.6 Sol', visibility: 'show' },
      { slug: 'gpt-image-2', display_name: 'GPT Image 2', visibility: 'hide' },
      { slug: 'gpt-image-1.5', display_name: 'GPT Image 1.5', visibility: 'hide' },
      { slug: 'hidden-secret', display_name: 'Hidden', visibility: 'hide' },
    ],
  }, {})
  const ids = models.map((model) => model.id)
  assert.ok(ids.includes('gpt-image-2'), 'gpt-image-2 should be admitted despite visibility:hide')
  assert.ok(ids.includes('gpt-image-1.5'), 'gpt-image-1.5 should be admitted despite visibility:hide')
  assert.ok(!ids.includes('hidden-secret'), 'other hidden models stay excluded')
  const image = models.find((model) => model.id === 'gpt-image-2')
  assert.equal(image.imageGeneration, true)
})

test('isHiddenImageModel only matches image models', () => {
  assert.equal(isHiddenImageModel({ slug: 'gpt-image-2', visibility: 'hide' }), true)
  assert.equal(isHiddenImageModel({ slug: 'gpt-image-1.5', visibility: 'hide' }), true)
  assert.equal(isHiddenImageModel({ slug: 'gpt-5.6-sol', visibility: 'hide' }), false)
  assert.equal(isHiddenImageModel({ slug: 'gpt-image-2' }), false)
})

test('modelProfileOf flags imageGeneration for mini/hd variants', () => {
  const profile = modelProfileOf({ slug: 'gpt-image-2-mini', visibility: 'hide' }, {})
  assert.equal(profile?.imageGeneration, true)
})

test('imageGenerationsURL preserves /v1 and appends the endpoint', () => {
  assert.equal(
    imageGenerationsURL('http://127.0.0.1:8317/v1'),
    'http://127.0.0.1:8317/v1/images/generations',
  )
  assert.equal(
    imageGenerationsURL('http://127.0.0.1:8317'),
    'http://127.0.0.1:8317/images/generations',
  )
})

test('isImageGenerationModel recognizes the owned ids', () => {
  assert.equal(isImageGenerationModel('gpt-image-2'), true)
  assert.equal(isImageGenerationModel('gpt-image-1.5'), true)
  assert.equal(isImageGenerationModel('gpt-image-2-hd'), true)
  assert.equal(isImageGenerationModel('gpt-5.6-sol'), false)
})

test('latestUserPrompt prefers the most recent user text', () => {
  const prompt = latestUserPrompt([
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'reply' },
    { role: 'user', content: [{ type: 'text', text: 'latest prompt' }] },
  ])
  assert.equal(prompt, 'latest prompt')
})

test('buildImageRequest emits the fixed generation envelope', () => {
  assert.deepEqual(buildImageRequest('gpt-image-2', 'a cat'), {
    model: 'gpt-image-2',
    prompt: 'a cat',
    n: 1,
    output_format: 'png',
    size: '1024x1024',
    quality: 'auto',
  })
  assert.deepEqual(buildImageRequest('gpt-image-2', 'x', { outputFormat: 'webp', quality: 'hd', size: '512x512' }), {
    model: 'gpt-image-2',
    prompt: 'x',
    n: 1,
    output_format: 'webp',
    size: '512x512',
    quality: 'hd',
  })
})

test('streamCpaImage posts to images/generations and yields image chunks via the attachment store', async () => {
  let postedURL
  let postedBody
  const fetchImpl = async (url, init) => {
    postedURL = String(url)
    postedBody = JSON.parse(init.body)
    return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64, output_format: 'png' }] }), { status: 200 })
  }
  const attachments = fakeAttachments()
  const chunks = []
  for await (const chunk of streamCpaImage(
    {
      provider: 'CLIProxyAPI',
      model: 'gpt-image-2',
      messages: [{ role: 'user', content: 'draw a cat' }],
    },
    { provider: 'CLIProxyAPI', baseURL: 'http://127.0.0.1:8317/v1', apiKeyEnv: 'KEY' },
    async () => 'secret',
    () => attachments,
    { fetchImpl },
  )) {
    chunks.push(chunk)
  }

  assert.equal(postedURL, 'http://127.0.0.1:8317/v1/images/generations')
  assert.equal(postedBody.model, 'gpt-image-2')
  assert.equal(postedBody.prompt, 'draw a cat')
  assert.equal(postedBody.n, 1)
  assert.equal(postedBody.output_format, 'png')
  assert.equal(postedBody.size, '1024x1024')
  assert.equal(postedBody.quality, 'auto')

  assert.equal(chunks[0].type, 'block-start')
  assert.equal(chunks[0].blockType, 'image')
  assert.equal(chunks[1].type, 'block-end')
  assert.equal(chunks[1].block.type, 'image')
  assert.ok(chunks[1].block.attachment.attachmentId !== undefined)
  assert.equal(chunks[2].type, 'usage')
  assert.equal(chunks[3].type, 'finish')
  assert.equal(chunks[3].reason.kind, 'stop')
  assert.equal(attachments.saved.length, 1)
})

test('streamCpaImage supports a url response by fetching and committing bytes', async () => {
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/images/generations')) {
      return new Response(JSON.stringify({ data: [{ url: 'http://img/cat.png' }] }), { status: 200 })
    }
    return new Response(Buffer.from('fakebytes'), { status: 200 })
  }
  const attachments = fakeAttachments()
  const chunks = []
  for await (const chunk of streamCpaImage(
    { model: 'gpt-image-2', messages: [{ role: 'user', content: 'draw' }] },
    { provider: 'CLIProxyAPI', baseURL: 'http://127.0.0.1:8317/v1' },
    async () => undefined,
    () => attachments,
    { fetchImpl },
  )) {
    chunks.push(chunk)
  }
  assert.equal(chunks[1].block.type, 'image')
  assert.equal(attachments.saved.length, 1)
})

test('streamCpaImage reports upstream HTTP errors with response details', async () => {
  const attachments = fakeAttachments()
  await assert.rejects(
    (async () => {
      for await (const _chunk of streamCpaImage(
        { model: 'gpt-image-2', messages: [{ role: 'user', content: 'draw' }] },
        { baseURL: 'http://127.0.0.1:8317/v1', apiKeyEnv: 'KEY' },
        async () => 'secret',
        () => attachments,
        {
          fetchImpl: async () => new Response(
            JSON.stringify({ error: { message: 'image generation disabled' } }),
            { status: 403 },
          ),
        },
      )) {
        // consume the generator so the rejection surfaces
      }
    })(),
    /HTTP 403.*image generation disabled/,
  )
})

test('streamCpaImage throws when there is no user prompt', async () => {
  const attachments = fakeAttachments()
  await assert.rejects(
    (async () => {
      for await (const _chunk of streamCpaImage(
        { model: 'gpt-image-2', messages: [{ role: 'assistant', content: 'hi' }] },
        { baseURL: 'http://127.0.0.1:8317/v1' },
        async () => undefined,
        () => attachments,
        { fetchImpl: async () => new Response('{}') },
      )) {
        // consume the generator so the rejection surfaces
      }
    })(),
    /requires a user text prompt/,
  )
})

test('streamCpaImage requires the attachment service', async () => {
  await assert.rejects(
    (async () => {
      for await (const _chunk of streamCpaImage(
        { model: 'gpt-image-2', messages: [{ role: 'user', content: 'draw' }] },
        { baseURL: 'http://127.0.0.1:8317/v1' },
        async () => undefined,
        () => undefined,
        { fetchImpl: async () => new Response('{}') },
      )) {
        // consume the generator so the rejection surfaces
      }
    })(),
    /requires the attachment service/,
  )
})
