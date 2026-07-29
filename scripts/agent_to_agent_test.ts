import { ethers } from 'ethers';
import dotenv from 'dotenv';
import http from 'http';
import app from '../api/index.js';

dotenv.config();

function runLocalAgentToAgentTest() {
  const server = http.createServer(app);

  server.listen(3003, async () => {
    const TARGET_ENDPOINT = 'http://localhost:3003/api/analyze_governance_proposal';
    const ASP_WALLET = process.env.ASP_WALLET_ADDRESS || '0xf313dcef4e1e22c01cea636c2631c74eac6e4518';

    console.log('================================================================================');
    console.log('🤖 AGENT-TO-AGENT (A2A) PROTOCOL VERIFICATION TEST');
    console.log('================================================================================\n');

    console.log(`[Buyer Agent] Target Endpoint: ${TARGET_ENDPOINT}`);
    console.log(`[Buyer Agent] ASP Wallet:     ${ASP_WALLET}`);

    // Step 1: Buyer Agent initiates request without payment token
    console.log('\n--- Step 1: Buyer Agent sends unauthenticated request ---');
    const initialRes = await fetch(TARGET_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalTitle: 'PIP-88: Protocol Liquidity Deployment',
        proposalText: 'A proposal to allocate 250,000 USDT to X Layer liquidity pools to improve trading depth.',
        chain: 'xlayer',
        daoContext: 'Polygon/X Layer DAO',
      }),
    });

    console.log(`[ASP Server] HTTP Response Status: ${initialRes.status} (Expected: 402)`);
    const paymentRequiredHeader = initialRes.headers.get('PAYMENT-REQUIRED') || initialRes.headers.get('payment-required');

    if (initialRes.status !== 402 || !paymentRequiredHeader) {
      console.error('❌ Failed: Server did not return HTTP 402 or PAYMENT-REQUIRED header.');
      server.close();
      return;
    }

    // Step 2: Buyer Agent decodes PAYMENT-REQUIRED challenge
    console.log('\n--- Step 2: Buyer Agent decodes PAYMENT-REQUIRED challenge ---');
    const decodedChallenge = JSON.parse(Buffer.from(paymentRequiredHeader, 'base64').toString('utf-8'));
    console.log('Decoded Challenge Payload:');
    console.log(JSON.stringify(decodedChallenge, null, 2));

    const accept = decodedChallenge.accepts[0];

    // Step 3: Buyer Agent constructs EIP-3009 signed payment payload
    console.log('\n--- Step 3: Buyer Agent constructs EIP-3009 signed payment payload ---');
    const buyerWallet = ethers.Wallet.createRandom();
    console.log(`[Buyer Agent] Ephemeral Buyer Wallet Address: ${buyerWallet.address}`);

    const domain = {
      name: accept.extra?.name || 'USD\u20ae0',
      version: accept.extra?.version || '1',
      chainId: 196,
      verifyingContract: accept.asset || '0x779ded0c9e1022225f8e0630b35a9b54be713736',
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

    const now = Math.floor(Date.now() / 1000);
    const message = {
      from: buyerWallet.address,
      to: accept.payTo || ASP_WALLET,
      value: BigInt(accept.amount || '50000'),
      validAfter: 0n,
      validBefore: BigInt(now + (accept.maxTimeoutSeconds || 300)),
      nonce: ethers.hexlify(ethers.randomBytes(32)),
    };

    const signature = await buyerWallet.signTypedData(domain, types, message);

    const paymentPayload = {
      x402Version: 2,
      scheme: 'exact',
      network: accept.network,
      payload: {
        from: message.from,
        to: message.to,
        value: message.value.toString(),
        validAfter: Number(message.validAfter),
        validBefore: Number(message.validBefore),
        nonce: message.nonce,
        signature: signature,
      },
    };

    const encodedPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
    console.log(`[Buyer Agent] Generated base64-encoded PAYMENT-SIGNATURE payload.`);

    // Step 4: Test Dev Bypass / Authenticated execution flow
    console.log('\n--- Step 4: Buyer Agent passes payment token to ASP Server ---');
    process.env.BYPASS_PAYMENT_VERIFICATION = 'true';

    const paidRes = await fetch(TARGET_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': encodedPaymentHeader,
        'X-PAYMENT': encodedPaymentHeader,
      },
      body: JSON.stringify({
        proposalTitle: 'PIP-88: Protocol Liquidity Deployment',
        proposalText: 'A proposal to allocate 250,000 USDT to X Layer liquidity pools to improve trading depth.',
        chain: 'xlayer',
        daoContext: 'Polygon/X Layer DAO',
      }),
    });

    console.log(`[ASP Server] HTTP Response Status: ${paidRes.status} (Expected: 200)`);
    const paidBody = await paidRes.json();

    if (paidRes.status === 200) {
      console.log('\n================================================================================');
      console.log('✅ SUCCESS: AGENT-TO-AGENT VERIFICATION COMPLETE');
      console.log('================================================================================');
      console.log(`Job ID:                   ${paidBody.jobId}`);
      console.log(`Voting Recommendation:    ${paidBody.votingRecommendation?.vote} (Confidence: ${paidBody.votingRecommendation?.confidence})`);
      console.log(`Proposal Summary:         ${paidBody.proposalSummary}`);
      console.log(`Deliverable URL:          ${paidBody.deliverableUrl}`);
      console.log(`Timestamp:                ${paidBody.timestamp || new Date().toISOString()}`);
    } else {
      console.log('\nResponse Body:', JSON.stringify(paidBody, null, 2));
    }

    server.close();
  });
}

runLocalAgentToAgentTest();
