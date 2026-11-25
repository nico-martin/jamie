# Jamie

Jamie is an offline-first recipe builder and voice cooking agent. All AI inference runs locally in the browser with WebGPU; prompts, recipes, audio, and conversations are not sent to an application server.

## AI Architecture

Jamie uses one local text-generation model (Gemma 4 by default) for two workflows:

- **Recipe generation:** The model produces a constrained JSON response matching the recipe schema. The UI streams and incrementally parses this output so the recipe appears while it is being generated.
- **Cooking agent:** Transformers.js renders the conversation and tool definitions with the model's chat template, then parses the assistant's text and tool calls with the tokenizer's response template. Available tools can change the serving count, reveal a recipe step, or end the active conversation and return to wake-word mode.

To switch models, set `LLM_MODEL_ID` (and `LLM_MODEL_DTYPE` if needed) in `src/services/shared.ts`. Use a WebGPU-compatible model with a chat template that supports tool calls and tool results, and a tokenizer response template that emits `tool_calls`.

The voice pipeline combines three additional local models:

1. **Silero VAD** detects speech segments from the microphone.
2. **Whisper Base** transcribes recorded speech with native WebGPU kernels.
3. **Kokoro 82M** speaks Jamie's response.

Saying "Jamie" starts a conversational session. Once active, follow-up speech no longer needs the wake word. Calling `end_conversation` clears the session while the recorder continues waiting for "Jamie" again.

The app logs timing data for recording, transcription, time to first token, generation throughput, agent loops, tool calls, and speech synthesis. The Conversation panel also displays tool execution and results alongside user and assistant messages.

## Offline Use

The production service worker precaches the complete application bundle and WebAssembly assets. On first production load, all four AI models are downloaded and initialized, then retained in browser cache storage for later offline use.

## Development

```bash
pnpm install
pnpm dev
```

Create a production build with:

```bash
pnpm build
```
