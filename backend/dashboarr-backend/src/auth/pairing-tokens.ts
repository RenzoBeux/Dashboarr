// Thin re-export so route files don't reach into the db layer directly.
// `createPairingToken` is intentionally not re-exported — pairing tokens are
// only minted via `ensureActiveToken` at startup, never on demand from a
// request handler. See routes/pair.ts for the security rationale.
export {
  ensureActiveToken,
  claimPairingToken,
  getActiveToken,
  purgeExpiredTokens,
} from "../db/repos/pairing.js";
