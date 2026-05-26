# Korean Learning Companion — PRD v1

## 1. TL;DR

A Telegram bot for plateaued intermediate Korean learners that runs production-first translation drills inside bounded scenarios. The user picks a setting (restaurant, classroom, bus station), is prompted in English, and types the Korean translation. The bot provides tiered hints, inline soft corrections, and Korean follow-up questions with English available as a spoiler tap. Over time, a personal mistake corpus and vocabulary exposure table feed a background coach loop that adapts difficulty up *or* down. Built first as a tool for the author; generalization is a later concern.

**Positioning:** *Translation-drill chat for plateaued intermediate Korean learners — your personal Anki, built from your own mistakes.*

## 2. Problem

Existing Korean-learning tools fail intermediate learners in specific ways:

- **Duolingo** — gamified but shallow. Multiple-choice drills don't build production fluency. Same curriculum for everyone.
- **Anki** — rigorous but cold. The learner does the curation work. No contextual practice.
- **Italki / human tutors** — high friction (scheduled, expensive, social cost). Wrong for fragmented 5-minute moments.
- **Generic AI chat (ChatGPT, etc.)** — not vocabulary-calibrated. Either too easy or floods the user with unknown words. No memory of the learner's journey.

The plateaued-intermediate learner has the alphabet and a vocabulary base but stalls because they don't get **production reps in safe contexts** during the short moments of attention they actually have.

## 3. Target user

**v1: the author.** A plateaued-intermediate Korean learner, TOPIK 1–2 starting zone, wants daily production practice in fragmented mobile moments (train rides, queues, etc.).

Generalization (broader intermediate learners, then heritage learners, then beginners) is parked until v1 proves the loop works for one user.

## 4. Goals & non-goals

**Goals**
- Get the author meaningful Korean production practice in 5-minute moments.
- Build a personal mistake corpus that drives tomorrow's practice from yesterday's mistakes.
- Validate that vocabulary-controlled LLM generation is reliable enough to deliver the i+1 promise.

**Non-goals (v1)**
- Teaching Hangul or absolute beginners.
- Native content (K-drama clips, lyrics, news).
- Scheduled lessons or tutor-style sessions.
- Voice input / output.
- Onboarding flow for non-author users.
- Scoring, XP, streaks.

## 5. Core loop

Per turn:

1. **Scenario pick.** User taps a scenario button (restaurant, bus station, classroom, etc.). Scenario scopes the vocabulary universe — this is also what makes vocabulary-controlled generation tractable.
2. **English prompt.** Bot sends a sentence in English the user should produce in Korean.
3. **User types Korean.** Free-text input.
4. **Hint (optional, tiered).** User can tap for help:
   - **Tap 1** — key vocabulary words
   - **Tap 2** — grammar pattern
   - **Tap 3** — full answer
   Each hint tap is logged as a struggle signal. No point penalty in v1.
5. **Inline soft correction.** Bot returns the user's attempt with gentle, encouraging feedback. Tone is critical — no red Xs, no failure sounds. Mistakes are framed as data.
6. **Korean follow-up.** Bot asks a next question in Korean, calibrated to the user's known vocab plus 1–2 new words. English translation available as a Telegram spoiler (`||...||`) on tap.
7. Loop.

## 6. Adaptive memory

Two stacked layers — the exposure table is plumbing; the mistake corpus is the product.

**Vocabulary / grammar exposure table (plumbing)**
- Tracks lemmas seen, forms seen, and inferred mastery state.
- Two-layer: lemma (먹다) + morphology (먹어요 / 먹었어요 / 먹을 거예요).
- Mastery inferred from interaction behavior, not self-rating.

**Mistake corpus (headline)**
- Every error becomes a future drill target.
- Drives the differentiation: *"your personal Anki, built from your own mistakes"* vs. Duolingo recycling the same curriculum for everyone.

**Background coach loop**
- Scheduled job. Reviews recent session data.
- Adjusts user difficulty **up *and* down** — repeated tap-3 hints or sustained errors should ease difficulty, not just escalate it.

## 7. UX principles

