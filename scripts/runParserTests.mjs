import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const outfile = 'scripts/.parserAssert.mjs';

await build({
  entryPoints: ['scripts/parserAssert.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'warning',
});

await import(pathToFileURL(outfile).href);
