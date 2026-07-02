/**
 * autoFillBrowser.js — backward-compatibility shim
 *
 * All logic has moved to src/core/autoFill/index.js.
 * This file re-exports the same API so existing callers continue to work.
 */
export { autoFillApplication } from './autoFill/index.js';
