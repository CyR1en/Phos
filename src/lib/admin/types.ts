export interface PhotoPosition {
  x: number   // vw, can be negative (off-screen left)
  y: number   // vh, can be negative (off-screen top)
  w: number   // vw, width
  h: number   // vh, height
  z: number   // unitless integer, stacking order
  br?: number // px, border-radius of the photo frame (0 = sharp corners)
  cropX?: number // object-position X % (0-100)
  cropY?: number // object-position Y % (0-100)
  cropZoom?: number // scale factor (>= 1)
}

export interface PositionConfig {
  mobile: PhotoPosition
  desktop: PhotoPosition
}

export interface SiteConfig {
  site: {
    theme: string
    page_description: string
    title: string
    description: string
    toggle_demo: boolean
    og: {
      image: string
      imageAlt: string
      imageWidth: number
      imageHeight: number
      locale: string
    }
    social: Array<{ platform: string; url: string }>
  }
  home: {
    page_description: string
    og_title: string
    og_description: string
    layout?: string[]
    hero: {
      heading: string
      subheading: string
      cta1: string
      cta2: string
      slideshow_interval: number
      overlay_opacity: number
      ken_burns?: boolean
      parallax?: boolean
      photos: string[]
    }
    services: {
      enabled: boolean
      heading: string
      subheading: string
    }
    showcase: {
      enabled: boolean
      heading: string
      items: Array<{
        type: 'category' | 'gallery'
        slug: string
        title: string
        description: string
      }>
    }
    selectedWork?: { enabled?: boolean; heading?: string; photos?: string[] }
    testimonials: {
      enabled: boolean
      heading: string
      testimonials: Array<{ quote: string; author: string; role: string }>
    }
    cta: {
      enabled: boolean
      heading: string
      body: string
      button: string
    }
    immersiveGallery?: {
      enabled: boolean
      text: string
      // Photos and positions are tracked per-device so mobile and desktop can
      // be curated independently. Positions are parallel to the matching
      // *Photos array; null = use hardcoded DEFAULT_POSITIONS.
      mobilePhotos: string[]
      mobilePositions?: PhotoPosition[] | null
      desktopPhotos: string[]
      desktopPositions?: PhotoPosition[] | null
    }
  }
  about: {
    page_description: string
    og_title: string
    og_description: string
    photographer: {
      name: string
      email: string
      intro: string
      bio: string
      photo: string
    }
    gear: {
      heading: string
      equipment: string[]
    }
    call_to_action: {
      heading: string
      link: string
    }
  }
  contact: {
    page_description: string
    og_title: string
    og_description: string
    format: {
      heading: string
      subheading: string
      submitBtn: string
    }
    smtp: {
      host: string
      port: number
      user: string
      pass: string
      fromEmail: string
      toEmail: string
    }
  }
  notFound: {
    page_description: string
    og_title: string
    og_description: string
    heading: string
    message: string
    button: string
  }
  portfolio: {
    page_description: string
    og_title: string
    og_description: string
  }
}

export interface CategoryData {
  slug: string
  photos: string[]
  meta: {
    name?: string
    description?: string
    cover?: string
    order?: number
    offer_service?: boolean
    photos?: Record<
      string,
      { title?: string; description?: string; hero_priority?: number }
    >
  }
}

export interface CategoriesResponse {
  categories: CategoryData[]
}

export interface PluginManifest {
  name: string
  entry: string
  slot: string | null
  admin: boolean
  config: Record<string, unknown>
}

export interface PluginsResponse {
  plugins: PluginManifest[]
}

export interface Gallery {
  id: number
  slug: string
  name: string
  description: string
  cover: string | null
  order_num: number
  created_at: number
  photo_count: number
  photos: GalleryPhoto[]
}

export interface GalleryPhoto {
  category: string
  filename: string
  position: number
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

// --- Build-time manifest types (for src/generated/*.json imports) ---

export interface ManifestPhoto {
  filename: string
  title: string
  titleIsAuto: boolean
  description: string
  focus: string | null
  full: string
  thumb: string
  thumbMobile: string
  hd: string
  /** Stage tiers the generator always emits (URLs resolve to the largest encoded tier). */
  immersive: string
  immersiveMobile: string
  srcset: string
  gridSrcset: string
  width: number | null
  height: number | null
  blur: string
  hero_priority: number
}

export interface ManifestCategory {
  slug: string
  name: string
  description: string
  cover: string
  coverThumbMobile: string
  coverSrcset: string
  coverWidth: number | null
  coverHeight: number | null
  coverBlur: string
  coverFocus: string | null
  order: number
  offer_service: boolean
  photoCount: number
  photos: ManifestPhoto[]
}

export interface HeroPriorityPhoto {
  full: string
  thumb: string
  thumbMobile: string
  hd: string
  srcset: string
  srcsetAvif: string
  heroSrc: string
  heroPortrait: {
    srcset: string
    srcsetAvif: string
  } | null
  ogImage: string
  title: string
  titleIsAuto: boolean
  description: string
  focus: string | null
  blur: string
  width: number | null
  height: number | null
  category: string
  categoryName: string
  hero_priority: number
}

export interface CategoriesManifest {
  categories: ManifestCategory[]
  heroPriority: HeroPriorityPhoto[]
}

export interface GalleriesManifest {
  galleries: ManifestGallery[]
}

export interface ManifestGallery {
  slug: string
  name: string
  description: string
  cover: string | null
  coverFull: string | null
  coverOg: string | null
  coverBlur: string
  coverFocus: string | null
  coverSrcset: string
  coverWidth: number | null
  coverHeight: number | null
  order: number
  photoCount: number
  photos: (ManifestPhoto & { category: string })[]
}
