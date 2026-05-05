/**
 * Runtime module — ForgeClient and ForgeSession.
 *
 * Wraps @github/copilot-sdk's CopilotClient and CopilotSession with Forge
 * instrumentation (bridge event wiring, hook composition, session tracking).
 *
 * @module
 */

export { ForgeClient, type ForgeClientOptions, type SDKClient } from "./client.js";
export { ForgeSession, type ForgeSessionConfig, type SDKSession } from "./session.js";
