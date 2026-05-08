/**
 * Root authenticated route. Day-7 ships the operator-dashboard Today
 * page at both `/` and `/today` — they render identically, so we just
 * re-export from the canonical Today path.
 */
export { default, metadata } from "./today/page";
