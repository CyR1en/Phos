"use client";

import * as React from "react";
import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
import { cn } from "@lib/utils";

// Types
interface iImmersiveScrollGalleryProps {
	images?: string[];
	text?: string;
	className?: string;
}

type StarLayerProps = {
	count: number;
	size: number;
	transition: any;
	className?: string;
};

// Helper to generate stars via box-shadow
function generateStars(count: number) {
	const shadows: string[] = [];
	for (let i = 0; i < count; i++) {
		const x = Math.floor(Math.random() * 4000) - 2000;
		const y = Math.floor(Math.random() * 4000) - 2000;
		shadows.push(`${x}px ${y}px currentColor`);
	}
	return shadows.join(", ");
}

function StarLayer({ count, size, transition, className }: StarLayerProps) {
	const [boxShadow, setBoxShadow] = React.useState<string>("");

	React.useEffect(() => {
		setBoxShadow(generateStars(count));
	}, [count]);

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
	"w-[30vw] h-[22.5vh] top-[4vh] -left-[1.5vw] z-30",      // 0: top-center
	"w-[42vw] h-[27vh] -top-[23vh] left-[5vw] z-20",          // 1: top-left wing
	"w-[24vw] h-[49.5vh] -top-[9.5vh] -left-[32vw] z-10",    // 2: far-left wing
	"w-[30vw] h-[22.5vh] top-[4vh] left-[32vw] z-30",         // 3: top-right
	"w-[24vw] h-[27vh] top-[31vh] left-[5vw] z-20",           // 4: bottom-left
	"w-[36vw] h-[22.5vh] top-[28.75vh] -left-[29vw] z-10",    // 5: far-right wing
	"w-[18vw] h-[13.5vh] top-[24.25vh] left-[29vw] z-40",     // 6: tiny center accent
];

export default function ImmersiveScrollGallery({
	images = [],
	text = "",
	className = "",
}: iImmersiveScrollGalleryProps) {
	const container = useRef<HTMLDivElement | null>(null);

	const { scrollYProgress: scrollYProgressRaw } = useScroll({
		target: container,
		offset: ["start start", "end end"],
	});

	// Apply spring physics to smooth out the scroll progress (fixes stuttering from mouse wheels)
	const scrollYProgress = useSpring(scrollYProgressRaw, {
		stiffness: 100,
		damping: 30,
		restDelta: 0.001
	});

	// Delayed start (0.1) so the section can fully enter the viewport before scaling begins
	const scale4 = useTransform(scrollYProgress, [0.1, 1], [1, 4]);
	const scale5 = useTransform(scrollYProgress, [0.1, 1], [1, 5]);
	const scale6 = useTransform(scrollYProgress, [0.1, 1], [1, 6]);
	const scale8 = useTransform(scrollYProgress, [0.1, 1], [1, 8]);
	const scale9 = useTransform(scrollYProgress, [0.1, 1], [1, 9]);

	// Fade images completely to 0 so they disappear behind the text
	const opacityImage = useTransform(scrollYProgress, [0.1, 0.8], [1, 0]);

	// Explicitly keep text opacity at 1 from 0.8 to 1.0 so it doesn't fade out
	const opacitySection2 = useTransform(scrollYProgress, [0.6, 0.8, 1], [0, 1, 1]);
	const scaleSection2 = useTransform(scrollYProgress, [0.6, 0.8, 1], [0.8, 1, 1]);

	const pictures = images.map((src, index) => {
		return {
			src: `/photos/full/${src}`, // Prepend path
			thumb: `/photos/thumbs/${src.replace(/\.[^.]+$/, ".webp")}`,
			scale: [scale4, scale5, scale6, scale5, scale6, scale8, scale9][
				index % 7
			],
		};
	});

	// Mouse parallax for stars
	const offsetX = useMotionValue(0);
	const offsetY = useMotionValue(0);
	const springX = useSpring(offsetX, { stiffness: 50, damping: 20 });
	const springY = useSpring(offsetY, { stiffness: 50, damping: 20 });

	const handleMouseMove = React.useCallback(
		(e: any) => {
			const centerX = window.innerWidth / 2;
			const centerY = window.innerHeight / 2;
			offsetX.set(-(e.clientX - centerX) * 0.05);
			offsetY.set(-(e.clientY - centerY) * 0.05);
		},
		[offsetX, offsetY]
	);

	return (
		<div ref={container} className={`absolute inset-0 ${className}`}>
			<div className="sticky top-0 h-[100vh] overflow-hidden" onMouseMove={handleMouseMove}>

				{/* Stars Background (Fades in with the text) */}
				<motion.div
					style={{ opacity: opacitySection2, x: springX, y: springY } as any}
					className="absolute inset-0 pointer-events-none text-ink/50 dark:text-ink/30"
				>
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
				</motion.div>

				{/* Zooming Images */}
				{pictures.map(({ src, thumb, scale }, index) => {
					return (
						<motion.div
							key={index}
							style={{ scale, opacity: opacityImage } as any}
							className="absolute flex items-center justify-center w-full h-full top-0 will-change-transform pointer-events-none"
						>
							{(
								<div className={`relative ${IMAGE_STYLES[index % IMAGE_STYLES.length]}`}>
									<ProgressiveImage
										src={src}
										thumb={thumb}
										alt={`Zoom image ${index + 1}`}
										// Removed shadow-xl because scaling a box-shadow causes severe browser jank
										className="object-cover w-full h-full rounded-lg will-change-transform"
										style={{ transform: "translateZ(0)" }}
									/>
								</div>
							) as any}
						</motion.div>
					) as any;
				})}

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

