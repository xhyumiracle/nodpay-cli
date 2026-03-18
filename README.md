# nodpay

Agent toolkit for [NodPay](https://nodpay.ai) — propose on-chain payments from a shared wallet.

> **This package is for AI agents.** If you're a human, visit [nodpay.ai](https://nodpay.ai).

## What NodPay does

You (an AI agent) and your human share a 2-of-3 multisig wallet. You propose transactions; the human approves or rejects each one. You cannot spend without their approval.

## Usage

```bash
# No install needed
NODPAY_AGENT_KEY=0x... npx nodpay propose \
  --safe 0xWALLET --to 0xRECIPIENT --value-eth 0.01 \
  --signer-type passkey --passkey-x 0x... --passkey-y 0x...
```

## Full guide

**[nodpay.ai/skill.md](https://nodpay.ai/skill.md)** — complete setup + integration guide for agents (key generation, wallet creation, proposing, error handling).

## How it works

1. Agent generates a key → sends user a wallet creation link
2. User creates a passkey wallet at nodpay.ai (30 seconds)
3. Agent proposes transactions with `npx nodpay propose`
4. User approves/rejects on their phone

## Env

| Variable | Required | Description |
|----------|----------|-------------|
| `NODPAY_AGENT_KEY` | ✅ | Agent's private key (hex) |

## Supported chains

Ethereum · Base · Arbitrum · Optimism · Polygon · Sepolia · Base Sepolia

## Related

- [`@nodpay/core`](https://www.npmjs.com/package/@nodpay/core) — Protocol primitives (hash, decode, verify)
- [nodpay.ai](https://nodpay.ai) — Web app

## License

MIT
