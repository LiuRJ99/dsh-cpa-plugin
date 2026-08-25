import test from 'node:test'
import assert from 'node:assert/strict'
import { createCpaImageGenerationService } from '../lib/image-generation.js'

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff])
const PNG_B64 = Buffer.from(PNG_BYTES).toString('base64')
const JPEG_B64 = Buffer.from(JPEG_BYTES).toString('base64')

function createHarness(options = {}) {
  const calls = []
  const routes = options.routes ?? {
    gpt: { baseURL: 'http://cpa.example/v1', apiKeyEnv: 'CPA_KEY' },
    gemini: { baseURL: 'http://cpa.example/v1', apiKeyEnv: 'CPA_KEY' },
  }
  const credentials = options.credentials ?? { CPA_KEY: 'secret-token' }
  const fetchImpl = options.fetchImpl ?? (async () => new Response('{}', { status: 200 }))
  const service = createCpaImageGenerationService(
    (engine) => routes[engine],
    async (ref) => credentials[ref],
    {
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), init })
        return fetchImpl(url, init)
      },
    },
  )
  return { calls, service }
}

function assertLlmError(error, code, status) {
  assert.equal(error?.name, 'LlmError')
  assert.equal(error?.code, code)
  if (status !== undefined) {
    assert.match(String(error.message), new RegExp(`HTTP ${status}\\b`, 'u'))
  }
}

test('GPT maps engine to images/generations and decodes b64_json', async () => {
  const { calls, service } = createHarness({
    fetchImpl: async () => new Response(JSON.stringify({
      data: [{ b64_json: PNG_B64 }],
    }), { status: 200 }),
  })

  const image = await service.generate({
    engine: 'gpt',
    prompt: 'a blue circle',
    signal: new AbortController().signal,
  })

  assert.equal(calls[0].url, 'http://cpa.example/v1/images/generations')
  assert.equal(calls[0].init.headers.authorization, 'Bearer secret-token')
  assert.equal(JSON.parse(calls[0].init.body).model, 'gpt-image-2')
  assert.equal(JSON.parse(calls[0].init.body).n, 1)
  assert.deepEqual(image.data, PNG_BYTES)
  assert.equal(image.mediaType, 'image/png')
})

test('Gemini maps engine to chat completions and decodes message.images', async () => {
  const { calls, service } = createHarness({
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          images: [{
            image_url: {
              url: `data:image/jpeg;base64,${JPEG_B64}`,
            },
          }],
        },
      }],
    }), { status: 200 }),
  })

  const image = await service.generate({
    engine: 'gemini',
    prompt: 'a blue circle',
    signal: new AbortController().signal,
  })

  const body = JSON.parse(calls[0].init.body)
  assert.equal(calls[0].url, 'http://cpa.example/v1/chat/completions')
  assert.equal(body.model, 'gemini-3.1-flash-image')
  assert.deepEqual(body.messages, [{ role: 'user', content: 'a blue circle' }])
  assert.equal(body.stream, false)
  assert.deepEqual(image.data, JPEG_BYTES)
  assert.equal(image.mediaType, 'image/jpeg')
})

test('GPT falls back to data[0].url downloads without forwarding authorization', async () => {
  const { calls, service } = createHarness({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/images/generations')) {
        return new Response(JSON.stringify({
          data: [{ url: 'https://cdn.example/generated.png' }],
        }), { status: 200 })
      }
      return new Response(PNG_BYTES, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    },
  })

  const image = await service.generate({
    engine: 'gpt',
    prompt: 'a blue circle',
    signal: new AbortController().signal,
  })

  assert.equal(calls[1].url, 'https://cdn.example/generated.png')
  assert.equal(calls[1].init.headers?.authorization, undefined)
  assert.deepEqual(image.data, PNG_BYTES)
  assert.equal(image.mediaType, 'image/png')
})

test('rejects empty prompts before calling CPA', async () => {
  const { calls, service } = createHarness()
  await assert.rejects(
    service.generate({
      engine: 'gpt',
      prompt: '   ',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'INVALID_REQUEST')
      return true
    },
  )
  assert.equal(calls.length, 0)
})

