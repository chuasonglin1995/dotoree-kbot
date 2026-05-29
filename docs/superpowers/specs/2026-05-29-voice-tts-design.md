# Voice TTS — Design

**Status:** Approved, ready for implementation plan
**Date:** 2026-05-29
**Phase:** v1.5 (post-v1, "Voice input + TTS" roadmap item — TTS half only)

## 1. Goal

Add on-demand Korean text-to-speech to the bot. When the bot sends a Korean message, the user can tap a 🔊 button to receive the same text as a Telegram voice note. STT (voice input) is deferred to a later phase; this design leaves room for it but does not implement it.

## 2. Scope

**In**
- 🔊 button on every Korean bot message (scenario openers and follow-ups).
- OpenAI `gpt-4o-mini-tts` via `client.audio.speech.create()`.
- Scenario-aware voice mapping (one voice per scenario).
- Content-keyed filesystem cache so repeated phrases are generated once.
- Telegram delivery as a voice note (`replyWithVoice`, opus format, no transcoding).

**Out**
- STT / voice input — separate phase.
- Steered styles (slow speech, dramatic, etc.) — `gpt-4o-mini-tts` supports this; we leave the service signature extensible but ship with default style only.
- Supabase Storage cache — deferred until prod/webhook deployment. Cache key format chosen now to make that migration a copy job.
- Cache eviction — not needed at single-user scale.
- Automated end-to-end bot tests — repo pattern is unit tests + manual smoke.

## 3. Product behavior

1. Bot sends a Korean message. Inline keyboard shows `[💡 1] [💡 2] [💡 3] [🔊]`.
2. User taps 🔊. Telegram fires callback `audio:<turnId>`.
3. Bot replies with a voice note containing the spoken Korean text.
4. Tapping 🔊 again (same turn or different turn with the same text) returns the cached audio — no second OpenAI call.

Scenario openers receive the same 🔊 affordance. The voice used is determined by the active scenario.

## 4. Architecture

New module under `src/audio/`, one new handler, two small touchpoints in existing code.

```
src/audio/
  tts.client.ts      OpenAI audio.speech wrapper (mirrors openai.client.ts pattern)
  tts.service.ts     text + voice -> audio buffer; owns cache lookup
  audio-cache.ts     filesystem cache, content-hash keyed

src/bot/handlers/
  audio.handler.ts   handles `audio:<turnId>` callback

Touchpoints:
  src/bot/formatting.ts        keyboard helper extended with 🔊 button
  src/reference/scenarios.ts   Scenario interface gains `voice` field
  src/bot/bot.ts               wire AudioHandler into callback router
  src/main.ts                  construct TtsClient, AudioCache, TtsService, AudioHandler
```

No DB migration. No new env vars (reuses `OPENAI_API_KEY`). One new entry in `.gitignore`: `.cache/audio/`.

## 5. Components

### TtsService

```ts
class TtsService {
  synthesize(text: string, voice: string): Promise<Buffer>
}
```

- Computes `hash = sha256(text + '|' + voice + '|' + model)`.
- Asks `AudioCache.get(hash)`. Hit → return buffer.
- Miss → call `TtsClient`, then `AudioCache.put(hash, buffer)` (best-effort), return buffer.
- Knows nothing about Telegram or turns.

The model identifier is bound at construction time so the hash includes it; swapping models invalidates the cache automatically (correct behavior — different model = different audio).

### AudioCache

```ts
class AudioCache {
  get(hash: string): Promise<Buffer | null>
  put(hash: string, buffer: Buffer): Promise<void>
}
```

- Files stored at `./.cache/audio/<hash>.ogg`.
- `get` returns `null` on ENOENT.
- `put` swallows write failures and logs them; the caller still has the buffer.
- No eviction.

### TtsClient

```ts
class TtsClient {
  constructor(apiKey: string, private readonly model: string)
  synthesize(text: string, voice: string): Promise<Buffer>
}
```

Constructor shape matches `OpenAILLMClient` (apiKey + model). `synthesize` wraps:

```ts
client.audio.speech.create({
  model: this.model,
  voice,
  input: text,
  response_format: 'opus',
})
```

Returns a Buffer. The model string is also passed to `TtsService` at construction so the cache hash can include it — both consume the same config value from `main.ts`.

### AudioHandler

```ts
class AudioHandler {
  handle(ctx: Context, turnId: string): Promise<void>
}
```

- `ctx.answerCbQuery()` immediately to dismiss the spinner.
- Loads turn via `SessionService.getTurn(turnId)`. If missing → answer with "Message expired", return.
- Loads session, resolves scenario, reads `scenario.voice`.
- Calls `TtsService.synthesize(turn.bot_followup_ko, voice)`.
- Sends `ctx.replyWithVoice({ source: buffer })`.
- On error, replies with a soft "Audio unavailable, try again?" — error is logged, turn state untouched.

### Scenario config

