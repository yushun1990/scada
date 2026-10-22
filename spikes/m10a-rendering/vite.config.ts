import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react(), {
    name: 'spike-chunk-evidence',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(chunk => ({
        file: chunk.fileName,
        isEntry: chunk.isEntry,
        imports: chunk.imports,
        dynamicImports: chunk.dynamicImports,
        modules: Object.keys(chunk.modules).map(id => id.replaceAll(process.cwd(), '<spike>').replaceAll(resolve('../..'), '<repo>')).sort(),
      }))
      this.emitFile({ type: 'asset', fileName: 'chunk-evidence.json', source: JSON.stringify(chunks, null, 2) })
    },
  }],
  build: { manifest: true },
  server: { fs: { allow: [resolve('../..')] } },
})
