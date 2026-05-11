# Multi-Agent Orchestration Playbook — Wasender Integration

**Scope:** Adding Wasender as a second WhatsApp provider to a Next.js 14 + TypeScript app (`lib/infobip.ts` → `lib/wa/` abstraction + new `lib/wa/wasender.ts`).
**Audience:** The orchestrator (this Claude session) running on Claude Code with the `superpowers` plugin (v5.1.0) installed.
**Goal:** Pick the right level of agent coordination for a *small, well-scoped feature*. Not a research mega-system.
**Date:** 2026-05-11.

---

## 1. Recommended Pipeline (read this first)

```
[Orchestrator: this session]
        │
        ▼
┌───────────────────────────────────────────────────┐
│ Phase 0 — Brainstorm (superpowers:brainstorming)  │  HUMAN GATE
│   Output: docs/superpowers/specs/YYYY-MM-DD-      │  user approves
│           wasender-design.md                      │  the spec
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│ Phase 1 — Research (PARALLEL, already done)       │
│   Agent A: Wasender API surface                   │
│   Agent B: Multi-provider architecture            │
│   Agent C: This playbook                          │
│   Dispatch rule: dispatching-parallel-agents      │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│ Phase 2 — Synthesis (orchestrator, NOT a subagent)│
│   Fold A+B+C into one design doc.                 │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│ Phase 3 — Plan (superpowers:writing-plans)        │
│   Output: docs/superpowers/plans/YYYY-MM-DD-      │
│           wasender.md (TDD steps, exact paths)    │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│ Phase 4 — Execute                                 │
│   superpowers:subagent-driven-development         │
│   = fresh subagent per task                       │
│   + spec-compliance review                        │
│   + code-quality review                           │
│   (Tasks SEQUENTIAL — they share lib/wa/ files)   │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│ Phase 5 — Verify + Ship                           │
│   verification-before-completion (gate)           │
│   finishing-a-development-branch (PR)             │
└───────────────────────────────────────────────────┘
```

Total subagent dispatches expected: **~3 research + (3 × N tasks for implementer/spec-reviewer/quality-reviewer) + 1 final reviewer**. For a 5-task plan that's ~19 subagent calls. Stay disciplined — this is small enough that adding a 6th "coordination" agent is overhead, not value.

---

## 2. Phase Ownership Map

| Phase | Owner | Skill / subagent type | Artifact |
|---|---|---|---|
| 0 Brainstorm | orchestrator (this session) | `superpowers:brainstorming` | `docs/superpowers/specs/YYYY-MM-DD-wasender-design.md` |
| 1 Research | 2–3 parallel subagents | `Task` tool, `general-purpose` `subagent_type` | research notes returned inline |
| 2 Synthesis | orchestrator | (none — orchestrator collates) | merged into the design spec |
| 3 Plan | orchestrator | `superpowers:writing-plans` | `docs/superpowers/plans/YYYY-MM-DD-wasender.md` |
| 4 Execute | fresh subagent per task | `superpowers:subagent-driven-development` (controller) → implementer / spec-reviewer / code-quality-reviewer subagents | commits on `feat/wasender` |
| 5 Ship | orchestrator | `superpowers:verification-before-completion` then `superpowers:finishing-a-development-branch` | PR |

**Note on subagent types.** Claude Code's documented built-ins are **`Explore`, `Plan`, and `general-purpose`** ([Claude Code docs](https://code.claude.com/docs/en/sub-agents)). The fancy named types in your prompt (`researcher`, `system-architect`, `backend-dev`, `tester`, `reviewer`, `code-review-and-quality`) are **not built-ins** — they're either user-defined custom subagents (`.claude/agents/*.md`) or names that exist only inside agent marketplaces. **UNVERIFIED for this repo** — none of those custom agent files exist under `.claude/agents/` here. Default to `general-purpose` and craft the prompt per-call. Don't invent agent names.

---

## 3. Parallelization Rules

Cite: `superpowers:dispatching-parallel-agents` (5.1.0). Cite: Anthropic's [orchestrator-worker write-up](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13).

**Parallelize when all three hold:**
1. Tasks operate on **independent problem domains** (different files, different external APIs, different concerns).
2. Each task can be understood **without context from the others**.
3. No shared writes — agents don't edit the same files concurrently.

**For this feature, parallel is right ONLY in Phase 1 (research).**
- Agent A reads Wasender docs (external HTTP, no repo touch).
- Agent B studies multi-provider patterns (read-only on `lib/infobip.ts` + general patterns).
- Agent C wrote this doc.
- All three return text. Zero file conflicts. Independent context windows. Safe.

**Sequential is right for Phase 4 (implementation).** Tasks share `lib/wa/types.ts`, `lib/wa/index.ts`, and the env config. `superpowers:subagent-driven-development` explicitly says: *"Never dispatch multiple implementation subagents in parallel (conflicts)"*. Honor it.

