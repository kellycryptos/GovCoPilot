import { JsonRpcProvider, Wallet, Contract, parseUnits } from 'ethers';
import dotenv from 'dotenv';
import app from '../api/index.js';
import { AddressInfo } from 'net';

dotenv.config();

const ASP_ADDRESS = process.env.ASP_WALLET_ADDRESS || '0xC91766bfeB093cF177936E95FF187FF7Cc13fe5b';
const USDT_ADDRESS = '0x1E4a5963aBFD975d8c9021ce480b42188849D41d';
const MAINNET_RPC = process.env.X_LAYER_MAINNET_RPC_URL || 'https://rpc.xlayer.tech';

const ERC20_ABI = [
  'function transfer(address to, uint256 value) public returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
];

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

async function mainnetE2ETest() {
  console.log('=== X Layer Mainnet End-to-End x402 Live Test ===\n');

  const { url, close } = await startServer();
  console.log(`Local ASP Server started on ${url}`);

  try {
    // Step A: Probe without payment header
    console.log('\n[Step A] Sending unauthenticated probe POST to /api/analyze...');
    const probeRes = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalText: 'PIP-105: Update X Layer Router Fee Model',
        proposalTitle: 'PIP-105: Update X Layer Router Fee Model',
        chain: 'x-layer',
      }),
    });

    console.log('Probe HTTP Status:', probeRes.status);
    const probeData = await probeRes.json();
    console.log('402 Payment Required Response:', probeData);

    const recipient = probeRes.headers.get('X-Payment-Address');
    const amount = probeRes.headers.get('X-Payment-Amount');
    const chainId = probeRes.headers.get('X-Payment-Chain-Id');
    const asset = probeRes.headers.get('X-Payment-Asset');

    console.log(`\nVerified 402 Headers: Recipient=${recipient}, Amount=${amount} ${asset}, ChainId=${chainId}`);

    if (chainId !== '196') {
      throw new Error(`Expected X Layer Mainnet Chain ID 196, got ${chainId}`);
    }

    // Step B: Submit real transaction or use provided TX hash
    let txHash = process.env.MAINNET_PAYMENT_TX_HASH;

    if (!txHash && process.env.MAINNET_PAYER_PRIVATE_KEY) {
      console.log('\n[Step B] Broadcasting real 0.05 USDT payment on X Layer Mainnet...');
      const provider = new JsonRpcProvider(MAINNET_RPC);
      const wallet = new Wallet(process.env.MAINNET_PAYER_PRIVATE_KEY, provider);
      const usdt = new Contract(USDT_ADDRESS, ERC20_ABI, wallet);

      const parsedAmount = parseUnits(amount || '0.05', 6);
      console.log(`Sending ${amount} USDT from ${wallet.address} to ${ASP_ADDRESS}...`);

      const tx = await usdt.transfer(ASP_ADDRESS, parsedAmount);
      console.log(`Broadcasted Mainnet Tx: ${tx.hash}`);
      console.log('Waiting for block confirmation...');
      await tx.wait(1);
      txHash = tx.hash;
      console.log(`Tx confirmed on block! Tx Hash: ${txHash}`);
    }

    if (!txHash) {
      console.log('\n-------------------------------------------------------------');
      console.log('NOTICE: No MAINNET_PAYMENT_TX_HASH or MAINNET_PAYER_PRIVATE_KEY set.');
      console.log('To execute Step B automatically, set MAINNET_PAYER_PRIVATE_KEY in .env');
      console.log(`Or manually send 0.05 USDT on X Layer Mainnet to ${ASP_ADDRESS}`);
      console.log('and pass MAINNET_PAYMENT_TX_HASH=<txHash> when running this script.');
      console.log('-------------------------------------------------------------\n');
      return;
    }

    // Step C: Retry request with X-Payment-Tx-Hash
    console.log(`\n[Step C] Retrying /api/analyze with X-Payment-Tx-Hash: ${txHash}...`);
    const paidRes = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Tx-Hash': txHash,
      },
      body: JSON.stringify({
        proposalText: 'PIP-105: Update X Layer Router Fee Model',
        proposalTitle: 'PIP-105: Update X Layer Router Fee Model',
        chain: 'x-layer',
      }),
    });

    console.log('Paid Request HTTP Status:', paidRes.status);
    const paidData = await paidRes.json();
    console.log('\n=== REAL MAINNET ANALYSIS RESPONSE ===');
    console.log(JSON.stringify(paidData, null, 2));

    if (paidRes.status === 200) {
      console.log('\nSUCCESS! Real X Layer Mainnet x402 payment flow verified end-to-end!');
      console.log(`Block Explorer Link: https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`);
    } else {
      console.error('Failed to verify payment or complete analysis.');
    }
  } catch (error) {
    console.error('Error during mainnet E2E test:', error);
  } finally {
    close();
  }
}

mainnetE2ETest();
