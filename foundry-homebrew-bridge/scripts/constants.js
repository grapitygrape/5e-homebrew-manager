/**
 * Module-wide constants. Setting keys live here so `settings.js`, `bridge.js`,
 * and `status.js` can't drift apart on a typo.
 */

const CONSTANTS = {
  MODULE_ID: 'foundry-homebrew-bridge',

  SETTINGS: {
    /** Manager base URL(s), comma-separated. See lib/connection.js. */
    MANAGER_URL: 'manager-url',
    /** Optional shared token (`HBM_BRIDGE_TOKEN`) when connecting to a protected remote manager. */
    BRIDGE_TOKEN: 'bridge-token',
    /** Connect automatically once the world is ready. */
    AUTO_CONNECT: 'auto-connect',
    /** Allow fuzzy name matching when nothing matches exactly. */
    FUZZY: 'fuzzy-enabled',
    /** 0–1. Below this similarity a fuzzy match is discarded. */
    FUZZY_THRESHOLD: 'fuzzy-threshold',
    /** Comma-separated pack ids / prefixes to skip (empty = search everything). */
    EXCLUDE_PACKS: 'exclude-packs',
    /** Include the world's own Items directory alongside compendiums. */
    INCLUDE_WORLD: 'include-world',
    /** Cap on matches returned per homebrew entry. */
    MAX_MATCHES: 'max-matches',
    /** Chat-log the outcome of each check request. */
    VERBOSE: 'verbose',
    /** The manager's replacement rules, as JSON. Read by every client. */
    RULES: 'replacement-rules',
    /** Swap a superseded item for its replacement when it's added to an actor. */
    ENFORCE: 'enforce-imports',
    /** Show players a banner on a replaced item's sheet. */
    BANNER: 'replaced-banner',
  },

  /** Give up on one check request after this long. */
  QUERY_TIMEOUT_MS: 60000,
};

export default CONSTANTS;
