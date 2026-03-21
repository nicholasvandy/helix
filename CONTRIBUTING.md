# Contributing to Helix

## Setup

```bash
git clone https://github.com/adrianhihi/helix.git
cd helix
npm install
npm run build
npm run test
```

## Structure

```
packages/core/   — Main SDK (@helix-agent/core)
packages/api/    — MPP API service
packages/mcp/    — MCP server
dashboard/       — SSE real-time dashboard
examples/        — Usage examples
```

## Tests

```bash
npm run test              # all tests
npm run test -- --watch   # watch mode
```

## Adding a Platform

1. Create `packages/core/src/platforms/{name}/perceive.ts` and `strategies.ts`
2. Register in `packages/core/src/platforms/index.ts`
3. Add tests in `packages/core/tests/perceive-{name}.test.ts`

## Adding a Strategy

1. Add to `packages/core/src/engine/provider.ts`
2. Add Zod schema in `strategy-schemas.ts`
3. Add seed gene in `seed-genes.ts` if common
4. Add tests

## Pull Requests

- Branch from `main`
- Include tests
- One feature per PR
