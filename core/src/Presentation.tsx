import React from "react";
import { Audio } from "@remotion/media";
import type { Caption } from "@remotion/captions";
import { AbsoluteFill, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Presentation, Slide, Theme } from "./domain";
import { AudioManifestSchema, parsePresentation } from "./domain";
import { buildTimeline, type TimelineSlide } from "./timeline";
import "./styles.css";

type PresentationProps = { presentation: unknown; audioManifest: unknown };
type SlideFrameProps = { slide: TimelineSlide; index: number; presentation: Presentation };

const fadeIn = (frame: number, fps: number, delay = 0, distance = 22) => {
  const progress = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 18, stiffness: 110 } });
  return { opacity: progress, transform: `translateY(${(1 - progress) * distance}px)` };
};

const CaptionOverlay: React.FC<{ captions: Caption[]; show: boolean }> = ({ captions, show }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!show) return null;
  const current = captions.find((caption) => frame * 1000 / fps >= caption.startMs && frame * 1000 / fps < caption.endMs);
  return current ? <div className="caption-overlay">{current.text}</div> : null;
};

const SlideHeader: React.FC<{ slide: Slide; index: number; total: number }> = ({ slide, index, total }) => (
  <header className="slide-header">
    <div className="brand"><span className="brand-mark">L</span><span>LUSINE / META BUILDER</span></div>
    <div className="slide-meta">
      <span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      <span className="meta-line" />
      <span>{slide.eyebrow ?? slide.type.toUpperCase()}</span>
    </div>
    <h1>{slide.title.split("\n").map((line) => <React.Fragment key={line}>{line}<br /></React.Fragment>)}</h1>
    {slide.subtitle && <p className="slide-subtitle">{slide.subtitle}</p>}
  </header>
);

const StatGrid: React.FC<{ slide: Slide; theme: Theme; frame: number; fps: number }> = ({ slide, theme, frame, fps }) => (
  <div className="stat-grid">
    {slide.stats.map((stat, index) => {
      const color = stat.color ?? theme.accent;
      return <div className="stat-card" key={`${stat.label}-${index}`} style={{ borderTopColor: color, ...fadeIn(frame, fps, 8 + index * 6, 34) }}>
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

const SlideBody: React.FC<{ slide: Slide; theme: Theme; frame: number; fps: number }> = ({ slide, theme, frame, fps }) => {
  switch (slide.type) {
    case "title": return <div className="title-body">{slide.body && <p>{slide.body}</p>}</div>;
    case "overview":
    case "metrics": return <div className="metric-body"><StatGrid slide={slide} theme={theme} frame={frame} fps={fps} />{slide.callout && <div className="callout">{slide.callout}</div>}</div>;
    case "diagram": return <div className="diagram-body"><Diagram slide={slide} theme={theme} />{slide.callout && <div className="callout">{slide.callout}</div>}</div>;
    case "quote": return <blockquote className="quote">{slide.quote ?? slide.body}</blockquote>;
    case "closing": return <div className="closing-body"><div className="closing-quote">{slide.quote}</div></div>;
    default: return <div className="text-body"><div>{slide.body && <p>{slide.body}</p>}</div><ul>{slide.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></div>;
  }
};

export const SlideFrame: React.FC<SlideFrameProps> = ({ slide, index, presentation }) => {
  const frame = useCurrentFrame();
  const { fps, theme } = presentation;
  return (
    <AbsoluteFill className="slide" style={{ background: theme.paper, color: theme.ink }}>
      <div className="grid" />
      <div className="accent-wash" style={{ background: theme.accent }} />
      <div className="slide-safe">
        <SlideHeader slide={slide} index={index} total={presentation.slides.length} />
        <main className={`slide-main layout-${slide.type}`} style={fadeIn(frame, fps, 5)}>
          <SlideBody slide={slide} theme={theme} frame={frame} fps={fps} />
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
