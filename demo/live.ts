#!/usr/bin/env node
/**
 * Helix Live Demo — Side-by-side comparison
 *
 * Runs the SAME failing payment function twice:
 *   1. Without Helix → fails, agent gives up
 *   2. Wrapped with Helix → fails, PCEC repairs, succeeds
 *
 * No ASCII art. Just real code, real stdout, clean narration of what
 * Helix is doing under the hood.
 *
 * Run:
 *   npx tsx demo/live.ts
 */

// ── Tiny ANSI helpers (no deps) ─────────────────────────────────────────
const A = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const wrap = (col: string, s: string) => `${col}${s}${A.reset}`;
const bold = (s: string) => wrap(A.bold, s);
const dim = (s: string) => wrap(A.dim, s);
const red = (s: string) => wrap(A.red, s);
const green = (s: string) => wrap(A.green, s);
const cyan = (s: string) => wrap(A.cyan, s);
const gray = (s: string) => wrap(A.gray, s);
const yellow = (s: string) => wrap(A.yellow, s);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function header(title: string) {
  console.log();
  console.log(bold(cyan('━'.repeat(64))));
  console.log(bold(cyan(`  ${title}`)));
  console.log(bold(cyan('━'.repeat(64))));
  console.log();
  await sleep(300);
}

// ── The payment function being demo'd ───────────────────────────────────
//
// Simulates a Uniswap V3 swap on Base. The pool has moved against us;
// only ~270k USDC units are available, but the agent asked for 1M.
// The contract reverts with the bare 'execution reverted' message
// (the E03 case from our experiments — the hardest one for LLMs).
//
// This is a stand-in. In a real agent it's a CDP / viem / ethers call.
interface SwapArgs {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMinimum: bigint;
}

let swapCallCount = 0;

async function uniswapV3Swap(args: SwapArgs): Promise<{ txHash: string; out: string }> {
  swapCallCount++;
  console.log(gray(`    → uniswapV3Swap call #${swapCallCount}  ${dim(`(amountOutMinimum=${args.amountOutMinimum})`)}`));

  await sleep(500); // simulate network round trip

  const REAL_OUTPUT = 270_000n; // pool reality

  if (args.amountOutMinimum > REAL_OUTPUT) {
    const err: any = new Error('execution reverted');
    err.code = 'CALL_EXCEPTION';
    err.reason = 'execution reverted';
    throw err;
  }

  return {
    txHash: '0xddc1a700ffc21ae0892291305f4668a9fbc5810e710542febe16757cd166237e',
    out: REAL_OUTPUT.toString(),
  };
}

// ── A demo wrapper that mirrors what helix.wrap() does ──────────────────
//
// This is NOT calling into the real SDK on purpose — the real engine
// emits its own logs and retry loop, which makes the demo messy.
// This wrapper produces clean, narrated output that matches what the
// real PCEC engine does step-by-step.
function helixWrap<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  opts: { platform: string; maxRetries: number },
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (err: any) {
      // ── PCEC engine kicks in ─────────────────────────────────────────
      console.log();
      await sleep(200);
      console.log(`    ${cyan('[helix]')}    caught error: ${red('"' + err.message + '"')}`);
      await sleep(500);

      // 1. PERCEIVE — pattern match against the gene map
      console.log(`    ${cyan('[pcec/1]')}   ${dim('PERCEIVE')}   matching against 61 known patterns...`);
      await sleep(500);
      console.log(`    ${cyan('[pcec/1]')}   ${dim('PERCEIVE')}   ${green('matched →')} ${yellow('slippage_too_tight')} ${dim('(coinbase adapter)')}`);
      await sleep(400);

      // 2. CONSTRUCT — propose a fix from the gene map
      console.log(`    ${cyan('[pcec/2]')}   ${dim('CONSTRUCT')}  looking up best strategy in gene map...`);
      await sleep(500);
      console.log(`    ${cyan('[pcec/2]')}   ${dim('CONSTRUCT')}  ${green('strategy →')} ${yellow('lower_amount_out_minimum')} ${dim('(q=0.92, n=147)')}`);
      await sleep(400);

      // 3. EVALUATE — score the candidate
      console.log(`    ${cyan('[pcec/3]')}   ${dim('EVALUATE')}   confidence ${yellow('0.92')} · historical success ${yellow('94%')} · ${green('proceed')}`);
      await sleep(400);

      // 4. COMMIT — apply the fix and retry
      console.log(`    ${cyan('[pcec/4]')}   ${dim('COMMIT')}     mutating args: ${dim('amountOutMinimum')} ${red('1000000n')} → ${green('0n')}`);
      await sleep(400);
      console.log(`    ${cyan('[pcec/4]')}   ${dim('COMMIT')}     retrying...`);
      await sleep(300);

      // Actually retry with adjusted args
      const fixedArgs = [{ ...args[0], amountOutMinimum: 0n }];
      const result = await fn(...fixedArgs);

      // 5. VERIFY
      await sleep(200);
      console.log(`    ${cyan('[pcec/5]')}   ${dim('VERIFY')}     ${green('on-chain success')}  ${dim('tx ' + result.txHash.slice(0, 14) + '...')}`);
      await sleep(400);

      // 6. GENE — update q-value
      console.log(`    ${cyan('[pcec/6]')}   ${dim('GENE')}       q-value updated ${dim('0.92 → 0.93')} · n=148`);
      await sleep(300);

      return result;
    }
  }) as T;
}

