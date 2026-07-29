/**
 * Main x402 Middleware entry point.
 * Replaces hand-rolled payment verification logic with the official OKX Payment SDK middleware
 * (@okxweb3/x402-express, @okxweb3/x402-core, @okxweb3/x402-evm).
 */

import { x402OkxMiddleware } from './x402-okx.js';

export const x402Middleware = x402OkxMiddleware;
export default x402Middleware;
