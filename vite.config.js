import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so the build works on GitHub Pages
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  }
});
