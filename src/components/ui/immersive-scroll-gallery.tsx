"use client";

import * as React from "react";
import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring, useMotionValue, useInView, useMotionValueEvent } from "framer-motion";
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
	duration: number;
	active: boolean;
	className?: string;
};

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

function StarLayer({ count, size, duration, active, className }: StarLayerProps) {
	const boxShadow = generateStars(count);
	const layer = useRef<HTMLDivElement>(null);
	const animation = useRef<Animation | null>(null);

	React.useEffect(() => {
		// Native transforms avoid a JavaScript style update on every frame.
		const drift = layer.current?.animate(
			[{ transform: "translateY(0)" }, { transform: "translateY(-2000px)" }],
			{ duration: duration * 1000, iterations: Infinity, easing: "linear" }
		);
		if (!drift) return;
		drift.pause();
		animation.current = drift;
		return () => drift.cancel();
	}, [duration]);

	React.useEffect(() => {
		if (active) animation.current?.play();
		else animation.current?.pause();
	}, [active, duration]);

	return (
		<div
			ref={layer}
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
		</div>
	) as any;
}

interface ProgressiveImageProps {
	src: string;
	thumb: string;
	alt: string;
	className: string;
	style: React.CSSProperties;
	shouldLoadFull: boolean;
}

function ProgressiveImage({ src, thumb, alt, className, style, shouldLoadFull }: ProgressiveImageProps) {
	const [decodedSrc, setDecodedSrc] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!shouldLoadFull) return;
		let cancelled = false;
		const image = new Image();
		image.decoding = "async";
		image.src = src;
		// Keep the thumbnail visible until its replacement is ready to paint.
		image.decode().then(() => {
			if (!cancelled) setDecodedSrc(src);
		}).catch(() => {});
		return () => { cancelled = true; };
	}, [src, shouldLoadFull]);

	return (
		<img
			src={decodedSrc === src ? src : thumb}
			alt={alt}
			className={cn(className, "absolute inset-0")}
			style={style}
			decoding="async"
		/>
	);
}

