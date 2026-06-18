// Global type augmentations — no top-level imports so this stays a
// global declaration file (top-level imports would make it a module,
// hiding these augmentations from the rest of the codebase).

interface Window {
  HSStaticMethods?: { autoInit: () => void }
  __updateLightboxData?: (data: unknown[]) => void
  __lenis?: import('lenis').Lenis
}
