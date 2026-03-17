#!/usr/bin/env node

const command = process.argv[2];

if (command === 'propose') {
  // Forward all args after 'propose' to the propose script
  const scriptPath = new URL('../scripts/propose.mjs', import.meta.url).pathname;
  process.argv = [process.argv[0], scriptPath, ...process.argv.slice(3)];
  await import(scriptPath);
} else if (command === 'version' || command === '--version' || command === '-v') {
  const { readFileSync } = await import('fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(`nodpay v${pkg.version}`);
} else {
  console.log(`Usage: nodpay <command>

Commands:
  propose   Propose a transaction for human approval

Example:
  nodpay propose --safe 0x... --to 0x... --value-eth 0.01 --signer-type passkey

Docs: https://nodpay.ai/skill.md`);
  process.exit(command ? 1 : 0);
}
