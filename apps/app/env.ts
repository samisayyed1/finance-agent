import { keys as analytics } from "@ai-cfo/analytics/keys";
import { keys as auth } from "@ai-cfo/auth/keys";
import { keys as collaboration } from "@ai-cfo/collaboration/keys";
import { keys as database } from "@ai-cfo/database/keys";
import { keys as email } from "@ai-cfo/email/keys";
import { keys as flags } from "@ai-cfo/feature-flags/keys";
import { keys as core } from "@ai-cfo/next-config/keys";
import { keys as observability } from "@ai-cfo/observability/keys";
import { keys as security } from "@ai-cfo/security/keys";
import { keys as webhooks } from "@ai-cfo/webhooks/keys";
import { createEnv } from "@t3-oss/env-nextjs";

export const env = createEnv({
  extends: [
    auth(),
    analytics(),
    collaboration(),
    core(),
    database(),
    email(),
    flags(),
    observability(),
    security(),
    webhooks(),
  ],
  server: {},
  client: {},
  runtimeEnv: {},
});
