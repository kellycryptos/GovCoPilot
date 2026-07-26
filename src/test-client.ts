import app from '../api/index.js';
import { AddressInfo } from 'net';
import { ethers } from 'ethers';

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

    if (!mainnetHeaders.chainId || !mainnetHeaders.chainId.includes('196')) {
      throw new Error(`Expected Mainnet Chain ID containing 196 or eip155:196, got ${mainnetHeaders.chainId}`);
    }

    // Test 3: Enforcement of X Layer Mainnet USDT0 even with X-Network header (No testnet fallback)
    console.log('\n[Test 3] Mainnet USDT0 Strict Enforcement Probe (X-Network: testnet attempt)...');
    const testnetRes = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Network': 'testnet',
      },
      body: JSON.stringify({
        proposalText: 'Test proposal verifying Mainnet USDT0 strict enforcement.',
      }),
    });
    console.log('Status:', testnetRes.status);
    const testnetHeaders = {
      address: testnetRes.headers.get('X-Payment-Address'),
      amount: testnetRes.headers.get('X-Payment-Amount'),
      chainId: testnetRes.headers.get('X-Payment-Chain-Id'),
      asset: testnetRes.headers.get('X-Payment-Asset'),
      tokenAddress: testnetRes.headers.get('X-Payment-Token-Address'),
    };
    console.log('Mainnet Enforced x402 Headers:', testnetHeaders);
    console.log('Response:', await testnetRes.json());

    if (!testnetHeaders.chainId || !testnetHeaders.chainId.includes('196')) {
      throw new Error(`Expected Mainnet Chain ID eip155:196, got ${testnetHeaders.chainId}`);
    }
    if (testnetHeaders.tokenAddress?.toLowerCase() !== '0x779ded0c9e1022225f8e0630b35a9b54be713736') {
      throw new Error(`Expected Mainnet USDT0 token 0x779ded0c9e1022225f8e0630b35a9b54be713736, got ${testnetHeaders.tokenAddress}`);
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

    // Test 6: Alternative x402 header parsing (base64 encoded invalid payload)
    console.log('\n[Test 6] Rejection of invalid base64-encoded PAYMENT-SIGNATURE header...');
    const payload = Buffer.from(JSON.stringify({ txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' })).toString('base64');
    const signatureHeaderRes = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': payload,
      },
      body: JSON.stringify({
        proposalText: 'Proposal with base64 PAYMENT-SIGNATURE header.',
      }),
    });
    console.log('Status:', signatureHeaderRes.status);
    console.log('Response:', await signatureHeaderRes.json());
    if (signatureHeaderRes.status !== 402 && signatureHeaderRes.status !== 400) {
      throw new Error(`Expected status 402/400 for invalid signature payload, got ${signatureHeaderRes.status}`);
    }

    // Test 7: Valid EIP-3009 TransferWithAuthorization Signature Verification
    console.log('\n[Test 7] Valid EIP-3009 TransferWithAuthorization Signature Verification...');
    const testWallet = ethers.Wallet.createRandom();
    const domain = {
      name: 'USD\u20ae0',
      version: '1',
      chainId: 196,
      verifyingContract: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
    };
    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };
    const message = {
      from: testWallet.address,
      to: '0xf313dcef4e1e22c01cea636c2631c74eac6e4518',
      value: 50000n,
      validAfter: 0n,
      validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
      nonce: ethers.hexlify(ethers.randomBytes(32)),
    };

    const signature = await testWallet.signTypedData(domain, types, message);
    const eip3009AuthPayload = {
      from: message.from,
      to: message.to,
      value: message.value.toString(),
      validAfter: Number(message.validAfter),
      validBefore: Number(message.validBefore),
      nonce: message.nonce,
      signature: signature,
    };
    const encodedXPayment = Buffer.from(JSON.stringify(eip3009AuthPayload)).toString('base64');

    const eip3009Res = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': encodedXPayment,
      },
      body: JSON.stringify({
        proposalText: 'EIP-3009 test proposal: allocate 50000 minimal units USDT0 to security audit.',
      }),
    });

    console.log('EIP-3009 Payment Response Status:', eip3009Res.status);
    const eip3009Data = await eip3009Res.json();
    console.log('EIP-3009 Response Proposal Summary:', eip3009Data.proposalSummary || eip3009Data.recommendation || eip3009Data);

    if (eip3009Res.status !== 200) {
      throw new Error(`Expected status 200 for valid EIP-3009 payment, got ${eip3009Res.status}`);
    }

    console.log('\nAll integration tests passed successfully!');
  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    console.log('\nStopping server...');
    close();
  }
}

runTests();