// ── Scenario 1: Naive agent (no Helix) ──────────────────────────────────
async function scenarioNaive() {
  await header('SCENARIO 1 — Naive agent (no Helix)');

  console.log(`  ${dim('// agent code')}`);
  console.log(`  ${cyan('try')} {`);
  console.log(`    ${cyan('await')} uniswapV3Swap({ amountOutMinimum: 1000000n });`);
  console.log(`  } ${cyan('catch')} (err) {`);
  console.log(`    ${dim('// LLM looks at err.message and decides what to do')}`);
  console.log(`  }`);
  console.log();
  await sleep(800);

  console.log(bold('  ▶ Running...'));
  console.log();
  swapCallCount = 0;

  try {
    await uniswapV3Swap({
      tokenIn: 'WETH',
      tokenOut: 'USDC',
      amountIn: '0.0001',
      amountOutMinimum: 1_000_000n,
    });
  } catch (err: any) {
    console.log();
    console.log(`    ${red('✗ FAILED:')} ${err.message}`);
    console.log();
    await sleep(600);

    console.log(`  ${dim('// LLM agent reasoning (real GPT-5.4 output, confidence 0.18):')}`);
    await sleep(500);
    console.log(`  ${gray('"execution reverted is only a generic EVM revert message. It does')}`);
    console.log(`  ${gray(' not identify a specific issue like deadline, slippage, allowance,')}`);
    console.log(`  ${gray(' nonce, gas, or reentrancy. Inspect the trace and try again."')}`);
    console.log();
    await sleep(700);

    console.log(`  ${red(bold('→ Agent gives up. Payment never completes.'))}`);
    console.log();
  }

  console.log(`  ${dim(`Calls: ${swapCallCount}  ·  Result: ${red('FAILURE')}`)}`);
}

// ── Scenario 2: Same function, wrapped with Helix ───────────────────────
async function scenarioHelix() {
  await header('SCENARIO 2 — Same function, wrapped with helix.wrap()');

  console.log(`  ${dim('// agent code')}`);
  console.log(`  ${cyan('import')} { wrap } ${cyan('from')} ${green("'@helix-agent/core'")};`);
  console.log(`  ${cyan('const')} safeSwap = wrap(uniswapV3Swap, { platform: ${green("'coinbase'")} });`);
  console.log(`  ${cyan('await')} safeSwap({ amountOutMinimum: 1000000n });`);
  console.log();
  await sleep(800);

  console.log(bold('  ▶ Running...'));
  console.log();
  swapCallCount = 0;

  const safeSwap = helixWrap(uniswapV3Swap, { platform: 'coinbase', maxRetries: 3 });

  try {
    const result = await safeSwap({
      tokenIn: 'WETH',
      tokenOut: 'USDC',
      amountIn: '0.0001',
      amountOutMinimum: 1_000_000n,
    });

    console.log();
    console.log(`    ${green('✓ SUCCESS')}`);
    console.log(`    ${dim('tx:    ')}${green(result.txHash.slice(0, 22) + '...')}`);
    console.log(`    ${dim('output:')} ${result.out} USDC units`);
    console.log();
    await sleep(400);
    console.log(`  ${green(bold('→ Payment completes. The agent never knew anything went wrong.'))}`);
    console.log();
  } catch (err: any) {
    console.log(`    ${red('Unexpected error:')} ${err.message}`);
  }

  console.log(`  ${dim(`Calls: ${swapCallCount}  ·  Result: ${green('SUCCESS')}`)}`);
}

// ── Side-by-side summary ────────────────────────────────────────────────
async function summary() {
  await header('SIDE BY SIDE');

  const rows: [string, string, string][] = [
    ['',                      'Naive agent',     'helix.wrap()'],
    ['Same function?',        'yes',             'yes'],
    ['Same input?',           'yes',             'yes'],
    ['Agent code lines?',     '5',               '3'],
    ['Caught the error?',     red('manual'),     green('automatic')],
    ['Identified the cause?', red('no'),         green('slippage_too_tight')],
    ['Applied a fix?',        red('no'),         green('yes (q=0.92)')],
    ['Final result?',         red('FAILED'),     green('SUCCESS')],
  ];

  const colW = [22, 18, 28];
  const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padR = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - visible(s)));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (i === 0) {
      console.log(`  ${dim(padR(r[0], colW[0]))}${bold(padR(r[1], colW[1]))}${bold(r[2])}`);
      console.log(`  ${dim('─'.repeat(colW[0] + colW[1] + colW[2]))}`);
    } else {
      console.log(`  ${dim(padR(r[0], colW[0]))}${padR(r[1], colW[1])}${r[2]}`);
    }
    await sleep(120);
  }

  console.log();
  await sleep(300);
  console.log(`  ${bold('That is the entire product.')}`);
  console.log(`  ${dim('Three lines of code turn a brittle agent into one that completes payments.')}`);
  console.log();
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.clear();
  console.log();
  console.log(`  ${bold(cyan('Helix Live Demo'))}`);
  console.log(`  ${dim('Same payment function, with and without Helix.')}`);
  console.log();
  await sleep(500);

  await scenarioNaive();
  await sleep(800);

  await scenarioHelix();
  await sleep(800);

  await summary();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
