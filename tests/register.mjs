// node --import ./tests/register.mjs <test>   → maps `import 'phaser'` to tests/stubs/phaser.js
import { register } from 'node:module';
register('./phaser-loader.mjs', import.meta.url);
