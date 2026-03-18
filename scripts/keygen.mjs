#!/usr/bin/env node
/**
 * Generate (or reuse) an agent keypair.
 *
 * - If NODPAY_AGENT_KEY already exists in --env-file, derives and prints the address.
 * - Otherwise generates a new keypair, appends to --env-file, prints the address.
 *
 * The private key NEVER appears in stdout — only the public address.
 *
 * Usage:
 *   npx nodpay keygen --env-file .env
 */

import { Wallet } from 'ethers';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const args = process.argv.slice(2);
const envFileIdx = args.indexOf('--env-file');
const envFile = envFileIdx !== -1 ? resolve(args[envFileIdx + 1]) : null;

if (!envFile) {
  console.error('Usage: npx nodpay keygen --env-file <path>');
  process.exit(1);
}

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
  appendFileSync(envFile, `\n${ENV_VAR}=${wallet.privateKey}\n`);
  console.log(wallet.address);
  console.error(`Generated new agent key → ${envFile}`);
}
