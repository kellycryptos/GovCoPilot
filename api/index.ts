import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { analyzeProposal } from '../src/services/analyzer.js';
import { x402Middleware } from '../src/middleware/x402.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
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
  res.json({ status: 'ok', name: 'GovCoPilot ASP', version: '1.0.1' });
});

// REST API endpoint for proposal analysis (protected by x402 payment middleware)
app.post(['/api/analyze', '/api/analyze_governance_proposal'], x402Middleware, async (req, res) => {
  try {
    const { proposalText, proposalTitle, chain, daoContext, treasurySnapshot } = req.body;

    if (!proposalText) {
      res.status(400).json({ error: 'Missing required field: proposalText' });
      return;
    }

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
    console.log(`==================================================`);
    console.log(` GovCoPilot ASP Server running on port ${PORT}`);
    console.log(` - Health check: http://localhost:${PORT}/health`);
    console.log(` - Analyze API:  http://localhost:${PORT}/api/analyze_governance_proposal (x402 gated)`);
    console.log(`==================================================`);
  });
}

export default app;