**Don't parallelize the design spec.** The brainstorming skill has a `HARD-GATE`: no implementation skill until the user approves the spec. A single orchestrator drafting it is correct — splitting into "I'll have one agent draft architecture and another draft test plan" creates merge drift for zero speed-up.

**Cost reality check.** Anthropic's data: multi-agent runs use **~15× tokens** vs. a normal chat ([Anthropic, 2025-06](https://www.anthropic.com/engineering/multi-agent-research-system)). Use parallel dispatch where it earns its keep — independent research domains and independent test-fix domains. Not for ceremony.

---

## 4. Hand-off Discipline

Each phase produces a **single, named artifact** the next phase reads. Subagents never inherit chat history; they get a constructed prompt + paths to read (`superpowers:dispatching-parallel-agents` calls this out, and Claude Code docs confirm: subagents *"work in isolated context windows ... return only the summary"*  — [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)).

| Hand-off | From → To | Artifact path | What MUST be in it |
|---|---|---|---|
| 1 → 2 | research subagents → orchestrator | inline returns (Agent A, B, C) | API surface, auth, error shapes; provider interface options; this playbook |
| 2 → 0/3 | orchestrator → spec | `docs/superpowers/specs/2026-05-11-wasender-design.md` | architecture, file map, error handling, test strategy, feature flag plan |
| 3 → 4 | `writing-plans` → `subagent-driven-development` | `docs/superpowers/plans/2026-05-11-wasender.md` | bite-sized TDD steps with exact paths + code blocks |
| 4 → 5 | implementer subagents → orchestrator | git commits + TodoWrite | one commit per task, tests green |

**No verbal hand-offs.** If it's not in a file or a TodoWrite entry, it doesn't exist for the next agent. The implementer subagent in Phase 4 should be able to do its task by reading only: (a) the relevant task text from the plan, (b) the files the task names, (c) the running CLAUDE.md.

---

## 5. Verification Gates

Use `superpowers:verification-before-completion` (5.1.0). Its iron law: *"NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE."*

| Gate | Who decides | What proves it |
|---|---|---|
| **G1 — Spec approval** | HUMAN | User says "approved" on the design doc. Brainstorming `HARD-GATE` blocks all implementation skills until this. |
| **G2 — Plan approval** | HUMAN | Quick user read of the plan file. `writing-plans` offers execution choice; user picks Subagent-Driven. |
| **G3 — Per-task spec compliance** | spec-reviewer subagent | Subagent returns ✅; implementer fixes until ✅. |
| **G4 — Per-task code quality** | code-quality-reviewer subagent | Subagent returns ✅; runs AFTER G3. |
| **G5 — Tests green** | orchestrator runs `npm test` | Exit 0, fresh output captured in the message. |
| **G6 — Real CAPI / Infobip / Wasender smoke** | HUMAN | Send a test lead through `/api/webhooks/...` against a preview deploy. CLAUDE.md mandates this for integration changes. |
| **G7 — Ship choice** | HUMAN | `finishing-a-development-branch` 4-option menu. |

G1 and G2 are *non-negotiable human gates* — a WhatsApp provider swap can silently drop leads, and the CLAUDE.md "fail loud, never silent" rule means we want a human eyeball before we automate touching production templates.

---

## 6. Anti-Patterns Specific to This Task

