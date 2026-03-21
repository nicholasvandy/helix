import type { GeneMap } from './gene-map.js';

let registered = false;

export function registerShutdownHandler(geneMap: GeneMap): void {
  if (registered) return;
  registered = true;

  const shutdown = (signal: string) => {
    console.error(`[helix] ${signal} received, flushing Gene Map...`);
    try {
      geneMap.close();
      console.error('[helix] Gene Map flushed and closed.');
    } catch {
      // already closed
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
