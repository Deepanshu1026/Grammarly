import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const buildTarget = process.env.BUILD_TARGET;

export default defineConfig({
    plugins: [react()],
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    build: {
        outDir: 'dist',
        emptyOutDir: buildTarget === undefined,
        rollupOptions: buildTarget === 'content'
            ? {
                input: resolve(__dirname, 'src/content/index.tsx'),
                output: {
                    format: 'iife',
                    entryFileNames: 'assets/content.js',
                    inlineDynamicImports: true,
                    assetFileNames: 'assets/[name].[ext]',
                },
            }
            : buildTarget === 'background'
                ? {
                    input: resolve(__dirname, 'src/background/index.ts'),
                    output: {
                        format: 'iife',
                        entryFileNames: 'assets/background.js',
                        inlineDynamicImports: true,
                    },
                }
                : {
                    // Popup build - normal ESM mode
                    input: {
                        popup: resolve(__dirname, 'src/popup/index.html'),
                    },
                    output: {
                        entryFileNames: 'assets/[name].js',
                        chunkFileNames: 'assets/[name].[hash].js',
                        assetFileNames: 'assets/[name].[ext]',
                    },
                },
    },
});
