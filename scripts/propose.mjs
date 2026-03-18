#!/usr/bin/env node
/**
 * Create and partially sign a Safe UserOperation via ERC-4337.
 * Alternative to propose-tx.mjs for 4337/passkey users.
 *
 * The agent signs first (1 of 2). The serialized SafeOperation is
 * output so the web app can have the user co-sign and submit.
 *
 * Agent key: read from .nodpay/.env (never from env vars or CLI args).
 * Chain config: resolved via --chain from @nodpay/core networks registry.
 * Bundler: NodPay public proxy (override with OP_STORE_URL for self-hosted).
 *
 * Args:
 *   --chain <name>           - Chain name (ethereum, base, sepolia, etc.)
 *   --to <address>           - Recipient address
 *   --value-eth <amount>     - Value in ETH (default: 0)
 *   --safe <address>         - Wallet (Safe) address
 *   --counterfactual         - Safe not yet deployed; include deployment in UserOp
 *   --human-signer-eoa <address>  - Human's EOA signer address (for EOA mode)
 *   --salt <nonce>           - Salt nonce (required for counterfactual)
 *   --reuse-gas-from <shortHash>  - Reuse gas values from a previous op (shortHash prefix of safeOpHash)
 *   --nonce <n>              - Override nonce
 *
 * Output: JSON with userOpHash, safeTxHash, safeOperationJson, etc.
 */

import { Safe4337Pack } from '@safe-global/relay-kit';
import { ethers } from 'ethers';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeUserOpHash, ENTRYPOINT } from '@nodpay/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PENDING_DIR = join(__dirname, '..', '.pending-txs');
mkdirSync(PENDING_DIR, { recursive: true });

// Resolve chain config: --chain flag auto-resolves from networks.json, env vars as fallback
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const NETWORKS = require('@nodpay/core/networks');
const allChains = { ...NETWORKS.mainnet, ...NETWORKS.testnet };

const chainArg = process.argv.includes('--chain')
  ? process.argv[process.argv.indexOf('--chain') + 1]
  : null;

// CHAIN RESOLUTION: --chain flag looks up RPC and chain ID from @nodpay/core's
// network registry (public RPC endpoints). No secrets involved — these are the
// same public endpoints listed on chainlist.org.
let RPC_URL, CHAIN_ID;
if (chainArg) {
  const net = allChains[chainArg];
  if (!net) {
    console.error(`Error: Unknown chain "${chainArg}". Supported: ${Object.keys(allChains).join(', ')}`);
    process.exit(1);
  }
  RPC_URL = net.rpcUrl;
  CHAIN_ID = String(net.chainId);
} else {
  console.error('Error: --chain is required.\nSupported: ' + Object.keys(allChains).join(', '));
  process.exit(1);
}
const ENTRYPOINT_ADDRESS = ENTRYPOINT;

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';

