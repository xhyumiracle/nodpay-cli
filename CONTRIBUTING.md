# Skill Authoring Guidelines

This document is for **repo maintainers** editing the NodPay agent skill. The skill is consumed by external AI agents who have zero context about NodPay internals.

## Core Principle

**The reader is a cold agent, not a developer.**

They don't know your codebase, your architecture, or your history. They have one job: help their human send crypto. Everything in SKILL.md must serve that job.

## Writing Rules

### 1. User-facing only

SKILL.md describes **what agents can do**, not how NodPay works internally.

- ✅ "Run this script with these flags"
- ❌ "The Safe4337Pack uses EIP-712 typed data to..."
- ❌ "The server verifies the agent signature by recovering..."

Internal details go in ARCHITECTURE.md or code comments.

### 2. One happy path, then exceptions

Lead with the most common case (passkey wallet, Sepolia). Introduce variations (EOA, mainnet) as branches from the main path, not as parallel tracks.

### 3. Defaults eliminate config

If the script can work with zero config, don't mention the config. The agent shouldn't know about bundler proxies, RPC fallback chains, or op-store URLs.

- ✅ `NODPAY_AGENT_KEY=0x...` (required, can't be defaulted)
- ❌ `OP_STORE_URL=...` (has a working default, agent never needs to touch it)

### 4. Copy-paste ready

Every command block must work if pasted verbatim (with placeholder substitution). No implicit `cd`, no assumed shell state, no "if you followed step 3..."

### 5. Verify with a clean agent

Before merging SKILL.md changes, mentally simulate: a fresh agent reads this file, has never seen NodPay, and must complete the workflow. Did you give them everything they need? Did you give them anything they don't?

## File Roles

| File | Audience | Purpose |
|------|----------|---------|
| `SKILL.md` | External agents | Complete usage guide. Self-contained. |
| `AGENT-NOTES.md` | Agents (advanced) | Edge cases, operational patterns. |
| `.env.example` | External agents | Minimal env template. Only required vars uncommented. |
| `CONTRIBUTING.md` | Repo maintainers | This file. How to write the skill. |
| `references/` | Agents (machine-readable) | Data files (networks, constants). |

## Antipatterns

- **Leaking internals**: mentioning `op-store`, `bundler proxy`, `Safe4337Pack`, `computeUserOpHash` in SKILL.md
- **Dev-only options**: exposing `OP_STORE_URL`, `WEB_APP_URL`, `NODE_ENV` to external agents
- **Stale script names**: SKILL.md says `propose.mjs`, actual file is `propose-4337.mjs` (or vice versa)
- **Implicit knowledge**: "check the pending txs" without giving the exact curl command
- **Over-documenting safety**: agent doesn't need to understand the EIP-712 hash derivation chain to use the tool. Tell them what to verify (agent address match), not how verification works internally.

## Checklist for SKILL.md Changes

- [ ] All script names match actual filenames in `scripts/`
- [ ] All env vars mentioned are in `.env.example`
- [ ] All commands work from the `skill/` directory
- [ ] No internal URLs (localhost, bot.xhyumiracle.com) leak into agent-facing docs
- [ ] Tested with `npm install` from a clean clone
