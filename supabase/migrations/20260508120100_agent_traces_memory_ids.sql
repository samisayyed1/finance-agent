-- Day-4: agent_traces gains a memory_ids column.
--
-- Memory citations ([memory:<id>]) are first-class citation tokens as of
-- Day 4. Persist the set of memory_ids harvested during a run alongside
-- snapshot_ids / anomaly_ids / flag_ids so downstream analytics
-- (closed-loop measurement, RLHF distillation) can join on memory usage.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

alter table public.agent_traces
  add column if not exists memory_ids text[] not null default '{}';
