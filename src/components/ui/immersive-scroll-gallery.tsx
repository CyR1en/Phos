'use client'

import * as React from 'react'
import { useRef } from 'react'
import { motion, useScroll, useTransform, useInView, useMotionValueEvent } from 'framer-motion'
import type { JSX } from 'preact'
import type { PhotoPosition } from '@lib/admin/types'

// Types
interface iImmersiveScrollGalleryProps {
  mobilePhotos?: string[]
  mobilePositions?: PhotoPosition[] | null
  desktopPhotos?: string[]
  desktopPositions?: PhotoPosition[] | null
  text?: string
  className?: string
}

function useMediaQuery(query: string): boolean {
  // Keep the server and first client render identical; browser reads belong in effects.
  const [matches, setMatches] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const handler = () => setMatches(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

interface ProgressiveImageProps {
  src: string
  thumb: string
  className: string
  style: JSX.CSSProperties
  shouldLoadFull: boolean
}

function ProgressiveImage({ src, thumb, className, style, shouldLoadFull }: ProgressiveImageProps) {
  const [decodedSrc, setDecodedSrc] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!shouldLoadFull) return
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.src = src
    // Keep the thumbnail visible until its replacement is ready to paint.
    image.decode().then(() => {
      if (!cancelled) setDecodedSrc(src)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [src, shouldLoadFull])

  return (
    <img
      src={decodedSrc === src ? src : thumb}
      alt=""
      aria-hidden="true"
      className={`${className} absolute inset-0`}
      style={style}
      loading="lazy"
      decoding="async"
    />
  )
}

function photoPath(src: string, variant: 'thumbs' | 'immersive' | 'immersive-mobile') {
  return `/photos/${variant}/${src.replace(/\.[^.]+$/, '.webp')}`
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

const IMAGE_STYLES = [
  'w-[44vw] h-[22vh] top-[-28vh] left-[-22vw] z-20 md:w-[30vw] md:h-[22.5vh] md:top-[4vh] md:-left-[1.5vw] md:z-30',      // 0: upper-left
  'w-[40vw] h-[20vh] top-[-16vh] left-[20vw] z-10 md:w-[42vw] md:h-[27vh] md:-top-[23vh] md:left-[5vw] md:z-20',          // 1: upper-right
  'w-[46vw] h-[24vh] top-[-6vh] left-[-26vw] z-30 md:w-[24vw] md:h-[49.5vh] md:-top-[9.5vh] md:-left-[32vw] md:z-10',    // 2: mid-left
  'w-[42vw] h-[22vh] top-[6vh] left-[22vw] z-20 md:w-[30vw] md:h-[22.5vh] md:top-[4vh] md:left-[32vw] md:z-30',         // 3: center-right
  'w-[44vw] h-[22vh] top-[16vh] left-[-20vw] z-10 md:w-[24vw] md:h-[27vh] md:top-[31vh] md:left-[5vw] md:z-20',           // 4: lower-left
  'w-[40vw] h-[20vh] top-[28vh] left-[18vw] z-30 md:w-[36vw] md:h-[22.5vh] md:top-[28.75vh] md:-left-[29vw] md:z-10',    // 5: bottom-right
  'hidden md:block md:w-[18vw] md:h-[13.5vh] md:top-[24.25vh] md:left-[29vw] md:z-40',     // 6: tiny center accent
]

interface AnimatedGalleryProps {
  photos: string[]
  positions: PhotoPosition[] | null
  isDesktop: boolean
  text: string
  className: string
}

function AnimatedGallery({ photos, positions, isDesktop, text, className }: AnimatedGalleryProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const photoKey = photos.join('|')
  const [imageVariant, setImageVariant] = React.useState<'immersive' | 'immersive-mobile'>('immersive-mobile')
  const [shouldLoadFullImages, setShouldLoadFullImages] = React.useState(false)

  React.useEffect(() => {
    setImageVariant(
      typeof window !== 'undefined' && isDesktop && window.devicePixelRatio > 1.5
        ? 'immersive'
        : 'immersive-mobile'
    )
  }, [isDesktop])

  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start start', 'end end'],
  })

  // Stop enlarging composited surfaces once the final photograph has faded.
  const imageProgress = useTransform(scrollYProgress, [0, 0.95], [0, 0.95])
  // All former slot targets (4/5/6/8/9) share the same 2.5x cap.
  const scaleImage = useTransform(imageProgress, (p) => Math.pow(2.5, clamp01((p - 0.1) / 0.9)))
  const opacityImage = useTransform(scrollYProgress, [0.75, 0.85], [1, 0])
  const opacityLastImage = useTransform(scrollYProgress, [0.85, 0.95], [1, 0])
  const opacitySection2 = useTransform(scrollYProgress, [0.75, 0.95], [0, 1])
  const scaleSection2 = useTransform(scrollYProgress, (progress) => {
    const p = clamp01((progress - 0.75) / 0.2)
    const easeOutExpo = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
    return 0.94 + 0.06 * easeOutExpo
  })

  const pictures = React.useMemo(() => photos.map((src, index) => {
    const pos = positions?.[index]
    const fallbackClassName = IMAGE_STYLES[index % IMAGE_STYLES.length]
    const mobileMatch = fallbackClassName.match(/(?:^|\s)z-(\d+)/)
    const desktopMatch = fallbackClassName.match(/md:z-(\d+)/)
    const fallbackZIndex = isDesktop
      ? (desktopMatch ? Number(desktopMatch[1]) : (mobileMatch ? Number(mobileMatch[1]) : undefined))
      : (mobileMatch ? Number(mobileMatch[1]) : undefined)
    const hiddenOnMobile = !isDesktop && (pos
      ? pos.w === 0 && pos.h === 0
      : fallbackClassName.split(' ').includes('hidden'))

    return {
      src: photoPath(src, imageVariant),
      thumb: photoPath(src, 'thumbs'),
      index,
      pos,
      fallbackClassName,
      zIndex: pos?.z ?? fallbackZIndex,
      hiddenOnMobile,
    }
  }).filter(({ hiddenOnMobile }) => !hiddenOnMobile), [photos, positions, isDesktop, imageVariant])
  // The last tile in the highest stacking layer stays through the text handoff.
  const lastImageIndex = pictures.reduce((lastIndex, picture, index) => (
    lastIndex === -1 || (picture.zIndex ?? 0) >= (pictures[lastIndex].zIndex ?? 0) ? index : lastIndex
  ), -1)

  const inView = useInView(stickyRef, { amount: 'some', once: false })
  const [imagesVisible, setImagesVisible] = React.useState(true)
  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    setImagesVisible(progress < 0.95)
  })

  React.useEffect(() => {
    setShouldLoadFullImages(false)
  }, [isDesktop, photoKey, imageVariant])

  React.useEffect(() => {
    const el = container.current
    if (!el || shouldLoadFullImages) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadFullImages(true)
          observer.disconnect()
        }
      },
      { rootMargin: '50% 0px', threshold: 0 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [isDesktop, photoKey, imageVariant, shouldLoadFullImages])

  return (
    <div ref={container} className={`absolute inset-0 ${className}`}>
      <div ref={stickyRef} className="sticky top-0 h-[100vh] overflow-hidden">
        {/* Zooming images keep the admin's viewport-relative positions and crops. */}
        <div
          className="absolute inset-0 origin-center scale-[0.9] translate-y-[2.5vh] pointer-events-none"
          style={{ visibility: imagesVisible ? 'visible' : 'hidden' }}
        >
          {pictures.map(({ src, thumb, index, pos, fallbackClassName, zIndex }, pictureIndex) => {
            const br = pos && typeof pos.br === 'number' ? pos.br : null
            const wrapperClassName = pos ? 'relative overflow-hidden' : `relative overflow-hidden ${fallbackClassName}`
            const wrapperStyle: JSX.CSSProperties = pos ? {
              width: `${pos.w}vw`,
              height: `${pos.h}vh`,
              top: `${pos.y}vh`,
              left: `${pos.x}vw`,
              zIndex,
            } : {}
            if (br !== null) wrapperStyle.borderRadius = `${br}px`

            const imgStyle: JSX.CSSProperties = {
              transform: `scale(${pos?.cropZoom ?? 1})`,
              transformOrigin: 'center',
              objectPosition: `${pos?.cropX ?? 50}% ${pos?.cropY ?? 50}%`,
            }

            return (
              <motion.div
                key={`${src}-${index}`}
                style={{
                  scale: scaleImage,
                  opacity: pictureIndex === lastImageIndex ? opacityLastImage : opacityImage,
                  zIndex,
                  willChange: inView && imagesVisible ? 'transform' : 'auto',
                }}
                className="absolute flex items-center justify-center w-full h-full top-0 pointer-events-none"
              >
                {(
                  <div
                    className={br !== null ? wrapperClassName : `${wrapperClassName} rounded-photo`}
                    style={wrapperStyle}
                  >
                    <ProgressiveImage
                      src={src}
                      thumb={thumb}
                      className="object-cover w-full h-full"
                      style={imgStyle}
                      shouldLoadFull={shouldLoadFullImages}
                    />
                  </div>
                ) as any}
              </motion.div>
            ) as any
          })}
        </div>

        {/* Content section */}
        {text && (
          <motion.div
            style={{
              opacity: opacitySection2,
              scale: scaleSection2,
              willChange: inView ? 'transform, opacity' : 'auto',
            }}
            className="w-full h-full flex items-center justify-center max-w-3xl mx-auto p-8 relative translate-y-[4vh] pointer-events-none"
          >
            {(
              <h2
                className="text-ink text-2xl md:text-4xl font-normal py-4 font-display text-center"
                style={{ lineHeight: 1.5 }}
                data-config="home.immersiveGallery.text"
              >
                {text}
              </h2>
            ) as any}
          </motion.div>
        )}
      </div>
    </div>
  ) as any
}

export default function ImmersiveScrollGallery({
  mobilePhotos = [],
  mobilePositions = null,
  desktopPhotos = [],
  desktopPositions = null,
  text = '',
  className = '',
}: iImmersiveScrollGalleryProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const photos = isDesktop ? desktopPhotos : mobilePhotos
  const positions = isDesktop ? desktopPositions : mobilePositions

  if (reducedMotion) {
    return (
      <div className={`mx-auto max-w-6xl px-6 py-12 ${className}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-start gap-4">
          {photos.map((src, index) => (
            <img
              key={`${src}-${index}`}
              src={photoPath(src, 'thumbs')}
              alt=""
              aria-hidden="true"
              className="block w-full h-auto"
              loading="lazy"
              decoding="async"
            />
          ))}
        </div>
        {text && (
          <h2
            className="max-w-3xl mx-auto text-ink text-2xl md:text-4xl font-normal py-8 font-display text-center"
            style={{ lineHeight: 1.5 }}
            data-config="home.immersiveGallery.text"
          >
            {text}
          </h2>
        )}
      </div>
    )
  }

  return <AnimatedGallery photos={photos} positions={positions} isDesktop={isDesktop} text={text} className={className} />
}
