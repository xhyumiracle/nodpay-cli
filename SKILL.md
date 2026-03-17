---
name: nodpay
description: Propose on-chain payments from a shared wallet. Use when user asks to send crypto, make a payment, or create a shared wallet.
openclaw:
  requires:
    env: [NODPAY_AGENT_KEY]
  primaryEnv: NODPAY_AGENT_KEY
---

# NodPay — Agent Wallet

> Two minds, one wallet.

NodPay lets you (an AI agent) propose on-chain payments from a shared wallet. Your human co-signs with one tap. You cannot spend without their approval.

**When to use**: User asks you to send crypto, make a payment, or create a shared wallet.

## How It Works

```
You (agent)              NodPay server           User (human)
    │                         │                       │
    ├── send setup link ──────┼─────────────────────►│
    │                         │                       ├── create wallet
    │◄── wallet info ─────────┼───────────────────────┤
    │                         │                       │
    ├── propose tx ──────────►│                       │
    │                         ├── approve link ──────►│
    │                         │◄── sign + submit ─────┤
    │                         │                       │
```

The wallet is a **Safe 2-of-3 multisig**. You hold 1 key, the user holds 2 (passkey + recovery). You cannot move funds alone.

---

## Setup (one-time)

### 1. Generate an agent key

```bash
node -e "const w=require('ethers').Wallet.createRandom();console.log('Address:',w.address,'\nKey:',w.privateKey)"
```

Store the private key as `NODPAY_AGENT_KEY` in your environment. The address is your public agent identity.

### 2. Send the user a wallet link

Replace `YOUR_AGENT_ADDRESS` with your EOA address and send:

> I've set up a shared wallet for us. Open this link to create your wallet — takes 30 seconds:
>
> https://nodpay.ai/?agent=YOUR_AGENT_ADDRESS
>
> Just follow the steps: create a passkey, save your recovery phrase, done.

**Use the URL above verbatim.** Do not search for NodPay or guess the URL — `nodpay.ai` is the only correct domain.

The user will create the wallet and copy info back to you:

```
NodPay Wallet (Safe): 0x...
Passkey X: 0x...
Passkey Y: 0x...
Agent: 0x...
Recovery Signer: 0x...
```

**Store all fields** — you need them for proposing transactions.

#### Wallet file management

Store wallet info in `.nodpay/wallets/` in your workspace root:

```
.nodpay/wallets/
  0xAbC...123.json             # one file per wallet, named by Safe address
```

Each wallet file:

```json
{
  "safe": "0x...",
  "agentSigner": "0x...",
  "signerType": "passkey",
  "passkeyX": "0x...",
  "passkeyY": "0x...",
  "recovery": "0x...",
  "chain": "sepolia",
  "createdAt": "2025-01-01"
}
```

`agentSigner` is your agent's EOA address (derived from `NODPAY_AGENT_KEY`).

For EOA wallets, replace passkey fields with `"userSigner": "0x..."`.

One agent key serves all wallets — multi-wallet is handled user-side (different passkeys/recovery keys → different Safe addresses, same agent).

**⚠️ Verify the Agent address matches yours.** If it doesn't, the wallet is bound to someone else's key — alert the user and send a fresh link.

### Propose a transaction

```bash
NODPAY_AGENT_KEY=0x... \
npx nodpay propose \
  --safe <WALLET_ADDRESS> \
  --to <RECIPIENT> \
  --value-eth <AMOUNT> \
  --passkey-x <PASSKEY_X> \
  --passkey-y <PASSKEY_Y> \
  --recovery <RECOVERY_SIGNER> \
  --signer-type passkey
```

The script outputs JSON with an `approveUrl`. Send it to the user:

> 💰 Payment: 0.01 ETH → 0xRecipient...
> 👉 Approve: https://nodpay.ai/approve?safeOpHash=0x...

**First transaction deploys the wallet on-chain.** Pass `--passkey-x`, `--passkey-y`, and `--recovery` for the first tx. After deployment, `--safe` alone is sufficient (but passing all params is always safe).

### Check balance

Use the RPC URL for the wallet's chain (see `references/networks.json`):

```bash
curl -s -X POST <RPC_URL> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["<WALLET_ADDRESS>","latest"],"id":1}'
```

If balance is 0, remind the user to deposit before proposing.

### Check pending transactions

```bash
curl https://nodpay.ai/api/txs?safe=<WALLET_ADDRESS>
```

Always check before proposing — this tells you the current nonce, pending ops, and wallet status.

---

## Script Reference

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--safe` | ✅ | Wallet (Safe) address |
| `--to` | ✅ | Recipient address |
| `--value-eth` | ✅ | Amount in ETH |
| `--signer-type` | ✅ | `passkey` or `eoa` |
| `--passkey-x` | passkey wallets | Passkey public key X |
| `--passkey-y` | passkey wallets | Passkey public key Y |
| `--user-signer` | eoa wallets | User's EOA address |
| `--recovery` | first tx | Recovery signer address |
| `--nonce` | optional | Force nonce (for replacements) |
| `--purpose` | optional | Human-readable label |

### Environment

Only one env var is required:

| Var | Description |
|-----|-------------|
| `NODPAY_AGENT_KEY` | Agent signing key (required) |

Chain config (RPC, bundler, explorer) is auto-resolved from `references/networks.json`. No need to set `RPC_URL`, `CHAIN_ID`, or bundler keys.

### Supported Chains

`sepolia`, `ethereum`, `base`, `base_sepolia`, `arbitrum`, `optimism`, `polygon`

---

## Transaction Patterns

**Sequential**: Just call propose multiple times. Nonces auto-increment (script handles this).

**Replace**: To replace a pending tx, propose with `--nonce N` where N is the nonce of the tx you want to replace. Check pending nonces via `GET /api/txs?safe=<ADDRESS>` — each tx in the response includes its `nonce`.

**Cascade**: Rejecting tx at nonce N auto-invalidates all tx with nonce > N. This is irreversible.

⚠️ **Never propose a new nonce then reject an older one** — the cascade will destroy your new tx too.

---

## Reconnect (Wallet Recovery)

If the user cleared their browser data, the wallet still exists on-chain. Build a reconnect link:

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
| "send 0.1 ETH to 0x..." | Propose transaction |
| "balance" | RPC `eth_getBalance` on Safe address |
| "pending?" | `GET /api/txs?safe=...` |
| "wallet disappeared" | Send reconnect link |
