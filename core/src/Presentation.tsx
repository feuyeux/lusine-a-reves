import React from "react";
import { Audio } from "@remotion/media";
import type { Caption } from "@remotion/captions";
import { AbsoluteFill, Img, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Presentation, Slide, SlideImage, StyleProfile, Theme } from "./domain";
import {
  AudioManifestSchema,
  DENSITY_SCALES,
  MOTION_CONFIGS,
  parsePresentation,
  resolveSlideTheme,
} from "./domain";
import { buildTimeline, type TimelineSlide } from "./timeline";
import "./styles.css";

type PresentationProps = { presentation: unknown; audioManifest: unknown };
type SlideFrameProps = { slide: TimelineSlide; index: number; presentation: Presentation };
type Motion = StyleProfile["motion"];
type BodyProps = { slide: Slide; theme: Theme; frame: number; fps: number; motion: Motion };

const fadeIn = (frame: number, fps: number, motion: Motion, delay = 0, distanceScale = 1) => {
  const { damping, stiffness, distance } = MOTION_CONFIGS[motion];
  const progress = spring({ frame: Math.max(0, frame - delay), fps, config: { damping, stiffness } });
  return { opacity: progress, transform: `translateY(${(1 - progress) * distance * distanceScale}px)` };
};

const CaptionOverlay: React.FC<{ captions: Caption[]; show: boolean }> = ({ captions, show }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!show) return null;
  const current = captions.find((caption) => frame * 1000 / fps >= caption.startMs && frame * 1000 / fps < caption.endMs);
  return current ? <div className="caption-overlay">{current.text}</div> : null;
};

const SlideHeader: React.FC<{ slide: Slide; index: number; total: number; brand: string }> = ({ slide, index, total, brand }) => (
  <header className="slide-header">
    <div className="brand"><span className="brand-mark">{brand.slice(0, 1).toUpperCase()}</span><span>{brand}</span></div>
    <div className="slide-meta">
      <span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      <span className="meta-line" />
      <span>{slide.eyebrow ?? slide.type.toUpperCase()}</span>
    </div>
    <h1>{slide.title.split("\n").map((line, lineIndex) => <React.Fragment key={`${lineIndex}-${line}`}>{line}<br /></React.Fragment>)}</h1>
    {slide.subtitle && <p className="slide-subtitle">{slide.subtitle}</p>}
  </header>
);

const StatGrid: React.FC<BodyProps> = ({ slide, theme, frame, fps, motion }) => (
  // --stat-count drives the grid column count so 2 or 4 stats stay balanced.
  <div className="stat-grid" style={{ "--stat-count": slide.stats.length } as React.CSSProperties}>
    {slide.stats.map((stat, index) => {
      const color = stat.color ?? theme.accent;
      return <div className="stat-card" key={`${stat.label}-${index}`} style={{ borderTopColor: color, ...fadeIn(frame, fps, motion, 8 + index * 6, 1.5) }}>
        <div className="stat-value" style={{ color, textShadow: `0 0 34px ${color}40` }}>{stat.value}</div>
        <div className="stat-label">{stat.label}</div>
        {stat.detail && <div className="stat-detail">{stat.detail}</div>}
      </div>;
    })}
  </div>
);

const Diagram: React.FC<{ slide: Slide; theme: Theme }> = ({ slide, theme }) => (
  <div className="diagram">
    {slide.nodes.map((node, index) => <React.Fragment key={`${node.label}-${index}`}>
      <div className="diagram-node" style={{ borderColor: node.color ?? theme.accent }}>
        <strong style={{ color: node.color ?? theme.accent }}>{node.label}</strong>
        {node.sub && <small>{node.sub}</small>}
      </div>
      {index < slide.nodes.length - 1 && <div className="diagram-arrow">→</div>}
    </React.Fragment>)}
  </div>
);

const ImageFigure: React.FC<{ image: SlideImage }> = ({ image }) => (
  <figure className="image-figure">
    <div className="image-frame">
      <Img src={staticFile(image.src)} alt={image.alt} style={{ objectFit: image.fit }} />
    </div>
    {image.caption && <figcaption className="image-caption">{image.caption}</figcaption>}
  </figure>
);