test('rejects unsupported options without inventing wire fields', async () => {
  const { service } = createHarness()

  await assert.rejects(
    service.generate({
      engine: 'gpt',
      prompt: 'x',
      aspectRatio: '16:9',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'UNSUPPORTED_OPTION')
      return true
    },
  )

  await assert.rejects(
    service.generate({
      engine: 'gemini',
      prompt: 'x',
      imageSize: '1024x1024',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'UNSUPPORTED_OPTION')
      return true
    },
  )
})

test('rejects success responses that contain no image payload', async () => {
  const { service } = createHarness({
    fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
  })

  await assert.rejects(
    service.generate({
      engine: 'gpt',
      prompt: 'x',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'EMPTY_RESPONSE')
      return true
    },
  )
})

test('maps invalid JSON to INVALID_RESPONSE', async () => {
  const { service } = createHarness({
    fetchImpl: async () => new Response('{', { status: 200 }),
  })

  await assert.rejects(
    service.generate({
      engine: 'gpt',
      prompt: 'x',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'INVALID_RESPONSE')
      return true
    },
  )
})

test('maps non-2xx responses to safe upstream HTTP errors', async () => {
  const { service } = createHarness({
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: 'do not leak me' },
    }), { status: 502 }),
  })

  await assert.rejects(
    service.generate({
      engine: 'gemini',
      prompt: 'x',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'UPSTREAM_HTTP_ERROR', 502)
      assert.doesNotMatch(String(error.message), /do not leak me/u)
      return true
    },
  )
})

test('maps transport failures to a safe error without leaking endpoint details', async () => {
  const { service } = createHarness({
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED http://cpa.example/v1/images/generations')
    },
  })

  await assert.rejects(
    service.generate({
      engine: 'gpt',
      prompt: 'x',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'TRANSPORT')
      assert.equal(error.message, 'CPA image generation request failed')
      assert.doesNotMatch(String(error.message), /cpa\.example|ECONNREFUSED|images\/generations/u)
      return true
    },
  )
})

test('rejects unknown media types from Gemini data URLs', async () => {
  const { service } = createHarness({
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          images: [{
            image_url: { url: `data:image/svg+xml;base64,${PNG_B64}` },
          }],
        },
      }],
    }), { status: 200 }),
  })

  await assert.rejects(
    service.generate({
      engine: 'gemini',
      prompt: 'x',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'INVALID_RESPONSE')
      return true
    },
  )
})

test('rejects empty CPA credentials before sending the request', async () => {
  const { calls, service } = createHarness({
    credentials: { CPA_KEY: '   ' },
  })

  await assert.rejects(
    service.generate({
      engine: 'gpt',
      prompt: 'x',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'INVALID_REQUEST')
      return true
    },
  )
  assert.equal(calls.length, 0)
})

test('honors already-aborted signals', async () => {
  const controller = new AbortController()
  controller.abort(new Error('custom abort reason with endpoint http://cpa.example/v1'))
  const { calls, service } = createHarness()

  await assert.rejects(
    service.generate({
      engine: 'gpt',
      prompt: 'x',
      signal: controller.signal,
    }),
    (error) => {
      assertLlmError(error, 'ABORTED')
      assert.equal(error.message, 'CPA image generation request aborted')
      assert.notEqual(error, controller.signal.reason)
      assert.doesNotMatch(String(error.message), /custom abort reason|cpa\.example/u)
      return true
    },
  )
  assert.equal(calls.length, 0)
})

test('rejects zero-byte GPT url downloads', async () => {
  const { service } = createHarness({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/images/generations')) {
        return new Response(JSON.stringify({
          data: [{ url: 'https://cdn.example/empty.png' }],
        }), { status: 200 })
      }
      return new Response(new Uint8Array(0), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    },
  })

  await assert.rejects(
    service.generate({
      engine: 'gpt',
      prompt: 'x',
      signal: new AbortController().signal,
    }),
    (error) => {
      assertLlmError(error, 'EMPTY_RESPONSE')
      return true
    },
  )
})
