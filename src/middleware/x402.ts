import { Request, Response, NextFunction } from 'express';
import { JsonRpcProvider } from 'ethers';
import { getNetworkConfig } from '../config/network.js';

// Memory store to prevent replay attacks
const verifiedTransactions = new Set<string>();

export async function x402Middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isPlayground = req.header('X-Playground-Request') === 'true';
  const bypass = process.env.BYPASS_PAYMENT_VERIFICATION === 'true' || isPlayground;
  if (bypass) {
    console.log('x402: Payment verification bypassed.');
    return next();
  }

  const networkConfig = getNetworkConfig(req);
  const txHash = req.header('X-Payment-Tx-Hash');

  if (!txHash) {
    // If no txHash, return 402 Payment Required
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Payment-Address, X-Payment-Amount, X-Payment-Chain-Id, X-Payment-Asset, X-Payment-Token-Address'
    );
    res.setHeader('X-Payment-Address', networkConfig.aspWalletAddress);
    res.setHeader('X-Payment-Amount', networkConfig.paymentAmount);
    res.setHeader('X-Payment-Chain-Id', networkConfig.chainId);
    res.setHeader('X-Payment-Asset', networkConfig.paymentAsset);
    res.setHeader('X-Payment-Token-Address', networkConfig.usdtContractAddress);

    res.status(402).json({
      error: 'Payment Required',
      message: `To access GovCoPilot analyze_governance_proposal tool, pay ${networkConfig.paymentAmount} ${networkConfig.paymentAsset} to ${networkConfig.aspWalletAddress} on ${networkConfig.name} (Chain ID ${networkConfig.chainId}). Once paid, include the transaction hash in the 'X-Payment-Tx-Hash' header.`,
      paymentDetails: {
        recipient: networkConfig.aspWalletAddress,
        amount: networkConfig.paymentAmount,
        asset: networkConfig.paymentAsset,
        chainId: networkConfig.chainId,
        tokenAddress: networkConfig.usdtContractAddress,
        network: networkConfig.name,
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
    const provider = new JsonRpcProvider(networkConfig.rpcUrl);
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
      res.status(400).json({
        error: 'Invalid Payment',
        message: `Transaction not found on ${networkConfig.name}. Please ensure the transaction hash is correct and has been broadcasted.`,
      });
      return;
    }

    // Verify transaction recipient (native transfer, ERC20 USDT transfer, or AA UserOp)
    let isRecipientMatch = false;
    const targetAddressClean = networkConfig.aspWalletAddress.toLowerCase().replace(/^0x/, '');
    const usdtAddressClean = networkConfig.usdtContractAddress.toLowerCase();

    // 1. Direct transfer to ASP wallet
    if (tx.to && tx.to.toLowerCase() === networkConfig.aspWalletAddress.toLowerCase()) {
      isRecipientMatch = true;
    } 
    // 2. ERC20 transfer (e.g. USDT) where tx.to is token contract and data contains recipient
    else if (tx.to && tx.to.toLowerCase() === usdtAddressClean && tx.data && tx.data.toLowerCase().includes(targetAddressClean)) {
      isRecipientMatch = true;
    }
    // 3. Generic calldata match (smart account / multi-sig / proxy call containing ASP address)
    else if (tx.data && tx.data.toLowerCase().includes(targetAddressClean)) {
      isRecipientMatch = true;
    }

    if (!isRecipientMatch) {
      res.status(400).json({
        error: 'Invalid Payment',
        message: `Transaction recipient does not match GovCoPilot ASP address on ${networkConfig.name}. Expected recipient: ${networkConfig.aspWalletAddress}`,
      });
      return;
    }

    // Wait for block confirmation
    if (!tx.blockNumber) {
      res.status(400).json({
        error: 'Invalid Payment',
        message: `Transaction is still pending on ${networkConfig.name}. Please wait for block confirmation.`,
      });
      return;
    }

    // Success! Mark transaction as used and proceed
    verifiedTransactions.add(txHash.toLowerCase());
    console.log(`x402: Payment verified successfully on ${networkConfig.name} (Chain ID ${networkConfig.chainId}) for tx: ${txHash}`);
    next();
  } catch (error: any) {
    console.error(`Error verifying payment on ${networkConfig.name}:`, error);
    res.status(500).json({
      error: 'Payment Verification Error',
      message: `Failed to verify payment on ${networkConfig.name}: ${error.message || error}`,
    });
  }
}
