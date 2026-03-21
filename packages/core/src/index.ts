// ── Public API ──
export { wrap, createEngine, shutdown } from './engine/wrap.js';

// ── Types ──
export type {
  FailureClassification,
  RepairCandidate,
  GeneCapsule,
  RepairResult,
  PlatformAdapter,
  ErrorCode,
  FailureCategory,
  Platform,
  Severity,
  SseEvent,
  SseEventType,
  HelixConfig,
  WrapOptions,
  HelixMode,
  HelixProviderConfig,
  DexConfig,
} from './engine/types.js';

export { REVENUE_AT_RISK, DEFAULT_CONFIG } from './engine/types.js';

// ── Platform adapters (for advanced users) ──
export { tempoAdapter, privyAdapter, coinbaseAdapter, genericAdapter, stripeAdapter, defaultAdapters } from './platforms/index.js';

// ── Engine internals (for advanced users) ──
export { PcecEngine } from './engine/pcec.js';
export { GeneMap } from './engine/gene-map.js';
export { EventBus, bus } from './engine/bus.js';
export { evaluate } from './engine/evaluate.js';
export { HelixProvider } from './engine/provider.js';
export { getDexPreset, DEX_PRESETS } from './engine/dex-presets.js';
export { registerShutdownHandler } from './engine/lifecycle.js';
