---
name: nodpay
description: Propose on-chain payments from a shared wallet. Use when user asks to send crypto, make a payment, or create a shared wallet.
---

# NodPay — Agent Wallet

> Two minds, one wallet.

A shared crypto wallet for humans and AI agents. Built on Safe's battle-tested multisig and ERC-4337 account abstraction — supports passkey and EOA signers out of the box. Friendly to both crypto-native and first-time users.

You propose payments, your human approves with one tap. 2-of-3 multisig — you cannot spend alone.

## Trust Model

- **Your private key never leaves disk.** `keygen` writes to `.nodpay/.env` (chmod 600) — never in stdout, context, or logs.
- **You can only propose.** Execution requires human co-sign (passkey). No single party can move funds.
- **Wallet info is public key material.** Safe address, passkey X/Y, recovery signer — all safe to store.
- **Recovery key is user-held.** The 12-word phrase generates a third signer the user controls. If the agent key or passkey is lost, the user can still recover funds — the agent never has unilateral access.
- **NodPay server is a stateless relay.** It forwards signed operations to the chain — no private keys, no custody, no accounts. Self-hostable via `OP_STORE_URL`. If the server goes offline, funds stay safe on-chain.
- **The web app is a convenience layer.** It helps users create wallets and approve transactions. All crypto operations happen client-side; nothing sensitive is stored server-side.
- **Verify the agent address matches yours** before storing wallet info. Mismatch = wrong key binding.

## Why NodPay

| What the user sees | What's behind it |
|--------------------|------------------|
| Open link → passkey → done (30s) | Counterfactual Safe deployment, no tx until first use |
| One-tap approve on any device | WebAuthn passkey as on-chain signer (OS-native, no extension) |
| No gas, no hex, no wallet app | ERC-4337 bundles gas; server relays signed UserOps |
| Same address on every chain | CREATE2 deterministic deploy — one address across all chains |
| Agent can't spend without me | 2-of-3 multisig threshold; agent holds 1 key, user holds 2 |

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
