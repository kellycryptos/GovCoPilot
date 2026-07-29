/**
 * Official OKX x402 Payment Middleware using `@okxweb3/x402-express` SDK.
 *
 * Integrates official `@okxweb3/x402-express`, `@okxweb3/x402-core`, and `@okxweb3/x402-evm`
 * SDK modules per the official OKX integration guide:
 * https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk
 */

import dns from 'dns';
import { Request, Response, NextFunction } from 'express';
import { paymentMiddleware, x402ResourceServer, Network } from '@okxweb3/x402-express';
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server';
import { OKXFacilitatorClient } from '@okxweb3/x402-core';
import { getNetworkConfig } from '../config/network.js';

// Fallback DNS resolution for OKX domains when local DNS lookup fails
const origLookup = dns.lookup;
(dns as any).lookup = (hostname: string, options: any, callback: any) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  return origLookup(hostname, options, (err: any, address: any, family: any) => {
    if (err && (hostname === 'web3.okx.com' || hostname === 'www.okx.com' || hostname === 'okx.com')) {
      const ip = '104.18.43.174';
      if (options && options.all) {
        return callback(null, [{ address: ip, family: 4 }]);
      }
      return callback(null, ip, 4);
    }
    return callback(err, address, family);
  });
};

const networkConfig = getNetworkConfig();
const NETWORK: Network = (networkConfig.caip2ChainId as Network) || 'eip155:196';
const PAY_TO = networkConfig.aspWalletAddress; // "0xf313dcef4e1e22c01cea636c2631c74eac6e4518"

// Dynamic pricing from environment configuration with sensible defaults
const PRICE_ANALYSIS = process.env.SERVICE_PRICE_ANALYSIS || '$0.05';
const PRICE_STRATEGY = process.env.SERVICE_PRICE_STRATEGY || '$0.02';
const PRICE_RISK = process.env.SERVICE_PRICE_RISK || '$0.03';
const PRICE_CALLDATA = process.env.SERVICE_PRICE_CALLDATA || '$0.04';

// Initialize OKX Facilitator Client with OKX Developer Portal credentials from environment
const facilitatorClient = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY || '',
  secretKey: process.env.OKX_SECRET_KEY || '',
  passphrase: process.env.OKX_PASSPHRASE || '',
});

// Initialize Resource Server and register EVM Exact Scheme
const resourceServer = new x402ResourceServer(facilitatorClient);
resourceServer.register(NETWORK, new ExactEvmScheme());

// Seed default supported response map for OKX X Layer (eip155:196) exact scheme
const defaultSupportedResponse = {
  kinds: [
    {
      x402Version: 2,
      scheme: 'exact',
      network: NETWORK,
      extra: { name: 'USD\u20ae0', version: '1' },
    },
  ],
  extensions: [],
  signers: {},
};

const seedSupportedMaps = () => {
  try {
    const versionMap = (resourceServer as any).supportedResponsesMap.get(2) || new Map();
    const networkMap = versionMap.get(NETWORK) || new Map();
    networkMap.set('exact', defaultSupportedResponse);
    versionMap.set(NETWORK, networkMap);
    (resourceServer as any).supportedResponsesMap.set(2, versionMap);

    const clientVersionMap = (resourceServer as any).facilitatorClientsMap.get(2) || new Map();
    const clientNetworkMap = clientVersionMap.get(NETWORK) || new Map();
    clientNetworkMap.set('exact', facilitatorClient);
    clientVersionMap.set(NETWORK, clientNetworkMap);
    (resourceServer as any).facilitatorClientsMap.set(2, clientNetworkMap);
  } catch (err) {
    console.warn('[x402-okx-sdk] Seeding supportedResponsesMap failed:', err);
  }
};

// Initial seed
seedSupportedMaps();

// Wrap initialize to preserve fallback scheme if network lookup fails
const origInit = resourceServer.initialize.bind(resourceServer);
resourceServer.initialize = async () => {
  try {
    await origInit();
  } catch (err: any) {
    console.log(`[x402-okx-sdk] Facilitator sync note: ${err.message}. Preserving registered EVM exact scheme.`);
    seedSupportedMaps();
  }
};

// Protected routes configuration matching OKX x402 v2 spec with dynamic pricing
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

// Create payment middleware instance from official OKX SDK
// Set syncFacilitatorOnStart = false to ensure non-blocking server startup
const sdkMiddleware = paymentMiddleware(routesConfig as any, resourceServer, undefined, undefined, false);

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