function photoPath(src: string, variant: "thumbs" | "immersive" | "immersive-mobile") {
	return `/photos/${variant}/${src.replace(/\.[^.]+$/, ".webp")}`;
}

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

	const isDesktop = useMediaQuery("(min-width: 768px)");
	const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
	const photos = isDesktop ? desktopPhotos : mobilePhotos;
	const photoKey = photos.join("|");
	const positions = isDesktop ? desktopPositions : mobilePositions;
	const hasPositions = positions != null && positions.length > 0;
	const [shouldLoadFullImages, setShouldLoadFullImages] = React.useState(false);

	const { scrollYProgress } = useScroll({
		target: container,
		offset: ["start start", "end end"],
	});

	// Photos have faded out at 80%; stop enlarging their composited surfaces there.
	const imageProgress = useTransform(scrollYProgress, [0, 0.8], [0, 0.8]);
	const scale4 = useTransform(imageProgress, [0.1, 1], [1, reducedMotion ? 1 : 4]);
	const scale5 = useTransform(imageProgress, [0.1, 1], [1, reducedMotion ? 1 : 5]);
	const scale6 = useTransform(imageProgress, [0.1, 1], [1, reducedMotion ? 1 : 6]);
	const scale8 = useTransform(imageProgress, [0.1, 1], [1, reducedMotion ? 1 : 8]);
	const scale9 = useTransform(imageProgress, [0.1, 1], [1, reducedMotion ? 1 : 9]);

	const opacityImage = useTransform(scrollYProgress, [0.1, 0.8, 1], [1, 0, 0]);

	const opacitySection2 = useTransform(scrollYProgress, [0.6, 0.8, 1], [0, 1, 1]);
	const scaleSection2 = useTransform(scrollYProgress, [0.6, 0.8, 1], [reducedMotion ? 1 : 0.8, 1, 1]);

	const pictures = React.useMemo(() => photos.map((src: string, index: number) => {
		return {
			src: photoPath(src, isDesktop ? "immersive" : "immersive-mobile"),
			thumb: photoPath(src, "thumbs"),
			scale: [scale4, scale5, scale6, scale5, scale6, scale8, scale9][
				index % 7
			],
		};
	}), [isDesktop, photoKey, scale4, scale5, scale6, scale8, scale9]);

	const stickyRef = useRef<HTMLDivElement | null>(null);
	const inView = useInView(stickyRef, { amount: "some", once: false });
	const shouldRenderStars = shouldLoadFullImages || inView;
	const [starsVisible, setStarsVisible] = React.useState(false);
	const [imagesVisible, setImagesVisible] = React.useState(true);
	useMotionValueEvent(scrollYProgress, "change", (progress) => {
		setStarsVisible(progress > 0.6);
		setImagesVisible(progress < 0.8);
	});

	const offsetX = useMotionValue(0);
	const offsetY = useMotionValue(0);
	const springX = useSpring(offsetX, { stiffness: 50, damping: 20 });
	const springY = useSpring(offsetY, { stiffness: 50, damping: 20 });
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

	React.useEffect(() => {
		setShouldLoadFullImages(false);
	}, [isDesktop, photoKey]);

	React.useEffect(() => {
		const el = container.current;
		if (!el || shouldLoadFullImages) return;

		const warmImages = () => {
			setShouldLoadFullImages(true);
		};

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					warmImages();
					observer.disconnect();
				}
			},
			{ rootMargin: "1400px 0px", threshold: 0 }
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, [pictures, shouldLoadFullImages]);

	return (
		<div ref={container} className={`absolute inset-0 ${className}`}>
			<div
				ref={stickyRef}
				className="sticky top-0 h-[100vh] overflow-hidden"
					onMouseMove={inView && starsVisible && !reducedMotion ? handleMouseMove : undefined}
			>

				{/* Stars Background (Fades in with the text) */}
				<motion.div
					style={{ opacity: opacitySection2, x: springX, y: springY } as any}
					className="absolute inset-0 pointer-events-none text-ink/50 dark:text-ink/30"
				>
				{shouldRenderStars && (
					<>
						{(
							<StarLayer
								count={300}
								size={2}
								duration={60}
								active={inView && starsVisible && !reducedMotion}
							/>
						) as any}
						{(
							<StarLayer
								count={150}
								size={3}
								duration={90}
								active={inView && starsVisible && !reducedMotion}
							/>
						) as any}
						{(
							<StarLayer
								count={50}
								size={4}
								duration={120}
								active={inView && starsVisible && !reducedMotion}
							/>
						) as any}
					</>
				) as any}
				</motion.div>

			{/* Zooming Images — scaled down + offset down to center vertically and clear the nav bar */}
			<div
				className="absolute inset-0 origin-center scale-[0.9] translate-y-[2.5vh] pointer-events-none"
				style={{ visibility: imagesVisible ? "visible" : "hidden" }}
			>
				{pictures.map(({ src, thumb, scale }, index) => {
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
					const skipOnMobile = pos && !isDesktop && pos.w === 0 && pos.h === 0;
					if (skipOnMobile) return null;
					const fallbackZIndexMatch = !pos ? IMAGE_STYLES[index % IMAGE_STYLES.length].match(/z-(\d+)|md:z-(\d+)/g) : null;
					let fallbackZIndex = undefined;
					if (fallbackZIndexMatch) {
						const mobileMatch = IMAGE_STYLES[index % IMAGE_STYLES.length].match(/(?:^|\s)z-(\d+)/);
						const desktopMatch = IMAGE_STYLES[index % IMAGE_STYLES.length].match(/md:z-(\d+)/);
						fallbackZIndex = isDesktop 
							? (desktopMatch ? parseInt(desktopMatch[1]) : (mobileMatch ? parseInt(mobileMatch[1]) : undefined))
							: (mobileMatch ? parseInt(mobileMatch[1]) : undefined);
					}
					
					const resolvedZIndex = zIndex !== undefined ? zIndex : fallbackZIndex;
					const wrapperClassName = pos ? "relative overflow-hidden" : `relative overflow-hidden ${IMAGE_STYLES[index % IMAGE_STYLES.length]}`;
					
					const wrapperStyle = posStyle ? { ...posStyle } as any : {};
					if (br !== null) {
						wrapperStyle.borderRadius = `${br}px`;
					}

					const cropX = pos?.cropX ?? 50;
					const cropY = pos?.cropY ?? 50;
					const cropZoom = pos?.cropZoom ?? 1;

					const imgClassName = "object-cover w-full h-full";
					const imgStyle = { 
						transform: `scale(${cropZoom})`,
						transformOrigin: 'center',
						objectPosition: `${cropX}% ${cropY}%`
					};

					return (
						<motion.div
							key={`${src}-${index}`}
							style={{ scale, opacity: opacityImage, zIndex: resolvedZIndex, willChange: inView && imagesVisible ? "transform" : "auto" } as any}
							className="absolute flex items-center justify-center w-full h-full top-0 pointer-events-none"
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
										className={imgClassName}
										style={imgStyle}
										shouldLoadFull={shouldLoadFullImages}
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
							className="text-ink text-2xl md:text-4xl font-thin py-4 font-display text-center [text-shadow:0_4px_8px_rgba(0,0,0,0.1)] dark:[text-shadow:0_0_20px_rgba(255,255,255,0.4)]"
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
