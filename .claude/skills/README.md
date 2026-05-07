# Claude skills bundle

Three external skill packs are vendored here as git sparse subtrees (NOT submodules — full copy at the recorded commit, license-audited).

| Pack | Source | License | Commit SHA (Day-0) |
| --- | --- | --- | --- |
| `alirezarezvani/` | https://github.com/alirezarezvani/claude-skills | MIT | `7d493fed97e4d57553630e1a2432c1c02bf5b2b3` |
| `joellewis-finance/` | https://github.com/JoelLewis/finance_skills | MIT | `f553a84f722218ac29d7db6bdd9cee704f925bae` |
| `openaccountant/` | https://github.com/openaccountant/skills | MIT | `f5abe381f24b5b7d59f1d0b4a825b14494ff2034` |

## Dropped at clone time
- **`tfriedel/claude-office-skills`** — investigated, but the repo had no LICENSE file at HEAD `d4241e43b60e8f96b0a80c3b1eb75fe8858437c0`. Per the project's safety rule, packs without a permissive license at the recorded commit are dropped and documented. The repo's README points to https://github.com/anthropics/skills as Anthropic's official, currently-maintained home; if we need office-document skills (PPTX/DOCX/XLSX/PDF) we'll evaluate that repo's license at that point.

## Runtime-loaded subset (production agent)
The full vendored set is available to Claude Code in development. The **production** AI CFO agent (instantiated by `@ai-cfo/agent.createAgent`) loads only:

- `openaccountant/business/anomaly_detect/` — anomaly classification heuristics.
- `openaccountant/business/reconciliation/` — reconciliation playbook (matches our `packages/reconcile` boundary).
- `joellewis-finance/core/*` — core finance review skills.

Everything else is dev-time only and not part of any production system prompt. Claude Code's local skill loader will see all of `.claude/skills/`; the agent SDK consumer is filtered by name.

## Updating
We do not pull updates from the upstreams automatically — the recorded SHAs are the immutable copy that ships with this repo. To upgrade a pack:
1. `git clone <upstream> /tmp/<name>` and re-verify license.
2. `rsync -a --exclude=.git /tmp/<name>/ .claude/skills/<name>/`.
3. Update this README's SHA row.
4. Run `bun run typecheck` and `bun run test:eval` to confirm no regression in grounding/feature recall.
