import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { build } from 'vite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const extensionVersion = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
).version as string;

function chromeExtensionPlugin() {
  return {
    name: 'chrome-extension',
    async closeBundle() {
      const distDir = resolve(__dirname, 'dist');

      // Build content script separately as IIFE
      await build({
        configFile: resolve(__dirname, 'vite.content.config.ts'),
      });

      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );

      // Create assets directory
      const assetsDir = resolve(distDir, 'assets');
      if (!existsSync(assetsDir)) {
        mkdirSync(assetsDir, { recursive: true });
      }

      // Copy icons
      [16, 48, 128].forEach((size) => {
        const src = resolve(__dirname, `assets/icon-${size}.png`);
        if (existsSync(src)) {
          copyFileSync(src, resolve(assetsDir, `icon-${size}.png`));
        }
      });

      console.log('Chrome extension files copied!');
    },
  };
}

export default defineConfig({
  root: 'src',
  define: {
    __APP_VERSION__: JSON.stringify(extensionVersion),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        'popup/index': resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  plugins: [chromeExtensionPlugin()],
});
