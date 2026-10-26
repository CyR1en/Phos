// Public config must not carry SMTP settings. Clone before deleting so callers
// can keep using the complete config for persistence, builds and mail delivery.
export function stripSecrets(config) {
  const clone = structuredClone(config)
  if (clone?.contact) delete clone.contact.smtp
  return clone
}

/** The exact bytes every writer of public/site-config.json must produce (tracked file: no churn). */
export function publicConfigJson(config) {
  return JSON.stringify(stripSecrets(config), null, 2) + '\n'
}
