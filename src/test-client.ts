import app from '../api/index.js';
import { AddressInfo } from 'net';

// Helper to start the server on a random port
function startServer(): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://localhost:${address.port}`,
        close: () => server.close(),
      });
    });
  });
}

async function runTests() {
  console.log('--- Starting GovCoPilot Local Integration Tests ---');
  const { url, close } = await startServer();
  console.log(`Server started on ${url}`);

  try {
    // Test 1: Health check
    console.log('\n[Test 1] Health Check...');
    const healthRes = await fetch(`${url}/health`);
    const healthData = await healthRes.json();
    console.log('Status:', healthRes.status);
    console.log('Response:', healthData);

    // Test 2: Gated endpoint without payment headers (with bypass turned off for testing)
    console.log('\n[Test 2] Gated endpoint without payment headers...');
    // Temporarily modify the environment to enforce payment for this test block
    process.env.BYPASS_PAYMENT_VERIFICATION = 'false';

    const gatedRes = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalText: 'Should we upgrade the GoalHook router contract?',
      }),
    });
    console.log('Status:', gatedRes.status);
    const gatedHeaders = {
      address: gatedRes.headers.get('X-Payment-Address'),
      amount: gatedRes.headers.get('X-Payment-Amount'),
      chainId: gatedRes.headers.get('X-Payment-Chain-Id'),
    };
    console.log('Headers:', gatedHeaders);
    console.log('Response:', await gatedRes.json());

    // Test 3: Gated endpoint with bypass enabled (to test LLM integration without payment)
    console.log('\n[Test 3] Gated endpoint with bypass enabled...');
    process.env.BYPASS_PAYMENT_VERIFICATION = 'true';

    const hasGroqKey = !!process.env.GROQ_API_KEY;
    if (!hasGroqKey) {
      console.log('WARNING: GROQ_API_KEY is not defined. Skipping live LLM analysis test.');
    } else {
      console.log('Sending live request to analyze proposal...');
      const proposalText = `
        Proposal Title: PIP-42: Deploy GoalHook V2 on X Layer
        
        Abstract:
        This proposal outlines the deployment of GoalHook V2 on X Layer. V2 introduces gas-optimized milestone verification and integrates OKX Agentic Wallet native execution schemes.
        
        Specification:
        1. Deploy GoalHookV2.sol contract.
        2. Set treasury controller to multi-sig 0x3a...4f.
        3. Authorize GoalHook V2 to spend up to 10,000 USDC for initialization.
        
        Risks:
        Smart contract risks associated with upgrading routers.
      `;

      const analysisRes = await fetch(`${url}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalText,
          proposalTitle: 'PIP-42: Deploy GoalHook V2 on X Layer',
          chain: 'x-layer',
        }),
      });

      console.log('Status:', analysisRes.status);
      const analysisData = await analysisRes.json();
      console.log('Analysis Output:', JSON.stringify(analysisData, null, 2));
    }
  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    console.log('\nStopping server...');
    close();
    console.log('Tests completed.');
  }
}

runTests();
