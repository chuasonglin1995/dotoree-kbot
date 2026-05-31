# Architecture Decision Records (ADRs)

This folder captures the **why** behind architectural decisions on this project. Code shows *what* we built; ADRs show *why we built it that way and what we considered instead*.

The audience is **future-you** (and any future contributor) trying to understand a decision months or years from now without re-deriving it from scratch.

## When to write an ADR

Write one when a decision:

- Is hard or costly to reverse later (deployment target, database choice, framework swap).
- Has real tradeoffs you weighed (not just "the obvious answer").
- Will surprise a future reader if the rationale isn't recorded.
- Sets a convention that other parts of the codebase will follow.

**Do not write an ADR** for routine implementation choices (variable names, file layout within a module, library bug workarounds). Those belong in code comments or PR descriptions.

## File naming

```
NNNN-kebab-case-topic.md
```

- `NNNN` — 4-digit zero-padded sequence number. **Never reused**, even if an ADR is superseded.
- Title is the **decision topic**, not the chosen option. Use `bot-transport-mode-polling-vs-webhook`, not `use-polling`. The topic stays stable even if we change our minds later.

## Lifecycle

Every ADR has a `Status` field that follows this lifecycle:

```
  Proposed  ──►  Accepted  ──►  Superseded by NNNN
                     │
                     └────────►  Deprecated
```

- **Proposed** — drafted but not yet committed to. Up for discussion.
- **Accepted** — the current truth. Code in the repo follows this decision.
- **Superseded by NNNN** — a later ADR replaced it. Update the status line and link forward to the new ADR. **Do not delete the file.** The history matters.
- **Deprecated** — no longer relevant, with no replacement. Rare.

## Template

Copy the structure from any existing ADR, or use this skeleton:

```markdown
# NNNN — <Decision topic>

- Status: <Proposed | Accepted | Superseded by NNNN | Deprecated>
- Date: YYYY-MM-DD
- Deciders: <names>

## Context
What situation forced this decision? What's the problem and what constraints
apply?

## Options considered
Brief description of each viable option. Use a comparison table when the
options have many dimensions.

## Decision
The chosen option, in one or two sentences. Plain and unambiguous.

## Rationale
Why this option won. Reference the decision drivers — what mattered most,
and how each option scored against them.

## Consequences
What becomes true once this decision is in place. Both good and bad.

## Revisit when
What conditions would make us re-open this ADR? This lets future-you know
when the decision has expired.

## References
Conversations, PRs, related ADRs, external docs.
```

## Style guidance

- **Short prose, sharp tables.** A reader should grasp the decision in under two minutes.
- **Name the assumptions.** "We chose X because we have one user" is more useful than "We chose X because it's simpler" — the first dates itself usefully; the second hides the real reason.
- **Be honest about tradeoffs.** If the chosen option has real downsides, list them. Hiding them just means future-you has to rediscover them.
- **"Revisit when" is load-bearing.** Most ADRs decay silently. This section is what saves them from becoming stale folklore.
