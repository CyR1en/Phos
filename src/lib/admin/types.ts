export interface SiteConfig {
  site: {
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
    hero: {
      heading: string
      subheading: string
      cta1: string
      cta2: string
      slideshow_interval: number
      overlay_opacity: number
    }
    services: {
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
    testimonials: {
      heading: string
      testimonials: Array<{ quote: string; author: string; role: string }>
    }
    cta: {
      heading: string
      body: string
      button: string
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
