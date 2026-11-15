import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  // Bundle the workspace package; real dependencies stay external.
  noExternal: ['@hangar/shared'],
  banner: { js: '#!/usr/bin/env node' },
})
