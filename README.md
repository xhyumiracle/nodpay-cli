# NodPay — Trusted Agent Wallet

> "Two minds, one wallet."

A multisig crypto wallet shared between humans and AI agents. Built on [Safe](https://safe.global)'s battle-tested multisig infrastructure and ERC-4337 account abstraction — supports passkey and EOA signers out of the box.

**For the full agent integration guide, see [nodpay.ai/skill.md](https://nodpay.ai/skill.md).**

## Package Structure

This npm package (`nodpay`) is the **agent-facing CLI**. It is also published as a skill on [ClawHub](https://clawhub.ai/xhyumiracle/nodpay).

| Distribution | Contains | Audience |
|--------------|----------|----------|
| **npm** (`npx nodpay`) | CLI scripts + `SKILL.md` | Any AI agent |
| **ClawHub** (`clawhub install nodpay`) | `SKILL.md` only | OpenClaw agents |
| **nodpay.ai/skill.md** | `SKILL.md` via CDN proxy | All agent frameworks |

The CLI provides five commands:

```
nodpay keygen     # Generate agent keypair (~/.nodpay/.env, chmod 600)
nodpay nonce      # Query next nonce (on-chain EntryPoint + pending proposals)
nodpay propose    # Propose a transaction for human approval (--nonce required)
nodpay txs        # List and verify transactions for a wallet
nodpay gasprice   # Get current gas price + estimated cost per chain
```

## Quick Start

```bash
# 1. Generate key (public address only in stdout; key never exposed)
npx nodpay keygen

# 2. Get next nonce (on-chain + pending)
npx nodpay nonce --safe 0xWALLET --chain base

# 3. Propose a payment
npx nodpay propose \
  --chain base \
  --safe 0xWALLET \
  --to 0xRECIPIENT \
  --value-eth 0.01 \
  --nonce 0 \
  --human-signer-passkey-x 0x... \
  --human-signer-passkey-y 0x... \
  --recovery-signer 0x...

# 4. Check transactions (with verification)
npx nodpay txs --safe 0xWALLET

# 5. Estimate gas cost for a sweep
npx nodpay gasprice --chain base
```

## Security

All config lives in `~/.nodpay/` — zero `process.env` references in code.

- **Hardened Key Isolation:** private key written directly to `~/.nodpay/.env` (chmod 600), strictly excluded from stdout and agent context.
- **Zero Trust:** `txs` independently verifies every server response (decode calldata → recompute hash → recover signer → check owner set).
- **Threshold Security:** 2-of-3 multisig — agent cannot move funds unilaterally.

See [SKILL.md](./SKILL.md) for the complete Trust Model.

## Related

| Package | Description |
|---------|-------------|
| [`@nodpay/core`](https://www.npmjs.com/package/@nodpay/core) | Protocol primitives — hash, decode, verify (identity-agnostic) |
| [nodpay.ai](https://nodpay.ai) | Web app — wallet creation & transaction approval |

## Supported Chains

Ethereum · Base · Arbitrum · Optimism · Polygon · Sepolia · Base Sepolia

## License

MIT
