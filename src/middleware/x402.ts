import { Request, Response, NextFunction } from 'express';
import { JsonRpcProvider } from 'ethers';
import { getNetworkConfig } from '../config/network.js';

// Memory store to prevent replay attacks
const verifiedTransactions = new Set<string>();

export async function x402Middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isPlayground = req.header('X-Playground-Request') === 'true';
  const bypass = process.env.BYPASS_PAYMENT_VERIFICATION === 'true' || isPlayground;
  if (bypass) {
    console.log(`[x402] Payment verification bypassed for ${req.method} ${req.path} (Playground: ${isPlayground}).`);
    return next();
  }

  const networkConfig = getNetworkConfig(req);
  const txHash = req.header('X-Payment-Tx-Hash') || req.header('X-Payment-Hash') || (req.body && req.body.paymentTxHash);

  if (!txHash) {
    const numericChainId = parseInt(networkConfig.chainId, 10);
    const caip2ChainId = networkConfig.caip2ChainId; // e.g. 'eip155:196'

    // Build standard x402 payment offer object
    const paymentOffer = {
      x402Version: 1,
      error: 'Payment Required',
      message: `To access GovCoPilot ASP analyze_governance_proposal tool, pay ${networkConfig.paymentAmount} ${networkConfig.paymentAsset} to ${networkConfig.aspWalletAddress} on ${networkConfig.name} (${caip2ChainId}). Include transaction hash in the 'X-Payment-Tx-Hash' header upon completion.`,
      accepts: [
        {
          scheme: 'exact',
          network: caip2ChainId,
          chainId: caip2ChainId,
          numericChainId: numericChainId,
          asset: networkConfig.paymentAsset,
          payTo: networkConfig.aspWalletAddress,
          amount: networkConfig.paymentAmount,
          tokenAddress: networkConfig.usdtContractAddress,
          maxAmountRequired: networkConfig.paymentAmount,
        },
      ],
      paymentDetails: {
        recipient: networkConfig.aspWalletAddress,
        amount: networkConfig.paymentAmount,
        asset: networkConfig.paymentAsset,
        network: caip2ChainId,
        chainId: caip2ChainId,
        numericChainId: numericChainId,
        caip2: caip2ChainId,
        tokenAddress: networkConfig.usdtContractAddress,
        networkName: networkConfig.name,
      },
    };

    // Encode PAYMENT-REQUIRED header for x402 v2 protocol compliance
    const encodedOffer = Buffer.from(JSON.stringify(paymentOffer)).toString('base64');

    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Payment-Address, X-Payment-Amount, X-Payment-Chain-Id, X-Payment-Network, X-Payment-Asset, X-Payment-Token-Address, PAYMENT-REQUIRED, WWW-Authenticate'
    );
    res.setHeader('X-Payment-Address', networkConfig.aspWalletAddress);
    res.setHeader('X-Payment-Amount', networkConfig.paymentAmount);
    res.setHeader('X-Payment-Chain-Id', caip2ChainId);
    res.setHeader('X-Payment-Network', caip2ChainId);
    res.setHeader('X-Payment-Asset', networkConfig.paymentAsset);
    res.setHeader('X-Payment-Token-Address', networkConfig.usdtContractAddress);
    res.setHeader('PAYMENT-REQUIRED', encodedOffer);

    console.log(
      `[x402] 402 Payment Required issued to ${req.ip || 'client'} for ${req.path}. Network: ${caip2ChainId}, Address: ${networkConfig.aspWalletAddress}, Fee: ${networkConfig.paymentAmount} ${networkConfig.paymentAsset}`
    );

    res.status(402).json(paymentOffer);
    return;
  }

  console.log(`[x402] Verifying payment transaction ${txHash} on ${networkConfig.name} (${networkConfig.caip2ChainId})...`);

  // Prevent replay attacks
  if (verifiedTransactions.has(txHash.toLowerCase())) {
    console.warn(`[x402] Replay attack detected: Transaction hash ${txHash} has already been used.`);
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
      console.warn(`[x402] Transaction ${txHash} not found on RPC node ${networkConfig.rpcUrl}.`);
      res.status(400).json({
        error: 'Invalid Payment',
        message: `Transaction not found on ${networkConfig.name} (${networkConfig.caip2ChainId}). Please verify transaction hash and broadcast status.`,
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
      console.warn(`[x402] Recipient mismatch for tx ${txHash}. Target expected: ${networkConfig.aspWalletAddress}, actual tx.to: ${tx.to}`);
      res.status(400).json({
        error: 'Invalid Payment',
        message: `Transaction recipient does not match GovCoPilot ASP address on ${networkConfig.name}. Expected recipient: ${networkConfig.aspWalletAddress}`,
      });
      return;
    }

    // Wait for block confirmation
    if (!tx.blockNumber) {
      console.warn(`[x402] Transaction ${txHash} is still pending (unconfirmed block).`);
      res.status(400).json({
        error: 'Invalid Payment',
        message: `Transaction is still pending on ${networkConfig.name}. Please wait for block confirmation.`,
      });
      return;
    }

    // Success! Mark transaction as used and proceed
    verifiedTransactions.add(txHash.toLowerCase());
    console.log(`[x402] SUCCESS: Payment verified on ${networkConfig.name} (${networkConfig.caip2ChainId}) for tx: ${txHash}`);
    next();
  } catch (error: any) {
    console.error(`[x402] ERROR verifying payment on ${networkConfig.name}:`, error);
    res.status(500).json({
      error: 'Payment Verification Error',
      message: `Failed to verify payment on ${networkConfig.name}: ${error.message || error}`,
    });
  }
}
