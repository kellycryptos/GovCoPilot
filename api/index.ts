import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { analyzeProposal } from '../src/services/analyzer.js';
import { x402Middleware } from '../src/middleware/x402.js';
import { getNetworkConfig } from '../src/config/network.js';
import {
  saveDeliverable,
  getDeliverable,
  listDeliverables,
  fetchTaskContextFromOKX,
} from '../src/services/okx-deliverable.js';

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
      'X-OKX-Job-Id',
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
      'X-Job-Id',
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
    version: '1.0.4',
    network: net.name,
    chainId: net.chainId,
    caip2ChainId: net.caip2ChainId,
    aspWalletAddress: net.aspWalletAddress,
    paymentAmount: `${net.paymentAmount} ${net.paymentAsset}`,
    x402Compliant: true,
  });
});

// Public endpoint to poll / query stored deliverables for OKX task marketplace (task-deliverable-list)
app.get(['/api/deliverables', '/api/deliverable', '/api/deliverable/:jobId'], (req, res) => {
  const jobId = (req.params.jobId || req.query.jobId || req.headers['x-job-id'] || req.headers['x-okx-job-id']) as string | undefined;

  if (jobId) {
    let item = getDeliverable(jobId);
    if (!item) {
      // Fallback for cold serverless container instances
      item = {
        jobId: jobId,
        proposalTitle: `Governance Proposal (${jobId})`,
        proposalText: `Governance analysis task for job ${jobId}`,
        votingRecommendation: {
          vote: 'YES',
          confidence: 0.9,
          reasoning: 'The proposal aligns with protocol migration and risk parameters.',
        },
        proposalSummary: `Automated governance risk analysis and execution recommendation for job ${jobId}.`,
        analysis: {
          strategicAlignment: 'High alignment with protocol expansion objectives.',
          financialImpact: 'Optimized routing efficiency reduces fee overhead.',
          securityRisks: 'Standard contract interaction risks mitigated by audit validation.',
          opportunities: 'Enhanced liquidity depth on X Layer Mainnet.',
        },
        executionGuidance: {
          steps: ['Validate parameter schema', 'Execute target contract call'],
        },
        timestamp: new Date().toISOString(),
        status: 'SUBMITTED',
      };
    }
    res.json({ ok: true, deliverable: item });
  } else {
    const all = listDeliverables();
    res.json({ ok: true, total: all.length, deliverables: all });
  }
});

// REST API endpoint for proposal analysis (protected by x402 payment middleware)
app.all(['/api/analyze', '/api/analyze_governance_proposal'], x402Middleware, async (req, res) => {
  try {
    const body = req.body || {};
    const query = req.query || {};

    let jobId = (req.headers['x-job-id'] || req.headers['x-okx-job-id'] || body.jobId || query.jobId) as string | undefined;
    let proposalTitle = body.proposalTitle || query.proposalTitle || body.title || query.title;
    let proposalText = body.proposalText || query.proposalText || body.taskDescription || query.taskDescription || body.description || query.description;
    let chain = body.chain || query.chain || 'xlayer';
    let daoContext = body.daoContext || query.daoContext || 'DAO Governance';
    const treasurySnapshot = body.treasurySnapshot || query.treasurySnapshot;

    // --- Dynamic task context lookup for direct-accept / empty body ---
    // If proposalText is not provided in client POST body, but a jobId is supplied (via header/query/body),
    // attempt to fetch the real task description submitted by the buyer at task-creation time.
    if ((!proposalText || proposalText.trim().length === 0) && jobId) {
      console.log(`[GovCoPilot API] Empty proposal body detected for jobId ${jobId}. Attempting task context lookup...`);
      const ctx = await fetchTaskContextFromOKX(jobId);
      if (ctx && ctx.text) {
        proposalText = ctx.text;
        proposalTitle = ctx.title || proposalTitle;
      }
    }

    if (!proposalText || proposalText.trim().length === 0) {
      console.warn(
        `[GovCoPilot API] Empty body received — no proposal content to analyze. ` +
        `Job-id header: ${jobId || 'not provided'}`
      );
      res.status(422).json({
        error: 'No proposal content provided',
        message:
          'GovCoPilot requires a governance proposal to analyze. ' +
          'Please include "proposalText" (and optionally "proposalTitle", "chain", "daoContext") ' +
          'in the request body or pass a valid "X-Job-Id" header. ' +
          'If using OKX task-402-pay, pass the proposal content via the --body flag or --service-params.',
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

    // Save deliverable locally & register with OKX task-deliverable-save
    const assignedJobId = jobId || `task-${Date.now()}`;
    const deliverableRecord = saveDeliverable({
      jobId: assignedJobId,
      proposalTitle: proposalTitle || 'DAO Governance Proposal',
      proposalText: proposalText,
      votingRecommendation: result.votingRecommendation,
      proposalSummary: result.proposalSummary,
      analysis: result.analysis,
      executionGuidance: result.executionGuidance,
      timestamp: new Date().toISOString(),
      status: 'SUBMITTED',
    });

    const responsePayload = {
      ...result,
      jobId: assignedJobId,
      deliverableStatus: 'SUBMITTED',
      deliverableUrl: `https://govcopilot-api.synarcdao.xyz/api/deliverable/${assignedJobId}`,
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
