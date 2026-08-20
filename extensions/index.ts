/**
 * Unsloth Studio provider extension for pi.
 *
 * Registers the local Unsloth Studio instance as a pi model provider and
 * auto-refreshes the available model list from the server's /v1/models
 * endpoint when pi starts. Because Unsloth Studio speaks the OpenAI-compatible
 * API, requests are streamed through pi's built-in openai-completions
 * implementation.
 *
 * Configuration (environment variables):
 *   UNSLOTH_API_KEY   API key. The Unsloth server requires authentication on
 *                     every endpoint, including /models.
 *   UNSLOTH_BASE_URL  Optional. Defaults to http://192.168.0.11:8888/v1
 *   UNSLOTH_CONTEXT   Optional. Context window fallback (tokens) for models
 *                     whose /models entry does not report one. Default 128000
 *
 * The model list is fetched fresh at startup, so newly loaded models are
 * picked up automatically when pi starts. If the fetch fails, the provider is
 * registered with no models and pi logs an error; fix the server and run
 * /reload to retry.
 */

import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

const DEFAULT_BASE_URL = "http://192.168.0.11:8888/v1";
const DEFAULT_CONTEXT_WINDOW = 65_000;
const DEFAULT_MAX_TOKENS = 8_000;

// The Unsloth Studio GGUF models expose thinking
// control through the server's chat template. They do not reliably accept the
// "developer" role or reasoning_effort, so use the safe subset.
const SHARED_COMPAT = {
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	maxTokensField: "max_tokens",
	thinkingFormat: "qwen-chat-template",
} as const;

interface UnslothModelEntry {
	id: string;
	display_name?: string;
	context_length?: number;
	max_context_length?: number;
	quant?: string;
}

function positiveNumber(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function toModel(entry: UnslothModelEntry, defaultContextWindow: number): ProviderModelConfig {
	// context_length is the native size; max_context_length is what the running
	// server will actually honor. Prefer max_context_length, then context_length.
	const contextWindow = positiveNumber(
		entry.max_context_length ?? entry.context_length,
		positiveNumber(entry.context_length, defaultContextWindow),
	);

	const baseName = entry.display_name ?? entry.id;
	const name = entry.quant ? `${baseName} (${entry.quant})` : baseName;

	return {
		id: entry.id,
		name,
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens: DEFAULT_MAX_TOKENS,
		compat: { ...SHARED_COMPAT },
	};
}

export default async function (pi: ExtensionAPI) {
	const baseUrl = (process.env.UNSLOTH_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
	const apiKey = process.env.UNSLOTH_API_KEY;
	const defaultContextWindow = positiveNumber(
		Number(process.env.UNSLOTH_CONTEXT),
		DEFAULT_CONTEXT_WINDOW,
	);

	let models: ProviderModelConfig[] = [];

	if (apiKey) {
		try {
			const response = await fetch(`${baseUrl}/models`, {
				headers: { Authorization: `Bearer ${apiKey}` },
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const payload = (await response.json()) as { data?: UnslothModelEntry[] };
			models = (payload.data ?? []).map((entry) => toModel(entry, defaultContextWindow));
		} catch (error) {
			console.error(
				`[unsloth] Failed to fetch models from ${baseUrl}/models: ${error instanceof Error ? error.message : error}`,
			);
			console.error("[unsloth] Registering provider with no models; fix the server and run /reload.");
		}
	} else {
		console.error(
			"[unsloth] UNSLOTH_API_KEY is not set. Set it before starting pi: export UNSLOTH_API_KEY=<key>",
		);
	}

	pi.registerProvider("unsloth", {
		name: "Unsloth (local)",
		baseUrl,
		apiKey: apiKey ?? "",
		api: "openai-completions",
		models,
	});
}
