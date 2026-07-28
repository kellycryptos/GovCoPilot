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

async function executeProposalTest(proposalTitle: string, proposalText: string, expectedVote: string) {
  const testWallet = new ethers.Wallet('0x0000000000000000000000000000000000000000000000000000000000000001');

  // Probe 402 challenge
  const challengeRes = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalTitle, proposalText }),
  });

  const rawHeader = challengeRes.headers.get('PAYMENT-REQUIRED') || challengeRes.headers.get('payment-required');
  const decodedChallenge = JSON.parse(Buffer.from(rawHeader!, 'base64').toString('utf8'));

  // Sign x402 payment
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600;
  const nonce = ethers.hexlify(ethers.randomBytes(32));

  const message = {
    from: testWallet.address,
    to: decodedChallenge.accepts[0].payTo,
    value: BigInt('50000'),
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
      value: '50000',
      validAfter,
      validBefore,
      nonce,
      signature,
    },
  };

  const encodedPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

  const apiRes = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': encodedPaymentHeader,
    },
    body: JSON.stringify({
      proposalTitle,
      proposalText,
      chain: 'xlayer',
      daoContext: 'X Layer DAO',
    }),
  });

  const data = await apiRes.json();
  const actualVote = data.votingRecommendation?.vote;
  const confidence = data.votingRecommendation?.confidence;

  console.log(`\n--- Test: "${proposalTitle}" ---`);
  console.log(`Expected Vote: ${expectedVote} | Actual Vote: ${actualVote} (Confidence: ${confidence})`);
  console.log(`Reasoning:     ${data.votingRecommendation?.reasoning}`);

  if (actualVote !== expectedVote) {
    throw new Error(`Regression test failed! Expected ${expectedVote}, got ${actualVote}`);
  }
}

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('🛡️ GOVCOPILOT PERMANENT AI REGRESSION TEST SUITE');
  console.log('================================================================');

  // Test Case 1: Legitimate Governance Upgrade -> Expected YES
  await executeProposalTest(
    'Legitimate Router Upgrade',
    'Upgrade Governor liquidity router parameters on X Layer Mainnet to optimize swap routing fees and reduce execution latency. Target contract address: 0x1111111111111111111111111111111111111111.',
    'YES'
  );

  // Test Case 2: Malicious Treasury Drain Proposal -> Expected NO
  await executeProposalTest(
    'Malicious Treasury Drain',
    'Transfer 95% of the DAO treasury to wallet 0x000000000000000000000000000000000000dead with no timelock, no multisig, and no community vote required. Executable immediately upon proposal creation.',
    'NO'
  );

  console.log('\n================================================================');
  console.log('✅ ALL PERMANENT REGRESSION TESTS PASSED!');
  console.log('================================================================\n');
}

runRegressionSuite().catch((err) => {
  console.error('❌ Regression suite failed:', err);
  process.exit(1);
});
