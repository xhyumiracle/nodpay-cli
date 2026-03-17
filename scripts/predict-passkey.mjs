#!/usr/bin/env node
/**
 * Predict a Safe address for a passkey-based wallet (counterfactual).
 * 
 * Uses Safe4337Pack with passkey signer support to ensure the Safe setup
 * includes SharedSigner.configure() for passkey coordinates.
 *
 * Env vars:
 *   NODPAY_AGENT_KEY  - Agent signer private key
 *   RPC_URL            - RPC endpoint
 *   CHAIN_ID           - Chain ID (default: 11155111)
 *   PIMLICO_API_KEY    - Pimlico bundler API key
 *
 * Args:
 *   --raw-id <base64>     - Passkey rawId (base64 encoded)
 *   --x <hex>             - Passkey public key x coordinate
 *   --y <hex>             - Passkey public key y coordinate
 *   --salt <nonce>        - Salt nonce (optional, default: random)
 *   --chain-id <number>   - Override chain ID
 *
 * Output: JSON { predictedAddress, owners, threshold, chainId, salt, deployed, passkeyCoordinates }
 */

import { Safe4337Pack } from '@safe-global/relay-kit';
import Safe, { getMultiSendContract, encodeMultiSendData, SafeProvider } from '@safe-global/protocol-kit';
import { OperationType } from '@safe-global/types-kit';
import { ethers } from 'ethers';

const SHARED_SIGNER_ADDRESS = '0x94a4F6affBd8975951142c3999aEAB7ecee555c2';

// Default P-256 verifier (FCLP256Verifier) on major chains
// From safe-modules-deployments v0.2.1
const FCLP256_VERIFIERS = {
  '11155111': '0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765', // Sepolia
  '1':        '0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765', // Mainnet
  '8453':     '0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765', // Base
  '84532':    '0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765', // Base Sepolia
  '42161':    '0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765', // Arbitrum
  '10':       '0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765', // Optimism
  '137':      '0x445a0683e494ea0c5AF3E83c5159fBE47Cf9e765', // Polygon
};

const RPC_URL = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const NODPAY_AGENT_KEY = process.env.NODPAY_AGENT_KEY;
const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;

if (!NODPAY_AGENT_KEY) {
  console.error(JSON.stringify({ error: 'Missing NODPAY_AGENT_KEY env var' }));
  process.exit(1);
}
if (!PIMLICO_API_KEY) {
  console.error(JSON.stringify({ error: 'Missing PIMLICO_API_KEY env var' }));
  process.exit(1);
}

const agentWallet = new ethers.Wallet(NODPAY_AGENT_KEY);
const DEFAULT_AGENT_ADDRESS = agentWallet.address;

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const rawId = getArg('--raw-id');
const x = getArg('--x');
const y = getArg('--y');
const CHAIN_ID = parseInt(getArg('--chain-id') || process.env.CHAIN_ID || '11155111', 10);
const salt = getArg('--salt') || Math.floor(Math.random() * 1_000_000_000).toString();
// Agent address can be overridden via --agent flag (for multi-agent support)
const AGENT_ADDRESS = getArg('--agent') || DEFAULT_AGENT_ADDRESS;
const RECOVERY_ADDRESS = getArg('--recovery'); // Optional 3rd owner for 2-of-3

if (!x || !y) {
  console.error(JSON.stringify({ error: 'Missing --x <hex> and --y <hex> passkey coordinates' }));
  process.exit(1);
}

try {
  const owners = RECOVERY_ADDRESS
    ? [AGENT_ADDRESS, SHARED_SIGNER_ADDRESS, RECOVERY_ADDRESS]
    : [AGENT_ADDRESS, SHARED_SIGNER_ADDRESS];
  const threshold = 2;
  const bundlerUrl = `https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${PIMLICO_API_KEY}`;
  const verifier = FCLP256_VERIFIERS[String(CHAIN_ID)] || FCLP256_VERIFIERS['11155111'];

  // Encode SharedSigner.configure() — stores passkey coordinates in Safe's storage
  const sharedSignerIface = new ethers.Interface([
    'function configure((uint256 x, uint256 y, uint176 verifiers) signer)'
  ]);
  const configureData = sharedSignerIface.encodeFunctionData('configure', [{
    x: BigInt(x),
    y: BigInt(y),
    verifiers: BigInt(verifier)
  }]);

  // We need Safe4337Pack to use our custom setup that includes:
  // 1. enableModules([Safe4337Module]) — done by Safe4337Pack
  // 2. SharedSigner.configure({x, y, verifiers}) — we need to inject this
  //
  // Strategy: Initialize Safe4337Pack normally, then monkey-patch protocolKit
  // to include our configure call in the predicted Safe config.
  
  // First, init Safe4337Pack to get module addresses and standard config
  const safe4337Pack = await Safe4337Pack.init({
    provider: RPC_URL,
    signer: NODPAY_AGENT_KEY,
    bundlerUrl,
    options: {
      owners,
      threshold,
      saltNonce: salt,
    },
  });

  // Get the address WITHOUT passkey config (this is what we had before — wrong)
  const addressWithoutPasskey = await safe4337Pack.protocolKit.getAddress();

  // Now create a new Safe4337Pack with passkey signer to get the CORRECT address
  // We pass a fake passkey signer object that Safe4337Pack recognizes
  const passkeySignerObj = {
    rawId: rawId || 'passkey-' + salt,
    coordinates: { x, y },
    customVerifierAddress: verifier,
  };

  const ownersForPasskeyPack = RECOVERY_ADDRESS
    ? [AGENT_ADDRESS, RECOVERY_ADDRESS] // SharedSigner will be auto-added by SDK
    : [AGENT_ADDRESS]; // SharedSigner will be auto-added by SDK
  const safe4337PackWithPasskey = await Safe4337Pack.init({
    provider: RPC_URL,
    signer: passkeySignerObj,
    bundlerUrl,
    options: {
      owners: ownersForPasskeyPack,
      threshold,
      saltNonce: salt,
    },
  });

  const predictedAddress = await safe4337PackWithPasskey.protocolKit.getAddress();

  // Check if already deployed
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const code = await provider.getCode(predictedAddress);
  const deployed = code !== '0x';

  const result = {
    predictedAddress,
    owners,
    threshold,
    chainId: CHAIN_ID,
    salt,
    deployed,
    sharedSigner: SHARED_SIGNER_ADDRESS,
    verifier,
    passkeyCoordinates: { x, y },
    rawId: rawId || null,
    // For debugging: show old address without passkey config
    _addressWithoutPasskeyConfig: addressWithoutPasskey,
  };

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.message || String(error) }));
  process.exit(1);
}
