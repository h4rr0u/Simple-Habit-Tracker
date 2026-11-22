import packageJson from "../../package.json";

/**
 * Single source of truth for the version shown in the UI. `package.json` is the
 * only place where the release number is written; everything else reads it from
 * here so a release bump is a one-line change.
 */
export const APP_VERSION: string = packageJson.version;

/** `1.1.0` → `v1.1.0`, for labels that need the tag prefix. */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
