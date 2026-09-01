import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs allow the same build to run from a GitHub Pages
  // project subdirectory or from a plain local/static web server.
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
});
