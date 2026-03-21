import type { DexConfig } from './types.js';

export const DEX_PRESETS: Record<string, DexConfig> = {
  'base': {
    routerAddress: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    quoterAddress: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    wethAddress: '0x4200000000000000000000000000000000000006',
    defaultTokens: {
      usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      dai: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    },
    defaultSlippage: 0.005,
    defaultDeadlineSeconds: 300,
  },
  'base-sepolia': {
    routerAddress: '0x050E797f3625EC8785265e1d9BDd4799b97528A1',
    wethAddress: '0x4200000000000000000000000000000000000006',
    defaultTokens: {
      usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
    defaultSlippage: 0.01,
    defaultDeadlineSeconds: 600,
  },
  'ethereum': {
    routerAddress: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    quoterAddress: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    defaultTokens: {
      usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    },
    defaultSlippage: 0.005,
    defaultDeadlineSeconds: 300,
  },
};

export function getDexPreset(chainId: number): DexConfig | null {
  switch (chainId) {
    case 8453: return DEX_PRESETS['base'];
    case 84532: return DEX_PRESETS['base-sepolia'];
    case 1: return DEX_PRESETS['ethereum'];
    default: return null;
  }
}
