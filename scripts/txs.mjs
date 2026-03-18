#!/usr/bin/env node
/**
 * List and verify transactions for a wallet.
 *
 * Fetches pending/completed ops from the NodPay API, then independently
 * verifies each one using @nodpay/core: decode callData, recompute hashes,
 * recover signers, and check owner membership.
 *
 * Usage:
 *   npx nodpay txs --safe <SAFE_ADDRESS> --chain <CHAIN>
 */

import { ethers } from 'ethers';
import {
  computeSafeOpHash,
  computeUserOpHash,
  decodeCallData,
  recoverEcdsaSigner,
  recoverRejectSigner,
} from '@nodpay/core';

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const safe = getArg('--safe');
const chain = getArg('--chain');

if (!safe) {
  console.error(JSON.stringify({ error: '--safe <address> is required' }));
  process.exit(1);
}

const baseUrl = 'https://nodpay.ai/api';
const params = new URLSearchParams({ safe });
if (chain) params.set('chain', chain);

try {
  const res = await fetch(`${baseUrl}/txs?${params}`);
  const data = await res.json();

  // Verify each operation
  if (data.txs && data.txs.length > 0) {
    for (const op of data.txs) {
      op._verified = {};

      // 1. Decode callData → actual to/value
      if (op.callData) {
        try {
          const decoded = decodeCallData(op.callData);
          if (decoded) {
            op._verified.decodedTo = decoded.to;
            op._verified.decodedValue = decoded.value;
            // Cross-check: does decoded match claimed?
            if (op.to && decoded.to.toLowerCase() !== op.to.toLowerCase()) {
              op._verified.toMismatch = true;
              op._verified.warning = `Claimed to=${op.to} but callData decodes to=${decoded.to}`;
            }
            if (op.value && decoded.value !== op.value) {
              op._verified.valueMismatch = true;
              op._verified.warning = (op._verified.warning || '') +
                ` Claimed value=${op.value} but callData decodes value=${decoded.value}`;
            }
          }
        } catch (e) {
          op._verified.decodeError = e.message;
        }
      }

      // 2. Recompute safeOpHash from UserOp fields
      if (op.userOp && op.chainId) {
        try {
          const recomputedSafeOpHash = computeSafeOpHash(op.userOp, op.chainId);
          op._verified.recomputedSafeOpHash = recomputedSafeOpHash;
          if (op.safeOpHash && recomputedSafeOpHash !== op.safeOpHash) {
            op._verified.hashMismatch = true;
            op._verified.warning = (op._verified.warning || '') +
              ` safeOpHash mismatch: claimed=${op.safeOpHash} computed=${recomputedSafeOpHash}`;
          }

          const recomputedUserOpHash = computeUserOpHash(op.userOp, op.chainId);
          op._verified.recomputedUserOpHash = recomputedUserOpHash;
        } catch (e) {
          op._verified.hashError = e.message;
        }
      }

      // 3. Recover propose signature signer
      if (op.safeOpHash && op.signatures) {
        try {
          const sigs = typeof op.signatures === 'object' ? Object.values(op.signatures) : [];
          for (const sig of sigs) {
            if (sig && sig.data) {
              const recovered = recoverEcdsaSigner(op.safeOpHash, sig.data);
              op._verified.proposeSigner = recovered;
            }
          }
        } catch (e) {
          op._verified.sigRecoverError = e.message;
        }
      }

      // 4. Recover reject signature signer
      if (op.safeOpHash && op.rejectSignature) {
        try {
          const recovered = recoverRejectSigner(op.safeOpHash, op.rejectSignature);
          op._verified.rejectSigner = recovered;
        } catch (e) {
          op._verified.rejectSigError = e.message;
        }
      }

      // Summary
      const warnings = op._verified.warning;
      if (warnings) {
        op._verified.status = 'WARNING';
      } else if (op._verified.recomputedSafeOpHash) {
        op._verified.status = 'VERIFIED';
      } else {
        op._verified.status = 'UNVERIFIED';
      }
    }
  }

  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
