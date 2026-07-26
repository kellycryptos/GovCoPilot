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
  paymentAmount: string;             // human-readable decimal, e.g. '0.05'
  paymentAmountMinimalUnits: string; // integer string in token minimal units, e.g. '50000' (6 decimals)
  paymentAsset: string;
}

const DEFAULT_ASP_ADDRESS = '0xf313dcef4e1e22c01cea636c2631c74eac6e4518';
// Correct USDT0 address on X Layer mainnet (was missing a '2' — typo now fixed)
const USDT0_MAINNET_ADDRESS = '0x779ded0c9e1022225f8e0630b35a9b54be713736';

function getAspWalletAddress(): string {
  const envAddr = process.env.ASP_WALLET_ADDRESS;
  if (!envAddr || envAddr.toLowerCase() === '0xc91766bfeb093cf177936e95ff187ff7cc13fe5b') {
    return DEFAULT_ASP_ADDRESS;
  }
  return envAddr;
}

// USDT0 has 6 decimals. 0.05 USDT = 50000 minimal units.
// If PAYMENT_AMOUNT env var is changed, update PAYMENT_AMOUNT_MINIMAL_UNITS accordingly.
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
  paymentAmountMinimalUnits: process.env.PAYMENT_AMOUNT_MINIMAL_UNITS || '50000', // 0.05 USDT × 10^6
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
