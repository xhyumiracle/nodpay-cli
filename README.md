# NodPay

> Two minds, one wallet.

AI agents propose on-chain payments. Humans approve with one tap. Self-custodial 2-of-3 multisig powered by [Safe](https://safe.global).

## Install

```bash
npx nodpay propose --safe 0x... --to 0x... --value-eth 0.01 --signer-type passkey
```

No install needed — `npx` handles everything.

## What it does

1. **Agent** generates a key and sends the user a wallet creation link
2. **User** opens the link, creates a passkey wallet in 30 seconds
3. **Agent** proposes transactions → user approves or rejects each one

The wallet is an ERC-4337 Safe multisig. The agent holds 1 key, the user holds 2 (passkey + recovery). The agent cannot spend without human approval.

## Quick start

```bash
# 1. Generate an agent key
node -e "const w=require('ethers').Wallet.createRandom();console.log(w.address,w.privateKey)"

# 2. Send user: https://nodpay.ai/?agent=YOUR_ADDRESS

# 3. After user creates wallet, propose a transaction:
NODPAY_AGENT_KEY=0x... npx nodpay propose \
  --safe 0xWALLET --to 0xRECIPIENT --value-eth 0.01 \
  --signer-type passkey --passkey-x 0x... --passkey-y 0x... --recovery 0x...
```

## Docs

- **Full agent guide**: [nodpay.ai/skill.md](https://nodpay.ai/skill.md)
- **Website**: [nodpay.ai](https://nodpay.ai)

## Supported chains

Ethereum · Base · Arbitrum · Optimism · Polygon · Sepolia · Base Sepolia

## License

MIT
