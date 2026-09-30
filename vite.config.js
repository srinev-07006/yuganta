// =============================================================
// vite.config.js
// =============================================================
// Vite is a build tool that:
//   1. Serves your files on localhost during development
//   2. Hot-reloads when you change code (no manual refresh)
//   3. Bundles everything into optimized files for production
//
// This config tells Vite how to handle our Phaser project.
// =============================================================

import { defineConfig } from 'vite';

export default defineConfig({

    // ----------------------------------------------------------
    // BASE PATH
    // ----------------------------------------------------------
    // Where the game will be hosted.
    // './' means "relative to the HTML file."
    // If you deploy to a subfolder like mysite.com/yuganta/,
    // change this to '/yuganta/'.
    // For local development, './' works perfectly.
    // ----------------------------------------------------------
    base: './',

    // ----------------------------------------------------------
    // DEV SERVER SETTINGS
    // ----------------------------------------------------------
    server: {
        // The port Vite's dev server runs on.
        // Open your browser to http://localhost:5173
        port: 5173,

        // Automatically open the browser when you run 'npm run dev'.
        // Set to false if you prefer opening it manually.
        open: true
    },

    // ----------------------------------------------------------
    // BUILD SETTINGS
    // ----------------------------------------------------------
    build: {
        // Where the production build goes.
        outDir: 'dist',

        // Generate source maps for debugging in production.
        // Useful for tracking down errors in the deployed version.
        sourcemap: true,

        // Phaser is a large library (~1.5 MB).
        // Vite warns about chunks over 500 KB by default.
        // We raise the limit since Phaser alone exceeds it.
        chunkSizeWarningLimit: 1600
    }
});