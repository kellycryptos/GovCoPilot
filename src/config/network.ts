import { Request } from 'express';
import dotenv from 'dotenv';

dotenv.config();

export interface NetworkConfig {
  networkKey: 'mainnet' | 'testnet';
  chainId: string;
  caip2ChainId: string;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  aspWalletAddress: string;
  usdtContractAddress: string;
  paymentAmount: string;
  paymentAsset: string;
}

export const NETWORKS: Record<'mainnet' | 'testnet', NetworkConfig> = {
  mainnet: {
    networkKey: 'mainnet',
    chainId: process.env.CHAIN_ID || '196',
    caip2ChainId: process.env.CAIP2_CHAIN_ID || 'eip155:196',
    name: 'X Layer Mainnet',
    rpcUrl: process.env.X_LAYER_MAINNET_RPC_URL || process.env.X_LAYER_RPC_URL || 'https://rpc.xlayer.tech',
    explorerUrl: 'https://www.okx.com/web3/explorer/xlayer',
    aspWalletAddress: process.env.ASP_WALLET_ADDRESS || '0xf313dcef4e1e22c01cea636c2631c74eac6e4518',
    usdtContractAddress: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
    paymentAmount: process.env.PAYMENT_AMOUNT || '0.05',
    paymentAsset: 'USDT',
  },
  testnet: {
    networkKey: 'testnet',
    chainId: '195',
    caip2ChainId: 'eip155:195',
    name: 'X Layer Testnet',
    rpcUrl: process.env.X_LAYER_TESTNET_RPC_URL || 'https://xlayertestrpc.okx.com',
    explorerUrl: 'https://www.okx.com/web3/explorer/xlayer-test',
    aspWalletAddress: process.env.ASP_WALLET_ADDRESS || '0xf313dcef4e1e22c01cea636c2631c74eac6e4518',
    usdtContractAddress: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
    paymentAmount: process.env.PAYMENT_AMOUNT || '0.05',
    paymentAsset: 'USDT',
  },
};

export function getActiveNetworkKey(req?: Request): 'mainnet' | 'testnet' {
  if (req) {
    const headerNet = req.header('X-Network')?.toLowerCase();
    if (headerNet === 'testnet' || headerNet === 'mainnet') {
      return headerNet;
    }
    const queryNet = (req.query?.network as string)?.toLowerCase();
    if (queryNet === 'testnet' || queryNet === 'mainnet') {
      return queryNet;
    }
  }

  const envNet = process.env.NETWORK?.toLowerCase();
  if (envNet === 'testnet') {
    return 'testnet';
  }

  return 'mainnet';
}

export function getNetworkConfig(req?: Request): NetworkConfig {
  const key = getActiveNetworkKey(req);
  return NETWORKS[key];
}
