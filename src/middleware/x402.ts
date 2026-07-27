import { Request, Response, NextFunction } from 'express';
import { JsonRpcProvider, ethers } from 'ethers';
import { getNetworkConfig } from '../config/network.js';

// ---------------------------------------------------------------------------
// Replay-attack protection stores
// ---------------------------------------------------------------------------
const verifiedTxHashes = new Set<string>(); // for tx-hash path
const usedEip3009Nonces = new Set<string>(); // for EIP-3009 path: "<from>-<nonce>"

// ---------------------------------------------------------------------------
// EIP-3009 / EIP-712 constants for USDT0 on X Layer mainnet
// USD₮0 (USDT0) implements EIP-3009 transferWithAuthorization.
// Domain values come from the OKX docs: extra.name = "USD₮0", extra.version = "1"
// ---------------------------------------------------------------------------
const EIP3009_DOMAIN = {
  name: 'USD\u20ae0', // USD₮0
  version: '1',
  chainId: 196,
  verifyingContract: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
};

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from',        type: 'address' },
    { name: 'to',          type: 'address' },
    { name: 'value',       type: 'uint256' },
    { name: 'validAfter',  type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce',       type: 'bytes32' },
  ],
};

// ---------------------------------------------------------------------------
// Build the standard x402 v2 payment challenge object
// Per OKX docs: base64-encode this and place in PAYMENT-REQUIRED response header.
// The `amount` field MUST be a minimal-unit integer string (decimals=6).
// ---------------------------------------------------------------------------
function buildPaymentChallenge(networkConfig: ReturnType<typeof getNetworkConfig>, req: Request) {
  const endpointUrl = `https://${req.headers.host || 'govcopilot.vercel.app'}${req.path}`;

  return {
    x402Version: 2,
    resource: {
      url: endpointUrl,
      description: 'GovCoPilot — AI-powered DAO governance proposal analysis. Returns a structured risk assessment, voting recommendation, and key insights.',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: networkConfig.caip2ChainId,             // "eip155:196"
        asset: networkConfig.usdtContractAddress,         // USDT0 contract
        amount: networkConfig.paymentAmountMinimalUnits,  // "50000" (0.05 USDT, 6 decimals)
        payTo: networkConfig.aspWalletAddress,
        maxTimeoutSeconds: 300,
        extra: { name: 'USD\u20ae0', version: '1' },     // required by OKX validator
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Path A: Verify an EIP-3009 signed authorization (OKX automated payment flow)
//
// OKX's payment client sends X-PAYMENT as a base64-encoded JSON containing the
// EIP-3009 authorization fields and signature. We verify the EIP-712 signature
// cryptographically — no on-chain RPC call needed.
// ---------------------------------------------------------------------------
async function verifyEip3009Payment(
  rawHeader: string,
  networkConfig: ReturnType<typeof getNetworkConfig>
): Promise<{ valid: boolean; reason?: string }> {
  let payload: any;

  try {
    const decoded = Buffer.from(rawHeader, 'base64').toString('utf-8');
    payload = JSON.parse(decoded);
  } catch {
    return { valid: false, reason: 'Could not base64-decode or JSON-parse X-PAYMENT header' };
  }

  // Support both flat payloads and nested { scheme, network, payload: {...} } wrappers
  const auth = payload.payload ?? payload;

  const { from, to, value, validAfter, validBefore, nonce, signature } = auth;

  if (!from || !to || value === undefined || !nonce || !signature) {
    return { valid: false, reason: 'EIP-3009 auth: missing required fields (from/to/value/nonce/signature)' };
  }

  // Recipient must match our wallet
  if (to.toLowerCase() !== networkConfig.aspWalletAddress.toLowerCase()) {
    return {
      valid: false,
      reason: `Payment recipient mismatch. Expected: ${networkConfig.aspWalletAddress}, got: ${to}`,
    };
  }

  // Amount must meet or exceed minimum service price (0.02 USDT = 20000 minimal units)
  const minServicePrice = BigInt(process.env.MIN_SERVICE_PRICE_UNITS || '20000');
  let provided: bigint;
  try {
    provided = BigInt(value);
  } catch {
    return { valid: false, reason: `Invalid value field: ${value}` };
  }
  if (provided < minServicePrice) {
    return {
      valid: false,
      reason: `Insufficient payment. Required minimum: ${minServicePrice} minimal units, provided: ${provided}`,
    };
  }

  // Time window checks
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (validAfter !== undefined && BigInt(validAfter) > now) {
    return { valid: false, reason: 'Authorization not yet valid (validAfter is in the future)' };
  }
  if (validBefore !== undefined && BigInt(validBefore) < now) {
    return { valid: false, reason: 'Authorization has expired (validBefore is in the past)' };
  }

  // Replay protection
  const nonceKey = `${from.toLowerCase()}-${nonce}`;
  if (usedEip3009Nonces.has(nonceKey)) {
    return { valid: false, reason: 'EIP-3009 nonce already used (replay attack prevented)' };
  }

  // EIP-712 signature verification
  try {
    const message = {
      from,
      to,
      value: BigInt(value),
      validAfter: BigInt(validAfter ?? 0),
      validBefore: BigInt(validBefore ?? now + BigInt(3600)),
      nonce,
    };

    const recovered = ethers.verifyTypedData(EIP3009_DOMAIN, EIP3009_TYPES, message, signature);

    if (recovered.toLowerCase() !== from.toLowerCase()) {
      return {
        valid: false,
        reason: `EIP-712 signature mismatch. Recovered signer: ${recovered}, claimed from: ${from}`,
      };
    }
  } catch (err: any) {
    return { valid: false, reason: `EIP-712 verification threw: ${err.message}` };
  }

  // All checks passed — mark nonce consumed
  usedEip3009Nonces.add(nonceKey);
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Path B: Verify by on-chain tx hash lookup (manual / demo payment flow)
//
// This path preserves the original verified manual-payment capability.
// Used when the payment header looks like a raw 0x transaction hash.
// ---------------------------------------------------------------------------
async function verifyTxHashPayment(
  txHash: string,
  networkConfig: ReturnType<typeof getNetworkConfig>
): Promise<{ valid: boolean; reason?: string }> {
  if (verifiedTxHashes.has(txHash.toLowerCase())) {
    return { valid: false, reason: 'Transaction hash already used (replay attack prevented)' };
  }

  try {
    const provider = new JsonRpcProvider(networkConfig.rpcUrl);
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
      return {
        valid: false,
        reason: `Transaction ${txHash} not found on ${networkConfig.name} (${networkConfig.caip2ChainId}). Verify hash and broadcast status.`,
      };
    }

    if (!tx.blockNumber) {
      return {
        valid: false,
        reason: `Transaction ${txHash} is still pending on ${networkConfig.name}. Wait for confirmation.`,
      };
    }

    const targetAddr = networkConfig.aspWalletAddress.toLowerCase();
    const usdtAddr   = networkConfig.usdtContractAddress.toLowerCase();
    const targetStripped = targetAddr.replace(/^0x/, '');

    const isRecipientMatch =
      (tx.to && tx.to.toLowerCase() === targetAddr) ||
      (tx.to && tx.to.toLowerCase() === usdtAddr && tx.data && tx.data.toLowerCase().includes(targetStripped)) ||
      (tx.data && tx.data.toLowerCase().includes(targetStripped));

    if (!isRecipientMatch) {
      return {
        valid: false,
        reason: `Tx recipient does not match GovCoPilot wallet. Expected: ${networkConfig.aspWalletAddress}, tx.to: ${tx.to}`,
      };
    }

    verifiedTxHashes.add(txHash.toLowerCase());
    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: `On-chain lookup error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Detect which payment format the header contains
// ---------------------------------------------------------------------------
function detectPaymentFormat(raw: string): 'eip3009' | 'txhash' | 'unknown' {
  // Raw tx hash: starts with 0x and is 66 hex chars
  if (/^0x[0-9a-fA-F]{64}$/.test(raw.trim())) return 'txhash';

  // Try to base64-decode and look for EIP-3009 fields
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    const auth = parsed.payload ?? parsed;
    if (auth.signature || auth.from) return 'eip3009';
  } catch {
    // not base64 JSON
  }

  // Might be a JSON string directly (not base64)
  try {
    const parsed = JSON.parse(raw);
    const auth = parsed.payload ?? parsed;
    if (auth.signature || auth.from) return 'eip3009';
  } catch {
    // not JSON either
  }

  // Fallback: if it looks like a long hex-ish string, treat as tx hash
  if (/^0x[0-9a-fA-F]+$/.test(raw.trim())) return 'txhash';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Main middleware
// ---------------------------------------------------------------------------
export async function x402Middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // ── Development bypass condition (env variable only) ──────────────────────
  const bypass = process.env.BYPASS_PAYMENT_VERIFICATION === 'true';
  if (bypass) {
    console.log(`[x402] Dev payment bypass active for ${req.method} ${req.path}`);
    return next();
  }

  const networkConfig = getNetworkConfig(req);

  // ── Extract raw payment token from any of the accepted headers ───────────
  let rawPayment =
    req.header('X-PAYMENT') ||
    req.header('PAYMENT-SIGNATURE') ||
    req.header('X-Payment-Tx-Hash') ||
    req.header('X-Payment-Hash') ||
    (req.body && req.body.paymentTxHash) ||
    null;

  // Authorization header fallback
  if (!rawPayment) {
    const authHeader = req.header('Authorization');
    if (authHeader) {
      const parts = authHeader.trim().split(/\s+/);
      rawPayment =
        parts.length === 2 && ['bearer', 'payment'].includes(parts[0].toLowerCase())
          ? parts[1]
          : authHeader;
    }
  }

  // ── No payment presented → issue 402 challenge ───────────────────────────
  if (!rawPayment) {
    const challenge = buildPaymentChallenge(networkConfig, req);
    const encodedChallenge = Buffer.from(JSON.stringify(challenge)).toString('base64');

    res.setHeader(
      'Access-Control-Expose-Headers',
      'PAYMENT-REQUIRED, WWW-Authenticate, X-Payment-Address, X-Payment-Amount, X-Payment-Chain-Id, X-Payment-Network, X-Payment-Asset, X-Payment-Token-Address'
    );

    // Primary x402 v2 header — this is what OKX's validator checks
    res.setHeader('PAYMENT-REQUIRED', encodedChallenge);

    // Supplementary informational headers (for tooling / explorers)
    res.setHeader('X-Payment-Address', networkConfig.aspWalletAddress);
    res.setHeader('X-Payment-Amount', networkConfig.paymentAmountMinimalUnits);
    res.setHeader('X-Payment-Chain-Id', networkConfig.caip2ChainId);
    res.setHeader('X-Payment-Network', networkConfig.caip2ChainId);
    res.setHeader('X-Payment-Asset', networkConfig.paymentAsset);
    res.setHeader('X-Payment-Token-Address', networkConfig.usdtContractAddress);
    res.setHeader(
      'WWW-Authenticate',
      `Payment realm="GovCoPilot", method="evm", chainId="${networkConfig.caip2ChainId}", token="${networkConfig.usdtContractAddress}"`
    );

    console.log(
      `[x402] 402 issued → IP: ${req.ip || 'client'}, path: ${req.path}, ` +
      `network: ${networkConfig.caip2ChainId}, asset: ${networkConfig.usdtContractAddress}, ` +
      `payTo: ${networkConfig.aspWalletAddress}, amount: ${networkConfig.paymentAmountMinimalUnits} (minimal units)`
    );

    // Body: valid x402 v2 challenge structure
    res.status(402).json(challenge);
    return;
  }

  // ── Payment header found → detect format and verify ─────────────────────
  const format = detectPaymentFormat(rawPayment);

  console.log(`[x402] Payment header received (format: ${format}), verifying for ${req.path}…`);

  let result: { valid: boolean; reason?: string };

  if (format === 'eip3009') {
    // OKX automated payment flow: cryptographic EIP-3009 authorization
    console.log('[x402] → EIP-3009 signed authorization path');
    result = await verifyEip3009Payment(rawPayment, networkConfig);

  } else if (format === 'txhash') {
    // Manual/demo payment flow: on-chain tx hash lookup
    const txHash = rawPayment.trim();
    console.log(`[x402] → On-chain tx hash path (${txHash})`);
    result = await verifyTxHashPayment(txHash, networkConfig);

  } else {
    // Unknown format — log the raw value for debugging and reject
    console.warn(`[x402] Unknown payment header format. Raw value: ${rawPayment.substring(0, 100)}`);
    result = { valid: false, reason: 'Unrecognised payment header format. Expected EIP-3009 authorization or 0x tx hash.' };
  }

  if (!result.valid) {
    console.warn(`[x402] Payment verification FAILED: ${result.reason}`);
    res.status(402).json({
      x402Version: 2,
      error: 'Payment verification failed',
      reason: result.reason,
    });
    return;
  }

  console.log(`[x402] ✅ Payment verified (format: ${format}) for ${req.path}`);
  next();
}
