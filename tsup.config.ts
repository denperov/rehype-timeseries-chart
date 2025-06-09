import {defineConfig} from 'tsup'

export default defineConfig({
  entry: ['src/index.js'],
  clean: true, // clean up the dist folder
  dts: true, // generate dts files
  format: ['esm'], // generate esm files
  minify: true,
  skipNodeModulesBundle: true
})
