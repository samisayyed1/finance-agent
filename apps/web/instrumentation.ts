import { initializeSentry } from "@ai-cfo/observability/instrumentation";

export const register = initializeSentry;
export { onRequestError } from "@ai-cfo/observability/instrumentation";
