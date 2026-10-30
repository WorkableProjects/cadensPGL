// Loads the vendored PapaParse into globalThis.Papa for Node tests,
// mirroring the <script src="vendor/papaparse.min.js"> tag in the browser.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.Papa = require('../vendor/papaparse.min.js');
