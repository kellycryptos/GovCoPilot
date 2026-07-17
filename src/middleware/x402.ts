import { Request, Response, NextFunction } from 'express';
import { JsonRpcProvider, TransactionResponse } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Configuration from env variables
const ASP_WALLET_ADDRESS = '0xf313dcef4e1e22c01cea636c2631c74eac6e4518'; // Mainnet ASP Wallet Payout address
const REQUIRED_AMOUNT = process.env.PAYMENT_AMOUNT || '0.05'; // 0.05 USDT or OKB
const CHAIN_ID = process.env.CHAIN_ID || '196'; // Default: X Layer Mainnet (196)
const RPC_URL = process.env.X_LAYER_RPC_URL || 'https://rpc.xlayer.tech'; // X Layer Mainnet RPC

// Memory store to prevent replay attacks
const verifiedTransactions = new Set<string>();

export async function x402Middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isPlayground = req.header('X-Playground-Request') === 'true';
  const bypass = process.env.BYPASS_PAYMENT_VERIFICATION === 'true' || isPlayground;
  if (bypass) {
    console.log('x402: Payment verification bypassed.');
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

    // Verify transaction recipient (native transfer, ERC20 transfer, or AA UserOp)
    let isRecipientMatch = false;
    const targetAddressClean = ASP_WALLET_ADDRESS.toLowerCase().replace(/^0x/, '');

    if (tx.to && tx.to.toLowerCase() === ASP_WALLET_ADDRESS.toLowerCase()) {
      isRecipientMatch = true;
    } else if (tx.data && tx.data.toLowerCase().includes(targetAddressClean)) {
      isRecipientMatch = true;
    }

    if (!isRecipientMatch) {
      res.status(400).json({
        error: 'Invalid Payment',
        message: `Transaction recipient does not match GovCoPilot. Expected: ${ASP_WALLET_ADDRESS}`,
      });
      return;
    }

    // Verify transaction value
    const txValueEth = parseFloat(tx.value.toString()) / 1e18;
    const requiredAmountNum = parseFloat(REQUIRED_AMOUNT);

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
