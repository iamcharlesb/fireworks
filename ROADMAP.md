# Fireworks++ Roadmap

Self-ownership is the right reason to bet on Fireworks++ — but only if we close the
gaps that OpenAI Agents SDK already covers for free (maturity, multi-agent, product
adapters). This backlog is verified against the current `src/` tree as of 2026-08-01,
not just asserted — each item below is marked with what actually exists today so we
don't re-build things that are already there.

## Phase 0 — Make it a real package (blocks everything else)

- [ ] Publish `fireworks-plus-plus` (private npm / GitHub Packages) and pin versions.
      `package.json` is still `0.1.0`, unpublished, no `repository` pointing at a real remote.
- [ ] Add CI: build + typecheck + tests on every PR.
      **Confirmed gap** — no `.github/workflows/` directory exists at all.
- [ ] Split the monolith smoke test into unit + integration suites; set a coverage floor.
      **Confirmed gap** — `test/` contains exactly one file, `smoke.test.cjs`, run via
      `npm test` → `node --test test/**/*.test.cjs`.
- [ ] Freeze a v0.2 stable surface: `createAgent()` (see `src/simple`), tool calling,
      providers, checkpoints — document "don't break."
- [ ] Add CHANGELOG + semver policy so apps can upgrade safely.
      **Confirmed gap** — no `CHANGELOG.md` in the repo.

## Phase 1 — Close OpenAI Agents SDK parity gaps

- [ ] **Multi-agent handoffs** — first-class `Agent` + `handoff()` / specialist routing.
      **Confirmed gap** — `src/agents/planner.ts` only tags plan steps with an
      `owner: "planner" | "specialist" | "executor" | "verifier"` string label. There's no
      `Agent` object, no `handoff()` primitive, and no runtime that actually routes
      execution to a different agent/model/tool-set based on that label.
- [ ] **Sessions / durable memory** — Postgres/Redis backends.
      **Confirmed** — `src/memory/*` (buffer/summary/thread/window) and
      `src/checkpoints/{file,memory}.ts` are the only implementations; checkpoints
      default to `.fireworks-plus-plus/checkpoints/` on local disk. No DB-backed store exists.
- [ ] **Guardrails as agent-loop-native hooks.**
      **Partially exists, not wired in** — `src/safety/policy.ts` (`SafetyPolicy`) is a real
      regex-based input/output filter, but nothing in `src/agents/executor.ts` or
      `tool_calling_executor.ts` calls it. Today it's a class you can invoke by hand, not a
      guardrail the agent loop enforces. The work here is wiring, not building from scratch.
- [ ] **Hosted-quality tracing** — OpenTelemetry export + one dashboard path
      (Langfuse/Datadog/your management server).
      **Partially exists** — `src/callbacks/tracing.ts` (`TracingCallbackHandler`) already
      builds full in-memory run trees (LLM/chain/tool spans, timings, token counts, agent
      actions). What's missing is only the *export*: there is no OTel exporter and no
      dashboard sink — it's in-process only and disappears when the process exits.
- [ ] **Streaming events API** — tool start/end, handoff, approval, token deltas as a
      stable event stream for UIs.
      **Partially exists** — `src/callbacks/base.ts` already defines `onLLMNewToken`,
      `onToolStart/End`, `onAgentAction/Finish` as real lifecycle hooks (see
      `StreamingCallbackHandler`, `TracingCallbackHandler`). The actual gaps: (1) these are
      callback classes you construct and pass in, not a subscribable event stream a UI can
      attach to over the wire; (2) there's no `onHandoff` or `onApproval` event, because
      neither handoffs nor approval gates exist yet (see above and Phase 4).
- [ ] **Structured outputs parity across providers.**
      **Mostly already done** — `src/chat_models/anthropic.ts`, `openai.ts`, and
      `gemini.ts` all implement real structured-output paths (Anthropic via forced tool
      call, OpenAI via `response_format: json_schema`, Gemini via its schema field). The
      OpenAI + Anthropic minimum this item asks for is already met. The actual remaining
      gap is `ollama.ts` (the one local provider called out in the non-goals) and
      `perplexity.ts`, which have no structured-output support — and no compatibility test
      pinning any of this down (folds into the Phase 4 compatibility-tests item, don't
      duplicate the work).
