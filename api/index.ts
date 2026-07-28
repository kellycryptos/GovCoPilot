import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { analyzeProposal } from '../src/services/analyzer.js';
import { x402Middleware } from '../src/middleware/x402.js';
import { getNetworkConfig } from '../src/config/network.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Payment-Tx-Hash',
      'X-Payment-Hash',
      'X-Network',
      'X-Playground-Request',
      'PAYMENT-SIGNATURE',
      'X-PAYMENT',
      'X-OKX-Sampling',
      'X-Sampling-Request',
      'X-OKX-Test',
      'X-OKX-Test-Wallet',
      'X-OKX-Agent-Id',
      'X-Job-Id',
    ],
    exposedHeaders: [
      'X-Payment-Address',
      'X-Payment-Amount',
      'X-Payment-Chain-Id',
      'X-Payment-Network',
      'X-Payment-Asset',
      'X-Payment-Token-Address',
      'PAYMENT-REQUIRED',
      'WWW-Authenticate',
    ],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express JSON error handler - prevent HTML error responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err) {
    console.error('[API JSON Error]', err.message);
    res.status(400).json({ error: 'Bad Request', message: err.message || 'Invalid payload' });
    return;
  }
  next();
});

app.use(express.static('public'));

// Explicitly serve landing page at root route
app.get('/', (req, res) => {
  const filePath = path.join(process.cwd(), 'public', 'index.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Landing page index.html not found.');
  }
});

// Public health check endpoint
app.get('/health', (req, res) => {
  const net = getNetworkConfig(req);
  res.json({
    status: 'ok',
    name: 'GovCoPilot ASP',
    version: '1.0.3',
    network: net.name,
    chainId: net.chainId,
    caip2ChainId: net.caip2ChainId,
    aspWalletAddress: net.aspWalletAddress,
    paymentAmount: `${net.paymentAmount} ${net.paymentAsset}`,
    x402Compliant: true,
  });
});

// REST API endpoint for proposal analysis (protected by x402 payment middleware)
app.all(['/api/analyze', '/api/analyze_governance_proposal', '/api/deliverable'], x402Middleware, async (req, res) => {
  try {
    const body = req.body || {};
    const query = req.query || {};

    const proposalTitle = body.proposalTitle || query.proposalTitle || body.title || query.title;
    const proposalText = body.proposalText || query.proposalText || body.taskDescription || query.taskDescription || body.description || query.description;
    const chain = body.chain || query.chain || 'xlayer';
    const daoContext = body.daoContext || query.daoContext || 'DAO Governance';
    const treasurySnapshot = body.treasurySnapshot || query.treasurySnapshot;

    // --- Content gate ---
    // OKX's x402/task-402-pay flow is expected to pass the buyer's task content
    // in the --body flag of `onchainos agent task-402-pay`, which replays it as
    // the POST body. If that body is empty or missing, we cannot fabricate content.
    //
    // NOTE: OKX does NOT provide a server-side "fetch task content by job-id" API
    // for ASPs to call back after receiving a payment — the task description lives
    // in the buyer's agent session and is passed as the --body on replay.
    // The correct fix is for buyers to include their proposal text in the task's
    // --service-params / --body when using `task-402-pay`.
    //
    // If no content is provided, we return a clear error rather than fabricating
    // a plausible-looking response.
    if (!proposalText || proposalText.trim().length === 0) {
      console.warn(
        `[GovCoPilot API] Empty body received — no proposal content to analyze. ` +
        `Job-id header: ${req.headers['x-job-id'] || req.headers['x-okx-job-id'] || 'not provided'}`
      );
      res.status(422).json({
        error: 'No proposal content provided',
        message:
          'GovCoPilot requires a governance proposal to analyze. ' +
          'Please include "proposalText" (and optionally "proposalTitle", "chain", "daoContext") ' +
          'in the request body. ' +
          'If using OKX task-402-pay, pass the proposal content via the --body flag.',
        requiredFields: {
          proposalText: 'The governance proposal text to analyze (required)',
          proposalTitle: 'Short title of the proposal (optional)',
          chain: 'Blockchain name, e.g. "xlayer", "ethereum" (optional, defaults to "xlayer")',
          daoContext: 'Name of the DAO (optional)',
        },
        hint: 'If you are a buyer using the OKX task marketplace, include your proposal text in --service-params when creating the task, or in --body when running task-402-pay.',
      });
      return;
    }

    console.log(
      `[GovCoPilot API] Executing analysis for "${proposalTitle || '(no title)'}" (Length: ${proposalText.length} chars, Method: ${req.method}, IP: ${req.ip || 'unknown'})`
    );

    const result = await analyzeProposal({
      proposalText,
      proposalTitle,
      chain,
      daoContext,
      treasurySnapshot,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error during proposal analysis endpoint:', error);
    res.status(500).json({
      error: 'Analysis Failed',
      message: error.message || 'An unexpected error occurred during analysis.',
    });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    const net = getNetworkConfig();
    console.log(`==================================================`);
    console.log(` GovCoPilot ASP Server running on port ${PORT}`);
    console.log(` - Active Network: ${net.name} (Chain ID ${net.chainId})`);
    console.log(` - ASP Wallet:    ${net.aspWalletAddress}`);
    console.log(` - Fee per call:  ${net.paymentAmount} ${net.paymentAsset}`);
    console.log(` - Health check: http://localhost:${PORT}/health`);
    console.log(` - Analyze API:  http://localhost:${PORT}/api/analyze_governance_proposal (x402 gated)`);
    console.log(`==================================================`);
  });
}

export default app;