1. **Synthesis-as-subagent.** Only the orchestrator has all three research returns in one context. A "synthesis subagent" loses the connective tissue.
2. **Parallel implementation tasks.** `lib/wa/types.ts`, `lib/wa/index.ts`, `client.config.ts`, `.env.local` get touched repeatedly. Run sequential. `subagent-driven-development` is explicit on this.
3. **Inventing `subagent_type` strings.** Claude Code ships **`general-purpose`** plus `Explore` / `Plan` as built-ins ([source](https://code.claude.com/docs/en/sub-agents)). `backend-dev`, `system-architect`, etc. are not built-ins here. Use `general-purpose`, specialize in the prompt.
4. **Over-parallel research.** Each research subagent is ~4× a chat turn ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)). Two-to-three is the sweet spot for this task. Adding a 4th "competitive analysis" agent is ceremony.
5. **Skipping the spec gate.** MAST taxonomy ([Cemri et al., 2025](https://arxiv.org/abs/2503.13657)) names *task verification gaps* as a top failure category. Skipping G1/G2 means implementers drift on unvalidated assumptions.
6. **Letting an implementer subagent read the whole plan.** `subagent-driven-development` red flag: *"Make subagent read plan file (provide full text instead)"*. Orchestrator pastes the one task.
7. **Performative agreement on reviewer feedback.** `receiving-code-review` forbids "you're absolutely right!". Verify, then fix or push back with reasoning.
8. **Silent catches in Wasender code.** CLAUDE.md: *"No `catch {}` without re-throwing or logging."* Put this constraint in the implementer's prompt; the code-quality reviewer must enforce it.
9. **Hard-coded Hebrew strings.** Wasender error / status / retry copy MUST flow through `client.config.ts` and `hebrew-content-writer`. Subagents don't read your CLAUDE.md unless you give it to them — include the relevant excerpts in each implementer prompt.

---

## 7. Concrete Recommendations — Run This Order

1. **Post-research.** Phase 1 done (3 research agents returned).
2. **Synthesize in this conversation, no extra agent.** Fold Wasender API + multi-provider patterns + this playbook into one doc.
3. **Invoke `superpowers:brainstorming`.** One clarifying question at a time, 2–3 approaches, writes spec to `docs/superpowers/specs/2026-05-11-wasender-design.md`, commits. Stop at `HARD-GATE`. Wait for user approval (**G1**).
4. **After approval**, terminal-state to `superpowers:writing-plans`. Plan to `docs/superpowers/plans/2026-05-11-wasender.md`. User reviews (**G2**).
5. **Pick Subagent-Driven execution.** Invoke `superpowers:subagent-driven-development`. Per task, dispatch via `Task` with `subagent_type: "general-purpose"`. Implementer prompt = task text + relevant paths + CLAUDE.md constraints (Hebrew, multi-client config, no silent catches, `lib/phone.ts` for CAPI). Then spec-reviewer (**G3**) → code-quality-reviewer (**G4**). Loop until both ✅, next task.
6. **Final reviewer subagent** over `BASE_SHA..HEAD_SHA` (`requesting-code-review` template).
7. **Run `npm test`** in this session, fresh output in-message (**G5**).
8. **User fires a test lead** at the preview deploy (**G6**) — CLAUDE.md mandates this for integration changes.
9. **Invoke `superpowers:finishing-a-development-branch`** — 4-option ship menu (**G7**).

---

## 8. Quick Reference — When To Use What

| Situation | Skill / Action |
|---|---|
| About to design anything | `superpowers:brainstorming` |
| Multiple independent research questions | `superpowers:dispatching-parallel-agents` (parallel `Task` calls, `general-purpose`) |
| Have a spec, need a plan | `superpowers:writing-plans` |
| Have a plan, executing now in this session | `superpowers:subagent-driven-development` |
| Have a plan, executing in a separate session | `superpowers:executing-plans` |
| About to claim "done" | `superpowers:verification-before-completion` |
| Mid-task review | `superpowers:requesting-code-review` |
| Got review feedback | `superpowers:receiving-code-review` (NO "you're absolutely right!") |
| Writing implementation code | `superpowers:test-driven-development` (RED → verify-fail → GREEN → verify-pass → REFACTOR) |
| Ready to ship | `superpowers:finishing-a-development-branch` |
| Need an isolated workspace | `superpowers:using-git-worktrees` (already done — you're in `feat-wasender_05-2026`) |

---

## 9. Skills To Skip For This Task

UNVERIFIED-for-this-repo / overkill:

- **`swarm-orchestration`, `swarm-advanced`, `v3-swarm-coordination`, `hive-mind_*` MCP tools** — built for >5-agent distributed systems. 15× token cost for no benefit on a one-file feature.
- **`reasoningbank-*`, `agentdb-*`** — pattern-storage / vector-search infra. Useful for long-running learning systems, not one-shot features.
- **`mcp__claude-flow__agent_spawn`** — parallel, but `Task` already does this with one less abstraction layer. Don't switch tooling mid-pipeline.

Phase 1 used `Task`. Keep `Task` for Phase 4.

---

## 10. Sources

- **superpowers v5.1.0 skills** (installed locally, path `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/`).
- Anthropic Engineering — [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13). 15×-token cost, 90.2% improvement, failure modes, lead-agent prompt rules.
- Claude Code Docs — [Create custom subagents](https://code.claude.com/docs/en/sub-agents) (2026). Built-in types (`Explore`, `Plan`, `general-purpose`), isolation model.
- Claude Code Docs — [Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams) (2026). Escalation reference — *not* what this task needs.
- Claudefa.st — [Sub-Agent Best Practices: Parallel vs Sequential](https://claudefa.st/blog/guide/agents/sub-agent-best-practices). Dispatch patterns; medium quality; Research → Plan → Implementation chain.
- Cemri et al. — [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657) (arXiv 2025-03, NeurIPS 2025). MAST: 14 failure modes, 3 categories. Source for over-parallelization-overhead claim.
- AddyOsmani — [The Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/) (2025).

**DATED flag:** Anything older than 2025-05 on Claude Code agent architecture — re-check; subagent / agent-teams split shifted through 2025–early-2026.
**UNVERIFIED flag:** `researcher`, `system-architect`, `backend-dev`, `tester`, `reviewer`, `code-review-and-quality` are *not* built-in `subagent_type` values in this install. Default to `general-purpose`; specialize via prompt.
