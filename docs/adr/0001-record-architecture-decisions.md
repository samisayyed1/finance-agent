# ADR 0001 — Record architecture decisions

## Status
Accepted — 2026-05-07

## Context
We need a durable, auditable trail of why the architecture is what it is. Slack threads vanish; PR descriptions get squashed; READMEs drift. Every consequential technical decision in AI Operating CFO must be findable in five years by someone who wasn't in the room.

## Decision
Adopt MADR-format Architecture Decision Records under `docs/adr/`. One ADR per consequential decision. Every ADR has Status / Context / Decision / Consequences. Decisions are append-only; superseded ADRs reference their successor. PRs that change architectural shape must add or update an ADR.

## Consequences
- New engineers can read 14 short markdown files and understand the spine of the system.
- ADR review becomes part of code review — incentive to write thoughtfully.
- Some friction on small changes; we accept that as the tax for clarity.
- Numbering is monotonic; we never renumber even if content shifts.
- The first six months of the company will be the most productive in this directory.
