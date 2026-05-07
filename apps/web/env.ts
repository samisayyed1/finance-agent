import { keys as cms } from "@ai-cfo/cms/keys";
import { keys as email } from "@ai-cfo/email/keys";
import { keys as flags } from "@ai-cfo/feature-flags/keys";
import { keys as core } from "@ai-cfo/next-config/keys";
import { keys as observability } from "@ai-cfo/observability/keys";
import { keys as rateLimit } from "@ai-cfo/rate-limit/keys";
import { keys as security } from "@ai-cfo/security/keys";
import { createEnv } from "@t3-oss/env-nextjs";

export const env = createEnv({
  extends: [
    cms(),
    core(),
    email(),
    observability(),
    flags(),
    security(),
    rateLimit(),
  ],
  server: {},
  client: {},
  runtimeEnv: {},
});
