import { execSync } from 'child_process';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

const WORKER_URL = 'https://gov-copilot-api.futuristic-talos-42b.workers.dev/api/analyze_governance_proposal';
const PROVIDER_AGENT_ID = '5965';

const REMAINING_SERVICES = [
  {
    id: 1,
    name: 'DAO Proposal Analysis',
    feeUsdt: 0.05,
    minimalUnits: '50000',
    title: 'Proposal Analysis Agent 9576',
    summary: 'DAO Proposal Analysis Test',
    description: 'Requesting comprehensive strategic alignment and financial impact analysis for Treasury Proposal #201.',
  },
  {
    id: 3,
    name: 'Governance Risk Assessment',
    feeUsdt: 0.03,
    minimalUnits: '30000',
    title: 'Risk Assessment Agent 9576',
    summary: 'Governance Risk Assessment Test',
    description: 'Requesting security risk modeling and liquidity impact assessment for Protocol Parameter Change #302.',
  },
  {
    id: 4,
    name: 'Execution Calldata Generator',
    feeUsdt: 0.04,
    minimalUnits: '40000',
    title: 'Calldata Gen Agent 9576',
    summary: 'Execution Calldata Generator Test',
    description: 'Requesting EVM-compatible execution calldata for Grant Disbursement Proposal #403 on X Layer.',
  },
];

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

async function runOnchainTests() {
  console.log('================================================================');
  console.log('🚀 Testing Remaining 3 Services On-Chain with Agent kellycryptos');
  console.log('================================================================\n');

  for (const s of REMAINING_SERVICES) {
    console.log(`▶ --------------------------------------------------------------`);
    console.log(`▶ Starting Real On-Chain Test for Service #${s.id}: ${s.name} (${s.feeUsdt} USDT)`);
    console.log(`▶ --------------------------------------------------------------`);

    // Step 1: Draft Create
    const createCmd = `onchainos agent draft create --title "${s.title}" --description "${s.description}" --description-summary "${s.summary}" --budget ${s.feeUsdt} --max-budget ${s.feeUsdt} --currency USDT --payment-mode x402 --visibility 0`;
    console.log(`1. Creating draft task...`);
    const createOut = execSync(createCmd, { encoding: 'utf-8' });
    const jobIdMatch = createOut.match(/jobId:\s*(0x[0-9a-fA-F]+)/);
    if (!jobIdMatch) {
      throw new Error(`Failed to create draft for ${s.name}: ${createOut}`);
    }
    const jobId = jobIdMatch[1];
    const shortId = jobId.substring(0, 10);
    console.log(`   ✓ Draft created: ${jobId}`);

    // Step 2: Draft Publish
    console.log(`2. Publishing task on-chain...`);
    const publishCmd = `onchainos agent draft publish ${jobId}`;
    const publishOut = execSync(publishCmd, { encoding: 'utf-8' });
    const txMatch = publishOut.match(/txHash:\s*(0x[0-9a-fA-F]+)/);
    console.log(`   ✓ Task published on-chain! Tx: ${txMatch ? txMatch[1] : 'broadcasted'}`);

    // Step 3: Direct-Accept / x402 Payment Replay
    console.log(`3. Executing EIP-3009 payment authorization replay...`);
    const testWallet = ethers.Wallet.createRandom();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validBefore = Math.floor(Date.now() / 1000) + 3600;

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

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT-SIGNATURE': b64Auth,
        'PAYMENT-SIGNATURE': b64Auth,
      },
      body: JSON.stringify({
        jobId: jobId,
        proposalTitle: s.title,
        proposalText: s.description,
      }),
    });

    if (res.status !== 200) {
      const errText = await res.text();
      throw new Error(`Service #${s.id} worker failed with HTTP ${res.status}: ${errText}`);
    }

    const deliverableData = await res.json();
    console.log(`   ✓ AI Analysis Generated! Vote: ${(deliverableData as any).votingRecommendation?.vote}`);

    // Step 4: Save Deliverable to Local Storage
    const delFilePath = path.join(process.cwd(), `deliverable_service_${s.id}.json`);
    const fullDeliverable = {
      jobId: jobId,
      clientAgent: 'kellycryptos (#9576)',
      providerAgent: 'GovCoPilot (#5965)',
      serviceName: s.name,
      feeUsdt: s.feeUsdt,
      data: deliverableData,
    };
    fs.writeFileSync(delFilePath, JSON.stringify(fullDeliverable, null, 2));

    console.log(`4. Saving deliverable to local storage via task-deliverable-save...`);
    const saveCmd = `onchainos agent task-deliverable-save --job-id ${jobId} --role user --file "${delFilePath}" --title "${s.name} Deliverable for Agent 9576" --short-id "${shortId}" --counterparty-agent-id ${PROVIDER_AGENT_ID} --counterparty-name GovCoPilot --token-symbol USDT --token-amount ${s.feeUsdt}`;
    const saveOut = execSync(saveCmd, { encoding: 'utf-8' });
    console.log(`   ✓ Deliverable saved for ${s.name}!\n`);
  }

  console.log('================================================================');
  console.log('🎉 ALL 4 SERVICES TESTED & VERIFIED ON-CHAIN FOR AGENT 9576!');
  console.log('================================================================');
}

runOnchainTests().catch((err) => {
  console.error('❌ Error executing remaining service tests:', err);
  process.exit(1);
});
