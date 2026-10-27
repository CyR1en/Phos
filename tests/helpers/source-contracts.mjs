// Shared source guards also have negative fixtures in smoke-helpers.test.mjs.
export function moduleSpecifiers(source) {
  return [...source.matchAll(/\b(?:import|export)\s*(?:[^;'"()]*?\bfrom\s*)?['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g)]
    .map(([, direct, dynamic]) => direct ?? dynamic)
}

export const rawConfigImports = source => moduleSpecifiers(source).filter(specifier =>
  /(?:^|\/)(?:content|generated)\/site-config\.json(?:[?#].*)?$/.test(specifier) || /^@lib\/config(?:\.[cm]?[jt]s)?(?:[?#].*)?$/.test(specifier))

export const pluginManifestImports = source => moduleSpecifiers(source).filter(specifier =>
  /(?:^|\/)generated\/plugins(?:\.[cm]?[jt]s)?(?:[?#].*)?$/.test(specifier))

// The timeout exemption belongs to the JS root compound, never its descendants.
export const hasRevealRootGate = selector => /(?:^|[\s(>+~,])(?:html)?\.js:not\(\s*\.reveal-timeout\s*\)(?![\w-])/.test(selector)
