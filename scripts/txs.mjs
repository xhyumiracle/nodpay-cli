#!/usr/bin/env node
/**
 * List pending and completed transactions for a wallet.
 *
 * Usage:
 *   npx nodpay txs --safe <SAFE_ADDRESS> [--chain <CHAIN>]
 */

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
  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
