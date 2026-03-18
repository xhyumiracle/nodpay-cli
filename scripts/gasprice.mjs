#!/usr/bin/env node
/**
 * Get current gas price and estimated gas cost for a NodPay transaction.
 *
 * Useful before proposing a sweep ("send all funds") — lets you calculate
 * how much ETH to leave for gas before proposing the full balance.
 *
 * Usage:
 *   npx nodpay gasprice --chain <CHAIN>
 *
 * Output:
 *   {
 *     "chain": "base",
 *     "chainId": "8453",
 *     "gasPriceGwei": "0.0012",
 *     "estimatedGasCost": {
 *       "deploy": "0.000152",   // first tx (Safe not yet deployed)
 *       "call": "0.000043"      // subsequent txs
 *     }
 *   }
 *
 * The agent should use:
 *   maxSendable = balance - estimatedGasCost.deploy  (if nonce 0 / counterfactual)
 *   maxSendable = balance - estimatedGasCost.call    (if Safe already deployed)
 */

import { ethers } from 'ethers';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const NETWORKS = require('@nodpay/core/networks');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const chainArg = getArg('--chain');
if (!chainArg) {
  const allChains = { ...NETWORKS.mainnet, ...NETWORKS.testnet };
  console.error(JSON.stringify({ error: '--chain is required. Supported: ' + Object.keys(allChains).join(', ') }));
  process.exit(1);
}

const allChains = { ...NETWORKS.mainnet, ...NETWORKS.testnet };
const net = allChains[chainArg];
if (!net) {
  console.error(JSON.stringify({ error: `Unknown chain "${chainArg}". Supported: ${Object.keys(allChains).join(', ')}` }));
  process.exit(1);
}

// Gas baselines from bundler simulation (same as propose.mjs)
const BUNDLER_BASELINE = {
  deploy: { vgl: 2653312n, cgl: 213422n, pvg: 194498n },
  call:   { vgl:  500000n, cgl: 218222n, pvg: 176846n },
};
const P256_DELTA = 400000n - 27000n; // FCL vs precompile
const HAS_P256_PRECOMPILE = new Set(['1', '8453', '42161', '10', '137', '11155111', '84532']);
const SAFETY = 12n; // 1.2x

function totalGasUnits(isCounterfactual, chainId) {
  const base = isCounterfactual ? BUNDLER_BASELINE.deploy : BUNDLER_BASELINE.call;
  let vgl = base.vgl;
  if (!HAS_P256_PRECOMPILE.has(String(chainId))) vgl += P256_DELTA;
  const vglS = vgl * SAFETY / 10n;
  const cglS = base.cgl * SAFETY / 10n;
  const pvgS = base.pvg * SAFETY / 10n;
  return vglS + cglS + pvgS;
}

try {
  const provider = new ethers.JsonRpcProvider(net.rpcUrl);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
  const FEE_MULTIPLIER = 3n; // same buffer as propose.mjs (propose→approve window)

  const effectiveGasPrice = gasPrice * FEE_MULTIPLIER;

  const deployCost = totalGasUnits(true, net.chainId) * effectiveGasPrice;
  const callCost   = totalGasUnits(false, net.chainId) * effectiveGasPrice;

  console.log(JSON.stringify({
    chain: chainArg,
    chainId: String(net.chainId),
    gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
    effectiveGasPriceGwei: ethers.formatUnits(effectiveGasPrice, 'gwei'),
    estimatedGasCost: {
      deploy: ethers.formatEther(deployCost),  // nonce 0 / counterfactual Safe
      call:   ethers.formatEther(callCost),    // Safe already deployed
    },
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
