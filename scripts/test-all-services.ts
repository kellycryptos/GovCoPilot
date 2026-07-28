import { ethers } from 'ethers';

const WORKER_URL = 'https://gov-copilot-api.futuristic-talos-42b.workers.dev/api/analyze_governance_proposal';

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
  { id: 2, name: 'DAO Voting Strategy', feeUsdt: 0.02, minimalUnits: '20000' },
  { id: 3, name: 'Governance Risk Assessment', feeUsdt: 0.03, minimalUnits: '30000' },
  { id: 4, name: 'Execution Calldata Generator', feeUsdt: 0.04, minimalUnits: '40000' },
];

async function testAllServices() {
  console.log('================================================================');
  console.log('🚀 OKX.AI GovCoPilot Marketplace Fit & x402 Rules Test Suite');
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
  console.log(`   extra.name:  ${decodedChallenge.accepts[0].extra.name}`);
  console.log(`   payTo:       ${decodedChallenge.accepts[0].payTo}`);

  if (decodedChallenge.accepts[0].extra.name !== 'USD\u20ae0') {
    throw new Error('OKX Rule Mismatch: extra.name must be USD₮0');
  }

  console.log('\n----------------------------------------------------------------\n');

  // -------------------------------------------------------------------------
  // STEP 2: Execute Real EIP-3009 Payment Authorization for All 4 Services
  // -------------------------------------------------------------------------
  console.log('📋 STEP 2: Testing EIP-3009 Payment Verification for All 4 Services...\n');

  for (const s of SERVICES) {
    console.log(`▶ Testing Service #${s.id}: ${s.name} (${s.feeUsdt} USDT = ${s.minimalUnits} minimal units)`);

    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const now = Math.floor(Date.now() / 1000);
    const validBefore = now + 3600;

    const message = {
      from: testWallet.address,
      to: '0xf313dcef4e1e22c01cea636c2631c74eac6e4518',
      value: BigInt(s.minimalUnits),
      validAfter: 0n,
      validBefore: BigInt(validBefore),
      nonce: nonce,
    };

    const signature = await testWallet.signTypedData(EIP3009_DOMAIN, EIP3009_TYPES, message);

    const authPayload = {
      scheme: 'exact',
      network: 'eip155:196',
      payload: {
        from: testWallet.address,
        to: '0xf313dcef4e1e22c01cea636c2631c74eac6e4518',
        value: s.minimalUnits,
        validAfter: 0,
        validBefore: validBefore,
        nonce: nonce,
        signature: signature,
      },
    };

    const b64Auth = Buffer.from(JSON.stringify(authPayload)).toString('base64');
    const testJobId = `task-e2e-service-${s.id}`;

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': b64Auth,
        'X-Job-Id': testJobId,
      },
      body: JSON.stringify({
        serviceId: s.id,
        proposalTitle: `PIP-102: Migration Proposal for ${s.name}`,
        proposalText: `This proposal seeks community authorization for ${s.name} on X Layer Mainnet.`,
      }),
    });

    if (res.status !== 200) {
      const errTxt = await res.text();
      throw new Error(`Service ${s.id} failed with HTTP ${res.status}: ${errTxt}`);
    }

    const data: any = await res.json();
    console.log(`   ✅ HTTP 200 OK — Proposal Summary: "${data.proposalSummary?.slice(0, 65)}..."`);
    console.log(`   ✅ Voting Recommendation: ${data.votingRecommendation?.vote} (Confidence: ${data.votingRecommendation?.confidence})`);
    console.log(`   ✅ Deliverable Status: ${data.deliverableStatus} (URL: ${data.deliverableUrl})`);
    console.log('');
  }

  console.log('----------------------------------------------------------------\n');

  // -------------------------------------------------------------------------
  // STEP 3: Verify Async Deliverable Polling & Retrieval (/api/deliverables)
  // -------------------------------------------------------------------------
  console.log('📋 STEP 3: Verifying Deliverable Polling & Retrieval (/api/deliverables)...');

  const pollRes = await fetch('https://gov-copilot-api.futuristic-talos-42b.workers.dev/api/deliverable/task-e2e-service-1');
  if (pollRes.status !== 200) {
    throw new Error(`Deliverable polling failed with status ${pollRes.status}`);
  }

  const pollData: any = await pollRes.json();
  console.log(`✅ Deliverable successfully retrieved via polling GET endpoint:`);
  console.log(`   jobId:   ${pollData.deliverable?.jobId}`);
  console.log(`   Title:   ${pollData.deliverable?.proposalTitle}`);
  console.log(`   Vote:    ${pollData.deliverable?.votingRecommendation?.vote}`);
  console.log(`   Summary: "${pollData.deliverable?.proposalSummary?.slice(0, 75)}..."`);

  console.log('\n================================================================');
  console.log('🎉 ALL 4 SERVICES COMPLY WITH OKX x402 RULES & MARKETPLACE FIT!');
  console.log('================================================================');
}

testAllServices().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
