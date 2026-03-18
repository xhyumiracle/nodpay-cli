#!/usr/bin/env node
/**
 * Generate (or reuse) an agent keypair.
 *
 * - Stores key in .nodpay/.env (chmod 600) — never appears in stdout or agent context.
 * - If key already exists, reuses it and prints the address.
 * - Outputs only the public address to stdout.
 *
 * Usage:
 *   npx nodpay keygen
 *   npx nodpay keygen --env-file <path>   # custom location
 */

import { Wallet } from 'ethers';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
import { resolve, dirname } from 'path';

const args = process.argv.slice(2);
const envFileIdx = args.indexOf('--env-file');
const envFile = envFileIdx !== -1
  ? resolve(args[envFileIdx + 1])
  : resolve('.nodpay', '.env');

const ENV_VAR = 'NODPAY_AGENT_KEY';

// Check if key already exists in the env file
function findExistingKey() {
  if (!existsSync(envFile)) return null;
  const lines = readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [name, ...rest] = trimmed.split('=');
    if (name.trim() === ENV_VAR) {
      const value = rest.join('=').trim().replace(/^["']|["']$/g, '');
      if (value) return value;
    }
  }
  return null;
}

const existing = findExistingKey();

if (existing) {
  try {
    const wallet = new Wallet(existing);
    console.log(wallet.address);
    console.error(`${ENV_VAR} already configured in ${envFile}`);
  } catch {
    console.error(`${ENV_VAR} exists in ${envFile} but is invalid. Remove it and re-run.`);
    process.exit(1);
  }
} else {
  const wallet = Wallet.createRandom();

  // SECURITY: Private key is written directly to file — it never appears in
  // stdout or process output. This is intentional: the calling agent (LLM)
  // only sees the public address, so the key never enters the model's context
  // window and cannot be leaked via prompt injection or conversation history.
  const dir = dirname(envFile);
  mkdirSync(dir, { recursive: true, mode: 0o700 });   // directory: owner-only
  const content = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  writeFileSync(envFile, content + `${ENV_VAR}=${wallet.privateKey}\n`, { mode: 0o600 }); // file: owner read/write only

  // Only the public address reaches stdout — safe for LLM context
  console.log(wallet.address);
  console.error(`Generated new agent key → ${envFile}`);
}
