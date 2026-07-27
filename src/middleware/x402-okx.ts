/**
 * Standard OKX x402 Payment Middleware using official `@okxweb3/x402-express` SDK.
 *
 * Replaces non-standard custom middleware with the canonical `@okxweb3/x402-express`
 * and `@okxweb3/x402-core` resource server to ensure full compatibility with OKX
 * automated security testing and listing review suite.
 */

import { Request, Response, NextFunction } from 'express';
import { x402ResourceServer, paymentMiddleware } from '@okxweb3/x402-express';
import { OKXFacilitatorClient } from '@okxweb3/x402-core';
import { getNetworkConfig } from '../config/network.js';

// ---------------------------------------------------------------------------
// Initialize OKX Facilitator Client & Resource Server
// ---------------------------------------------------------------------------
const facilitatorClient = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY || '311d0f71-c507-4929-8c5e-a39c3abfccd2',
  secretKey: process.env.OKX_SECRET_KEY || '68A68080EB31ACF22C52F9046924171A',
  passphrase: process.env.OKX_PASSPHRASE || 'fQSmNkr6J77GTtH@34',
});

const resourceServer = new x402ResourceServer(facilitatorClient);

const networkConfig = getNetworkConfig();

// Define route configuration matching OKX x402 v2 specification
const routesConfig: Record<string, any> = {
  'POST /api/analyze_governance_proposal': {
    accepts: [
      {
        scheme: 'exact',
        network: networkConfig.caip2ChainId,              // "eip155:196"
        asset: networkConfig.usdtContractAddress,          // USDT0 contract on X Layer
        amount: process.env.MIN_SERVICE_PRICE_UNITS || '20000', // 0.02 USDT (20000 minimal units)
        payTo: networkConfig.aspWalletAddress,
        maxTimeoutSeconds: 300,
        extra: {
          name: 'USD\u20ae0',                               // Required OKX extra token name
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
        network: networkConfig.caip2ChainId,
        asset: networkConfig.usdtContractAddress,
        amount: process.env.MIN_SERVICE_PRICE_UNITS || '20000',
        payTo: networkConfig.aspWalletAddress,
        maxTimeoutSeconds: 300,
        extra: {
          name: 'USD\u20ae0',
          version: '1',
        },
      },
    ],
    description: 'GovCoPilot — AI-powered DAO governance proposal analysis on X Layer.',
    mimeType: 'application/json',
  },
  'POST /api/deliverable': {
    accepts: [
      {
        scheme: 'exact',
        network: networkConfig.caip2ChainId,
        asset: networkConfig.usdtContractAddress,
        amount: process.env.MIN_SERVICE_PRICE_UNITS || '20000',
        payTo: networkConfig.aspWalletAddress,
        maxTimeoutSeconds: 300,
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

// Create official OKX payment middleware instance
const okxSdkMiddleware = paymentMiddleware(routesConfig, resourceServer);

// ---------------------------------------------------------------------------
// Exported Express middleware with development bypass support
// ---------------------------------------------------------------------------
export function x402OkxMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.BYPASS_PAYMENT_VERIFICATION === 'true') {
    console.log(`[okx-x402-sdk] Dev bypass active for ${req.method} ${req.path}`);
    return next();
  }

  // Delegate payment challenge & verification to official @okxweb3/x402-express SDK
  return okxSdkMiddleware(req, res, next);
}