// SECURITY: Read agent key from ~/.nodpay/.env file (chmod 600), not from
// process.env or CLI args. The key is loaded at runtime by the script itself,
// so it never passes through the LLM agent's context or conversation history.
function loadAgentKey() {
  try {
    const envPath = join(HOME, '.nodpay', '.env');
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [name, ...rest] = trimmed.split('=');
      if (name.trim() === 'NODPAY_AGENT_KEY') {
        return rest.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
  return null;
}
const NODPAY_AGENT_KEY = loadAgentKey();
const DEFAULT_SAFE = null; // always use --safe flag

// BUNDLER: NodPay provides a public bundler proxy at nodpay.ai/api/bundler so
// agents don't need their own bundler API key. This is a thin relay — it
// forwards the UserOp to a bundler service and returns the result. The proxy
// only sees the already-signed (partial) UserOp; it cannot modify or execute it.
// Optional overrides (OP_STORE_URL, WEB_APP_URL) also read from ~/.nodpay/.env.
function loadDotEnvVar(name, fallback) {
  try {
    const envPath = join(HOME, '.nodpay', '.env');
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [k, ...rest] = trimmed.split('=');
      if (k.trim() === name) return rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
  return fallback;
}
const opStoreBase = loadDotEnvVar('OP_STORE_URL', 'https://nodpay.ai/api');
const BUNDLER_URL = `${opStoreBase}/bundler/${CHAIN_ID}`;

if (!NODPAY_AGENT_KEY) {
  console.error(JSON.stringify({ error: 'Missing NODPAY_AGENT_KEY in ~/.nodpay/.env — run npx nodpay keygen first' }));
  process.exit(1);
}

const agentWallet = new ethers.Wallet(NODPAY_AGENT_KEY);
const AGENT_ADDRESS = agentWallet.address;

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}
function hasFlag(name) {
  return args.includes(name);
}

const to = getArg('--to');
const valueEth = getArg('--value-eth') || getArg('--value') || '0';
const safeOverride = getArg('--safe');
let isCounterfactual = hasFlag('--counterfactual');
const humanSigner = getArg('--human-signer-eoa');
const salt = getArg('--salt') || '1001';

// Passkey support
const passkeyX = getArg('--human-signer-passkey-x');
const passkeyY = getArg('--human-signer-passkey-y');
const passkeyRawId = getArg('--passkey-raw-id');
const passkeyVerifier = getArg('--passkey-verifier') || '0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765';
const recoverySigner = getArg('--recovery-signer');
const isPasskey = !!(passkeyX && passkeyY);

if (!to) {
  console.error(JSON.stringify({ error: 'Missing --to <address>' }));
  process.exit(1);
}

if (!ethers.isAddress(to)) {
  console.error(JSON.stringify({ error: `Invalid recipient address: ${to}` }));
  process.exit(1);
}

const SAFE_ADDRESS = safeOverride || DEFAULT_SAFE;

if (!isCounterfactual && !SAFE_ADDRESS) {
  console.error(JSON.stringify({ error: 'Missing SAFE_ADDRESS. Use --safe <address> or set SAFE_ADDRESS env, or use --counterfactual.' }));
  process.exit(1);
}

// Auto-detect counterfactual: if --safe given but not deployed, switch to counterfactual
if (!isCounterfactual && SAFE_ADDRESS) {
  const _provider = new ethers.JsonRpcProvider(RPC_URL);
  const _code = await _provider.getCode(SAFE_ADDRESS);
  if (_code === '0x') {
    isCounterfactual = true;
    console.error(`[INFO] Safe ${SAFE_ADDRESS} not deployed, switching to counterfactual mode`);
  }
}

if (isCounterfactual && !humanSigner && !isPasskey) {
  console.error(JSON.stringify({ error: '--counterfactual requires --human-signer-eoa <address> (or use passkey mode)' }));
  process.exit(1);
}

const value = ethers.parseEther(valueEth).toString();

/**
 * Fetch conservative gas values from chain RPC.
 * Uses gasPrice × 3 as a buffer for fee volatility.
 * Gas limits are hardcoded floors that comfortably cover P-256 FCL verification.
 * Excess gas limits are NOT charged — actual fee = actual gas used × actual price.
 */
/**
 * Gas estimation from measured components — no bundler needed.
 * See ARCHITECTURE.md Section 2. Excess limits are NOT charged on-chain.
 *
 * ┌─────────────────────────────────┬──────────┬────────────────────────────────┐
 * │ Component                       │ Measured │ Source                         │
 * ├─────────────────────────────────┼──────────┼────────────────────────────────┤
 * │ Safe proxy CREATE2 + setup()    │  425,000 │ deploy(777k) - call(352k)      │
 * │ EntryPoint handleOps overhead   │   55,000 │ receipt - inner execution       │
 * │ Safe validateUserOp (non-P256)  │   45,000 │ signature decode + module call  │
 * │ Safe executeUserOp dispatch     │   30,000 │ module → execTransaction        │
 * │ ETH transfer (base cost)        │   21,000 │ EVM constant                   │
 * │ P-256 via RIP-7212 precompile   │   27,000 │ estimateGas on all 7 chains    │
 * │ P-256 via FCL library fallback  │  400,000 │ observed range 200-400k        │
 * │ initCode validation overhead    │   50,000 │ factory call decode + verify    │
 * ├─────────────────────────────────┼──────────┼────────────────────────────────┤
 * │ Safety multiplier               │    1.4x  │ covers browser variance in     │
 * │                                 │          │ clientDataJSON length           │
 * └─────────────────────────────────┴──────────┴────────────────────────────────┘
 *
 * All supported chains have RIP-7212, but we size for FCL fallback
 * in case new chains without precompile are added.
 */

/**
 * Gas baselines from bundler simulation on Sepolia (with RIP-7212 precompile).
 * These are the bundler's own estimates for successful txs — the most accurate reference.
 *
 *   Scenario  │ vGL       │ cGL     │ pvG     │ P-256 method
 *   ──────────┼───────────┼─────────┼─────────┼──────────────
 *   deploy    │ 2,653,312 │ 213,422 │ 194,498 │ precompile (27k)
 *   call      │   500,000 │ 218,222 │ 176,846 │ precompile (27k)
 *
 * For chains without RIP-7212, P-256 goes through FCL library (~400k).
 * Delta = 400k - 27k = 373k added to vGL.
 *
 * Safety: 1.2x multiplier on baselines (covers browser clientDataJSON variance).
 */
const BUNDLER_BASELINE = {
  deploy: { vgl: 2653312n, cgl: 213422n, pvg: 194498n },
  call:   { vgl:  500000n, cgl: 218222n, pvg: 176846n },
};

const P256_PRECOMPILE_COST = 27000n;
const P256_FCL_COST = 400000n;
const P256_DELTA = P256_FCL_COST - P256_PRECOMPILE_COST; // 373k extra without precompile

// Chains with RIP-7212 precompile (verified via estimateGas on address 0x100)
const HAS_P256_PRECOMPILE = new Set([
  '1', '8453', '42161', '10', '137',     // mainnets
  '11155111', '84532',                     // testnets
]);

const SAFETY = 12n; // 1.2x (divide by 10)

function estimateGas(isCounterfactual, chainId) {
  const base = isCounterfactual ? BUNDLER_BASELINE.deploy : BUNDLER_BASELINE.call;
  const hasPrecompile = HAS_P256_PRECOMPILE.has(String(chainId));

  let vgl = base.vgl;
  if (!hasPrecompile) vgl += P256_DELTA;

  return {
    verificationGasLimit: vgl * SAFETY / 10n,
    callGasLimit:         base.cgl * SAFETY / 10n,
    preVerificationGas:   base.pvg * SAFETY / 10n,
  };
}

async function getDefaultGasValues(isCounterfactual = false, chainId = CHAIN_ID) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
  const FEE_MULTIPLIER = 3n; // covers gas price volatility between propose → approve

  return {
    ...estimateGas(isCounterfactual, chainId),
    maxFeePerGas: (gasPrice * FEE_MULTIPLIER).toString(),
    maxPriorityFeePerGas: (ethers.parseUnits('2', 'gwei') * FEE_MULTIPLIER).toString(),
  };
}

try {
  // Build init options for Safe4337Pack
  // For passkey Safes, use passkey object as signer to get correct initCode
  // (includes SharedSigner.configure() in setup). Agent signs manually afterward.
  const initOptions = {
    provider: RPC_URL,
    bundlerUrl: BUNDLER_URL,
  };

  if (isPasskey) {
    // Passkey signer: Safe4337Pack auto-adds SharedSigner + configure() to setup
    initOptions.signer = {
      rawId: passkeyRawId || '0xdeadbeef',
      coordinates: { x: passkeyX, y: passkeyY },
      customVerifierAddress: passkeyVerifier,
    };
    if (isCounterfactual) {
      const passkeyOwners = recoverySigner
        ? [AGENT_ADDRESS, recoverySigner] // SharedSigner auto-added by SDK
        : [AGENT_ADDRESS]; // SharedSigner auto-added by SDK
      initOptions.options = {
        owners: passkeyOwners,
        threshold: 2,
      };
      if (salt) initOptions.options.saltNonce = salt;
    } else {
      initOptions.options = { safeAddress: SAFE_ADDRESS };
    }
  } else {
    // EOA signer: agent key as primary signer
    initOptions.signer = NODPAY_AGENT_KEY;
    if (isCounterfactual) {
      // Canonical owner order: [humanSigner, agentSigner, recoverySigner] — must match frontend
      const eoaOwners = recoverySigner
        ? [humanSigner, AGENT_ADDRESS, recoverySigner]
        : [humanSigner, AGENT_ADDRESS];
      initOptions.options = {
        owners: eoaOwners,
        threshold: 2,
      };
      if (salt) initOptions.options.saltNonce = salt;
    } else {
      initOptions.options = { safeAddress: SAFE_ADDRESS };
    }
  }

  const safe4337Pack = await Safe4337Pack.init(initOptions);

  const safeAddress = await safe4337Pack.protocolKit.getAddress();

  // Auto-detect deployment status: if Safe is already deployed, drop counterfactual
  if (isCounterfactual) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const code = await provider.getCode(safeAddress);
    if (code !== '0x') {
      isCounterfactual = false;
      // Re-init without counterfactual options to avoid initCode
      initOptions.options = { safeAddress };
      if (isPasskey) {
        // Keep passkey signer for correct module handling
      } else {
        // For EOA, just set safeAddress
      }
      // Note: Safe4337Pack will skip initCode for deployed Safes automatically
      // since protocolKit detects deployment status
    }
  }

  // Nonce + gas management for sequential proposals
  const customNonceArg = getArg('--nonce');
  const reuseGasFrom = getArg('--reuse-gas-from'); // shortHash of a previous op to copy gas values from
  let txOptions = {};
  const opStoreUrl = opStoreBase;
  const safeAddr = await safe4337Pack.protocolKit.getAddress();

  // Determine nonce: on-chain nonce is the source of truth.
  // For queued ops, find the highest pending nonce and increment.
  if (customNonceArg !== undefined) {
    txOptions.customNonce = BigInt(customNonceArg);
  } else {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const ep = new ethers.Contract('0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
        ['function getNonce(address,uint192) view returns (uint256)'], provider);
      const onChainNonce = await ep.getNonce(safeAddr, 0);

      // Check pending ops to find the highest queued nonce
      const listRes = await fetch(`${opStoreUrl}/txs?safe=${safeAddr}&chain=${CHAIN_ID}`);
      let nextNonce = onChainNonce;
      if (listRes.ok) {
        const listData = await listRes.json();
        for (const op of (listData.txs || listData.ops || [])) {
          const opNonce = BigInt(op.nonce ?? -1);
          if (opNonce >= onChainNonce && opNonce >= nextNonce) {
            nextNonce = opNonce + 1n;
          }
        }
      }
      // Only set custom nonce if we need to skip ahead for queuing
      if (nextNonce > onChainNonce) {
        txOptions.customNonce = nextNonce;
      }
      // else: let SDK use on-chain nonce naturally
    } catch (e) {
      // Non-fatal: SDK will use its own nonce detection
    }
  }

  // Resolve gas values: use hardcoded defaults (from RPC gas price) always.
  // If --reuse-gas-from is provided and fetch succeeds, use those values instead
  // (useful for re-proposing ops with identical gas parameters).
  let gasValues = await getDefaultGasValues(isCounterfactual);

  if (reuseGasFrom) {
    try {
      const refRes = await fetch(`${opStoreUrl}/tx/${reuseGasFrom}`);
      if (refRes.ok) {
        const refData = await refRes.json();
        const uo = refData.data?.safeOperationJson?.userOperation;
        if (uo) {
          gasValues = {
            callGasLimit: BigInt(uo.callGasLimit),
            verificationGasLimit: BigInt(uo.verificationGasLimit),
            preVerificationGas: BigInt(uo.preVerificationGas),
            maxFeePerGas: BigInt(uo.maxFeePerGas),
            maxPriorityFeePerGas: BigInt(uo.maxPriorityFeePerGas),
          };
          console.error(`[INFO] Reusing gas values from op ${reuseGasFrom}`);
        }
      }
    } catch (e) {
      // Non-fatal: fall through to defaults already set
      console.error(`[INFO] Could not fetch gas from ${reuseGasFrom}, using defaults`);
    }
  }

  // Monkey-patch getEstimateFee to always use our hardcoded gas values.
  // This bypasses bundler simulation entirely — the dummy bundlerUrl is never called.
  // Gas limits are set conservatively high; excess is NOT charged on-chain.
  safe4337Pack.getEstimateFee = async ({ safeOperation }) => {
    safeOperation.addEstimations(gasValues);
    return safeOperation;
  };

  // Create the transaction as a SafeOperation (UserOp wrapper)
  const safeOperation = await safe4337Pack.createTransaction({
    transactions: [{ to, value, data: '0x' }],
    options: txOptions,
  });

  // Agent signs (1 of 2 signatures)
  // For passkey Safes, the pack's signer is the passkey (not agent key),
  // so we sign manually with the agent's private key.
  // Use the SDK's own hash computation — safeOperation.getHash() uses viem.hashTypedData
  // This is the canonical hash that matches the on-chain verification
  function bigintReplacer(key, val) {
    return typeof val === 'bigint' ? val.toString() : val;
  }
  const safeOpHash = safeOperation.getHash();
  const rawSafeOp = safeOperation.getSafeOperation();
  const eip712Types = safeOperation.getEIP712Type();
  const eip712Domain = {
    chainId: parseInt(CHAIN_ID, 10),
    verifyingContract: safeOperation.options.moduleAddress,
  };

  // Always sign manually with the agent's private key over the canonical hash
  // (Using SDK's signSafeOperation would apply viem hex transforms that produce
  //  a different hash than getHash(), making server-side verification impossible)
  const sig = agentWallet.signingKey.sign(safeOpHash);
  const agentSig = ethers.Signature.from(sig).serialized;
  safeOperation.addSignature({
    signer: AGENT_ADDRESS,
    data: agentSig,
    isContractSignature: false,
  });
  const signedOperation = safeOperation;

  // Serialize the SafeOperation for the web app
  const safeOperationJson = JSON.parse(JSON.stringify({
    userOperation: signedOperation.userOperation,
    options: signedOperation.options,
    signatures: Object.fromEntries(signedOperation.signatures || new Map()),
  }, bigintReplacer));

  // Include EIP-712 data so web app can use eth_signTypedData_v4
  const safeOpForSigning = JSON.parse(JSON.stringify({
    domain: eip712Domain,
    types: eip712Types,
    value: rawSafeOp,
  }, bigintReplacer));

  safeOperationJson.safeOpHash = safeOpHash;
  safeOperationJson.eip712 = safeOpForSigning;

  // Compute the real EntryPoint userOpHash (for bundler receipt lookup)
  const entryPointUserOpHash = computeUserOpHash(signedOperation.userOperation, parseInt(CHAIN_ID, 10));

  const shortId = safeOpHash.slice(2, 10);

  const result = {
    userOpHash: entryPointUserOpHash,
    safeOpHash,
    shortId,
    to,
    value,
    valueEth,
    safeAddress,
    counterfactual: isCounterfactual,
    status: 'pending_user_signature',
    chainId: parseInt(CHAIN_ID, 10),
    safeOperationJson,
    createdAt: new Date().toISOString(),
  };

  // Save locally for tracking
  writeFileSync(join(PENDING_DIR, `4337-${shortId}.json`), JSON.stringify(result, null, 2));

  // Store to op-store API for hash-based web app lookup
  // NOTE: signerType intentionally NOT sent — it's determined by user's browser
  // (localStorage), not by agent. See ARCHITECTURE.md Client Verification Chain.
  const storePayload = {
    safeOperationJson,
    userOpHash: entryPointUserOpHash,
    to,
    value,
    valueEth,
    safeAddress,
    chainId: parseInt(CHAIN_ID, 10),
    counterfactual: isCounterfactual,
    agent: AGENT_ADDRESS,
    agentSignature: safeOperationJson.signatures,
    createdAt: new Date().toISOString(),
  };

  // Extract raw agent signature for server auth
  const agentSigEntry = Object.values(safeOperationJson.signatures || {})[0];
  const rawAgentSignature = agentSigEntry?.data || null;

  let approveUrl = null;
  try {
    const storeRes = await fetch(`${opStoreUrl}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...storePayload,
        agentSignature: rawAgentSignature,
        agentAddress: AGENT_ADDRESS,
      }),
    });
    const storeData = await storeRes.json();
    if (!storeRes.ok) {
      result.opStoreError = storeData.error || `HTTP ${storeRes.status}`;
    }
    if (storeData.shortHash) {
      const webBase = loadDotEnvVar('WEB_APP_URL', 'https://nodpay.ai/');
      approveUrl = `${webBase}approve?safeOpHash=${storeData.safeOpHash}`;
      result.approveUrl = approveUrl;
      result.opStoreSafeOpHash = storeData.safeOpHash;
      result.opStoreShortHash = storeData.shortHash;
    }
  } catch (e) {
    // Non-fatal: op-store might not be running
    result.opStoreError = e.message;
  }

  console.log(JSON.stringify(result, null, 2));

} catch (error) {
  console.error(JSON.stringify({ error: error.message || String(error) }));
  process.exit(1);
}
