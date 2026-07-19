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

    // Test 2: Gated endpoint on Mainnet (Default Network) without payment headers
    console.log('\n[Test 2] Mainnet x402 Probe (Default Network)...');
    process.env.BYPASS_PAYMENT_VERIFICATION = 'false';

    const mainnetRes = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalText: 'Should we upgrade the GoalHook router contract on X Layer Mainnet?',
      }),
    });
    console.log('Status:', mainnetRes.status);
    const mainnetHeaders = {
      address: mainnetRes.headers.get('X-Payment-Address'),
      amount: mainnetRes.headers.get('X-Payment-Amount'),
      chainId: mainnetRes.headers.get('X-Payment-Chain-Id'),
      asset: mainnetRes.headers.get('X-Payment-Asset'),
    };
    console.log('Mainnet x402 Headers:', mainnetHeaders);
    console.log('Response:', await mainnetRes.json());

    if (mainnetHeaders.chainId !== '196') {
      throw new Error(`Expected Mainnet Chain ID 196, got ${mainnetHeaders.chainId}`);
    }

    // Test 3: Gated endpoint on Testnet via X-Network header
    console.log('\n[Test 3] Testnet Fallback x402 Probe (X-Network: testnet)...');
    const testnetRes = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Network': 'testnet',
      },
      body: JSON.stringify({
        proposalText: 'Test proposal for X Layer Testnet fallback.',
      }),
    });
    console.log('Status:', testnetRes.status);
    const testnetHeaders = {
      address: testnetRes.headers.get('X-Payment-Address'),
      amount: testnetRes.headers.get('X-Payment-Amount'),
      chainId: testnetRes.headers.get('X-Payment-Chain-Id'),
      asset: testnetRes.headers.get('X-Payment-Asset'),
    };
    console.log('Testnet x402 Headers:', testnetHeaders);
    console.log('Response:', await testnetRes.json());

    if (testnetHeaders.chainId !== '195') {
      throw new Error(`Expected Testnet Chain ID 195, got ${testnetHeaders.chainId}`);
    }

    // Test 4: Invalid Tx Hash rejection (Security Check)
    console.log('\n[Test 4] Rejection of fake/invalid transaction hash...');
    const fakeTxRes = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Tx-Hash': '0x0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: JSON.stringify({
        proposalText: 'Proposal with invalid tx hash.',
      }),
    });
    console.log('Status:', fakeTxRes.status);
    console.log('Response:', await fakeTxRes.json());

    // Test 5: Playground bypass test
    console.log('\n[Test 5] Playground request bypass header...');
    const playgroundRes = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Playground-Request': 'true',
      },
      body: JSON.stringify({
        proposalText: 'PIP-42: Deploy GoalHook V2 on X Layer',
        proposalTitle: 'PIP-42: Deploy GoalHook V2 on X Layer',
        chain: 'x-layer',
      }),
    });
    console.log('Status:', playgroundRes.status);
    const playgroundData = await playgroundRes.json();
    console.log('Playground Analysis Title:', playgroundData.proposalTitle || playgroundData.recommendation);

    console.log('\nAll integration tests passed successfully!');
  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    console.log('\nStopping server...');
    close();
  }
}

runTests();
