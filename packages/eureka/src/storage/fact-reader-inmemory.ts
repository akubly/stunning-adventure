/**
 * Substrate re-export shim for `InMemoryFactReader`.
 *
 * The integrate-activity contract test (`integrate.contract.test.ts`) imports
 * from this path; the actual implementation lives in `./fact-reader.ts`
 * alongside the rest of the in-memory storage shims. This file is a one-line
 * re-export so the activity test's import paths remain stable.
 *
 * If a future refactor moves the implementation, update only this file —
 * not the activity test.
 */
export { InMemoryFactReader } from './fact-reader.js';
