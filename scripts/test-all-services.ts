import { ethers } from 'ethers';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const WORKER_URL = 'https://govcopilot-api.synarcdao.xyz/api/analyze_governance_proposal';

const EIP3009_DOMAIN = {
  name: 'USD\u20ae0',
  version: '1',
  chainId: 196,
  verifyingContract: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
};

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

const SERVICES = [
  { id: 1, name: 'DAO Proposal Analysis', feeUsdt: 0.05, minimalUnits: '50000' },
  { id: 2, name: 'DAO Voting Strategy', feeUsdt: 0.05, minimalUnits: '50000' },
  { id: 3, name: 'Governance Risk Assessment', feeUsdt: 0.05, minimalUnits: '50000' },
  { id: 4, name: 'Execution Calldata Generator', feeUsdt: 0.05, minimalUnits: '50000' },
];

async function testAllServices() {
  console.log('================================================================');
  console.log('🚀 OKX.AI GovCoPilot Personal Agent Service Test Suite');
  console.log('================================================================\n');

  const testWallet = new ethers.Wallet('0x0000000000000000000000000000000000000000000000000000000000000001');

  // -------------------------------------------------------------------------
  // STEP 1: Verify HTTP 402 Challenge Header & Schema Compliance
  // -------------------------------------------------------------------------
  console.log('📋 STEP 1: Verifying x402 HTTP 402 Challenge Header & Schema...');

  const challengeRes = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalTitle: 'Test Proposal', proposalText: 'Test governance content' }),
  });

  if (challengeRes.status !== 402) {
    throw new Error(`Expected HTTP 402, got ${challengeRes.status}`);
  }

  const rawHeader = challengeRes.headers.get('PAYMENT-REQUIRED') || challengeRes.headers.get('payment-required');
  if (!rawHeader) {
    throw new Error('Missing PAYMENT-REQUIRED header in HTTP 402 response');
  }

  const decodedChallenge = JSON.parse(Buffer.from(rawHeader, 'base64').toString('utf8'));
  console.log('✅ PAYMENT-REQUIRED header successfully parsed:');
  console.log(`   x402Version: ${decodedChallenge.x402Version}`);
  console.log(`   network:     ${decodedChallenge.accepts[0].network}`);
  console.log(`   asset:       ${decodedChallenge.accepts[0].asset}`);
  console.log(`   payTo:       ${decodedChallenge.accepts[0].payTo}`);
  console.log(`   amount:      ${decodedChallenge.accepts[0].amount} minimal units (${decodedChallenge.accepts[0].amount / 1e6} USDT0)\n`);

  // -------------------------------------------------------------------------
  // STEP 2: Execute E2E x402 Signed Authorization Calls across all services
  // -------------------------------------------------------------------------
  console.log('⚡ STEP 2: Executing x402 Payment & Service Analysis Calls...');

  for (const s of SERVICES) {
    console.log(`\n--- Testing Service #${s.id}: ${s.name} ---`);

    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600;
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    const message = {
      from: testWallet.address,
      to: decodedChallenge.accepts[0].payTo,
      value: BigInt(s.minimalUnits),
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await testWallet.signTypedData(EIP3009_DOMAIN, EIP3009_TYPES, message);

    const paymentPayload = {
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:196',
      payload: {
        from: testWallet.address,
        to: decodedChallenge.accepts[0].payTo,
        value: s.minimalUnits,
        validAfter,
        validBefore,
        nonce,
        signature,
      },
    };

    const encodedPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

    const sampleJobId = `job-personal-agent-svc-${s.id}`;

    const apiRes = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': encodedPaymentHeader,
        'X-Job-Id': sampleJobId,
      },
      body: JSON.stringify({
        proposalTitle: `X Layer Governance Upgrade #${s.id}`,
        proposalText: `Proposal #${s.id}: Upgrade Governor liquidity router parameters on X Layer Mainnet to optimize swap routing fees and reduce transaction latency. Target address: 0x1111111111111111111111111111111111111111.`,
        chain: 'xlayer',
        daoContext: 'X Layer DAO',
      }),
    });

    if (apiRes.status !== 200) {
      const errText = await apiRes.text();
      throw new Error(`Service #${s.id} failed with status ${apiRes.status}: ${errText}`);
    }

    const data = await apiRes.json();
    console.log(`✅ Service #${s.id} Success (HTTP 200 OK):`);
    console.log(`   Job ID:              ${data.jobId}`);
    console.log(`   Vote Recommendation: ${data.votingRecommendation.vote} (Confidence: ${data.votingRecommendation.confidence})`);
    console.log(`   Summary:             ${data.proposalSummary.substring(0, 70)}...`);
    console.log(`   Deliverable URL:     ${data.deliverableUrl}`);
  }

  // -------------------------------------------------------------------------
  // STEP 3: Verify Public Deliverable Polling Endpoint (task-deliverable-list)
  // -------------------------------------------------------------------------
  console.log('\n📦 STEP 3: Verifying Deliverable Polling Endpoint (GET /api/deliverable/:jobId)...');
  const pollRes = await fetch('https://govcopilot-api.synarcdao.xyz/api/deliverable/job-personal-agent-svc-1');
  const pollData = await pollRes.json();

  if (pollRes.status === 200 && pollData.ok) {
    console.log('✅ Deliverable Polling Passed (HTTP 200 OK):');
    console.log(`   Retrieved Deliverable Job ID: ${pollData.deliverable.jobId}`);
    console.log(`   Deliverable Status:           ${pollData.deliverable.status}`);
  } else {
    throw new Error(`Deliverable polling failed: ${JSON.stringify(pollData)}`);
  }

  console.log('\n================================================================');
  console.log('🎉 ALL GOVCOPILOT PERSONAL AGENT TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

testAllServices().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
