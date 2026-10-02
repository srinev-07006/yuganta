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
import path from 'node:path';
import { buildManifest } from './tools/buildManifest.js';

// Virtual module `virtual:yuganta-manifest`: index of public/data (parvas, nodes, dialogue
// files, map files). Derived at dev/build time — nobody edits an index by hand.
function yugantaManifest() {
    const ID = 'virtual:yuganta-manifest', RESOLVED = '\0' + ID;
    const dataDir = path.resolve(process.cwd(), 'public/data');
    return {
        name: 'yuganta-manifest',
        resolveId(id) { return id === ID ? RESOLVED : null; },
        load(id) {
            if (id !== RESOLVED) return null;
            // (no addWatchFile on a directory: Vite dev tries to import it as a module and errors;
            //  configureServer below already watches dataDir and triggers a full reload)
            return `export default ${JSON.stringify(buildManifest(dataDir))};`;
        },
        configureServer(server) {
            // Data edits (Role 3/4) → reload the page with a fresh manifest
            server.watcher.add(dataDir);
            server.watcher.on('all', (_e, file) => {
                if (file.startsWith(dataDir)) {
                    const mod = server.moduleGraph.getModuleById(RESOLVED);
                    if (mod) server.moduleGraph.invalidateModule(mod);
                    server.ws.send({ type: 'full-reload' });
                }
            });
        }
    };
}

export default defineConfig({

    plugins: [yugantaManifest()],

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