const SlideBody: React.FC<BodyProps> = ({ slide, theme, frame, fps, motion }) => {
  switch (slide.type) {
    case "title": return <div className="title-body">{slide.body && <p>{slide.body}</p>}</div>;
    case "overview":
    case "metrics": return <div className="metric-body"><StatGrid slide={slide} theme={theme} frame={frame} fps={fps} motion={motion} />{slide.callout && <div className="callout">{slide.callout}</div>}</div>;
    case "diagram": return <div className="diagram-body"><Diagram slide={slide} theme={theme} />{slide.callout && <div className="callout">{slide.callout}</div>}</div>;
    case "image": return <div className="image-body">{slide.image && <ImageFigure image={slide.image} />}{slide.callout && <div className="callout">{slide.callout}</div>}</div>;
    case "quote": return <blockquote className="quote">{slide.quote ?? slide.body}</blockquote>;
    case "closing": return <div className="closing-body"><div className="closing-quote">{slide.quote}</div></div>;
    default: return <div className="text-body"><div>{slide.body && <p>{slide.body}</p>}</div><ul>{slide.bullets.map((bullet, bulletIndex) => <li key={`${bulletIndex}-${bullet}`}>{bullet}</li>)}</ul></div>;
  }
};

export const SlideFrame: React.FC<SlideFrameProps> = ({ slide, index, presentation }) => {
  const frame = useCurrentFrame();
  const { fps, style } = presentation;
  // Per-slide overrides win over the deck palette, so a chapter can reskin
  // itself without forking the presentation theme.
  const theme = resolveSlideTheme(slide, presentation.theme);
  const scale = DENSITY_SCALES[style.density];
  const cssVars = {
    "--ink": theme.ink, "--paper": theme.paper, "--muted": theme.muted,
    "--accent": theme.accent, "--accent2": theme.accent2, "--accent3": theme.accent3,
    "--panel": theme.panel, "--radius": `${style.cornerRadius}px`,
    "--heading-font": style.headingFont, "--body-font": style.bodyFont,
    "--gap-scale": scale.gap, "--text-scale": scale.text,
  } as React.CSSProperties;
  return (
    // data-mood exposes the semantic mood label as a CSS hook for downstream
    // theming without baking any specific mood into the renderer.
    <AbsoluteFill className={`slide density-${style.density}`} data-mood={style.mood} style={{ ...cssVars, background: theme.paper, color: theme.ink }}>
      {style.backgroundPattern !== "none" && <div className={`pattern pattern-${style.backgroundPattern}`} />}
      <div className="accent-wash" style={{ background: theme.accent }} />
      <div className="slide-safe">
        <SlideHeader slide={slide} index={index} total={presentation.slides.length} brand={presentation.brand} />
        <main className={`slide-main layout-${slide.type}`} style={fadeIn(frame, fps, style.motion, 5)}>
          <SlideBody slide={slide} theme={theme} frame={frame} fps={fps} motion={style.motion} />
        </main>
        <CaptionOverlay captions={slide.captions} show={presentation.showCaptions} />
        <footer className="slide-footer">
          <span>{presentation.title}</span>
          <span className="footer-rule" />
          <span>{slide.id}</span>
        </footer>
      </div>
    </AbsoluteFill>
  );
};

export const PresentationVideo: React.FC<PresentationProps> = ({ presentation, audioManifest }) => {
  const normalizedPresentation = parsePresentation(presentation);
  const normalizedManifest = AudioManifestSchema.parse(audioManifest);
  const timeline = buildTimeline(normalizedPresentation, normalizedManifest);
  return <AbsoluteFill>{timeline.slides.map((slide, index) => <Sequence key={slide.id} from={slide.startFrame} durationInFrames={slide.durationInFrames}>
    {slide.audio && <Audio src={staticFile(slide.audio)} volume={0.98} />}
    <SlideFrame slide={slide} index={index} presentation={normalizedPresentation} />
  </Sequence>)}</AbsoluteFill>;
};
