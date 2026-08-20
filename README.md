# pi-unsloth

Pi extension that registers your local **Unsloth Studio** instance
(`http://192.168.0.11:8888/v1`) as a model provider.

- **OpenAI-compatible** — all requests stream through pi's built-in
  `openai-completions` implementation.
- **Auto-refreshing model list** — fetches `/v1/models` when pi starts, so any
  models loaded on the server are available in `/model` without manual config.
- **Authenticated** — the server requires a key on every endpoint, including
  `/models`. The key is read from `UNSLOTH_API_KEY`.

## Setup

1. Set the API key (and optionally the base URL / context fallback):

   ```bash
   export UNSLOTH_API_KEY=sk-unsloth-...
   export UNSLOTH_BASE_URL=http://192.168.0.11:8888/v1   # default
   export UNSLOTH_CONTEXT=128000                          # fallback context window
   ```

2. Install the extension from this repo:

   ```bash
   pi install /path/to/pi-unsloth
   # or, for development:
   pi -e /path/to/pi-unsloth/extensions/index.ts
   ```

3. Restart pi (or run `/reload`). The provider appears as **Unsloth (local)**
   and the model picker (`/model` or Ctrl+L) lists whatever the server reports
   in `/v1/models` at startup.

## How it works

The extension factory is `async`: pi waits for it before continuing startup, so
the model list is fetched fresh on every start (the documented approach for
dynamic model discovery). Model entries are mapped with:

- **context window** — from `max_context_length`/`context_length` returned by
  the server, falling back to `UNSLOTH_CONTEXT`.
- **reasoning** — enabled, with `thinkingFormat: "qwen-chat-template"`
  (`chat_template_kwargs.enable_thinking` + `preserve_thinking`), matching how
  these GGUF servers toggle thinking.
- **compat** — `supportsDeveloperRole: false`, `supportsReasoningEffort:
  false`, `maxTokensField: "max_tokens"` (safe subset for local Qwen/Gemma
  servers).

If the fetch fails (server down, bad key), pi still starts; the provider is
registered with no models and an error is logged. Fix the server and run
`/reload`.

## Notes

- `UNSLOTH_API_KEY` must be present in pi's environment at startup. If it is
  missing, the extension logs an error and registers no models.
- The server's `/models` list may include non-chat models (e.g. image or
  text-to-speech GGUF files); they appear in the picker but may fail at request
  time.

## Typecheck

```bash
npm install
npm run typecheck
```