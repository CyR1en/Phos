import type { PositionConfig } from "@lib/admin/types"

/**
 * Hardcoded default positions for the ImmersiveScrollGallery, transcribed from
 * the original IMAGE_STYLES Tailwind classes. Used as a fallback when
 * `home.immersiveGallery.mobilePositions` / `desktopPositions` is null/absent
 * in config, and as the "Reset to default" target in the visual layout editor.
 *
 * Values are in vw/vh (viewport-relative) so they map 1:1 to the live layout
 * regardless of screen size. z is unitless stacking order.
 *
 * Index 6 (tiny center accent) is desktop-only — its mobile position is set to
 * off-screen (w:0,h:0) so it renders nothing on mobile, matching the original
 * `hidden md:block` behavior.
 */
export const DEFAULT_POSITIONS: PositionConfig[] = [
  {
    // 0: upper-left
    mobile: { x: -22, y: -28, w: 44, h: 22, z: 20 },
    desktop: { x: -1.5, y: 4, w: 30, h: 22.5, z: 30 },
  },
  {
    // 1: upper-right
    mobile: { x: 20, y: -16, w: 40, h: 20, z: 10 },
    desktop: { x: 5, y: -23, w: 42, h: 27, z: 20 },
  },
  {
    // 2: mid-left
    mobile: { x: -26, y: -6, w: 46, h: 24, z: 30 },
    desktop: { x: -32, y: -9.5, w: 24, h: 49.5, z: 10 },
  },
  {
    // 3: center-right
    mobile: { x: 22, y: 6, w: 42, h: 22, z: 20 },
    desktop: { x: 32, y: 4, w: 30, h: 22.5, z: 30 },
  },
  {
    // 4: lower-left
    mobile: { x: -20, y: 16, w: 44, h: 22, z: 10 },
    desktop: { x: 5, y: 31, w: 24, h: 27, z: 20 },
  },
  {
    // 5: bottom-right
    mobile: { x: 18, y: 28, w: 40, h: 20, z: 30 },
    desktop: { x: -29, y: 28.75, w: 36, h: 22.5, z: 10 },
  },
  {
    // 6: tiny center accent (desktop-only; mobile renders nothing)
    mobile: { x: 0, y: 0, w: 0, h: 0, z: 0 },
    desktop: { x: 29, y: 24.25, w: 18, h: 13.5, z: 40 },
  },
]