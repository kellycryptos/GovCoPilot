import { Request } from 'express';
import dotenv from 'dotenv';

dotenv.config();

export interface NetworkConfig {
  networkKey: 'mainnet';
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

const DEFAULT_ASP_ADDRESS = '0xf313dcef4e1e22c01cea636c2631c74eac6e4518';
const USDT0_MAINNET_ADDRESS = '0x779ded0c9e102225f8e0630b35a9b54be713736';

function getAspWalletAddress(): string {
  const envAddr = process.env.ASP_WALLET_ADDRESS;
  if (!envAddr || envAddr.toLowerCase() === '0xc91766bfeb093cf177936e95ff187ff7cc13fe5b') {
    return DEFAULT_ASP_ADDRESS;
  }
  return envAddr;
}

export const MAINNET_CONFIG: NetworkConfig = {
  networkKey: 'mainnet',
  chainId: '196',
  caip2ChainId: 'eip155:196',
  name: 'X Layer Mainnet',
  rpcUrl: process.env.X_LAYER_MAINNET_RPC_URL || process.env.X_LAYER_RPC_URL || 'https://rpc.xlayer.tech',
  explorerUrl: 'https://www.okx.com/web3/explorer/xlayer',
  aspWalletAddress: getAspWalletAddress(),
  usdtContractAddress: USDT0_MAINNET_ADDRESS,
  paymentAmount: process.env.PAYMENT_AMOUNT || '0.05',
  paymentAsset: 'USDT0',
};

export const NETWORKS: Record<string, NetworkConfig> = {
  mainnet: MAINNET_CONFIG,
  testnet: MAINNET_CONFIG, // Forced to Mainnet config (testnet fallback disabled)
};

export function getActiveNetworkKey(_req?: Request): 'mainnet' {
  return 'mainnet';
}

export function getNetworkConfig(_req?: Request): NetworkConfig {
  return MAINNET_CONFIG;
}