- [ ] **Eval harness** — golden datasets per product agent (builder, SDR, retention)
      runnable in CI.
      **Partially exists** — `src/evaluations/{base,runner,string_evaluators}.ts` already
      provide a generic `runEvaluation()` + `BaseEvaluator` harness. What's missing is (1)
      wiring any of it into CI (which doesn't exist yet — Phase 0), and (2) the actual
      golden datasets, which are necessarily product-specific and live outside this repo.

## Phase 2 — Product adapters (this is the real "one to all")

Your apps don't need a better ReAct loop first — they need a shared bus.

- [ ] `@magic/agent-core` (thin layer on Fireworks++) with tenant/auth context, cost +
      audit hooks, tool registry interface.
      Note: `src/governance/{budget,rbac,audit}.ts` already provide generic
      `BudgetManager`, `RBACAuthorizer`, and audit logging primitives that
      `@magic/agent-core` should wrap rather than reinvent — see Phase 4.
- [ ] VAPI adapter — map VAPI webhook tool calls ↔ Fireworks++ tools; assistant sync out
      of band.
- [ ] LLM tool-calling adapter — replace SuperBuilder's hand-rolled 6-round loop.
      (Claim about SuperBuilder's loop is unverified from this repo — SuperBuilder lives
      outside `agentfireworks`. Confirm shape before committing to adapter design.)
- [ ] Domain tool packs (shareable packages): restaurant/POS/save_order,
      appointments/calendar, CRM/campaigns/outbound, website builder mutations.
- [ ] Instruction pipeline — custom instructions + system template combine/extract
      (MagicDial's model).
- [ ] Queue adapters — QStash / RabbitMQ job runners for long workflows (AI SDR
      provisioning).

## Phase 3 — Adopt per app (don't big-bang)

1. SuperBuilder first — platform assistant router/specialists → Fireworks++ (highest
   fit, no VAPI dependency).
2. MagicDial Ask AI / AI SDR chat — second (orchestration + tools).
3. MagicUI retention / smart-alerts — third (simpler agents).
4. Leave live VAPI voice runtime on VAPI; only put tool execution + instruction gen +
   internal agents on Fireworks++.

## Phase 4 — Ops so self-owned doesn't become a liability

- [ ] Persist checkpoints/audit to S3/Postgres (not `.fireworks-plus-plus/` on disk in
      prod). **Confirmed gap**, see Phase 1 sessions/memory note.
- [ ] Wire budget + RBAC to your real user roles (`SUPER_ADMIN` / `ADMIN` / `CUSTOMER`).
      **Frameworks already exist** — `src/governance/rbac.ts` (`RBACAuthorizer`) and
      `budget.ts` (`BudgetManager`) are generic, working implementations with role/permission
      matching and scoped budget consumption already wired to callbacks
      (`governance/handlers.ts`). The work is *configuring* them with the real role enum
      and limits, not building RBAC/budget primitives from scratch.
- [ ] Human-approval gates for destructive tools (builder publish, phone provisioning,
      SSH, etc.). **Confirmed gap** — no approval/HITL mechanism exists anywhere in
      `src/governance` or `src/agents`.
- [ ] On-call runbook: how to debug a stuck run, replay from checkpoint, read audit
      trail.
- [ ] Compatibility tests: each provider's tool-calling against a fixed tool suite.
      **Confirmed gap** — folds in the Ollama/Perplexity structured-output gap above;
      one suite should cover both.

## Suggested order (next 4–6 weeks)

| Week | Focus |
| --- | --- |
| 1 | Publish + CI + stable `createAgent` API |
| 2 | Multi-agent handoffs + session memory backend |
| 3 | `@magic/agent-core` + SuperBuilder migration |
| 4 | VAPI tool adapter + one MagicDial internal agent |
| 5–6 | Tracing export/evals-in-CI + domain tool packs |

## Explicit non-goals (keep ownership focused)

- Don't replace VAPI for phone/voice.
- Don't rebuild LangChain-compatible APIs.
- Don't chase every provider — OpenAI + Anthropic + one local (Ollama) is enough.

Self-owned only pays off if Phase 0 + SuperBuilder adoption land first; otherwise
you're maintaining a framework nobody uses.
