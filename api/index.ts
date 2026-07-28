import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { analyzeProposal } from '../src/services/analyzer.js';
import { x402Middleware } from '../src/middleware/x402.js';
import { getNetworkConfig } from '../src/config/network.js';
import { getSynArcProposal } from '../src/services/synarc.js';

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
    version: '1.0.2',
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

    let proposalTitle = body.proposalTitle || query.proposalTitle || body.title || query.title;
    let proposalText = body.proposalText || query.proposalText || body.taskDescription || query.taskDescription || body.description || query.description;
    let chain = body.chain || query.chain || 'xlayer';
    let daoContext = body.daoContext || query.daoContext || 'SynArc Protocol DAO';
    const treasurySnapshot = body.treasurySnapshot || query.treasurySnapshot;

    let synarcSourceInfo: { source: string; sourceUrl: string } | undefined;

    // Real SynArc Proposal Fallback: If proposalText is empty, fetch real proposal data from SynArc DAO
    if (!proposalText || proposalText.trim().length === 0) {
      const synarcProposal = await getSynArcProposal();
      proposalTitle = synarcProposal.title;
      proposalText = synarcProposal.proposalText;
      chain = synarcProposal.chain;
      daoContext = synarcProposal.daoContext;
      synarcSourceInfo = {
        source: synarcProposal.source,
        sourceUrl: synarcProposal.sourceUrl,
      };
    }

    console.log(
      `[GovCoPilot API] Executing analysis for "${proposalTitle}" (Length: ${proposalText.length} chars, Method: ${req.method}, IP: ${req.ip || 'unknown'})`
    );

    const result = await analyzeProposal({
      proposalText,
      proposalTitle,
      chain,
      daoContext,
      treasurySnapshot,
    });

    // Attach real SynArc DAO source attribution if fallback was used or requested
    const responsePayload = {
      ...result,
      source: synarcSourceInfo?.source || 'SynArc DAO Governance Protocol',
      sourceUrl: synarcSourceInfo?.sourceUrl || 'https://synarcdao.xyz',
    };

    res.json(responsePayload);
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
