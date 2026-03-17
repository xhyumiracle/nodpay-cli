# Agent Operational Notes

Advanced patterns and edge cases. Read SKILL.md first.

## Nonce Management

- **Auto-increment**: propose without `--nonce` → script fetches on-chain nonce, auto-increments past pending ops
- **Replace**: use `--nonce N` with same nonce as pending tx → both appear in dashboard, user picks one
- **Gas reuse**: when nonce > on-chain nonce, bundler rejects gas estimation (`AA25`). Script auto-reuses gas from the first pending op.

## Status Lifecycle

```
pending → submitted → executed
                   ↘ rejected
                   ↘ replaced (another tx at same nonce was executed)
                   ↘ invalidated (cascade from lower nonce rejection)
```

## Multi-Wallet

One agent can serve multiple wallets. Different user devices → different passkeys → different Safe addresses. Always confirm which wallet before proposing.

## EOA Wallets

For users who prefer MetaMask/browser wallet over passkey:

```bash
node scripts/propose.mjs \
  --safe <WALLET_ADDRESS> \
  --to <RECIPIENT> \
  --value-eth <AMOUNT> \
  --user-signer <USER_EOA_ADDRESS> \
  --recovery <RECOVERY_SIGNER> \
  --signer-type eoa
```

## Owner Ordering (CREATE2)

Safe address is deterministically derived. Owner order is fixed:

- **Passkey**: `[agent, recovery, SharedSigner]`
- **EOA**: `[userSigner, agent, recovery]`

Wrong order → wrong address. The propose script handles this automatically.

## API Reference

```
GET  /api/txs?safe=<addr>                    # list all ops for a wallet
GET  /api/txs?safe=<addr>&status=pending     # filter by status
GET  /api/tx/<shortHash>                     # get single op by hash prefix
```
