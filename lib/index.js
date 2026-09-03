import { IMAGE_GENERATION_SERVICE, createCpaImageGenerationService } from "./image-generation-internal.js";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { CONTEXT_WINDOW_EXCEEDED_CODE, EMPTY_RESPONSE_CODE, LlmError, QUOTA_EXCEEDED_CODE, ToolCallId, attributionHeaders, contentHasImage, isContextWindowExceededError, isQuotaExceededError, offloadRequestImagesWithPolicy, offloadedImageText } from "@deepseek-ai/dsh-llm";
import { stream } from "@earendil-works/pi-ai/api/openai-responses";
import { isContextOverflow } from "@earendil-works/pi-ai";
//#region src/catalog.js
const IMAGE_ONLY_MODEL_IDS = /* @__PURE__ */ new Set([
	"gpt-image-1.5",
	"gpt-image-2",
	"gemini-3.1-flash-image"
]);
function isImageOnlyModel(value) {
	const id = typeof value === "string" ? modelIdOf({ id: value }) : modelIdOf(value);
	return id !== void 0 && IMAGE_ONLY_MODEL_IDS.has(id);
}
function modelIdOf(entry) {
	const value = entry?.id ?? entry?.slug ?? entry?.model;
	return typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
}
//#endregion
//#region src/pi-ai/replay.ts
/**
* Durable pi-ai replay metadata and assistant-history reconstruction.
*
* This is the small compatibility slice used by the CPA fast path. The
* published dsh-llm-pi-ai package keeps these helpers internal and does not
* ship its TypeScript sources, so the plugin owns the adapter boundary here.
*/
function parseArguments(raw) {
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
	} catch {}
	return {};
}
function emptyPiUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			total: 0
		}
	};
}
function toPiReplayState(message) {
	return {
		response: {
			kind: "pi-ai",
			version: 2,
			api: message.api,
			provider: message.provider,
			model: message.model,
			...message.responseModel === void 0 ? {} : { responseModel: message.responseModel },
			...message.responseId === void 0 ? {} : { responseId: message.responseId },
			stopReason: message.stopReason
		},
		blocks: message.content.map((block) => {
			switch (block.type) {
				case "text": return {
					type: "text",
					...block.textSignature === void 0 ? {} : { textSignature: block.textSignature }
				};
				case "thinking": return {
					type: "reasoning",
					...block.thinkingSignature === void 0 ? {} : { thinkingSignature: block.thinkingSignature },
					...block.redacted === void 0 ? {} : { redacted: block.redacted }
				};
				case "toolCall": return {
					type: "tool-call",
					...block.thoughtSignature === void 0 ? {} : { thoughtSignature: block.thoughtSignature }
				};
			}
		})
	};
}
function invalidReplay(message) {
	throw new LlmError(`invalid pi-ai replay state: ${message}`, "INVALID_REPLAY_STATE");
}
function readReplayState(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return invalidReplay("expected a replay envelope");
	const envelope = value;
	const rawResponse = envelope["response"];
	if (typeof rawResponse !== "object" || rawResponse === null || Array.isArray(rawResponse)) return invalidReplay("expected a response object");
	const response = rawResponse;
	if (response["kind"] !== "pi-ai") return invalidReplay("unknown state kind");
	if (response["version"] !== 2) return invalidReplay(`unsupported version ${String(response["version"])}`);
	for (const key of [
		"api",
		"provider",
		"model"
	]) if (typeof response[key] !== "string" || response[key].length === 0) return invalidReplay(`${key} must be a non-empty string`);
	if (![
		"stop",
		"length",
		"toolUse",
		"error",
		"aborted"
	].includes(String(response["stopReason"]))) return invalidReplay("unknown stopReason");
	if (response["responseModel"] !== void 0 && typeof response["responseModel"] !== "string") return invalidReplay("responseModel must be a string");
	if (response["responseId"] !== void 0 && typeof response["responseId"] !== "string") return invalidReplay("responseId must be a string");
	const blocks = envelope["blocks"];
	if (!Array.isArray(blocks)) return invalidReplay("blocks must be an array");
	for (const [index, value] of blocks.entries()) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return invalidReplay(`block ${index} must be an object`);
		const block = value;
		if (![
			"text",
			"reasoning",
			"tool-call"
		].includes(String(block["type"]))) return invalidReplay(`block ${index} has an unknown type`);
		for (const signature of [
			"textSignature",
			"thinkingSignature",
			"thoughtSignature"
		]) if (block[signature] !== void 0 && typeof block[signature] !== "string") return invalidReplay(`block ${index} ${signature} must be a string`);
		if (block["redacted"] !== void 0 && typeof block["redacted"] !== "boolean") return invalidReplay(`block ${index} redacted must be boolean`);
	}
	return {
		response,
		blocks
	};
}
function foreignAssistant(message) {
	const source = message.source.kind === "model" ? message.source : void 0;
	const content = [];
	for (const block of message.content) switch (block.type) {
		case "text":
			content.push({
				type: "text",
				text: block.text
			});
			break;
		case "reasoning":
			content.push({
				type: "thinking",
				thinking: block.text
			});
			break;
		case "tool-call":
			content.push({
				type: "toolCall",
				id: block.id,
				name: block.name,
				arguments: parseArguments(block.arguments)
			});
			break;
		case "image": throw new LlmError("pi-ai chat history cannot represent structured assistant image output", "UNSUPPORTED_CONTENT");
	}
	return {
		role: "assistant",
		content,
		api: "dsh-foreign",
		provider: source?.provider ?? "dsh-foreign",
		model: source?.model ?? "dsh-foreign",
		usage: emptyPiUsage(),
		stopReason: content.some((piece) => piece.type === "toolCall") ? "toolUse" : "stop",
		timestamp: 0
	};
}
function replayedAssistant(message, source, rawState) {
	const state = readReplayState(rawState);
	if (state.response.provider !== source.provider) return invalidReplay("provider does not match assistant source");
	if (state.response.model !== source.model) return invalidReplay("model does not match assistant source");
	if (state.blocks.length !== message.content.length) return invalidReplay("block count does not match assistant content");
	return {
		role: "assistant",
		content: message.content.map((block, index) => {
			const replay = state.blocks[index];
			if (replay === void 0 || replay.type !== block.type) return invalidReplay(`block ${index} does not match assistant content`);
			switch (block.type) {
				case "text": return {
					type: "text",
					text: block.text,
					...replay.type === "text" && replay.textSignature !== void 0 ? { textSignature: replay.textSignature } : {}
				};
				case "reasoning": return {
					type: "thinking",
					thinking: block.text,
					...replay.type === "reasoning" && replay.thinkingSignature !== void 0 ? { thinkingSignature: replay.thinkingSignature } : {},
					...replay.type === "reasoning" && replay.redacted !== void 0 ? { redacted: replay.redacted } : {}
				};
				case "tool-call": return {
					type: "toolCall",
					id: block.id,
					name: block.name,
					arguments: parseArguments(block.arguments),
					...replay.type === "tool-call" && replay.thoughtSignature !== void 0 ? { thoughtSignature: replay.thoughtSignature } : {}
				};
				default: return invalidReplay(`block ${index} has an unsupported Harness type`);
			}
		}),
		api: state.response.api,
		provider: state.response.provider,
		model: state.response.model,
		...state.response.responseModel === void 0 ? {} : { responseModel: state.response.responseModel },
		...state.response.responseId === void 0 ? {} : { responseId: state.response.responseId },
		usage: emptyPiUsage(),
		stopReason: state.response.stopReason,
		timestamp: 0
	};
}
function toPiAssistant(message, onDegrade) {
	const source = message.source;
	if (source.kind !== "model" || source.replayState === void 0) return foreignAssistant(message);
	try {
		return replayedAssistant(message, source, source.replayState);
	} catch (error) {
		if (!(error instanceof LlmError) || error.code !== "INVALID_REPLAY_STATE") throw error;
		onDegrade?.(error.message);
		return foreignAssistant(message);
	}
}
//#endregion
//#region src/pi-ai/context.ts
/**
* Harness request-history conversion into pi-ai's Context vocabulary.
*
* The published dsh-llm-pi-ai package keeps this helper internal and does not
* ship its TypeScript sources. Keep the CPA fast path self-contained so its
* host bundle remains usable with the published runtime packages.
*/
function flattenText(message) {
	return message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function toolResultText(blocks) {
	return blocks.map((block) => block.type === "text" ? block.text : block.type === "tool-result" ? toolResultText(block.content) : "").join("");
}
function assertSupportedImageRoles(messages) {
	for (const message of messages) if (message.role !== "user" && contentHasImage(message.content)) throw new LlmError(`pi-ai cannot represent an image in an in-history ${message.role} message`, "UNSUPPORTED_CONTENT");
}
async function userContent(blocks, attachments) {
	const content = [];
	for (const block of blocks) switch (block.type) {
		case "text":
			if (block.text.length > 0) content.push({
				type: "text",
				text: block.text
			});
			break;
		case "image": {
			const stored = await attachments.readImage(block.attachment);
			content.push({
				type: "image",
				data: Buffer.from(stored.data).toString("base64"),
				mimeType: stored.ref.mediaType
			});
			break;
		}
		case "tool-result": {
			const nested = await userContent(block.content, attachments);
			if (typeof nested === "string") {
				if (nested.length > 0) content.push({
					type: "text",
					text: nested
				});
			} else content.push(...nested);
			break;
		}
	}
	if (content.every((block) => block.type === "text")) return content.map((block) => block.text).join("");
	return content;
}
function toolsOf(options) {
	return options.tools?.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters
	}));
}
function piContext(options, messages) {
	const tools = toolsOf(options);
	return {
		...options.system !== void 0 ? { systemPrompt: options.system } : {},
		messages,
		...tools !== void 0 && tools.length > 0 ? { tools } : {}
	};
}
function textOnlyContext(options, onReplayDegrade) {
	const toolNames = /* @__PURE__ */ new Map();
	const messages = [];
	for (const message of options.messages) {
		if (contentHasImage(message.content)) throw new LlmError("pi-ai image conversion requires the durable attachment service", "UNSUPPORTED_CONTENT");
		if (message.role === "system") {
			messages.push({
				role: "user",
				content: flattenText(message),
				timestamp: 0
			});
			continue;
		}
		if (message.role === "assistant") {
			const assistant = toPiAssistant(message, onReplayDegrade);
			for (const block of assistant.content) if (block.type === "toolCall") toolNames.set(ToolCallId(block.id), block.name);
			messages.push(assistant);
			continue;
		}
		const text = flattenText(message);
		const results = message.content.filter((block) => block.type === "tool-result");
		if (text.length > 0 || results.length === 0) messages.push({
			role: "user",
			content: text,
			timestamp: 0
		});
		for (const result of results) messages.push({
			role: "toolResult",
			toolCallId: result.toolCallId,
			toolName: toolNames.get(result.toolCallId) ?? "unknown",
			content: [{
				type: "text",
				text: toolResultText(result.content) || "(no output)"
			}],
			isError: result.isError ?? false,
			timestamp: 0
		});
	}
	return piContext(options, messages);
}
function toPiContext(options, attachments, onReplayDegrade, maxRequestImageBytes) {
	return attachments === void 0 ? textOnlyContext(options, onReplayDegrade) : toPiContextWithImages(options, attachments, onReplayDegrade, maxRequestImageBytes);
}
async function toPiContextWithImages(options, attachments, onReplayDegrade, maxRequestImageBytes) {
	assertSupportedImageRoles(options.messages);
	const requestMessages = offloadRequestImagesWithPolicy(options.messages, {
		representation: "base64",
		byteQuantum: 1,
		...maxRequestImageBytes === void 0 ? {} : { maxBytes: maxRequestImageBytes },
		placeholder: (ref) => offloadedImageText(ref)
	});
	const toolNames = /* @__PURE__ */ new Map();
	const messages = [];
	for (const message of requestMessages) {
		if (message.role === "system") {
			messages.push({
				role: "user",
				content: flattenText(message),
				timestamp: 0
			});
			continue;
		}
		if (message.role === "assistant") {
			const assistant = toPiAssistant(message, onReplayDegrade);
			for (const block of assistant.content) if (block.type === "toolCall") toolNames.set(ToolCallId(block.id), block.name);
			messages.push(assistant);
			continue;
		}
		const content = await userContent(message.content.filter((block) => block.type !== "tool-result"), attachments);
		const results = message.content.filter((block) => block.type === "tool-result");
		if (content.length > 0 || results.length === 0) messages.push({
			role: "user",
			content,
			timestamp: 0
		});
		for (const result of results) {
			const resultContent = await userContent(result.content, attachments);
			messages.push({
				role: "toolResult",
				toolCallId: result.toolCallId,
				toolName: toolNames.get(result.toolCallId) ?? "unknown",
				content: typeof resultContent === "string" ? [{
					type: "text",
					text: resultContent || "(no output)"
				}] : resultContent,
				isError: result.isError ?? false,
				timestamp: 0
			});
		}
	}
	return piContext(options, messages);
}
//#endregion
//#region src/pi-ai/stream.ts
/**
* pi-ai assistant event translation into the Harness streaming protocol.
*
* Kept local for the CPA fast path because dsh-llm-pi-ai does not expose this
* helper from its published entry point.
*/
function mapUsage(usage) {
	return {
		inputTokens: usage.input,
		outputTokens: usage.output,
		...usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {},
		...usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {}
	};
}
function classifyPiAiError(message) {
	if (/\b(?:401|403)\b/.test(message)) return "AUTH";
	if (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE;
	if (/\b429\b|rate.?limit/i.test(message)) return "RATE_LIMIT";
	if (/\b413\b|failed to buffer the request body:\s*length limit exceeded|payload too large|request body too large/i.test(message)) return "INVALID_REQUEST";
	if (/\b400\b|invalid.?request/i.test(message)) return "INVALID_REQUEST";
	if (/\b5\d\d\b/.test(message)) return "SERVER";
	if (/\btime(?:d)?\s*out\b|timeout/i.test(message)) return "TIMEOUT";
	if (/stream ended (?:before|without)\b/i.test(message)) return "TRANSPORT";
	if (/\b(?:network|connection|socket|fetch)\b|\bECONN[A-Z]+\b/i.test(message) || /\b(?:other side closed|HTTP2 request did not get a response|WebSocket closed unexpectedly)\b/i.test(message) || /\bterminated\b|premature close/i.test(message)) return "TRANSPORT";
	return "PI_AI_ERROR";
}
function mapStopReason(message, contextWindow) {
	const piAiOverflow = isContextOverflow(message, contextWindow);
	const harnessOverflow = message.stopReason === "error" && message.errorMessage !== void 0 && isContextWindowExceededError(message.errorMessage);
	if (piAiOverflow || harnessOverflow) return {
		kind: "error",
		failure: {
			message: message.errorMessage ?? `pi-ai detected context overflow for model "${message.model}"`,
			code: CONTEXT_WINDOW_EXCEEDED_CODE
		}
	};
	switch (message.stopReason) {
		case "stop":
			if (message.content.length === 0) return {
				kind: "error",
				failure: {
					message: `model "${message.model}" returned a completed response with no content`,
					code: EMPTY_RESPONSE_CODE
				}
			};
			return { kind: "stop" };
		case "length": return { kind: "max-tokens" };
		case "toolUse": return { kind: "tool-calls" };
		case "aborted": return {
			kind: "aborted",
			failure: {
				message: message.errorMessage ?? "pi-ai stream aborted",
				code: "ABORTED"
			}
		};
		case "error": {
			const text = message.errorMessage ?? "pi-ai stream error";
			return {
				kind: "error",
				failure: {
					message: text,
					code: classifyPiAiError(text)
				}
			};
		}
	}
}
async function* toStreamChunks(events, contextWindow) {
	const toolIds = /* @__PURE__ */ new Map();
	for await (const event of events) switch (event.type) {
		case "start": break;
		case "text_start":
			yield {
				type: "block-start",
				index: event.contentIndex,
				blockType: "text"
			};
			break;
		case "text_delta":
			yield {
				type: "text-delta",
				index: event.contentIndex,
				text: event.delta
			};
			break;
		case "text_end":
			yield {
				type: "block-end",
				index: event.contentIndex,
				block: {
					type: "text",
					text: event.content
				}
			};
			break;
		case "thinking_start":
			yield {
				type: "block-start",
				index: event.contentIndex,
				blockType: "reasoning"
			};
			break;
		case "thinking_delta":
			yield {
				type: "reasoning-delta",
				index: event.contentIndex,
				text: event.delta
			};
			break;
		case "thinking_end":
			yield {
				type: "block-end",
				index: event.contentIndex,
				block: {
					type: "reasoning",
					text: event.content
				}
			};
			break;
		case "toolcall_start": {
			const partial = event.partial.content[event.contentIndex];
			const id = partial?.type === "toolCall" ? partial.id : "";
			const name = partial?.type === "toolCall" ? partial.name : "";
			toolIds.set(event.contentIndex, {
				id,
				name
			});
			yield {
				type: "block-start",
				index: event.contentIndex,
				blockType: "tool-call"
			};
			break;
		}
		case "toolcall_delta": {
			const known = toolIds.get(event.contentIndex);
			yield {
				type: "tool-call-delta",
				index: event.contentIndex,
				id: ToolCallId(known?.id ?? ""),
				...known?.name !== void 0 && known.name.length > 0 ? { name: known.name } : {},
				argumentsDelta: event.delta
			};
			break;
		}
		case "toolcall_end":
			yield {
				type: "block-end",
				index: event.contentIndex,
				block: {
					type: "tool-call",
					id: ToolCallId(event.toolCall.id),
					name: event.toolCall.name,
					arguments: JSON.stringify(event.toolCall.arguments)
				}
			};
			break;
		case "done":
			yield {
				type: "usage",
				usage: mapUsage(event.message.usage)
			};
			yield {
				type: "finish",
				reason: mapStopReason(event.message, contextWindow),
				replayState: toPiReplayState(event.message)
			};
			return;
		case "error":
			yield {
				type: "usage",
				usage: mapUsage(event.error.usage)
			};
			yield {
				type: "finish",
				reason: mapStopReason(event.error, contextWindow)
			};
			return;
	}
	throw new LlmError("pi-ai event stream ended without done/error", "STREAM_CLOSED");
}
//#endregion
//#region src/cpa-fast-stream.ts
/**
* The optional Fast path for CLIProXyAPI's Codex Responses models.
*
* The Host keeps this implementation behind the `llm/stream` waterfall and
* only calls it after the model catalog has advertised the `priority` service
* tier. Older Harness runtimes may carry the task tier through the optional
* execution bridge instead of a typed request field; the downstream CPA call
* always receives the effective `priority` tier. The normal provider route and
* all other providers remain unchanged.
*/
async function* streamCpaFast(options, route, resolveApiKey, resolveAttachments) {
	if (options.stop !== void 0) throw new LlmError("CLIProXyAPI Responses does not support stop sequences", "UNSUPPORTED_OPTION");
	const configured = route.models.find((model) => model.id === options.model);
	const efforts = reasoningEfforts(configured);
	const requestedEffort = options.reasoningEffort === void 0 ? void 0 : String(options.reasoningEffort);
	if (requestedEffort !== void 0 && requestedEffort !== "off" && !efforts.includes(requestedEffort)) throw new LlmError(`CLIProXyAPI model "${options.model}" does not support reasoning effort "${requestedEffort}"`, "UNSUPPORTED_REASONING_EFFORT");
	const model = cpaModel(route, configured, options.model, efforts);
	const containsImage = options.messages.some((message) => contentHasImage(message.content));
	const attachments = containsImage ? resolveAttachments?.() : void 0;
	if (containsImage && attachments === void 0) throw new LlmError("CLIProXyAPI image input requires the attachment service", "UNSUPPORTED_CONTENT");
	const context = attachments === void 0 ? toPiContext(options) : await toPiContext(options, attachments);
	const apiKey = route.apiKeyEnv === void 0 ? void 0 : await resolveApiKey(route.apiKeyEnv);
	yield* toStreamChunks(stream(model, context, {
		...apiKey === void 0 ? {} : { apiKey },
		...requestedEffort === void 0 || requestedEffort === "off" ? {} : { reasoningEffort: requestedEffort },
		...options.temperature === void 0 ? {} : { temperature: options.temperature },
		...options.maxTokens === void 0 ? {} : { maxTokens: options.maxTokens },
		...options.sessionId === void 0 ? {} : { sessionId: String(options.sessionId) },
		signal: options.signal,
		headers: attributionHeaders(),
		maxRetries: 0,
		serviceTier: "priority"
	}), model.contextWindow);
}
function cpaModel(route, configured, id, efforts) {
	const thinkingLevelMap = Object.fromEntries(efforts.map((effort) => [effort, effort]));
	return {
		id,
		name: configured?.name ?? id,
		api: "openai-responses",
		provider: route.provider,
		baseUrl: route.baseURL,
		reasoning: efforts.length > 0,
		...efforts.length === 0 ? {} : { thinkingLevelMap },
		input: configured?.input?.length === 0 ? ["text"] : configured?.input === void 0 ? ["text"] : [...configured.input],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0
		},
		contextWindow: configured?.contextWindow ?? 262144,
		maxTokens: configured?.maxTokens ?? 32768
	};
}
function reasoningEfforts(configured) {
	return configured?.reasoningEfforts === void 0 ? [] : [...configured.reasoningEfforts];
}
//#endregion
//#region src/model-discovery.ts
const MAX_RESPONSE_BYTES = 4194304;
const DEFAULT_TIMEOUT_MS = 15e3;
/**
* Read CLIProxyAPI's richer model listing for the settings page.
*
* Harness' generic pi-ai discovery only understands the OpenAI `data` shape
* and deliberately returns a small metadata projection. CLIProxyAPI's `/v1/
* models` endpoint has historically returned either `models` or `data`, so
* this adapter accepts both forms while keeping the model route owned by the
* native `llm-pi-ai` service.
*/
async function discoverCpaModels(request, resolveStoredApiKey, signal) {
	const url = `${normalizeBaseURL(request.baseURL)}/models?client_version=dsh-cpa-plugin`;
	const apiKey = request.apiKey?.trim() || await resolveStoredApiKey();
	const controller = new AbortController();
	const forwardAbort = () => {
		controller.abort(signal?.reason);
	};
	const timer = setTimeout(() => {
		controller.abort(/* @__PURE__ */ new Error(`CLIProXyAPI model discovery timed out after ${DEFAULT_TIMEOUT_MS} ms`));
	}, DEFAULT_TIMEOUT_MS);
	if (signal?.aborted) forwardAbort();
	else signal?.addEventListener("abort", forwardAbort, { once: true });
	try {
		const response = await fetch(url, {
			method: "GET",
			signal: controller.signal,
			headers: {
				accept: "application/json",
				...apiKey === void 0 ? {} : { authorization: `Bearer ${apiKey}` },
				...attributionHeaders()
			}
		});
		if (!response.ok) throw new Error(`CLIProXyAPI model catalog returned HTTP ${response.status}`);
		const models = readModels(await readJson(response));
		if (models.length === 0) throw new Error("CLIProXyAPI returned no usable models");
		return models;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", forwardAbort);
	}
}
function normalizeBaseURL(value) {
	const baseURL = String(value ?? "").trim().replace(/\/+$/, "");
	if (baseURL === "") throw new Error("CLIProXyAPI model endpoint is empty");
	let parsed;
	try {
		parsed = new URL(baseURL);
	} catch (error) {
		throw new Error("CLIProXyAPI model endpoint must be a valid URL", { cause: error });
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("CLIProXyAPI model endpoint must use HTTP or HTTPS");
	return baseURL;
}
async function readJson(response) {
	const declared = Number(response.headers.get("content-length") ?? NaN);
	if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
		await response.body?.cancel();
		throw new Error("CLIProXyAPI model catalog exceeds 4 MiB");
	}
	const text = await response.text();
	if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error("CLIProXyAPI model catalog exceeds 4 MiB");
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error("CLIProXyAPI model catalog did not return usable JSON", { cause: error });
	}
}
function readModels(value) {
	const root = record(value);
	const entries = Array.isArray(root?.models) ? root.models : Array.isArray(root?.data) ? root.data : [];
	const seen = /* @__PURE__ */ new Set();
	const models = [];
	for (const entryValue of entries) {
		const entry = record(entryValue);
		const id = text(entry?.slug, entry?.id, entry?.model);
		if (id === void 0 || seen.has(id)) continue;
		seen.add(id);
		const name = text(entry?.display_name, entry?.name, entry?.description, id);
		const contextWindow = positiveInteger(entry?.max_context_window, entry?.context_window, entry?.context_length);
		const maxTokens = positiveInteger(entry?.max_output_tokens, entry?.max_completion_tokens, entry?.max_tokens);
		models.push({
			id,
			...name === void 0 ? {} : { name },
			...contextWindow === void 0 ? {} : { contextWindow },
			...maxTokens === void 0 ? {} : { maxTokens }
		});
	}
	return models;
}
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function text(...values) {
	for (const value of values) if (typeof value === "string" && value.trim() !== "") return value.trim();
}
function positiveInteger(...values) {
	for (const value of values) {
		if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
		if (typeof value === "string" && /^\d+$/.test(value.trim())) {
			const parsed = Number(value.trim());
			if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
		}
	}
}
//#endregion
//#region src/model-capabilities.ts
/**
* Provider-neutral capability service shared with optional client plugins.
*
* CPA owns the upstream fetch and cache; consumers only see this stable shape
* and must treat the service as optional.
*/
const MODEL_CAPABILITY_SERVICE = "dshModelCapabilities";
const PRIORITY_SERVICE_TIER = "priority";
//#endregion
//#region src/model-execution.ts
/** Optional provider-neutral bridge for syncing task execution state. */
const MODEL_EXECUTION_SERVICE = "dshModelExecution";
//#endregion
//#region src/index.ts
const name = "dsh-cpa-plugin";
/** The model settings namespace whose CPA route carries the endpoint/models. */
const MODEL_SETTINGS_NS = "llm-pi-ai";
const MODEL_DISCOVERY_NS = "llm-cliproxyapi";
const MODEL_KEY_REF = "CPA_MODEL_API_KEY";
/** The native CLIProxyAPI provider's credential reference. */
const NATIVE_MODEL_KEY_REF = "DSH_CLIPROXY_API_KEY";
const MODEL_REFRESH_EVENT = "dsh-cpa/refresh-models";
const REFRESH_SETTINGS_NS = "dsh-cpa-plugin";
const REFRESH_INTERVALS = [
	0,
	3e5,
	18e5,
	36e5,
	108e5,
	18e6
];
const RefreshSettings = z.object({ refreshIntervalMs: z.natural().min(0).default(3e5) });
const Config = z.object({
	endpoint: z.string().default("http://localhost:8317"),
	providerId: z.string().default("cpa"),
	managementKeyEnv: z.string().default("CPA_MANAGEMENT_KEY"),
	timeoutMs: z.natural().min(1e3).default(8e3),
	refreshIntervalMs: z.natural().min(0).default(3e5),
	registerDiscovery: z.boolean().default(true)
});
const inject = [];
/** Apply the Host half without touching Harness or CLIProxyAPI source. */
function apply(ctx, config) {
	let readCredential = async (ref) => process.env[ref];
	let accountCacheKey = "";
	let accountCache;
	let accountRefreshPromise;
	const selectedBySession = /* @__PURE__ */ new Map();
	let defaultSelectedAccount;
	const speedBySessionModel = /* @__PURE__ */ new Map();
	const fastModelIds = /* @__PURE__ */ new Set();
	let capabilitiesCacheKey = "";
	let capabilitiesCache;
	let capabilitiesPromise;
	let capabilitiesPromiseKey = "";
	let capabilitiesEpoch = 0;
	const refreshEntry = { refreshIntervalMs: normalizeRefreshInterval(config.refreshIntervalMs) };
	ctx.inject(["settings"], (scope) => {
		scope.settings.installSection(ctx, REFRESH_SETTINGS_NS, RefreshSettings, refreshEntry, {
			setSource: () => {},
			onChange: () => {}
		});
	});
	ctx.inject(["credentials"], (scope) => {
		readCredential = async (ref) => {
			try {
				return (await scope.credentials.resolve(credentialRef(ref)))?.value;
			} catch (error) {
				return process.env[ref];
			}
		};
	});
	/**
	* The native CLIProxyAPI settings surface historically stored the model key
	* under DSH_CLIPROXY_API_KEY, while the add-on model editor defaults to
	* CPA_MODEL_API_KEY. Image generation is an add-on capability, so accept
	* either known reference and keep one DSH installation from requiring the
	* user to enter the same key twice.
	*/
	const readImageCredential = async (ref) => {
		const primary = await readCredential(ref);
		if (primary !== void 0 && primary.trim() !== "") return primary;
		if (ref !== MODEL_KEY_REF && ref !== NATIVE_MODEL_KEY_REF) return primary;
		const fallback = await readCredential(ref === MODEL_KEY_REF ? NATIVE_MODEL_KEY_REF : MODEL_KEY_REF);
		return fallback !== void 0 && fallback.trim() !== "" ? fallback : primary;
	};
	const imageService = createCpaImageGenerationService((_engine) => {
		const route = cpaFastRoute(ctx, effectiveConfig(ctx, config));
		return route === void 0 ? void 0 : {
			baseURL: route.baseURL,
			apiKeyEnv: route.apiKeyEnv
		};
	}, readImageCredential);
	ctx.provide(IMAGE_GENERATION_SERVICE, imageService);
	const capabilityCacheKeyOf = (currentConfig) => `${currentConfig.endpoint}\u0000${currentConfig.providerId}`;
	const applyCapabilities = (value, key) => {
		capabilitiesCacheKey = key;
		capabilitiesCache = value;
		fastModelIds.clear();
		for (const model of value.models) {
			if (!model.serviceTiers.some((tier) => tier.id === "priority")) continue;
			if (isImageOnlyModel(model.id)) continue;
			fastModelIds.add(model.id);
			for (const alias of model.aliases ?? []) if (!isImageOnlyModel(alias)) fastModelIds.add(alias);
		}
		return value;
	};
	const invalidateModelCapabilities = () => {
		capabilitiesEpoch += 1;
		capabilitiesCacheKey = "";
		capabilitiesCache = void 0;
		capabilitiesPromise = void 0;
		capabilitiesPromiseKey = "";
		fastModelIds.clear();
	};
	const loadModelCapabilities = (signal) => {
		const epoch = capabilitiesEpoch;
		const currentConfig = effectiveConfig(ctx, config);
		const key = capabilityCacheKeyOf(currentConfig);
		if (capabilitiesCache !== void 0 && capabilitiesCacheKey === key) return Promise.resolve(capabilitiesCache);
		if (capabilitiesPromise !== void 0 && capabilitiesPromiseKey === key) return capabilitiesPromise;
		if (capabilitiesPromise !== void 0 && capabilitiesPromiseKey !== key) invalidateModelCapabilities();
		const pending = fetchModelCapabilities(ctx, currentConfig, readCredential, signal).then((value) => {
			if (epoch !== capabilitiesEpoch) return loadModelCapabilities(signal);
			return applyCapabilities(value, key);
		});
		capabilitiesPromise = pending;
		capabilitiesPromiseKey = key;
		pending.then(() => {
			if (capabilitiesPromise === pending) {
				capabilitiesPromise = void 0;
				capabilitiesPromiseKey = "";
			}
		}, () => {
			if (capabilitiesPromise === pending) {
				capabilitiesPromise = void 0;
				capabilitiesPromiseKey = "";
			}
		});
		return pending;
	};
	ctx.provide(MODEL_CAPABILITY_SERVICE, { listModelCapabilities: async (signal) => {
		const value = await loadModelCapabilities(signal ?? new AbortController().signal);
		const provider = effectiveConfig(ctx, config).providerId;
		return value.models.flatMap((model) => [model.id, ...model.aliases ?? []].map((modelId) => ({
			provider,
			model: modelId,
			serviceTiers: model.serviceTiers
		})));
	} });
	ctx.provide(MODEL_EXECUTION_SERVICE, { setSessionSpeed: (sessionId, provider, model, speed) => {
		if (provider !== effectiveConfig(ctx, config).providerId) return;
		const key = speedKey(sessionId, model);
		if (speed === "fast" && fastModelIds.has(model)) speedBySessionModel.set(key, "fast");
		else speedBySessionModel.delete(key);
	} });
	if (config.registerDiscovery !== false) ctx.inject(["llm"], (scope) => {
		scope.llm.registerModelDiscovery(MODEL_DISCOVERY_NS, (request, signal) => discoverCpaModels(request, () => readCredential(MODEL_KEY_REF), signal));
	});
	const handleCpaStream = (options, next) => {
		const currentConfig = effectiveConfig(ctx, config);
		if (options.provider !== currentConfig.providerId || options.sessionId === void 0 || fastModelIds.has(options.model) === false) return next();
		const extension = options;
		const key = speedKey(String(options.sessionId), options.model);
		const requestedTier = extension.serviceTier === PRIORITY_SERVICE_TIER;
		if (requestedTier) speedBySessionModel.set(key, "fast");
		if (!requestedTier && speedBySessionModel.get(key) !== "fast") return next();
		const route = cpaFastRoute(ctx, currentConfig);
		if (route === void 0) return next();
		return streamCpaFast(options, route, readCredential, () => ctx.get("attachments"));
	};
	ctx.on("llm/stream", handleCpaStream);
	const cacheKeyOf = (currentConfig) => `${currentConfig.endpoint}\u0000${currentConfig.providerId}`;
	const refreshAccounts = (signal) => {
		if (accountRefreshPromise !== void 0) return accountRefreshPromise;
		const currentConfig = effectiveConfig(ctx, config);
		const promise = fetchAccounts(currentConfig, readCredential, signal, true).then((value) => {
			accountCacheKey = cacheKeyOf(currentConfig);
			accountCache = value;
			return value;
		});
		accountRefreshPromise = promise;
		const clear = () => {
			if (accountRefreshPromise === promise) accountRefreshPromise = void 0;
		};
		promise.then(clear, clear);
		return promise;
	};
	const readAccounts = async (signal) => {
		const currentConfig = effectiveConfig(ctx, config);
		const key = cacheKeyOf(currentConfig);
		if (accountCache !== void 0 && accountCacheKey === key) return accountCache;
		const value = await fetchAccounts(currentConfig, readCredential, signal, false);
		accountCacheKey = key;
		accountCache = value;
		return value;
	};
	ctx.inject(["connection"], (scope) => {
		scope.get("connection").rpc.handle("/cpa", async (endpoint, payload, signal) => {
			switch (endpoint) {
				case "config": return ok(await configView(ctx, effectiveConfig(ctx, config), readCredential));
				case "set-refresh-interval": {
					const intervalMs = parseRefreshInterval(payload);
					const settings = ctx.get("settings");
					if (settings === void 0) throw new Error("settings service is unavailable");
					await settings.mutate(REFRESH_SETTINGS_NS, [{
						op: "set",
						path: ["refreshIntervalMs"],
						value: intervalMs
					}]);
					invalidateModelCapabilities();
					await refreshModelCatalog(ctx, signal);
					const current = await readAccounts(signal);
					return ok({
						...current.quotaFetchedAt === void 0 ? await refreshAccounts(signal) : current,
						refreshIntervalMs: effectiveRefreshInterval(ctx, config)
					});
				}
				case "accounts": return ok(await readAccounts(signal));
				case "refresh":
					invalidateModelCapabilities();
					await refreshModelCatalog(ctx, signal);
					return ok(await refreshAccounts(signal));
				case "account-models": {
					const request = parseAccountModelsRequest(payload);
					return ok(await fetchAccountModels(effectiveConfig(ctx, config), readCredential, request, signal));
				}
				case "model-capabilities": return ok(await loadModelCapabilities(signal));
				case "model-input-capabilities": return ok(await fetchModelInputCapabilities(ctx, signal));
				case "select-speed": {
					const selection = parseSpeedSelection(payload);
					if (selection.speed === "fast" && fastModelIds.has(selection.model) === false) try {
						await loadModelCapabilities(signal);
					} catch {}
					const speed = selection.speed === "fast" && fastModelIds.has(selection.model) ? "fast" : "standard";
					speedBySessionModel.set(speedKey(selection.sessionId, selection.model), speed);
					return ok({ selectedSpeed: speed });
				}
				case "session-speed": {
					const selection = parseSessionSpeed(payload);
					const key = speedKey(selection.sessionId, selection.model);
					const speed = speedBySessionModel.get(key);
					return ok({
						sessionId: selection.sessionId,
						model: selection.model,
						...speed === void 0 ? {} : { speed }
					});
				}
				case "select-account": {
					const selection = parseSelection(payload);
					selectedBySession.set(selection.sessionId, selection.authIndex);
					if (selection.persistDefault !== false) defaultSelectedAccount = selection.authIndex;
					return ok({ selected: selection.authIndex });
				}
				case "account-selection": {
					const sessionId = parseSessionId(payload);
					return ok({ selected: selectedBySession.get(sessionId) ?? defaultSelectedAccount });
				}
				case "reset-quota": {
					const authIndex = parseAuthIndex(payload);
					await requestCpa(effectiveConfig(ctx, config), readCredential, "/v0/management/reset-quota", {
						method: "POST",
						body: JSON.stringify({ auth_index: authIndex })
					}, signal);
					await refreshAccounts(signal);
					return ok({ reset: true });
				}
				default: throw new Error(`dsh-cpa-plugin: unknown endpoint ${endpoint}`);
			}
		});
	});
	return {
		refreshAccounts,
		readAccounts
	};
}
/**
* The Web settings proxy already exposes the pi-ai provider namespace. The
* CPA model submodule writes `providers.cpa.baseURL` there, so the Host reads
* that value for management calls as well and keeps the YAML endpoint only
* as the bootstrap fallback before a model route exists.
*/
function effectiveConfig(ctx, config) {
	const value = ctx.get("settings")?.get(MODEL_SETTINGS_NS);
	const providers = valueObject(valueObject(value)?.providers);
	const providerId = providerCandidates(config).find((candidate) => valueObject(providers?.[candidate]) !== void 0) ?? config.providerId;
	const baseURL = stringValue(valueObject(valueObject(providers?.[providerId]))?.baseURL);
	return {
		...config,
		providerId,
		...baseURL === void 0 ? {} : { endpoint: managementEndpoint(baseURL) }
	};
}
/**
* `CLIProxyAPI` is the upstream provider id. Older plugin builds saved the
* same route under `cpa`; accept either namespace, preserving the preferred
* id supplied by the caller when both profiles exist.
*/
function providerCandidates(config) {
	const candidates = [config.providerId];
	if (config.providerId === "CLIProxyAPI") candidates.push("cpa");
	else if (config.providerId === "cpa") candidates.push("CLIProxyAPI");
	return [...new Set(candidates)];
}
function managementEndpoint(value) {
	return value.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}
