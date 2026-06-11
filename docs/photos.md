# Adding Photos

Create a folder in your photos directory with a descriptive name (e.g. `wildlife/`, `wedding/`), drop images inside (jpg, png, webp, or avif), and rebuild or restart the container. The folder automatically becomes a gallery at `/photos/wildlife`.

## Metadata

For display names, descriptions, and per-photo captions, add a `_meta.yaml` file inside the folder:

```yaml
name: "Wildlife"
description: "Animals in their natural habitat"
cover: "lion.jpg"
order: 1
photos:
  lion.jpg:
    title: "Mountain Lion"
    description: "Captured in the Rockies"
    hero_priority: 2
```

## Hero Slideshow

Photos with `hero_priority > 0` appear in the hero slideshow. Higher values appear earlier. Use this sparingly — pick your strongest 5-10 images across all categories.

## Image Pipeline

- EXIF data is stripped from all served images
- WebP thumbnails (800×600) and mobile thumbnails (400px) are generated automatically
- 20px blur placeholders are generated for lazy loading
- Gallery layout is a responsive masonry grid with a full-screen lightbox viewer (swipe support on mobile)
