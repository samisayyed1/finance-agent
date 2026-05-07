/**
 * OpenTelemetry tracer factory.
 *
 * Day-0: returns a no-op tracer when @opentelemetry/api is absent or
 * OTEL_EXPORTER_OTLP_ENDPOINT is unset. Real wiring (NodeSDK + OTLP exporter)
 * lands when we plumb agent-trace spans into our observability vendor.
 *
 * Consumers (e.g. packages/agent's PostToolUse hook) call
 * `getTracer("ai-cfo-agent").startActiveSpan(name, fn)` regardless of
 * whether the SDK is configured; no-op spans cost ~nothing.
 */

interface NoopSpan {
  end(): void;
  recordException(_e: Error): void;
  setAttribute(_k: string, _v: unknown): void;
  setStatus(_s: { code: number; message?: string }): void;
}

interface NoopTracer {
  startActiveSpan<T>(name: string, fn: (span: NoopSpan) => T): T;
}

const noopSpan: NoopSpan = {
  setAttribute() {
    /* no-op */
  },
  setStatus() {
    /* no-op */
  },
  recordException() {
    /* no-op */
  },
  end() {
    /* no-op */
  },
};

const noopTracer: NoopTracer = {
  startActiveSpan(_name, fn) {
    return fn(noopSpan);
  },
};

const realTracer: NoopTracer | null = null;

export const getTracer = (_name: string): NoopTracer => {
  if (realTracer) {
    return realTracer;
  }
  // Phase 5+: dynamic import @opentelemetry/api once OTLP endpoint is set.
  return noopTracer;
};
