import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

await build({
  entryPoints: ['scripts/evalIntelligence.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'scripts/.evalIntelligence.mjs',
  logLevel: 'warning',
});
await import(pathToFileURL('scripts/.evalIntelligence.mjs').href);
