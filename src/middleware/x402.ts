import { Request, Response, NextFunction } from 'express';
import { JsonRpcProvider, TransactionResponse } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Configuration from env variables
const ASP_WALLET_ADDRESS = process.env.ASP_WALLET_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'; // Example address
const REQUIRED_AMOUNT = process.env.PAYMENT_AMOUNT || '0.05'; // e.g., 0.05 USDC or OKB
const CHAIN_ID = process.env.CHAIN_ID || '195'; // Default: X Layer Testnet (195)
const RPC_URL = process.env.X_LAYER_RPC_URL || 'https://xlayertestrpc.okx.com'; // X Layer Testnet RPC

// Memory store to prevent replay attacks
const verifiedTransactions = new Set<string>();

export async function x402Middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bypass = process.env.BYPASS_PAYMENT_VERIFICATION === 'true';
  if (bypass) {
    console.log('x402: Payment verification bypassed via environment config.');
    return next();
  }

  const txHash = req.header('X-Payment-Tx-Hash');

  if (!txHash) {
    // If no txHash, return 402 Payment Required
    res.setHeader('Access-Control-Expose-Headers', 'X-Payment-Address, X-Payment-Amount, X-Payment-Chain-Id');
    res.setHeader('X-Payment-Address', ASP_WALLET_ADDRESS);
    res.setHeader('X-Payment-Amount', REQUIRED_AMOUNT);
    res.setHeader('X-Payment-Chain-Id', CHAIN_ID);

    res.status(402).json({
      error: 'Payment Required',
      message: `To access GovCoPilot analyze_governance_proposal tool, pay ${REQUIRED_AMOUNT} native token/USDC to ${ASP_WALLET_ADDRESS} on Chain ID ${CHAIN_ID}. Once paid, include the transaction hash in the 'X-Payment-Tx-Hash' header.`,
      paymentDetails: {
        recipient: ASP_WALLET_ADDRESS,
        amount: REQUIRED_AMOUNT,
        chainId: CHAIN_ID,
      },
    });
    return;
  }

  // Prevent replay attacks
  if (verifiedTransactions.has(txHash.toLowerCase())) {
    res.status(400).json({
      error: 'Invalid Payment',
      message: 'This transaction hash has already been used for a previous request.',
    });
    return;
  }

  try {
    const provider = new JsonRpcProvider(RPC_URL);
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
      res.status(400).json({
        error: 'Invalid Payment',
        message: 'Transaction not found onchain. Please ensure the transaction hash is correct and has been broadcasted.',
      });
      return;
    }

    // Verify transaction recipient
    if (!tx.to || tx.to.toLowerCase() !== ASP_WALLET_ADDRESS.toLowerCase()) {
      res.status(400).json({
        error: 'Invalid Payment',
        message: `Transaction recipient does not match GovCoPilot. Expected: ${ASP_WALLET_ADDRESS}, got: ${tx.to}`,
      });
      return;
    }

    // Verify transaction value
    // Note: For native token transfer, tx.value is in wei.
    // If it's a ERC20 token (like USDC) transaction, we'd need to parse the log/calldata.
    // As an MVP/Hackathon showcase, we check native value first, or accept transaction if value > 0 for demo purposes.
    const txValueEth = parseFloat(tx.value.toString()) / 1e18;
    const requiredAmountNum = parseFloat(REQUIRED_AMOUNT);

    // If it is a token transfer (value is 0 but has input data), we can parse input or allow it for demo.
    const isTokenTransfer = tx.data && tx.data !== '0x';

    if (!isTokenTransfer && txValueEth < requiredAmountNum) {
      res.status(400).json({
        error: 'Invalid Payment',
        message: `Insufficient payment amount. Expected at least ${REQUIRED_AMOUNT}, got: ${txValueEth}`,
      });
      return;
    }

    // Wait for at least 1 confirmation (can check if tx.blockNumber is not null)
    if (!tx.blockNumber) {
      res.status(400).json({
        error: 'Invalid Payment',
        message: 'Transaction is still pending. Please wait for at least 1 block confirmation.',
      });
      return;
    }

    // Success! Mark transaction as used and proceed
    verifiedTransactions.add(txHash.toLowerCase());
    console.log(`x402: Payment verified successfully for tx: ${txHash}`);
    next();
  } catch (error: any) {
    console.error('Error verifying payment onchain:', error);
    res.status(500).json({
      error: 'Payment Verification Error',
      message: `Failed to verify payment onchain: ${error.message || error}`,
    });
  }
}
