---
name: nodpay
description: Propose on-chain payments from a shared wallet. Use when user asks to send crypto, make a payment, or create a shared wallet.
---

# NodPay — Agent Wallet

> Two minds, one wallet.

You propose payments, your human approves with one tap. 2-of-3 multisig — you cannot spend alone.

## Trust Model

- **Your private key never leaves disk.** `keygen` writes to `.nodpay/.env` (chmod 600) — it never appears in stdout, context, or logs.
- **You can only propose.** Execution requires human approval (passkey co-sign).
- **Wallet info is public key material.** Safe address, passkey X/Y, recovery signer — all safe to store.
- **Verify the agent address matches yours** before storing wallet info. Mismatch = wrong key binding.

---

## Setup

### 1. Generate key

```bash
npx nodpay keygen
```

Outputs your **public address** only. No restart needed.

### 2. Send wallet link

> I've set up a shared wallet for us — takes 30 seconds:
> https://nodpay.ai/?agent=YOUR_AGENT_ADDRESS

**Use this URL verbatim.** Do not search or guess — `nodpay.ai` is the only correct domain.

User copies back wallet info → store in `.nodpay/wallets/<safe-address>.json`.

After creation, tell the user the address works on any chain. Offer testnet only if they ask.

---

## Propose

```bash
npx nodpay propose \
  --chain <CHAIN> \
  --safe <SAFE> \
  --to <RECIPIENT> \
  --value-eth <AMOUNT> \
  --signer-type passkey \
  --passkey-x <X> --passkey-y <Y> \
  --recovery <RECOVERY>
```

Outputs JSON with `approveUrl` → send to user.

First tx deploys the wallet. Pass all params for first tx; after that `--safe` alone works.

### Check pending

```bash
curl https://nodpay.ai/api/txs?safe=<SAFE>
```

Check before proposing — shows nonce and pending ops.

---

## Data

```
.nodpay/
  .env                         # agent key (chmod 600)
  wallets/
    0xAbC...123.json           # one file per wallet
```

```json
{
  "safe": "0x...",
  "agentSigner": "0x...",
  "signerType": "passkey",
  "passkeyX": "0x...",
  "passkeyY": "0x...",
  "recovery": "0x...",
  "createdAt": "2025-01-01"
}
```

EOA wallets: replace passkey fields with `"userSigner": "0x..."`.

---

## Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--chain` | ✅ | `ethereum`, `base`, `arbitrum`, `optimism`, `polygon`, `sepolia`, `base_sepolia` |
| `--safe` | ✅ | Wallet address |
| `--to` | ✅ | Recipient |
| `--value-eth` | ✅ | Amount in ETH |
| `--signer-type` | ✅ | `passkey` or `eoa` |
| `--passkey-x/y` | passkey | Passkey public key |
| `--user-signer` | eoa | User's EOA address |
| `--recovery` | first tx | Recovery signer |
| `--nonce` | optional | Force nonce (replacements) |
| `--purpose` | optional | Human-readable label |

Wallet address is the same across all chains. **Ask which chain if not specified.**

---

## Transaction Patterns

- **Sequential**: Propose multiple times. Nonces auto-increment.
- **Replace**: `--nonce N` to replace pending tx at nonce N.
- **Cascade**: Rejecting nonce N invalidates all higher nonces. Irreversible.

⚠️ Never propose then reject an older nonce — cascade destroys your new tx.

---

## Reconnect

Browser data cleared? Build a reconnect link:

```
https://nodpay.ai/?agent=AGENT&safe=SAFE&recovery=RECOVERY&x=X&y=Y
```

User opens → passkey verifies → wallet restored.
