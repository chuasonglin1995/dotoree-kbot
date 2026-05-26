# Product Decisions & Roadmap

Short reference. Append new decisions as they're made. Roadmap items move buckets as we ship/defer.

## Decisions

### Audience

- **Build for self first.** Target = the author, plateaued intermediate, TOPIK 1-2. Generalize only after the loop works for one. Don't assume self-experience generalizes to beginners or heritage learners.
- **Positioning:** *Translation-drill chat for plateaued intermediate Korean learners — your personal Anki, built from your own mistakes.* Not Duolingo for newbies, not a tutor.
- **Telegram-first.** Native to author's habits; cheapest dev surface. Quietly biases audience away from Western K-pop fans (Discord/TikTok). Revisit if generalizing.

### UX

- **Type-first, not tap-first.** Production is the muscle. Buttons only as scaffolds — never as a substitute for typing Korean.
- **Scenarios are vocabulary-scoping, not flavor.** Each scenario bounds a hundreds-word universe, making vocab-controlled LLM generation tractable.
- **Korean default; English revealed via Telegram spoiler (`||…||`).** Bilingual inline was rejected — kills comprehension muscle.
- **Tiered hints, no scoring.** Tap 1 = vocab, Tap 2 = grammar, Tap 3 = full answer. Each tap logged as struggle signal; no XP/points in v1.
- **Soft tone is the product.** No red Xs, no failure sounds. Mistakes framed as data.

### Memory & adaptivity

- **Mistake corpus is the headline differentiator.** Exposure tracking is plumbing.
- **Mastery inferred, never self-rated.** Behavior > declared confidence. No upfront word-checklist calibration.
- **Default TOPIK 1-2; no calibration in v1.** Future `/level` command for adaptive quickcheck.
- **Coach rebalances up AND down.** Tired days should ease difficulty, not just escalate.

### Tech

- **Stack:** Node.js + Fastify + Telegraf + Supabase + OpenAI (`gpt-4.1-mini`). NestJS rejected — too much boilerplate for a solo build.
- **`VocabConstrainedGenerator` is the swappable boundary.** If vocab leakage exceeds 90%, swap the strategy (template, retrieval, post-processing) without touching the rest.
- **Polling in dev, webhook in prod.** One-line swap when deploying.
- **JSON seed files in git → Supabase at runtime.** Static reference (vocab/grammar) is version-controlled flat files; user state lives in the DB.
- **Frequency tier (1-5 bucket), not raw rank.** Stable on insert; finer than TOPIK level alone.

### Open

- **Role-play vs translation-drill.** PRD §5 says "English prompt → user types Korean translation"; the build delivers bot-speaks-Korean role-play with English in spoilers. Different muscles. Try a week of role-play before deciding to pivot.

---

## Roadmap

Legend: ✅ Implemented · 🔜 Next · 🕒 Later · ❌ Rejected · ❓ Undecided

### ✅ Implemented (v1)

- Scenario picker (restaurant, café, transit)
- Core loop — bot speaks Korean → user types Korean → soft correction → Korean follow-up w/ English spoiler
- Tiered hints (3 levels) with logging
- Mistake corpus (every error → future drill target)
- Exposure tracking (vocab/grammar seen → DB)
- Background coach loop (every 30 min, levels up *and* down)
- Soft-tone correction
- Telegram polling mode
- Fastify HTTP server + `/healthz`

### 🔜 Next

- End-of-session summary card (also the planned day-1 hook)
- Voice input + TTS (promoted from Later)
- `/level` adaptive quickcheck for explicit calibration
- Daily review session generated from the mistake corpus
- More scenarios + difficulty tagging
- Webhook mode for deployed bot
- Scoring / streaks — **only if data shows retention is a problem**

### 🕒 Later

- Freeform conversation mode (no scripted scenario)
- Generalization onboarding for non-author users
- Native content integration (K-drama, lyrics, music)

### ❌ Rejected

- Mobile native app (Telegram is enough)
- Community features (leaderboards, shared corpora)

### ❓ Undecided

- Role-play vs translation-drill core loop (see Decisions §Open)
