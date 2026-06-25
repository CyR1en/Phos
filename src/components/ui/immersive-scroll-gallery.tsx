"use client";

import * as React from "react";
import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring, useMotionValue, useInView } from "framer-motion";
import { cn } from "@lib/utils";
import type { PhotoPosition } from "@lib/admin/types";

// Types
interface iImmersiveScrollGalleryProps {
	mobilePhotos?: string[];
	mobilePositions?: PhotoPosition[] | null;
	desktopPhotos?: string[];
	desktopPositions?: PhotoPosition[] | null;
	text?: string;
	className?: string;
}

// Responsive hook — inline styles can't use Tailwind's md: media queries, so we
// switch between mobile/desktop positions at the JS level. Re-renders on 768px cross.
function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = React.useState(() =>
		typeof window !== "undefined" ? window.matchMedia(query).matches : false
	);
	React.useEffect(() => {
		const mql = window.matchMedia(query);
		const handler = () => setMatches(mql.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, [query]);
	return matches;
}

type StarLayerProps = {
	count: number;
	size: number;
	transition: any;
	className?: string;
};

// Helper to generate stars via box-shadow.
// Memoized at module scope so repeated renders with the same count reuse the
// same string instead of recomputing + triggering a re-render.
const starCache = new Map<number, string>();
function generateStars(count: number) {
	const cached = starCache.get(count);
	if (cached) return cached;
	const shadows: string[] = [];
	for (let i = 0; i < count; i++) {
		const x = Math.floor(Math.random() * 4000) - 2000;
		const y = Math.floor(Math.random() * 4000) - 2000;
		shadows.push(`${x}px ${y}px currentColor`);
	}
	const value = shadows.join(", ");
	starCache.set(count, value);
	return value;
}

function StarLayer({ count, size, transition, className }: StarLayerProps) {
	// Compute once per (count) — no setState, no effect, no re-render.
	const boxShadow = generateStars(count);

	return (
		<motion.div
			animate={{ y: [0, -2000] }}
			transition={transition}
			className={cn("absolute top-0 left-0 w-full h-[2000px]", className)}
		>
			{(
				<div
					className="absolute bg-transparent rounded-full"
					style={{ width: size, height: size, boxShadow }}
				/>
			) as any}
			{(
				<div
					className="absolute bg-transparent rounded-full top-[2000px]"
					style={{ width: size, height: size, boxShadow }}
				/>
			) as any}
		</motion.div>
	) as any;
}

function ProgressiveImage({ src, thumb, alt, className, style }: any) {
	const [isLoaded, setIsLoaded] = React.useState(false);

	return (
		<>
			<img
				src={thumb}
				alt={alt}
				className={cn(className, isLoaded ? "opacity-0" : "opacity-100", "absolute inset-0 transition-opacity duration-1000")}
				style={style}
			/>
			<img
				src={src}
				alt={alt}
				onLoad={() => setIsLoaded(true)}
				className={cn(className, isLoaded ? "opacity-100" : "opacity-0", "absolute inset-0 transition-opacity duration-1000")}
				style={style}
				loading="lazy"
				decoding="async"
			/>
		</>
	);
}

// Horizontally expanded to ~94vw to match the nav bar width, while keeping the vertical height constrained.
// z-indexes are assigned so the center cluster (top-center, top-left, top-right) sits on top of the side wings.
const IMAGE_STYLES = [
	"w-[44vw] h-[22vh] top-[-28vh] left-[-22vw] z-20 md:w-[30vw] md:h-[22.5vh] md:top-[4vh] md:-left-[1.5vw] md:z-30",      // 0: upper-left
	"w-[40vw] h-[20vh] top-[-16vh] left-[20vw] z-10 md:w-[42vw] md:h-[27vh] md:-top-[23vh] md:left-[5vw] md:z-20",          // 1: upper-right
	"w-[46vw] h-[24vh] top-[-6vh] left-[-26vw] z-30 md:w-[24vw] md:h-[49.5vh] md:-top-[9.5vh] md:-left-[32vw] md:z-10",    // 2: mid-left
	"w-[42vw] h-[22vh] top-[6vh] left-[22vw] z-20 md:w-[30vw] md:h-[22.5vh] md:top-[4vh] md:left-[32vw] md:z-30",         // 3: center-right
	"w-[44vw] h-[22vh] top-[16vh] left-[-20vw] z-10 md:w-[24vw] md:h-[27vh] md:top-[31vh] md:left-[5vw] md:z-20",           // 4: lower-left
	"w-[40vw] h-[20vh] top-[28vh] left-[18vw] z-30 md:w-[36vw] md:h-[22.5vh] md:top-[28.75vh] md:-left-[29vw] md:z-10",    // 5: bottom-right
	"hidden md:block md:w-[18vw] md:h-[13.5vh] md:top-[24.25vh] md:left-[29vw] md:z-40",     // 6: tiny center accent
];

export default function ImmersiveScrollGallery({
	mobilePhotos = [],
	mobilePositions = null,
	desktopPhotos = [],
	desktopPositions = null,
	text = "",
	className = "",
}: iImmersiveScrollGalleryProps) {
	const container = useRef<HTMLDivElement | null>(null);

	// Switch between mobile/desktop photos + positions at the JS level (inline
	// styles can't use Tailwind's md: prefix). Falls back to IMAGE_STYLES
	// (CSS-driven) when positions is null/absent, so existing behavior is
	// unchanged. Conditional rendering (vs. rendering both with hidden/md:block)
	// avoids initializing double the framer-motion springs.
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const photos = isDesktop ? desktopPhotos : mobilePhotos;
	const positions = isDesktop ? desktopPositions : mobilePositions;
	const hasPositions = positions != null && positions.length > 0;

	const { scrollYProgress } = useScroll({
		target: container,
		offset: ["start start", "end end"],
	});

	// NOTE: We intentionally do NOT wrap scrollYProgress in useSpring here.
	// SmoothScroll.astro already runs Lenis (lerp 0.15) which smooths the
	// native scroll position. Stacking a second spring on top caused the zoom
	// to lag behind the wheel input, producing the "stutter then start" feel
	// on entry. Lenis alone gives a smooth, responsive progress curve.

	// Delayed start (0.1) so the section can fully enter the viewport before scaling begins
	const scale4 = useTransform(scrollYProgress, [0.1, 1], [1, 4]);
	const scale5 = useTransform(scrollYProgress, [0.1, 1], [1, 5]);
	const scale6 = useTransform(scrollYProgress, [0.1, 1], [1, 6]);
	const scale8 = useTransform(scrollYProgress, [0.1, 1], [1, 8]);
	const scale9 = useTransform(scrollYProgress, [0.1, 1], [1, 9]);

	// Fade images out by 0.8 and KEEP them at 0 through the end of the scroll
	// so the paragraph + stars stand alone. The explicit hold-at-0 stop at
	// progress 1 prevents any fade-back-in from scroll overshoot/extrapolation.
	const opacityImage = useTransform(scrollYProgress, [0.1, 0.8, 1], [1, 0, 0]);

	// Explicitly keep text opacity at 1 from 0.8 to 1.0 so it doesn't fade out
	const opacitySection2 = useTransform(scrollYProgress, [0.6, 0.8, 1], [0, 1, 1]);
	const scaleSection2 = useTransform(scrollYProgress, [0.6, 0.8, 1], [0.8, 1, 1]);

	const pictures = photos.map((src: string, index: number) => {
		return {
			src: `/photos/full/${src}`, // Prepend path
			thumb: `/photos/thumbs/${src.replace(/\.[^.]+$/, ".webp")}`,
			scale: [scale4, scale5, scale6, scale5, scale6, scale8, scale9][
				index % 7
			],
		};
	});

	// Only run the star animations + mouse parallax while the section is on
	// screen. While off-screen the infinite y-loop animations and the mousemove
	// listener would otherwise burn CPU/GPU budget the browser needs for smooth
	// compositing when the section eventually enters the viewport.
	const stickyRef = useRef<HTMLDivElement | null>(null);
	const inView = useInView(stickyRef, { amount: "some", once: false });

	// Mouse parallax for stars
	const offsetX = useMotionValue(0);
	const offsetY = useMotionValue(0);
	const springX = useSpring(offsetX, { stiffness: 50, damping: 20 });
	const springY = useSpring(offsetY, { stiffness: 50, damping: 20 });

	// rAF-throttled parallax: coalesce bursts of mousemove events into one
	// motion-value update per frame instead of updating on every event.
	const rafId = React.useRef<number | null>(null);
	const lastEvent = React.useRef<{ x: number; y: number } | null>(null);
	const handleMouseMove = React.useCallback(
		(e: any) => {
			lastEvent.current = { x: e.clientX, y: e.clientY };
			if (rafId.current != null) return;
			rafId.current = requestAnimationFrame(() => {
				rafId.current = null;
				const ev = lastEvent.current;
				if (!ev) return;
				const centerX = window.innerWidth / 2;
				const centerY = window.innerHeight / 2;
				offsetX.set(-(ev.x - centerX) * 0.05);
				offsetY.set(-(ev.y - centerY) * 0.05);
			});
		},
		[offsetX, offsetY]
	);

	React.useEffect(() => {
		return () => {
			if (rafId.current != null) cancelAnimationFrame(rafId.current);
		};
	}, []);

	return (
		<div ref={container} className={`absolute inset-0 ${className}`}>
			<div
				ref={stickyRef}
				className="sticky top-0 h-[100vh] overflow-hidden"
				onMouseMove={inView ? handleMouseMove : undefined}
			>

				{/* Stars Background (Fades in with the text) */}
				<motion.div
					style={{ opacity: opacitySection2, x: springX, y: springY } as any}
					className="absolute inset-0 pointer-events-none text-ink/50 dark:text-ink/30"
				>
				{inView && (
					<>
						{(
							<StarLayer
								count={300}
								size={2}
								transition={{ repeat: Infinity, duration: 60, ease: "linear" }}
							/>
						) as any}
						{(
							<StarLayer
								count={150}
								size={3}
								transition={{ repeat: Infinity, duration: 90, ease: "linear" }}
							/>
						) as any}
						{(
							<StarLayer
								count={50}
								size={4}
								transition={{ repeat: Infinity, duration: 120, ease: "linear" }}
							/>
						) as any}
					</>
				) as any}
				</motion.div>

			{/* Zooming Images — scaled down + offset down to center vertically and clear the nav bar */}
			<div className="absolute inset-0 origin-center scale-[0.9] translate-y-[2vh] will-change-transform pointer-events-none">
				{pictures.map(({ src, thumb, scale }, index) => {
					// When positions are configured, use inline styles (JS-driven
					// responsive switch). Otherwise fall back to the hardcoded
					// IMAGE_STYLES Tailwind classes (CSS-driven md: prefix).
					// `pos` is already the active device's PhotoPosition (mobile or
					// desktop selected above via useMediaQuery), so read fields directly.
					const pos = hasPositions ? positions![index] : null;
					const zIndex = pos ? pos.z : undefined;
					// Per-photo border radius (px). Falls back to the CSS class
					// (`rounded-lg`) when unset so the original look is preserved.
					const br = pos && typeof pos.br === "number" ? pos.br : null;
					const posStyle = pos
						? {
								width: `${pos.w}vw`,
								height: `${pos.h}vh`,
								top: `${pos.y}vh`,
								left: `${pos.x}vw`,
								zIndex,
							} as React.CSSProperties
						: undefined;
					// Skip rendering on mobile if the position has zero size
					// (matches the original `hidden md:block` for index 6).
					const skipOnMobile = pos && !isDesktop && pos.w === 0 && pos.h === 0;
					if (skipOnMobile) return null;

					// Extract z-index classes from IMAGE_STYLES fallback if pos is not defined
					const fallbackZIndexMatch = !pos ? IMAGE_STYLES[index % IMAGE_STYLES.length].match(/z-(\d+)|md:z-(\d+)/g) : null;
					let fallbackZIndex = undefined;
					if (fallbackZIndexMatch) {
						// Simple heuristic to get the right z-index from the string based on desktop/mobile
						const mobileMatch = IMAGE_STYLES[index % IMAGE_STYLES.length].match(/(?:^|\s)z-(\d+)/);
						const desktopMatch = IMAGE_STYLES[index % IMAGE_STYLES.length].match(/md:z-(\d+)/);
						fallbackZIndex = isDesktop 
							? (desktopMatch ? parseInt(desktopMatch[1]) : (mobileMatch ? parseInt(mobileMatch[1]) : undefined))
							: (mobileMatch ? parseInt(mobileMatch[1]) : undefined);
					}
					
					const resolvedZIndex = zIndex !== undefined ? zIndex : fallbackZIndex;

					// When a custom border-radius is set, drop the `rounded-lg`
					// class (it would override the inline style) and apply via style.
					const wrapperClassName = pos ? "relative overflow-hidden" : `relative overflow-hidden ${IMAGE_STYLES[index % IMAGE_STYLES.length]}`;
					
					const wrapperStyle = posStyle ? { ...posStyle } as any : {};
					if (br !== null) {
						wrapperStyle.borderRadius = `${br}px`;
					}

					const cropX = pos?.cropX ?? 50;
					const cropY = pos?.cropY ?? 50;
					const cropZoom = pos?.cropZoom ?? 1;

					const imgClassName = "object-cover w-full h-full will-change-transform";
					const imgStyle = { 
						transform: `translateZ(0) scale(${cropZoom})`, 
						transformOrigin: 'center',
						objectPosition: `${cropX}% ${cropY}%`
					};

					return (
						<motion.div
							key={index}
							style={{ scale, opacity: opacityImage, zIndex: resolvedZIndex } as any}
							className="absolute flex items-center justify-center w-full h-full top-0 will-change-transform pointer-events-none"
						>
							{(
								<div
									className={br !== null ? wrapperClassName : `${wrapperClassName} rounded-lg`}
									style={wrapperStyle}
								>
									<ProgressiveImage
										src={src}
										thumb={thumb}
										alt={`Zoom image ${index + 1}`}
										// Removed shadow-xl because scaling a box-shadow causes severe browser jank
										className={imgClassName}
										style={imgStyle}
									/>
								</div>
							) as any}
						</motion.div>
					) as any;
				})}
			</div>

			{/* Content Section */}
				<motion.div
					style={{
						opacity: opacitySection2,
						scale: scaleSection2,
					} as any}
					className="w-full h-full flex items-center justify-center max-w-3xl mx-auto p-8 relative translate-y-[4vh] will-change-transform pointer-events-none"
				>
					{(
						<h2
							className="text-ink text-2xl md:text-4xl font-thin py-4 font-display text-center drop-shadow-xl dark:drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]"
							style={{ lineHeight: 1.5 }}
							data-config="home.immersiveGallery.text"
						>
							{text}
						</h2>
					) as any}
				</motion.div>
			</div>
		</div>
	) as any;
}

