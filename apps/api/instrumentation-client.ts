import { initializeAnalytics } from "@ai-cfo/analytics/instrumentation-client";
import { initializeSentry } from "@ai-cfo/observability/client";

initializeSentry();
initializeAnalytics();

export { onRouterTransitionStart } from "@ai-cfo/observability/client";
