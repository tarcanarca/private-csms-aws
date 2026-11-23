import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// Tests run against TypeScript sources directly (no build step needed).
const alias = {
  '@csms/contracts': src('./packages/contracts/src/index.ts'),
  '@csms/domain-stations': src('./packages/domain/stations/src/index.ts'),
  '@csms/observability': src('./packages/observability/src/index.ts'),
  '@csms/ocpp-1.6': src('./packages/ocpp-1.6/src/index.ts'),
  '@csms/persistence': src('./packages/persistence/src/index.ts'),
  '@csms/charging-control': src('./apps/charging-control/src/index.ts'),
  '@csms/ocpp-gateway': src('./apps/ocpp-gateway/src/index.ts'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts', 'tests/protocol/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts', 'tests/reliability/**/*.test.ts'],
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
