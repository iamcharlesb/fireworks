/** Best-effort output redaction, not an execution sandbox or a secret manager. */
const secretName = /(?:api[_-]?key|secret|token|password|passwd|credential|private[_-]?key|access[_-]?key|authorization|cookie|mongodb_uri|database_url)/i;

export function redactSecrets(value: string): string {
  let result = value;
  // Exact configured credentials catch opaque keys and provider-specific formats.
  const configured = Object.entries(process.env)
    .filter(([name, text]) => secretName.test(name) && text && text.length >= 8)
    .map(([, text]) => text!)
    .sort((a, b) => b.length - a.length);
  for (const secret of configured) {
    result = result.split(secret).join("[REDACTED]");
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret) result = result.split(encoded).join("[REDACTED]");
  }
  return result
    .replace(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(?:sk-(?:proj-|ant-)?|xai-|gh[pousr]_)[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}=*/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/((?:["']?)(?:[\w-]*(?:password|passwd|secret|token|api[_-]?key|authorization|cookie))["']?\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;\r\n}]+)/gi,
      (_match, prefix: string, raw: string) => prefix + (raw.startsWith('"') ? '"[REDACTED]"' : raw.startsWith("'") ? "'[REDACTED]'" : "[REDACTED]"));
}

/** Sanitize structured events without changing their shape or mutating live state. */
export function redactSecretValues<T>(value: T): T {
  if (typeof value === "string") return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map(item => redactSecretValues(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      secretName.test(key) && typeof item === "string" ? "[REDACTED]" : redactSecretValues(item)
    ])) as T;
  }
  return value;
}