`Scenario` interface gains a `voice` field. Initial mapping:

| Scenario   | Voice     |
|------------|-----------|
| Restaurant | `nova`    |
| Café       | `shimmer` |
| Transit    | `onyx`    |

These are initial first guesses based on the English personalities of the voices (friendly / light / authoritative). The author may adjust by ear at any time — it is a config change with no code impact.

### Keyboard

`formatting.ts`'s `hintKeyboard` is renamed to `turnKeyboard(turnId)` and returns:

```
[💡 1] [💡 2] [💡 3] [🔊]
```

Both `MessageHandler` and `ScenarioHandler` use the new helper. The 🔊 callback data is `audio:<turnId>`. The scenario opener's turn ID is the same one already created when the scenario starts.

## 6. Data flow

```
1. MessageHandler/ScenarioHandler completes a turn
   └─ ctx.reply(..., reply_markup: turnKeyboard(turn.id))

2. User taps 🔊
   └─ Telegram callback: data="audio:<turnId>"

3. Bot router → AudioHandler.handle(ctx, turnId)
   ├─ answerCbQuery()                              (UI spinner dismissed)
   ├─ sessions.getTurn(turnId)        → turn       (or "expired")
   ├─ sessions.currentSession(...)    → session
   ├─ findScenario(session.scenario)  → scenario   (provides voice)
   ├─ tts.synthesize(turn.bot_followup_ko, scenario.voice)
   │   ├─ hash = sha256(text|voice|model)
   │   ├─ cache.get(hash)              → Buffer? (hit → done)
   │   ├─ client.synthesize(...)       → Buffer  (OpenAI)
   │   ├─ cache.put(hash, buffer)      (best-effort)
   │   └─ return buffer
   └─ ctx.replyWithVoice({ source: buffer })
```

## 7. Error handling

Failures are contained at the handler boundary; the service throws and the cache is best-effort.

| Failure                             | Behavior                                                                        |
|-------------------------------------|---------------------------------------------------------------------------------|
| Turn not found (callback is stale)  | `ctx.answerCbQuery("Message expired")`. No reply.                               |
| OpenAI request fails / times out    | `ctx.reply("Audio unavailable, try again?")`. Error logged. Turn state intact.  |
| Disk write fails (cache.put)        | Logged. Service still returns the buffer; user still hears audio this round.    |
| Disk read fails (cache.get)         | Treated as a miss; regenerate.                                                  |
| Telegram `replyWithVoice` fails     | Error logged. No retry in v1.                                                   |

## 8. Testing

**Unit tests (Jest, matching existing repo pattern):**

- `audio-cache.spec.ts`
  - Hash determinism: same input → same hash, different inputs → different hashes.
  - Round-trip: `put` then `get` returns the same buffer.
  - Miss: `get` on unknown hash returns `null`.
  - Write failure does not throw.

- `tts.service.spec.ts` (with mocked `TtsClient` and `AudioCache`)
  - First call: invokes client, calls `cache.put`, returns buffer.
  - Second call with same input: invokes `cache.get`, returns cached buffer, does **not** invoke client.
  - Different voice for same text: client invoked again (different hash).

**Manual smoke (dev, polling mode):**

1. `/start` → pick Restaurant → tap 🔊 on the opener → hear Korean audio.
2. Tap 🔊 again on the same message → identical playback. Verify in logs that no OpenAI call was made.
3. Send a Korean reply → bot follows up → tap 🔊 on the follow-up → hear it.
4. `/start` → pick Café → tap 🔊 → confirm different voice (`shimmer` vs. `nova`).
5. Set scenario voice to an invalid value in config → tap 🔊 → confirm graceful "Audio unavailable" reply, no crash.

## 9. Forward compatibility

- **STT phase:** when voice input is added, the `audio.handler.ts` will sit alongside a new `voice-message.handler.ts`. `TtsClient` and the future `SttClient` can share an `audio` namespace under `src/audio/`. No restructure needed.
- **Steered styles:** `TtsService.synthesize` will gain an optional `style?: string` parameter that maps to `gpt-4o-mini-tts`'s instructions field. Cache key extends to include style. Existing cache entries remain valid (default style = no instruction).
- **Supabase Storage cache:** swap `AudioCache` implementation. The interface (`get`/`put` keyed on hash) is identical. Migration = copy `.cache/audio/*.ogg` into a Storage bucket using the filename as object key.

## 10. Implementation order (sketch)

Implementation plan follows in a separate document. Rough order:

1. `audio-cache.ts` + tests
2. `tts.client.ts`
3. `tts.service.ts` + tests
4. Extend `Scenario` interface + add voices to existing three scenarios
5. Extend keyboard helper, rename if needed
6. `audio.handler.ts`
7. Wire up in `main.ts` and `bot.ts` callback router
8. Manual smoke

## 11. Open questions

None at design time. Voice choices may be revised by the author by ear; that is a config-only change and does not block the plan.
