/**
 * Harness request-history conversion into pi-ai's Context vocabulary.
 *
 * The published dsh-llm-pi-ai package keeps this helper internal and does not
 * ship its TypeScript sources. Keep the CPA fast path self-contained so its
 * host bundle remains usable with the published runtime packages.
 */

import { contentHasImage, IMAGE_OFFLOAD_REQUIRED_CODE, LlmError, offloadedImageText, projectOffloadedImages, requiredImageOffload, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { Context as PiContext, ImageContent, Message as PiMessage, TextContent, Tool as PiTool } from '@earendil-works/pi-ai'
import { toPiAssistant } from './replay.ts'

function flattenText(message: RequestMessage): string {
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

function assertSupportedHistory(messages: readonly RequestMessage[]): void {
  for (const message of messages) {
    if (message.role === 'developer') throw new LlmError('Developer messages are not supported yet', 'UNSUPPORTED_CONTENT')
    if (message.content.some(block => block.type === 'tool-addition' || block.type === 'tool-removal')) {
      throw new LlmError('Tool-change blocks are not supported yet', 'UNSUPPORTED_CONTENT')
    }
    if (message.role !== 'user' && message.role !== 'tool' && contentHasImage(message.content)) {
      throw new LlmError(
        `pi-ai cannot represent an image in an in-history ${message.role} message`,
        'UNSUPPORTED_CONTENT',
      )
    }
  }
}

async function userContent(
  blocks: readonly ContentBlock[],
  attachments: AttachmentStore,
): Promise<string | (TextContent | ImageContent)[]> {
  const content: (TextContent | ImageContent)[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (block.text.length > 0) content.push({ type: 'text', text: block.text })
        break
      case 'image': {
        const stored = await attachments.readImage(block.attachment)
        content.push({
          type: 'image',
          data: Buffer.from(stored.data).toString('base64'),
          mimeType: stored.ref.mediaType,
        })
        break
      }
      default:
        break
    }
  }
  if (content.every(block => block.type === 'text')) return content.map(block => block.text).join('')
  return content
}

function toolsOf(options: GenerateOptions): PiTool[] | undefined {
  return options.tools?.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

function piContext(options: GenerateOptions, messages: PiMessage[], systemPrompt?: string): PiContext {
  const tools = toolsOf(options)
  return {
    ...systemPrompt !== undefined ? { systemPrompt } : {},
    messages,
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
  }
}

function textOnlyContext(options: GenerateOptions, onReplayDegrade?: (reason: string) => void): PiContext {
  assertSupportedHistory(options.messages)
  const { messages: history, systemPrompt } = splitSystemPrompt(options)
  const toolNames = new Map<ToolCallId, string>()
  const messages: PiMessage[] = []
  for (const message of history) {
    if (contentHasImage(message.content)) {
      throw new LlmError('pi-ai image conversion requires the durable attachment service', 'UNSUPPORTED_CONTENT')
    }
    if (message.role === 'system') {
      messages.push({ role: 'user', content: flattenText(message), timestamp: 0 })
      continue
    }
    if (message.role === 'assistant') {
      const assistant = toPiAssistant(message, onReplayDegrade)
      for (const block of assistant.content) if (block.type === 'toolCall') toolNames.set(ToolCallId(block.id), block.name)
      messages.push(assistant)
      continue
    }
    if (message.role === 'tool') {
      messages.push({
        role: 'toolResult',
        toolCallId: message.toolCallId,
        toolName: toolNames.get(message.toolCallId) ?? 'unknown',
        content: [{ type: 'text', text: flattenText(message) || '(no output)' }],
        isError: message.isError ?? false,
        timestamp: 0,
      })
      continue
    }
    messages.push({ role: 'user', content: flattenText(message), timestamp: 0 })
  }
  return piContext(options, messages, systemPrompt)
}

function splitSystemPrompt(options: GenerateOptions): { messages: readonly RequestMessage[], systemPrompt?: string } {
  if (options.system !== undefined) return { messages: options.messages, systemPrompt: options.system }
  const [first, ...rest] = options.messages
  if (first?.role !== 'system') return { messages: options.messages }
  const prompt = flattenText(first)
  return { messages: rest, ...prompt.length > 0 ? { systemPrompt: prompt } : {} }
}

export function toPiContext(
  options: GenerateOptions,
  attachments?: undefined,
  onReplayDegrade?: (reason: string) => void,
): PiContext
export function toPiContext(
  options: GenerateOptions,
  attachments: AttachmentStore,
  onReplayDegrade?: (reason: string) => void,
  maxRequestImageBytes?: number,
): Promise<PiContext>
export function toPiContext(
  options: GenerateOptions,
  attachments?: AttachmentStore,
  onReplayDegrade?: (reason: string) => void,
  maxRequestImageBytes?: number,
): PiContext | Promise<PiContext> {
  return attachments === undefined
    ? textOnlyContext(options, onReplayDegrade)
    : toPiContextWithImages(options, attachments, onReplayDegrade, maxRequestImageBytes)
}

async function toPiContextWithImages(
  options: GenerateOptions,
  attachments: AttachmentStore,
  onReplayDegrade?: (reason: string) => void,
  maxRequestImageBytes?: number,
): Promise<PiContext> {
  assertSupportedHistory(options.messages)
  const { messages: history, systemPrompt } = splitSystemPrompt(options)
  if (maxRequestImageBytes !== undefined) {
    const offloadImages = requiredImageOffload(history, {
      representation: 'base64', maxBytes: maxRequestImageBytes,
    }, block => block.attachment.bytes)
    if (offloadImages > 0) {
      throw new LlmError(`pi-ai request images exceed the ${maxRequestImageBytes}-byte base64 bound`, IMAGE_OFFLOAD_REQUIRED_CODE, { offloadImages })
    }
  }
  const requestMessages = projectOffloadedImages(history, ref => offloadedImageText(ref))
  const toolNames = new Map<ToolCallId, string>()
  const messages: PiMessage[] = []

  for (const message of requestMessages) {
    if (message.role === 'system') {
      messages.push({ role: 'user', content: flattenText(message), timestamp: 0 })
      continue
    }
    if (message.role === 'assistant') {
      const assistant = toPiAssistant(message, onReplayDegrade)
      for (const block of assistant.content) {
        if (block.type === 'toolCall') toolNames.set(ToolCallId(block.id), block.name)
      }
      messages.push(assistant)
      continue
    }
    const content = await userContent(message.content, attachments)
    if (message.role === 'tool') {
      messages.push({
        role: 'toolResult',
        toolCallId: message.toolCallId,
        toolName: toolNames.get(message.toolCallId) ?? 'unknown',
        content: typeof content === 'string'
          ? [{ type: 'text', text: content || '(no output)' }]
          : content,
        isError: message.isError ?? false,
        timestamp: 0,
      })
      continue
    }
    messages.push({ role: 'user', content, timestamp: 0 })
  }

  return piContext(options, messages, systemPrompt)
}
