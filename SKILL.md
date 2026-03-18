---
name: nodpay
description: Propose on-chain payments from a shared wallet. Use when user asks to send crypto, make a payment, or create a shared wallet.
---

# NodPay — Agent Wallet

> Two minds, one wallet.

**TL;DR:** You propose payments, your human approves with one tap. 2-of-3 multisig — you cannot spend alone.

## ⚠️ Security First

| ✅ DO | ❌ DON'T |
|-------|----------|
| Use `npx nodpay keygen` (key never in stdout) | Generate keys manually or log them |
| Store wallet info in `.nodpay/wallets/` | Put private keys in chat or code |
| Verify agent address matches yours | Trust wallet info without checking |
| Let the human approve every transaction | Try to bypass approval |

**Private key never leaves disk.** `keygen` writes directly to `.nodpay/.env` (chmod 600). The key never appears in your output, context, or logs.

---

## Setup (one-time)

### 1. Generate an agent key

```bash
npx nodpay keygen
```

Outputs your **public address** only. Key is stored in `.nodpay/.env`. No gateway restart needed.

If a key already exists, it reuses it and prints the address.

### 2. Send the user a wallet link

Replace `YOUR_AGENT_ADDRESS` with your address and send:

> I've set up a shared wallet for us. Open this link to create your wallet — takes 30 seconds:
>
> https://nodpay.ai/?agent=YOUR_AGENT_ADDRESS
>
> Just follow the steps: create a passkey, save your recovery phrase, done.

**Use the URL above verbatim.** Do not search for NodPay or guess the URL — `nodpay.ai` is the only correct domain.

The user will copy wallet info back to you:

```
NodPay Wallet (Safe): 0x...
Passkey X: 0x...
Passkey Y: 0x...
Agent: 0x...
Recovery Signer: 0x...
```

**Store all fields** in `.nodpay/wallets/<safe-address>.json`.

**After wallet creation**, tell the user their wallet is ready and works on any supported chain. Briefly offer: *"Want to try a test transaction on a testnet first?"* — only guide to testnets if the user says yes.

**⚠️ Verify the Agent address matches yours.** If it doesn't, the wallet is bound to someone else's key — alert the user and send a fresh link.

---

## Usage

### Propose a transaction

```bash
npx nodpay propose \
  --chain <CHAIN> \
  --safe <WALLET_ADDRESS> \
  --to <RECIPIENT> \
  --value-eth <AMOUNT> \
  --passkey-x <PASSKEY_X> \
  --passkey-y <PASSKEY_Y> \
  --recovery <RECOVERY_SIGNER> \
  --signer-type passkey
```

Outputs JSON with an `approveUrl`. Send it to the user:

> 💰 Payment: 0.01 ETH → 0xRecipient...
> 👉 Approve: https://nodpay.ai/approve?safeOpHash=0x...

**First transaction deploys the wallet on-chain.** Pass all params for the first tx. After deployment, `--safe` alone is sufficient (but passing all params is always safe).

### Check pending transactions

```bash
curl https://nodpay.ai/api/txs?safe=<WALLET_ADDRESS>
```

Always check before proposing — shows current nonce, pending ops, and wallet status.

---

## Data Layout

```
.nodpay/
  .env                         # agent key (chmod 600, never touch directly)
  wallets/
    0xAbC...123.json           # one file per wallet
```

Wallet file format:

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

For EOA wallets, replace passkey fields with `"userSigner": "0x..."`.

---

## Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--chain` | ✅ | Chain name (e.g. `ethereum`, `base`, `sepolia`) |
| `--safe` | ✅ | Wallet (Safe) address |
| `--to` | ✅ | Recipient address |
| `--value-eth` | ✅ | Amount in ETH |
| `--signer-type` | ✅ | `passkey` or `eoa` |
| `--passkey-x` | passkey | Passkey public key X |
| `--passkey-y` | passkey | Passkey public key Y |
| `--user-signer` | eoa | User's EOA address |
| `--recovery` | first tx | Recovery signer address |
| `--nonce` | optional | Force nonce (for replacements) |
| `--purpose` | optional | Human-readable label |

### Supported Chains

`ethereum`, `base`, `arbitrum`, `optimism`, `polygon`, `sepolia`, `base_sepolia`

Wallet address is the same across all chains (counterfactual). **Do not assume a default chain.** Ask the user which chain if not specified.

---

## Transaction Patterns

**Sequential**: Just call propose multiple times. Nonces auto-increment.

**Replace**: Propose with `--nonce N` to replace a pending tx at nonce N.

**Cascade**: Rejecting tx at nonce N invalidates all tx with nonce > N. Irreversible.

⚠️ **Never propose a new nonce then reject an older one** — the cascade will destroy your new tx too.

---

## Reconnect (Wallet Recovery)

If the user cleared their browser data:

```
https://nodpay.ai/?agent=YOUR_AGENT_ADDRESS&safe=WALLET_ADDRESS&recovery=RECOVERY_SIGNER&x=PASSKEY_X&y=PASSKEY_Y
```

User opens → verifies passkey → wallet restored. No on-chain action needed.

---

## Security Model

| Owner | Holder | Can do |
|-------|--------|--------|
| Agent EOA | You | Propose only |
| Passkey | User's device | Approve or reject |
| Recovery | User's 12-word phrase | Backup access |

- 2-of-3 threshold — you cannot execute alone
- Passkey X/Y are public key material, safe to store
- No private keys stored on NodPay's server
- Funds are safe on-chain even if NodPay goes offline

---

## Common Requests

| User says | Action |
|-----------|--------|
| "create a wallet" | Send `https://nodpay.ai/?agent=YOUR_ADDRESS` |
| "send 0.1 ETH to 0x..." | `npx nodpay propose --chain ...` |
| "pending?" | `GET /api/txs?safe=...` |
| "wallet disappeared" | Send reconnect link |