function ok(value) {
	return {
		ok: true,
		value
	};
}
async function refreshModelCatalog(ctx, signal) {
	if (signal.aborted) throw signal.reason;
	const parallel = ctx.parallel;
	if (typeof parallel === "function") await parallel.call(ctx, MODEL_REFRESH_EVENT);
	if (signal.aborted) throw signal.reason;
}
function effectiveRefreshInterval(ctx, config) {
	return normalizeRefreshInterval(valueObject(ctx.get("settings")?.get(REFRESH_SETTINGS_NS))?.refreshIntervalMs ?? config.refreshIntervalMs);
}
function normalizeRefreshInterval(value) {
	const parsed = optionalNumberValue(value);
	return parsed !== void 0 && REFRESH_INTERVALS.includes(parsed) ? parsed : 3e5;
}
function parseRefreshInterval(value) {
	const parsed = optionalNumberValue(valueObject(value)?.refreshIntervalMs);
	if (parsed === void 0 || !REFRESH_INTERVALS.includes(parsed)) throw new Error("invalid CLIProxyAPI refresh interval");
	return parsed;
}
async function configView(ctx, config, readCredential) {
	return {
		endpoint: config.endpoint,
		providerId: config.providerId,
		managementKeyEnv: config.managementKeyEnv,
		managementKeyConfigured: Boolean(await readCredential(config.managementKeyEnv)),
		refreshIntervalMs: effectiveRefreshInterval(ctx, config)
	};
}
/** Read the settings-owned CPA model route without exposing its key to the browser. */
function cpaFastRoute(ctx, config) {
	const value = ctx.get("settings")?.get(MODEL_SETTINGS_NS);
	const profile = valueObject(valueObject(valueObject(valueObject(value)?.providers))?.[config.providerId]);
	if ((stringValue(profile?.api) ?? "openai-responses") !== "openai-responses") return void 0;
	const baseURL = stringValue(profile?.baseURL) ?? modelEndpoint(config.endpoint);
	const models = (Array.isArray(profile?.models) ? profile.models : []).flatMap((modelValue) => {
		const model = valueObject(modelValue);
		const id = stringValue(model?.id);
		if (id === void 0) return [];
		const reasoning = model?.reasoningEfforts === false ? [] : objectKeys(model?.reasoningEfforts);
		return [{
			id,
			...stringValue(model?.name) === void 0 ? {} : { name: stringValue(model?.name) },
			...Array.isArray(model?.input) ? { input: model.input.filter((value) => value === "text" || value === "image") } : {},
			...reasoning.length === 0 ? {} : { reasoningEfforts: reasoning },
			...positiveNumber(model?.contextWindow) === void 0 ? {} : { contextWindow: positiveNumber(model?.contextWindow) },
			...positiveNumber(model?.maxTokens) === void 0 ? {} : { maxTokens: positiveNumber(model?.maxTokens) }
		}];
	});
	return {
		provider: config.providerId,
		baseURL: modelEndpoint(baseURL),
		apiKeyEnv: stringValue(profile?.apiKeyEnv) ?? NATIVE_MODEL_KEY_REF,
		models
	};
}
/** Fetch the extended CLIProXyAPI catalog; the plain endpoint omits service tiers. */
async function fetchModelCapabilities(ctx, config, readCredential, signal) {
	const route = cpaFastRoute(ctx, config);
	if (route === void 0) return {
		models: [],
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	const key = route.apiKeyEnv === void 0 ? void 0 : await readCredential(route.apiKeyEnv);
	if (key === void 0 || key.trim() === "") return {
		models: [],
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	const endpoint = new URL("models?client_version=0.144.0", ensureBaseUrl(route.baseURL)).toString();
	let body;
	try {
		body = await requestModelCatalog(endpoint, key, config.timeoutMs, signal);
	} catch {
		return {
			models: [],
			fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
	}
	return {
		models: parseModelCapabilities(body),
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
/** Resolve the exact modality metadata already used by Harness admission. */
async function fetchModelInputCapabilities(ctx, signal) {
	return {
		models: (await Promise.all(ctx.llm.listProviders().map(async (provider) => {
			try {
				const models = await ctx.llm.listModels(provider.id);
				return Promise.all(models.map(async (model) => {
					try {
						const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id, signal);
						if (resolved.inputModalities === void 0) return void 0;
						const input = resolved.inputModalities.filter((value) => value === "text" || value === "image");
						return {
							provider: provider.id,
							model: model.id,
							input: [...input]
						};
					} catch {
						return;
					}
				}));
			} catch {
				return [];
			}
		}))).flat(1).filter((entry) => entry !== void 0),
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
async function requestModelCatalog(endpoint, key, timeoutMs, signal) {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort(/* @__PURE__ */ new Error("CLIProXyAPI model catalog request timed out"));
	}, timeoutMs);
	const abort = () => {
		controller.abort(signal.reason);
	};
	signal.addEventListener("abort", abort, { once: true });
	try {
		const response = await fetch(endpoint, {
			method: "GET",
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${key}`
			}
		});
		const text = await response.text();
		let body;
		try {
			body = text === "" ? {} : JSON.parse(text);
		} catch {
			body = { error: text.slice(0, 300) };
		}
		if (!response.ok) {
			const message = valueObject(body)?.error;
			throw new Error(typeof message === "string" ? message : `CLIProXyAPI returned HTTP ${String(response.status)}`);
		}
		return body;
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", abort);
	}
}
function parseModelCapabilities(value) {
	const root = valueObject(value);
	return (Array.isArray(root?.models) ? root.models : Array.isArray(root?.data) ? root.data : []).flatMap((entryValue) => {
		const entry = valueObject(entryValue);
		const ids = [...new Set([
			stringValue(entry?.slug),
			stringValue(entry?.id),
			stringValue(entry?.model)
		].filter((value) => value !== void 0))];
		const id = ids[0];
		if (id === void 0) return [];
		const aliases = ids.slice(1);
		const parsedTiers = (Array.isArray(entry?.service_tiers) ? entry.service_tiers : Array.isArray(entry?.serviceTiers) ? entry.serviceTiers : []).flatMap((tierValue) => {
			const tier = valueObject(tierValue);
			const tierId = stringValue(tier?.id);
			if (tierId === void 0) return [];
			return [{
				id: tierId,
				...stringValue(tier?.name) === void 0 ? {} : { name: stringValue(tier?.name) },
				...stringValue(tier?.description) === void 0 ? {} : { description: stringValue(tier?.description) }
			}];
		});
		return [{
			id,
			...aliases.length > 0 ? { aliases } : {},
			serviceTiers: parsedTiers
		}];
	});
}
async function fetchAccounts(config, readCredential, signal, includeQuota) {
	const body = await requestCpa(config, readCredential, "/v0/management/auth-files", { method: "GET" }, signal);
	const accounts = (Array.isArray(body.files) ? body.files : []).flatMap(toAccount);
	const enriched = includeQuota ? await Promise.all(accounts.map(async (account) => {
		try {
			const result = await fetchAccountQuota(config, readCredential, account, signal);
			return {
				...account,
				...result.plan === void 0 ? {} : { plan: result.plan },
				...result.quota === void 0 ? {} : { quota: result.quota }
			};
		} catch {
			return account;
		}
	})) : accounts;
	const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
	return {
		accounts: enriched,
		fetchedAt,
		...includeQuota ? { quotaFetchedAt: fetchedAt } : {}
	};
}
async function fetchAccountQuota(config, readCredential, account, signal) {
	const provider = account.provider.trim().toLowerCase();
	if (provider.includes("antigravity")) {
		const headers = {
			Authorization: "Bearer $TOKEN$",
			"Content-Type": "application/json",
			"User-Agent": "antigravity/cli/1.0.13 (aidev_client; os_type=darwin; arch=arm64)"
		};
		const quotaRequest = account.projectId === void 0 ? Promise.resolve({}) : callUpstream(config, readCredential, account.authIndex, "POST", "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary", headers, JSON.stringify({ project: account.projectId }), signal);
		const subscriptionRequest = callUpstream(config, readCredential, account.authIndex, "POST", "https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", headers, JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }), signal);
		const [quotaResult, subscriptionResult] = await Promise.allSettled([quotaRequest, subscriptionRequest]);
		return parseAntigravityQuota(quotaResult.status === "fulfilled" ? quotaResult.value : {}, subscriptionResult.status === "fulfilled" ? subscriptionResult.value : {});
	}
	if (provider.includes("codex")) return parseCodexQuota(await callUpstream(config, readCredential, account.authIndex, "GET", "https://chatgpt.com/backend-api/wham/usage", {
		Authorization: "Bearer $TOKEN$",
		Accept: "application/json"
	}, void 0, signal));
	return {};
}
async function callUpstream(config, readCredential, authIndex, method, url, header, data, signal) {
	const wrapper = valueObject(await requestCpa(config, readCredential, "/v0/management/api-call", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			auth_index: authIndex,
			method,
			url,
			header,
			...data === void 0 ? {} : { data }
		})
	}, signal));
	const statusCode = numberValue(wrapper?.status_code);
	const responseBody = stringValue(wrapper?.body) ?? "";
	if (statusCode < 200 || statusCode >= 300) throw new Error(`CLIProXyAPI upstream returned HTTP ${String(statusCode)}`);
	if (responseBody === "") return {};
	try {
		return JSON.parse(responseBody);
	} catch {
		throw new Error("CLIProXyAPI upstream returned invalid JSON");
	}
}
function parseCodexQuota(body) {
	const root = valueObject(body);
	if (root === void 0) return {};
	const rateLimit = valueObject(root.rate_limit) ?? valueObject(root.rateLimit) ?? {};
	const primary = valueObject(rateLimit.primary_window) ?? valueObject(rateLimit.primaryWindow) ?? valueObject(root.primary_window) ?? valueObject(root.primaryWindow);
	const secondary = valueObject(rateLimit.secondary_window) ?? valueObject(rateLimit.secondaryWindow) ?? valueObject(root.secondary_window) ?? valueObject(root.secondaryWindow);
	const credits = valueObject(root.credits);
	const spendControl = valueObject(root.spend_control) ?? valueObject(root.spendControl);
	const limitReached = booleanValue(rateLimit.limit_reached) === true || booleanValue(rateLimit.limitReached) === true || booleanValue(root.rate_limit_reached) === true || booleanValue(root.rateLimitReached) === true;
	const parsedWindows = [parseCodexQuotaWindow(primary, "five_hour"), parseCodexQuotaWindow(secondary, "weekly")].filter((window) => window !== void 0);
	if (Array.isArray(rateLimit.windows)) for (const [index, value] of rateLimit.windows.entries()) {
		const fallback = index === 0 ? "five_hour" : index === 1 ? "weekly" : "quota";
		const window = parseCodexQuotaWindow(valueObject(value), fallback);
		if (window !== void 0) parsedWindows.push(window);
	}
	const windows = deduplicateCodexQuotaWindows(parsedWindows);
	const activeWindow = primary ?? secondary;
	const fallbackRemaining = percentRemaining(firstNumber(root.used_percent, root.usedPercent));
	if (windows.length === 0 && fallbackRemaining !== void 0) windows.push({
		window: "quota",
		remaining: fallbackRemaining,
		total: 100,
		unit: "%",
		exceeded: limitReached || fallbackRemaining <= 0
	});
	const balance = firstNumber(credits?.balance);
	const quotaExceeded = limitReached || booleanValue(credits?.overage_limit_reached) === true || booleanValue(credits?.overageLimitReached) === true || booleanValue(spendControl?.reached) === true || windows.some((window) => window.exceeded === true || window.remaining <= 0);
	const primaryQuotaWindow = windows.find((window) => window.window === "five_hour") ?? windows[0];
	const remaining = primaryQuotaWindow?.remaining;
	const resetAfterSeconds = firstNumber(activeWindow?.reset_after_seconds, activeWindow?.resetAfterSeconds);
	const resetAt = epochToIso(activeWindow?.reset_at ?? activeWindow?.resetAt);
	const windowSeconds = firstNumber(activeWindow?.limit_window_seconds, activeWindow?.limitWindowSeconds);
	const quota = remaining !== void 0 ? {
		remaining,
		total: 100,
		used: 100 - remaining,
		unit: "%",
		exceeded: quotaExceeded,
		window: primaryQuotaWindow?.window ?? "quota",
		windows,
		...resetAt === void 0 ? {} : { resetAt },
		...resetAfterSeconds === void 0 ? {} : { resetAfterSeconds },
		...windowSeconds === void 0 ? {} : { windowSeconds }
	} : balance !== void 0 ? {
		remaining: Math.max(0, balance),
		unit: "credits",
		exceeded: quotaExceeded || balance <= 0
	} : void 0;
	return {
		...stringValue(root.plan_type) === void 0 && stringValue(root.planType) === void 0 ? {} : { plan: normalizePlan(stringValue(root.plan_type) ?? stringValue(root.planType)) },
		...quota === void 0 ? {} : { quota }
	};
}
function parseCodexQuotaWindow(value, fallbackWindow) {
	if (value === void 0) return void 0;
	const used = firstNumber(value.used_percent, value.usedPercent);
	const reportedRemaining = firstNumber(value.remaining_percent, value.remainingPercent);
	const remaining = reportedRemaining === void 0 ? percentRemaining(used) : clampPercent(reportedRemaining);
	if (remaining === void 0) return void 0;
	const window = codexWindowKey(firstNumber(value.limit_window_seconds, value.limitWindowSeconds), fallbackWindow, stringValue(value.window) ?? stringValue(value.name) ?? stringValue(value.label));
	const resetAt = epochToIso(value.reset_at ?? value.resetAt);
	return {
		window,
		remaining,
		total: 100,
		unit: "%",
		exceeded: booleanValue(value.limit_reached) === true || booleanValue(value.limitReached) === true || booleanValue(value.exceeded) === true || remaining <= 0,
		...resetAt === void 0 ? {} : { resetAt }
	};
}
function deduplicateCodexQuotaWindows(windows) {
	const byWindow = /* @__PURE__ */ new Map();
	for (const window of windows) {
		const current = byWindow.get(window.window);
		if (current === void 0 || window.remaining < current.remaining) byWindow.set(window.window, window);
	}
	return [...byWindow.values()].sort((left, right) => codexWindowOrder(left.window) - codexWindowOrder(right.window));
}
function codexWindowOrder(window) {
	if (window === "five_hour") return 0;
	if (window === "weekly") return 1;
	return 2;
}
function percentRemaining(used) {
	return used === void 0 ? void 0 : clampPercent(100 - clampPercent(used));
}
function clampPercent(value) {
	return Math.max(0, Math.min(100, value));
}
function codexWindowKey(seconds, fallback = "quota", label) {
	if (seconds !== void 0) {
		if (Math.abs(seconds - 18e3) <= 60) return "five_hour";
		if (Math.abs(seconds - 604800) <= 60) return "weekly";
		if (seconds >= 2419200) return "monthly";
		return `window_${seconds}`;
	}
	const normalized = label?.trim().toLowerCase().replace(/[-\s]+/g, "_");
	if (normalized === "5h" || normalized?.includes("five_hour") || normalized?.includes("5_hour")) return "five_hour";
	if (normalized === "week" || normalized?.includes("week")) return "weekly";
	return fallback;
}
function parseAntigravityQuota(body, subscriptionBody) {
	const root = valueObject(body);
	const subscription = valueObject(subscriptionBody);
	const windows = root === void 0 || !Array.isArray(root.groups) ? [] : root.groups.flatMap((groupValue) => {
		const group = valueObject(groupValue);
		const groupLabel = stringValue(group?.displayName) ?? stringValue(group?.label);
		if (group === void 0 || !Array.isArray(group.buckets)) return [];
		return group.buckets.flatMap((bucketValue) => {
			const bucket = valueObject(bucketValue);
			if (bucket === void 0) return [];
			const remainingFraction = firstNumber(bucket.remainingFraction, bucket.remaining_fraction);
			const window = antigravityWindow(bucket);
			if (remainingFraction === void 0 || window === void 0) return [];
			const remaining = Math.max(0, Math.min(100, remainingFraction <= 1 ? remainingFraction * 100 : remainingFraction));
			const resetAt = stringValue(bucket.resetTime) ?? stringValue(bucket.reset_at);
			return [{
				window,
				...groupLabel === void 0 ? {} : { group: groupLabel },
				remaining,
				total: 100,
				unit: "%",
				exceeded: remaining <= 0,
				...resetAt === void 0 ? {} : { resetAt }
			}];
		});
	});
	const remaining = windows.length === 0 ? void 0 : Math.min(...windows.map((window) => window.remaining));
	const quota = remaining === void 0 ? void 0 : {
		remaining,
		total: 100,
		unit: "%",
		exceeded: windows.some((window) => window.exceeded === true),
		windows
	};
	const subscriptionRoot = valueObject(subscription);
	const currentTier = valueObject(subscriptionRoot?.currentTier) ?? valueObject(subscriptionRoot?.current_tier);
	const plan = antigravityPlan(valueObject(subscriptionRoot?.paidTier) ?? valueObject(subscriptionRoot?.paid_tier)) ?? antigravityPlan(currentTier);
	return {
		...plan === void 0 ? {} : { plan },
		...quota === void 0 ? {} : { quota }
	};
}
function antigravityWindow(bucket) {
	const value = `${stringValue(bucket.window) ?? ""} ${stringValue(bucket.bucketId) ?? ""} ${stringValue(bucket.displayName) ?? ""}`.trim().toLowerCase();
	if (value.includes("5h") || value.includes("five hour") || value.includes("five-hour")) return "five_hour";
	if (value.includes("week")) return "weekly";
	return stringValue(bucket.window)?.trim().toLowerCase().replace(/[-\s]+/g, "_");
}
function antigravityPlan(tier) {
	if (tier === void 0) return void 0;
	const id = stringValue(tier.id)?.toLowerCase();
	if (id?.includes("ultra")) return "ultra";
	if (id?.includes("pro")) return "pro";
	if (id?.includes("standard")) return "standard";
	if (id?.includes("free")) return "free";
	const name = stringValue(tier.name) ?? stringValue(tier.description);
	if (name === void 0 || name.trim().toLowerCase() === "antigravity") return void 0;
	const normalizedName = name.trim().toLowerCase();
	if (normalizedName.includes("google ai pro") || /(^|[^a-z])pro([^a-z]|$)/.test(normalizedName)) return "pro";
	if (normalizedName.includes("google ai ultra") || /(^|[^a-z])ultra([^a-z]|$)/.test(normalizedName)) return "ultra";
	if (normalizedName.includes("standard")) return "standard";
	if (normalizedName.includes("free")) return "free";
	return normalizePlan(name);
}
function normalizePlan(value) {
	return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}
function toAccount(value) {
	if (typeof value !== "object" || value === null) return [];
	const raw = value;
	const authIndex = stringValue(raw.auth_index) ?? stringValue(raw.id);
	const id = stringValue(raw.id) ?? authIndex;
	if (authIndex === void 0 || id === void 0) return [];
	const name = stringValue(raw.name) ?? id;
	const provider = stringValue(raw.provider) ?? stringValue(raw.type) ?? "CLIProXyAPI";
	const plan = accountPlan(raw);
	const quota = accountQuota(raw);
	const projectId = stringValue(raw.project_id) ?? stringValue(raw.projectId);
	const rawRecent = Array.isArray(raw.recent_requests) ? raw.recent_requests : Array.isArray(raw.recentRequests) ? raw.recentRequests : void 0;
	const recentSuccess = rawRecent === void 0 ? void 0 : rawRecent.reduce((sum, item) => sum + numberValue(valueObject(item)?.success), 0);
	const recentFailed = rawRecent === void 0 ? void 0 : rawRecent.reduce((sum, item) => sum + numberValue(valueObject(item)?.failed), 0);
	return [{
		id,
		authIndex,
		name,
		provider,
		...plan === void 0 ? {} : { plan },
		...stringValue(raw.label) === void 0 ? {} : { label: stringValue(raw.label) },
		...stringValue(raw.email) === void 0 ? {} : { email: stringValue(raw.email) },
		...stringValue(raw.account) === void 0 ? {} : { account: stringValue(raw.account) },
		...projectId === void 0 ? {} : { projectId },
		status: stringValue(raw.status) ?? "unknown",
		...stringValue(raw.status_message) === void 0 ? {} : { statusMessage: stringValue(raw.status_message) },
		...quota === void 0 ? {} : { quota },
		disabled: raw.disabled === true,
		unavailable: raw.unavailable === true,
		...stringValue(raw.next_retry_after) === void 0 ? {} : { nextRetryAfter: stringValue(raw.next_retry_after) },
		...stringValue(raw.last_refresh) === void 0 ? {} : { lastRefresh: stringValue(raw.last_refresh) },
		success: numberValue(raw.success),
		failed: numberValue(raw.failed),
		...recentSuccess === void 0 ? {} : { recentSuccess },
		...recentFailed === void 0 ? {} : { recentFailed }
	}];
}
async function fetchAccountModels(config, readCredential, request, signal) {
	const response = valueObject(await requestCpa(config, readCredential, `/v0/management/auth-files/models?${new URLSearchParams({
		name: request.name,
		auth_index: request.authIndex
	}).toString()}`, { method: "GET" }, signal));
	const models = Array.isArray(response?.models) ? response.models.flatMap((model) => {
		if (typeof model === "string") return stringValue(model) === void 0 ? [] : [model.trim()];
		const record = valueObject(model);
		const id = stringValue(record?.id) ?? stringValue(record?.model);
		return id === void 0 ? [] : [id];
	}) : [];
	return {
		authIndex: request.authIndex,
		models: [...new Set(models)]
	};
}
/**
* CPA deliberately returns only a safe subset of the auth record. Codex's
* plan is nested in the decoded ID-token claims; newer CPA versions may also
* expose a top-level plan/tier field, so accept those forms without sending
* the token itself to the browser.
*/
function accountPlan(raw) {
	const idToken = valueObject(raw.id_token);
	const subscription = valueObject(raw.subscription);
	const currentTier = valueObject(raw.current_tier) ?? valueObject(raw.currentTier);
	const candidates = [
		raw.plan_type,
		raw.plan,
		raw.subscription_plan,
		raw.subscription_type,
		raw.tier_id,
		raw.tier,
		idToken?.plan_type,
		idToken?.chatgpt_plan_type,
		subscription?.plan_type,
		subscription?.plan,
		currentTier?.id
	];
	for (const candidate of candidates) {
		const value = stringValue(candidate);
		if (value !== void 0) return value.toLowerCase().replace(/[\s_]+/g, "-");
	}
}
/**
* CPA releases quota information at different layers and versions. Accept
* only the small, display-safe projection we need; never forward raw auth
* metadata or tokens to the browser.
*/
function accountQuota(raw) {
	const quota = valueObject(raw.quota) ?? {};
	const remaining = firstNumber(quota.remaining, quota.remaining_quota, quota.balance, quota.credits, raw.quota_remaining, raw.remaining_quota, raw.balance, raw.credits);
	const total = firstNumber(quota.total, quota.limit, quota.quota_limit, raw.quota_limit, raw.limit, raw.total_quota);
	const used = firstNumber(quota.used, quota.usage, quota.used_quota, raw.quota_used, raw.used_quota, raw.usage);
	const unit = stringValue(quota.unit) ?? stringValue(quota.type) ?? stringValue(raw.quota_unit);
	const label = stringValue(quota.display) ?? stringValue(quota.label) ?? stringValue(quota.text) ?? stringValue(raw.quota_label);
	const exceeded = booleanValue(quota.exceeded) ?? booleanValue(raw.quota_exceeded);
	if (remaining === void 0 && total === void 0 && used === void 0 && unit === void 0 && label === void 0 && exceeded === void 0) return;
	return {
		...remaining === void 0 ? {} : { remaining },
		...total === void 0 ? {} : { total },
		...used === void 0 ? {} : { used },
		...unit === void 0 ? {} : { unit },
		...label === void 0 ? {} : { label },
		...exceeded === void 0 ? {} : { exceeded }
	};
}
async function requestCpa(config, readCredential, path, init, signal) {
	const key = await readCredential(config.managementKeyEnv);
	if (key === void 0 || key.trim() === "") throw new Error(`CLIProXyAPI management key is not configured (${config.managementKeyEnv})`);
	const endpoint = new URL(path, ensureBaseUrl(config.endpoint)).toString();
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort(/* @__PURE__ */ new Error("CLIProXyAPI request timed out"));
	}, config.timeoutMs);
	const abort = () => {
		controller.abort(signal.reason);
	};
	signal.addEventListener("abort", abort, { once: true });
	try {
		const response = await fetch(endpoint, {
			...init,
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${key}`,
				...init.headers
			}
		});
		const text = await response.text();
		let body;
		try {
			body = text === "" ? {} : JSON.parse(text);
		} catch {
			body = { error: text.slice(0, 300) };
		}
		if (!response.ok) {
			const message = typeof body === "object" && body !== null && typeof body.error === "string" ? body.error : `CLIProXyAPI responded with HTTP ${String(response.status)}`;
			throw new Error(message);
		}
		return body;
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", abort);
	}
}
function ensureBaseUrl(value) {
	const trimmed = value.trim();
	if (trimmed === "") throw new Error("CLIProXyAPI endpoint is empty");
	return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
function parseSelection(value) {
	if (typeof value !== "object" || value === null) throw new Error("invalid CLIProXyAPI account selection");
	const raw = value;
	const sessionId = stringValue(raw.sessionId);
	const authIndex = raw.authIndex === void 0 ? void 0 : stringValue(raw.authIndex);
	const persistDefault = raw.persistDefault === void 0 ? void 0 : raw.persistDefault;
	if (sessionId === void 0 || raw.authIndex !== void 0 && authIndex === void 0 || persistDefault !== void 0 && typeof persistDefault !== "boolean") throw new Error("invalid CLIProXyAPI account selection");
	return {
		sessionId,
		...authIndex === void 0 ? {} : { authIndex },
		...persistDefault === void 0 ? {} : { persistDefault }
	};
}
function parseSessionId(value) {
	if (typeof value !== "object" || value === null) throw new Error("invalid CLIProXyAPI session selection");
	const sessionId = stringValue(value.sessionId);
	if (sessionId === void 0) throw new Error("CLIProXyAPI session id is required");
	return sessionId;
}
function parseSpeedSelection(value) {
	if (typeof value !== "object" || value === null) throw new Error("invalid CLIProXyAPI speed selection");
	const raw = value;
	const sessionId = stringValue(raw.sessionId);
	const model = stringValue(raw.model);
	const speed = stringValue(raw.speed);
	if (sessionId === void 0 || model === void 0 || speed !== "standard" && speed !== "fast") throw new Error("invalid CLIProXyAPI speed selection");
	return {
		sessionId,
		model,
		speed
	};
}
function parseSessionSpeed(value) {
	if (typeof value !== "object" || value === null) throw new Error("invalid CLIProXyAPI session speed request");
	const raw = value;
	const sessionId = stringValue(raw.sessionId);
	const model = stringValue(raw.model);
	if (sessionId === void 0 || model === void 0) throw new Error("CLIProXyAPI session speed requires sessionId and model");
	return {
		sessionId,
		model
	};
}
function parseAuthIndex(value) {
	if (typeof value !== "object" || value === null) throw new Error("invalid CLIProXyAPI auth_index");
	const authIndex = stringValue(value.authIndex);
	if (authIndex === void 0 || authIndex === "") throw new Error("CLIProXyAPI auth_index is required");
	return authIndex;
}
function parseAccountModelsRequest(value) {
	if (typeof value !== "object" || value === null) throw new Error("invalid CLIProXyAPI account models request");
	const raw = value;
	const authIndex = stringValue(raw.authIndex);
	const name = stringValue(raw.name);
	if (authIndex === void 0 || name === void 0) throw new Error("CLIProXyAPI account auth_index and name are required");
	return {
		authIndex,
		name
	};
}
function stringValue(value) {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
}
function modelEndpoint(value) {
	const normalized = value.trim().replace(/\/+$/, "");
	if (normalized === "") return "";
	return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}
function objectKeys(value) {
	const record = valueObject(value);
	if (record === void 0) return [];
	return Object.keys(record).filter((key) => key !== "off" && record[key] !== false);
}
function positiveNumber(value) {
	const number = optionalNumberValue(value);
	return number !== void 0 && number > 0 ? number : void 0;
}
function speedKey(sessionId, model) {
	return `${sessionId}\u0000${model}`;
}
function epochToIso(value) {
	const numeric = optionalNumberValue(value);
	if (numeric !== void 0) {
		const date = new Date(numeric > 0xe8d4a51000 ? numeric : numeric * 1e3);
		return Number.isNaN(date.getTime()) ? void 0 : date.toISOString();
	}
	return stringValue(value);
}
function valueObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function numberValue(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function firstNumber(...values) {
	for (const value of values) {
		const parsed = optionalNumberValue(value);
		if (parsed !== void 0) return parsed;
	}
}
function optionalNumberValue(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || value.trim() === "") return void 0;
	const parsed = Number(value.trim().replace(/,/g, ""));
	return Number.isFinite(parsed) ? parsed : void 0;
}
function booleanValue(value) {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return void 0;
	if (value.trim().toLowerCase() === "true") return true;
	if (value.trim().toLowerCase() === "false") return false;
}
//#endregion
export { Config, apply, inject, name, parseCodexQuota, parseModelCapabilities };
