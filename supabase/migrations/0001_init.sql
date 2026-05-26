-- Korean Learning Companion — v1 schema
-- Layers:
--   Static reference: vocab, grammar (seeded from word-bank JSON)
--   User identity:    users
--   Activity:         sessions, turns
--   Adaptive memory:  exposures, mistakes

-- ─────────────────────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────────────────────
create table users (
  id                   uuid primary key default gen_random_uuid(),
  telegram_id          bigint unique not null,
  current_topik_level  int not null default 1,
  created_at           timestamptz not null default now(),
  last_seen_at         timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- Static reference: vocab
-- ─────────────────────────────────────────────────────────────
create table vocab (
  id            int primary key,
  lemma_ko      text not null,
  gloss_en      text not null,
  pos           text not null,
  topik_level   int  not null,
  freq_tier     int  not null,
  scenarios     jsonb not null default '[]'::jsonb
);

create index vocab_topik_level_idx on vocab(topik_level);
create index vocab_freq_tier_idx   on vocab(freq_tier);
create index vocab_scenarios_idx   on vocab using gin (scenarios);

-- ─────────────────────────────────────────────────────────────
-- Static reference: grammar
-- ─────────────────────────────────────────────────────────────
create table grammar (
  id            int primary key,
  pattern       text not null,
  gloss_en      text not null,
  example_ko    text not null,
  example_en    text not null,
  topik_level   int  not null
);

create index grammar_topik_level_idx on grammar(topik_level);

-- ─────────────────────────────────────────────────────────────
-- Activity: sessions
-- A session = one continuous conversation in a chosen scenario.
-- ─────────────────────────────────────────────────────────────
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  scenario    text not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

create index sessions_user_id_idx on sessions(user_id);

-- ─────────────────────────────────────────────────────────────
-- Activity: turns
-- A turn = one prompt -> user reply -> correction -> follow-up cycle.
-- ─────────────────────────────────────────────────────────────
create table turns (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references sessions(id) on delete cascade,
  turn_number       int  not null,
  prompt_en         text,
  user_input_ko     text,
  bot_correction    text,
  bot_followup_ko   text,
  bot_followup_en   text,
  hints_used        int  not null default 0,  -- 0/1/2/3 tier reached
  created_at        timestamptz not null default now()
);

create index turns_session_id_idx on turns(session_id);
create unique index turns_session_turn_uq on turns(session_id, turn_number);

-- ─────────────────────────────────────────────────────────────
-- Adaptive memory: exposures
-- One row per (user, vocab) — accumulates as the user encounters words.
-- ─────────────────────────────────────────────────────────────
create table exposures (
  user_id          uuid not null references users(id) on delete cascade,
  vocab_id         int  not null references vocab(id) on delete cascade,
  exposure_count   int  not null default 0,
  correct_count    int  not null default 0,
  incorrect_count  int  not null default 0,
  last_seen_at     timestamptz not null default now(),
  primary key (user_id, vocab_id)
);

-- ─────────────────────────────────────────────────────────────
-- Adaptive memory: mistakes (the headline differentiator)
-- ─────────────────────────────────────────────────────────────
create table mistakes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  turn_id              uuid not null references turns(id) on delete cascade,
  user_text            text not null,
  correct_text         text not null,
  category             text,  -- 'vocab' | 'particle' | 'tense' | 'word_order' | 'spelling' | 'other'
  related_vocab_id     int references vocab(id),
  related_grammar_id   int references grammar(id),
  scheduled_review_at  timestamptz,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now()
);

create index mistakes_user_id_idx     on mistakes(user_id);
create index mistakes_review_due_idx  on mistakes(user_id, scheduled_review_at)
  where resolved_at is null;
