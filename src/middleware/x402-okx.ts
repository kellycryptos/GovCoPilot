/**
 * Official OKX x402 Payment Middleware using `@okxweb3/x402-express` SDK.
 *
 * Integrates official `@okxweb3/x402-express`, `@okxweb3/x402-core`, and `@okxweb3/x402-evm`
 * SDK modules per the official OKX integration guide:
 * https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk
 */

import { Request, Response, NextFunction } from 'express';
import { paymentMiddleware, x402ResourceServer, Network } from '@okxweb3/x402-express';
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server';
import { OKXFacilitatorClient } from '@okxweb3/x402-core';
import { getNetworkConfig } from '../config/network.js';

const networkConfig = getNetworkConfig();
const NETWORK: Network = (networkConfig.caip2ChainId as Network) || 'eip155:196';
const PAY_TO = networkConfig.aspWalletAddress; // "0xf313dcef4e1e22c01cea636c2631c74eac6e4518"

const PRICE_ANALYSIS = process.env.SERVICE_PRICE_ANALYSIS || '$0.05';

// Initialize OKX Facilitator Client with credentials from environment
const rawFacilitatorClient = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY || '',
  secretKey: process.env.OKX_SECRET_KEY || '',
  passphrase: process.env.OKX_PASSPHRASE || '',
});

// Wrap verify and getSupported to provide real outbound network execution logging
const origVerify = rawFacilitatorClient.verify.bind(rawFacilitatorClient);
rawFacilitatorClient.verify = async (payload: any, requirements: any) => {
  console.log(`[OKX Facilitator Outbound] Sending verify request to OKX API (scheme: ${requirements?.scheme}, network: ${requirements?.network})...`);
  try {
    const res = await origVerify(payload, requirements);
    console.log(`[OKX Facilitator Outbound] Verify response received from OKX API: isValid=${res?.isValid}`);
    return res;
  } catch (err: any) {
    console.error(`[OKX Facilitator Outbound] Verify call failed:`, err?.message || err);
    throw err;
  }
};

const origGetSupported = rawFacilitatorClient.getSupported.bind(rawFacilitatorClient);
rawFacilitatorClient.getSupported = async () => {
  console.log(`[OKX Facilitator Outbound] Syncing supported payment kinds from OKX API...`);
  try {
    const res = await origGetSupported();
    console.log(`[OKX Facilitator Outbound] Supported payment kinds synced successfully.`);
    return res;
  } catch (err: any) {
    console.error(`[OKX Facilitator Outbound] getSupported call failed:`, err?.message || err);
    throw err;
  }
};

// Initialize Resource Server and register EVM Exact Scheme
export const resourceServer = new x402ResourceServer(rawFacilitatorClient);
resourceServer.register(NETWORK, new ExactEvmScheme());

// Synchronize resourceServer with OKX Facilitator on startup
resourceServer.initialize().then(() => {
  console.log('[x402-okx-sdk] ResourceServer successfully initialized with OKX Facilitator Service.');
}).catch((err) => {
  console.warn('[x402-okx-sdk] ResourceServer initialization warning:', err.message || err);
});

// Protected routes configuration matching OKX x402 v2 spec
const routesConfig: Record<string, any> = {
  'POST /api/analyze_governance_proposal': {
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        payTo: PAY_TO,
        price: PRICE_ANALYSIS,
        asset: networkConfig.usdtContractAddress,
        extra: {
          name: 'USD\u20ae0',
          version: '1',
        },
      },
    ],
    description: 'GovCoPilot — AI-powered DAO governance proposal analysis on X Layer.',
    mimeType: 'application/json',
  },
  'GET /api/analyze_governance_proposal': {
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        payTo: PAY_TO,
        price: PRICE_ANALYSIS,
        asset: networkConfig.usdtContractAddress,
        extra: {
          name: 'USD\u20ae0',
          version: '1',
        },
      },
    ],
    description: 'GovCoPilot — AI-powered DAO governance proposal analysis on X Layer.',
    mimeType: 'application/json',
  },
  'POST /api/analyze': {
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        payTo: PAY_TO,
        price: PRICE_ANALYSIS,
        asset: networkConfig.usdtContractAddress,
        extra: {
          name: 'USD\u20ae0',
          version: '1',
        },
      },
    ],
    description: 'GovCoPilot — AI-powered DAO governance proposal analysis on X Layer.',
    mimeType: 'application/json',
  },
  'GET /api/analyze': {
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        payTo: PAY_TO,
        price: PRICE_ANALYSIS,
        asset: networkConfig.usdtContractAddress,
        extra: {
          name: 'USD\u20ae0',
          version: '1',
        },
      },
    ],
    description: 'GovCoPilot — AI-powered DAO governance proposal analysis on X Layer.',
    mimeType: 'application/json',
  },
};

// Create payment middleware instance directly from official OKX SDK
const sdkMiddleware = paymentMiddleware(routesConfig as any, resourceServer);

export async function x402OkxMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.BYPASS_PAYMENT_VERIFICATION === 'true') {
    console.log(`[okx-x402-sdk] Dev bypass active for ${req.method} ${req.path}`);
    return next();
  }

  try {
    return await sdkMiddleware(req, res, next);
  } catch (err: any) {
    console.error(`[okx-x402-sdk Error] Middleware error for ${req.method} ${req.path}:`, err);
    return next(err);
  }
}

export default x402OkxMiddleware;