- **Telegram-native.** Use spoilers, inline buttons, no app-store friction. The platform's constraints are the design.
- **Type-first.** Production is the muscle being trained. Buttons exist only as scaffolds (scenario pick, hints, reveal), never as a substitute for typing Korean.
- **Soft tone.** Encouraging language, mistakes framed as data. No red Xs, no failure sounds, no negative reinforcement. Tone is part of the product.
- **Low cognitive load per turn.** One sentence, one decision. Sessions should feel completable in 90 seconds even if the user wants to keep going.
- **Friction in the right place.** Hints are reachable but tiered. English follow-ups are available but require a spoiler tap.

## 8. Technical architecture

- **Frontend:** Telegram bot (Telegraf.js)
- **Backend:** Node.js + Fastify, TypeScript
- **Database:** Supabase (Postgres + auth)
- **LLM:** OpenAI (`gpt-4.1-mini` default) — vocabulary-controlled generation is the load-bearing technical bet; see Risks.
- **Coach loop:** scheduled job (`node-cron` in v1, can move to Supabase Edge Function later) reviewing session data and rebalancing user state.

## 9. V1 scope

**In**
- Single user (the author).
- 3–5 starter scenarios (e.g. restaurant, classroom, bus station, hotel, shopping).
- Core loop (section 5).
- Mistake corpus + exposure tracking (section 6).
- Hint-tap logging.
- Background coach loop adjusting difficulty up and down.
- Soft-tone inline correction.

**Out**
- End-of-session summary card.
- Voice input / TTS.
- Explicit level calibration (`/level` command).
- Freeform conversation mode.
- Scoring / streaks.
- Native content.
- Onboarding for non-author users.

## 10. Risks & assumptions

**Load-bearing tech bet:** *LLMs can be reliably constrained to a target vocabulary across multi-turn generation.* Scenario scoping mitigates this (restaurant vocab is finite) but does not eliminate it. **Action: derisk before building backend.** Spend one day proving the model can stay within a 300-word vocab list across 10 turns of a scenario.

**Load-bearing UX bet:** *The author will tolerate the cognitive and emotional cost of production-first practice.* Typing wrong Korean in public is high-friction. Soft tone is supposed to mitigate this; needs verification with real usage.

**Named gap:** *No designed day-1 hook.* The v1 loop is valuable over time but the first session is just "translate, correct, next." If the author isn't opening it unprompted by week 2, the hook gap is the problem, not the loop. The end-of-session summary card (Next) is the planned fix.

**Generalization assumption:** *What works for the author will work for similar intermediate learners.* Probably true within the plateau-intermediate segment; almost certainly false for beginners and heritage learners. Don't generalize until v1 proves itself.

## 11. Success criteria

This is a build-for-self product. Success is measured against the author's own usage:

- **Engagement** — author uses the bot ≥3 sessions/week unprompted, sustained over 4 weeks.
- **Learning signal** — after 4 weeks, error rate on previously-failed grammar patterns (e.g. past-tense particles) declines measurably in the mistake corpus.
- **Loop tightness** — a typical session completes in 90 seconds with ≥3 turns.
- **Tech risk closed** — vocabulary-controlled generation stays within target list ≥90% of turns in scenario contexts.

If all four hold after 4 weeks, generalize. If engagement breaks but learning signal is good, fix the hook. If learning signal breaks, revisit the loop.

## 12. Roadmap

Now / Next / Later. No dates — post-launch evidence reorders things.

### Now (v1, this build)
- Core loop, mistake corpus + exposure table, coach loop, hint tracking, soft-tone correction.

### Next (immediate post-v1, evidence-driven)
- End-of-session summary card ("today you learned X new words, made Y mistakes I'll quiz you on tomorrow"). This is also the planned fix for the day-1 hook gap.
- **Voice input + TTS responses.** Conversation in voice is core to actually learning to speak; promoted from Later.
- `/level` slash command — LexTale-style 90-second adaptive vocab quickcheck for explicit calibration.
- Daily review session generated from the mistake corpus — your personal Anki, surfaced as a chat.
- Scoring / streak system — *only if data shows retention is a problem.*
- More scenarios + scenario-difficulty tagging.

### Later (parked, evidence-dependent)
- Freeform conversation mode (no scripted scenario).
- Generalization to other intermediate learners (new-user onboarding flow).
- Native content integration (K-drama, lyrics) for advanced mode.
