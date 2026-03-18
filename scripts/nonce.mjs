#!/usr/bin/env node
/**
 * Query the next available nonce for a Safe wallet from on-chain EntryPoint.
 *
 * This is the ERC-4337 standard: EntryPoint.getNonce(sender, key).
 * Pure on-chain query — no server dependency.
 *
 * Usage:
 *   npx nodpay nonce --safe <SAFE_ADDRESS> --chain <CHAIN>
 *
 * Output:
 *   { "nonce": 0, "safe": "0x...", "chain": "base", "chainId": "8453" }
 */

import { ethers } from 'ethers';
import { ENTRYPOINT } from '@nodpay/core';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const NETWORKS = require('@nodpay/core/networks');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const safe = getArg('--safe');
const chainArg = getArg('--chain');

if (!safe) {
  console.error(JSON.stringify({ error: '--safe <address> is required' }));
  process.exit(1);
}
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

try {
  const provider = new ethers.JsonRpcProvider(net.rpcUrl);
  const ep = new ethers.Contract(
    ENTRYPOINT,
    ['function getNonce(address sender, uint192 key) view returns (uint256)'],
    provider
  );
  const onChainNonce = await ep.getNonce(safe, 0);

  console.log(JSON.stringify({
    nextNonce: Number(onChainNonce),
    safe,
    chain: chainArg,
    chainId: String(net.chainId),
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
