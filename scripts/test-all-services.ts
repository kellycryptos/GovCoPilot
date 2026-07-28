import { ethers } from 'ethers';

const WORKER_URL = 'https://gov-copilot-api.futuristic-talos-42b.workers.dev/api/analyze_governance_proposal';

// Registered services on OKX.AI Marketplace
const SERVICES = [
  { id: 1, name: 'DAO Proposal Analysis', feeUsdt: 0.05, minimalUnits: '50000' },
  { id: 2, name: 'DAO Voting Strategy', feeUsdt: 0.02, minimalUnits: '20000' },
  { id: 3, name: 'Governance Risk Assessment', feeUsdt: 0.03, minimalUnits: '30000' },
  { id: 4, name: 'Execution Calldata Generator', feeUsdt: 0.04, minimalUnits: '40000' },
];

// Reusable mock signer for testing EIP-3009 verification logic
const testWallet = ethers.Wallet.createRandom();

const EIP3009_DOMAIN = {
  name: 'USD\u20ae0',
  version: '1',
  chainId: 196,
  verifyingContract: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
};

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from',        type: 'address' },
    { name: 'to',          type: 'address' },
    { name: 'value',       type: 'uint256' },
    { name: 'validAfter',  type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce',       type: 'bytes32' },
  ],
};

async function testAllServices() {
  console.log('================================================================');
  console.log('🚀 OKX.AI GovCoPilot Marketplace Fit & x402 Rules Test Suite');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // STEP 1: Verify x402 HTTP 402 Challenge on Cloudflare Worker
  // -------------------------------------------------------------------------
  console.log('📋 STEP 1: Verifying x402 HTTP 402 Challenge Header & Schema...');
  const initialRes = await fetch(WORKER_URL, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
  
  if (initialRes.status !== 402) {
    throw new Error(`Expected HTTP 402 Payment Required, got status ${initialRes.status}`);
  }

  const paymentReqHeader = initialRes.headers.get('PAYMENT-REQUIRED');
  if (!paymentReqHeader) {
    throw new Error('Missing PAYMENT-REQUIRED response header');
  }

  const decodedChallenge = JSON.parse(Buffer.from(paymentReqHeader, 'base64').toString('utf-8'));
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
  // STEP 2: Execute Real EIP-3009 Authorization Replay for All 4 Services
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
      from: testWallet.address,
      to: '0xf313dcef4e1e22c01cea636c2631c74eac6e4518',
      value: s.minimalUnits,
      validAfter: 0,
      validBefore: validBefore,
      nonce: nonce,
      signature: signature,
    };

    const b64Auth = Buffer.from(JSON.stringify(authPayload)).toString('base64');

    const serviceBody = JSON.stringify({
      serviceId: s.id,
      proposalTitle: `Test Proposal for ${s.name}`,
      proposalText: `This is a test governance proposal requesting automated analysis for ${s.name}.`,
    });

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT-SIGNATURE': b64Auth,
        'PAYMENT-SIGNATURE': b64Auth,
      },
      body: serviceBody,
    });

    if (res.status !== 200) {
      const errText = await res.text();
      throw new Error(`Service #${s.id} failed with HTTP ${res.status}: ${errText}`);
    }

    const data: any = await res.json();
    console.log(`   ✅ HTTP 200 OK — Proposal Summary: "${data.proposalSummary?.substring(0, 65)}..."`);
    console.log(`   ✅ Voting Recommendation: ${data.votingRecommendation?.vote} (Confidence: ${data.votingRecommendation?.confidence})`);
    console.log(`   ✅ Strategic Alignment: "${data.analysis?.strategicAlignment?.substring(0, 70)}..."\n`);
  }

  console.log('----------------------------------------------------------------\n');

  // -------------------------------------------------------------------------
  // STEP 3: Verify Direct-Accept Fallback Mode (Empty Body Payload)
  // -------------------------------------------------------------------------
  console.log('📋 STEP 3: Verifying Direct-Accept Fallback Handling (Empty Client Body)...');

  const fallbackNonce = ethers.hexlify(ethers.randomBytes(32));
  const fallbackMsg = {
    from: testWallet.address,
    to: '0xf313dcef4e1e22c01cea636c2631c74eac6e4518',
    value: 20000n, // 0.02 USDT
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce: fallbackNonce,
  };
  const fallbackSig = await testWallet.signTypedData(EIP3009_DOMAIN, EIP3009_TYPES, fallbackMsg);
  const fallbackAuth = Buffer.from(JSON.stringify({
    from: testWallet.address,
    to: '0xf313dcef4e1e22c01cea636c2631c74eac6e4518',
    value: '20000',
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 3600,
    nonce: fallbackNonce,
    signature: fallbackSig,
  })).toString('base64');

  const emptyBodyRes = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT-SIGNATURE': fallbackAuth,
      'PAYMENT-SIGNATURE': fallbackAuth,
    },
    body: '{}',
  });

  if (emptyBodyRes.status !== 200) {
    throw new Error(`Direct-accept fallback failed with status ${emptyBodyRes.status}`);
  }

  const fallbackData: any = await emptyBodyRes.json();
  console.log(`✅ Direct-accept fallback returned successful analysis of real SynArc proposal:`);
  console.log(`   Source: ${fallbackData.source}`);
  console.log(`   Source URL: ${fallbackData.sourceUrl}`);
  console.log(`   Vote: ${fallbackData.votingRecommendation?.vote}`);
  console.log(`   Summary: "${fallbackData.proposalSummary}"`);

  console.log('\n================================================================');
  console.log('🎉 ALL 4 SERVICES COMPLY WITH OKX x402 RULES & MARKETPLACE FIT!');
  console.log('================================================================');
}

testAllServices().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
