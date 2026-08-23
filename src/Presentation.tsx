import React from "react";
import { Audio } from "@remotion/media";
import { useWindowedAudioData, visualizeAudio } from "@remotion/media-utils";
import type { Caption } from "@remotion/captions";
import {
  AbsoluteFill,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Presentation, PresenterProfile, Slide, Theme } from "./domain";
import { AudioManifestSchema, parsePresentation } from "./domain";
import { buildTimeline, type TimelineSlide } from "./timeline";
import "./styles.css";

type PresentationProps = {
  presentation: unknown;
  audioManifest: unknown;
};

type SlideFrameProps = {
  slide: TimelineSlide;
  index: number;
  presentation: Presentation;
};

const fadeIn = (frame: number, fps: number, delay = 0, distance = 30) => {
  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 18, stiffness: 110 },
  });
  return {
    opacity: progress,
    transform: `translateY(${(1 - progress) * distance}px)`,
  };
};

const Wave: React.FC<{ activity: number; color: string }> = ({ activity, color }) => {
  const frame = useCurrentFrame();
  return (
    <div className="wave" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => {
        const pulse = Math.abs(Math.sin(frame * 0.16 + index * 0.8));
        const height = 4 + (pulse * 0.7 + activity * 0.9) * (8 + (index % 4) * 4);
        return <i key={index} style={{ height, background: color }} />;
      })}
    </div>
  );
};

const AvatarArt: React.FC<{ mouthOpen: number; breathe: number; sway: number; blink: number; theme: Theme; profile: PresenterProfile }> = ({ mouthOpen, breathe, sway, blink, theme, profile }) => {
  const eyeScale = Math.max(0.12, 1 - blink * 0.88);
  const mouthHeight = 4 + mouthOpen * 15;
  return (
  <svg className="presenter-art" viewBox="0 0 360 460" role="img" aria-label={`${profile.displayName}, ${profile.role}`}>
    <defs>
      <linearGradient id={`presenter-bg-${profile.id}`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor={theme.panel} />
        <stop offset="1" stopColor="#08101d" />
      </linearGradient>
      <linearGradient id={`presenter-shirt-${profile.id}`} x1="0" x2="1">
        <stop offset="0" stopColor="#254d68" />
        <stop offset="1" stopColor="#162c49" />
      </linearGradient>
      <linearGradient id={`presenter-skin-${profile.id}`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#f7c7a5" />
        <stop offset="0.58" stopColor="#e6a17f" />
        <stop offset="1" stopColor="#b96f60" />
      </linearGradient>
      <linearGradient id={`presenter-hair-${profile.id}`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#253c5e" />
        <stop offset="0.55" stopColor="#101c35" />
        <stop offset="1" stopColor="#070d1b" />
      </linearGradient>
      <linearGradient id={`presenter-blazer-${profile.id}`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#1a6c79" />
        <stop offset="0.5" stopColor="#174b69" />
        <stop offset="1" stopColor="#142c50" />
      </linearGradient>
      <radialGradient id={`presenter-light-${profile.id}`} cx="35%" cy="20%" r="80%">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.2" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="360" height="460" rx="24" fill={`url(#presenter-bg-${profile.id})`} />
    <circle cx="296" cy="76" r="54" fill={theme.accent} opacity="0.1" />
    <circle cx="296" cy="76" r="40" fill="none" stroke={theme.accent} strokeOpacity="0.18" />
    <path d="M18 460 C25 377 83 342 180 342 C277 342 335 377 342 460 Z" fill={`url(#presenter-shirt-${profile.id})`} />
    <path d="M18 460 C28 386 70 359 128 346 L180 409 L232 346 C290 359 332 386 342 460 Z" fill={`url(#presenter-blazer-${profile.id})`} />
    <path d="M128 349 L180 410 L232 349 L218 460 L142 460 Z" fill={theme.paper} opacity="0.96" />
    <path d="M145 350 L180 410 L215 350" fill="none" stroke={theme.accent3} strokeWidth="4" />
    <path d="M165 329 L165 382 Q180 394 195 382 L195 329" fill={`url(#presenter-skin-${profile.id})`} />
    <path d="M94 384 Q110 361 129 353 M266 384 Q250 361 231 353" fill="none" stroke="#8edbd3" strokeOpacity="0.35" strokeWidth="3" />
    <g transform={`translate(${sway} ${breathe})`}>
      <ellipse cx="84" cy="205" rx="15" ry="31" fill="#c47b69" />
      <ellipse cx="276" cy="205" rx="15" ry="31" fill="#c47b69" />
      <path d="M90 190 C84 111 118 58 180 59 C242 58 276 111 270 190 C260 155 235 133 180 133 C125 133 100 155 90 190 Z" fill={`url(#presenter-hair-${profile.id})`} />
      <path d="M94 142 C100 88 136 65 180 66 C224 65 260 88 266 142 C242 113 215 103 180 105 C145 103 118 113 94 142 Z" fill="#2b456b" opacity="0.5" />
      <path d="M105 132 C88 168 91 237 119 277 C133 298 158 312 180 313 C202 312 227 298 241 277 C269 237 272 168 255 132 C232 112 205 103 180 104 C155 103 128 112 105 132 Z" fill={`url(#presenter-skin-${profile.id})`} />
      <path d="M103 211 Q96 231 111 246" fill="none" stroke="#a8615c" strokeOpacity="0.55" strokeWidth="4" />
      <path d="M257 211 Q264 231 249 246" fill="none" stroke="#a8615c" strokeOpacity="0.55" strokeWidth="4" />
      <path d="M116 178 Q137 163 157 176" fill="none" stroke="#4f3044" strokeWidth="7" strokeLinecap="round" />
      <path d="M203 176 Q223 163 244 178" fill="none" stroke="#4f3044" strokeWidth="7" strokeLinecap="round" />
      <path d="M113 190 Q136 174 159 190 Q136 207 113 190 Z" fill="#fffaf5" transform={`translate(0 0) scale(1 ${eyeScale})`} style={{ transformOrigin: "136px 190px" }} />
      <path d="M201 190 Q224 174 247 190 Q224 207 201 190 Z" fill="#fffaf5" transform={`scale(1 ${eyeScale})`} style={{ transformOrigin: "224px 190px" }} />
      <ellipse cx="137" cy="190" rx="8" ry="10" fill="#3b7a78" transform={`scale(1 ${eyeScale})`} style={{ transformOrigin: "137px 190px" }} />
      <ellipse cx="223" cy="190" rx="8" ry="10" fill="#3b7a78" transform={`scale(1 ${eyeScale})`} style={{ transformOrigin: "223px 190px" }} />
      <circle cx="137" cy="191" r="4" fill="#10192b" transform={`scale(1 ${eyeScale})`} style={{ transformOrigin: "137px 191px" }} />
      <circle cx="223" cy="191" r="4" fill="#10192b" transform={`scale(1 ${eyeScale})`} style={{ transformOrigin: "223px 191px" }} />
      <circle cx="140" cy="187" r="2.5" fill="#fff" transform={`scale(1 ${eyeScale})`} style={{ transformOrigin: "140px 187px" }} />
      <circle cx="226" cy="187" r="2.5" fill="#fff" transform={`scale(1 ${eyeScale})`} style={{ transformOrigin: "226px 187px" }} />
      <path d="M115 190 Q136 171 159 190 M201 190 Q224 171 247 190" fill="none" stroke="#34263d" strokeWidth="3" strokeLinecap="round" />
      <path d="M180 192 L170 237 Q180 244 190 237" fill="none" stroke="#ad655e" strokeWidth="4" strokeLinecap="round" />
      <path d="M169 239 Q180 244 191 239" fill="none" stroke="#8c4e53" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="130" cy="244" rx="28" ry="14" fill="#e18d7d" opacity="0.2" />
      <ellipse cx="230" cy="244" rx="28" ry="14" fill="#e18d7d" opacity="0.2" />
      <path d={`M142 270 Q180 ${262 - mouthOpen * 2} 218 270 Q180 ${270 + mouthHeight} 142 270 Z`} fill="#642e45" />
      <path d="M145 270 Q159 259 180 266 Q201 259 215 270" fill="none" stroke="#8e4056" strokeWidth="4" strokeLinecap="round" />
      <path d="M153 273 Q180 278 207 273" fill="none" stroke="#f1a397" strokeWidth="3" strokeLinecap="round" />
      <path d="M158 272 Q180 267 202 272 L198 278 L162 278 Z" fill="#fff4ed" opacity={Math.min(0.8, mouthOpen * 2)} />
      <path d="M102 154 Q91 211 104 267" fill="none" stroke="#0c172c" strokeWidth="15" strokeLinecap="round" />
      <path d="M258 154 Q269 211 256 267" fill="none" stroke="#0c172c" strokeWidth="15" strokeLinecap="round" />
      <path d="M103 134 Q119 77 180 75 Q241 77 257 134" fill="none" stroke="#415f87" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
      <circle cx="102" cy="243" r="7" fill={theme.accent3} />
      <circle cx="258" cy="243" r="7" fill={theme.accent3} />
      <path d="M180 350 L171 383 L180 397 L189 383 Z" fill={theme.accent3} />
      <circle cx="180" cy="385" r="4" fill="#10223b" />
    </g>
    <rect x="1" y="1" width="358" height="458" rx="23" fill={`url(#presenter-light-${profile.id})`} />
  </svg>
  );
};

const PresenterCard: React.FC<{ activity: number; theme: Theme; profile: PresenterProfile }> = ({ activity, theme, profile }) => {
  const frame = useCurrentFrame();
  const mouthOpen = Math.min(1, activity * 1.6 + Math.abs(Math.sin(frame * 0.18)) * 0.12);
  const breathe = Math.sin(frame * 0.05) * 1.6;
  const sway = Math.sin(frame * 0.025) * 1.2;
  const blinkPhase = frame % 173;
  const blink = blinkPhase > 160 ? Math.sin(((blinkPhase - 160) / 13) * Math.PI) : 0;
  return (
    <div className="presenter-card">
      <div className="presenter-kicker"><span className="live-dot" /> LINA / TECHNICAL PRESENTER</div>
      <AvatarArt mouthOpen={mouthOpen} breathe={breathe} sway={sway} blink={blink} theme={theme} profile={profile} />
      <div className="presenter-footer"><span>{profile.displayName} / {profile.role}</span><Wave activity={activity} color={theme.accent} /></div>
    </div>
  );
};

const TalkingPresenter: React.FC<{ audioSrc: string; theme: Theme; profile: PresenterProfile }> = ({ audioSrc, theme, profile }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src: staticFile(audioSrc),
    frame,
    fps,
    windowInSeconds: 4,
  });
  const values = audioData
    ? visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, optimizeFor: "speed", dataOffsetInSeconds })
    : [];
  const activity = values.length === 0 ? 0.18 : values.reduce((sum, value) => sum + value, 0) / values.length;
  return <PresenterCard activity={activity} theme={theme} profile={profile} />;
};

const CaptionOverlay: React.FC<{ captions: Caption[]; show: boolean; theme: Theme }> = ({ captions, show, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!show) return null;
  const current = captions.find((caption) => frame * 1000 / fps >= caption.startMs && frame * 1000 / fps < caption.endMs);
  if (!current) return null;
  return <div className="caption-overlay" style={{ color: theme.paper, background: theme.ink }}>{current.text}</div>;
};

const SlideHeader: React.FC<{ slide: Slide; index: number; total: number; theme: Theme }> = ({ slide, index, total, theme }) => (
  <header className="slide-header">
    <div className="brand"><span className="brand-mark" style={{ borderColor: theme.accent, color: theme.accent }}>LB</span><span>LUSINE / META BUILDER</span></div>
    <div className="slide-meta" style={{ color: theme.accent2 }}>
      <span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      <span className="meta-line" style={{ background: theme.accent2 }} />
      <span>{slide.eyebrow ?? slide.type.toUpperCase()}</span>
    </div>
    <h1>{slide.title.split("\n").map((line) => <React.Fragment key={line}>{line}<br /></React.Fragment>)}</h1>
    {slide.subtitle && <p className="slide-subtitle">{slide.subtitle}</p>}
  </header>
);

const StatGrid: React.FC<{ slide: Slide; theme: Theme }> = ({ slide, theme }) => (
  <div className="stat-grid">
    {slide.stats.map((stat, index) => <div className="stat-card" key={`${stat.label}-${index}`} style={{ borderTopColor: stat.color ?? theme.accent }}>
      <div className="stat-value" style={{ color: stat.color ?? theme.accent }}>{stat.value}</div>
      <div className="stat-label">{stat.label}</div>
      {stat.detail && <div className="stat-detail">{stat.detail}</div>}
    </div>)}
  </div>
);

const Diagram: React.FC<{ slide: Slide; theme: Theme }> = ({ slide, theme }) => (
  <div className="diagram">
    {slide.nodes.map((node, index) => <React.Fragment key={`${node.label}-${index}`}>
      <div className="diagram-node" style={{ borderColor: node.color ?? theme.accent }}>
        <strong style={{ color: node.color ?? theme.accent }}>{node.label}</strong>
        {node.sub && <small>{node.sub}</small>}
      </div>
      {index < slide.nodes.length - 1 && <div className="diagram-arrow" style={{ color: theme.muted }}>→</div>}
    </React.Fragment>)}
  </div>
);

const SlideBody: React.FC<{ slide: Slide; theme: Theme }> = ({ slide, theme }) => {
  switch (slide.type) {
    case "title":
      return <div className="title-body"><div className="eyebrow">{slide.eyebrow}</div>{slide.body && <p>{slide.body}</p>}</div>;
    case "overview":
    case "metrics":
      return <div className="metric-body"><StatGrid slide={slide} theme={theme} />{slide.callout && <div className="callout" style={{ borderLeftColor: theme.accent3 }}>{slide.callout}</div>}</div>;
    case "diagram":
      return <div className="diagram-body"><Diagram slide={slide} theme={theme} />{slide.callout && <div className="callout" style={{ borderLeftColor: theme.accent3 }}>{slide.callout}</div>}</div>;
    case "quote":
      return <blockquote className="quote" style={{ borderLeftColor: theme.accent }}>{slide.quote ?? slide.body}</blockquote>;
    case "closing":
      return <div className="closing-body"><div className="eyebrow">{slide.eyebrow}</div><div className="closing-quote" style={{ color: theme.accent3 }}>{slide.quote}</div></div>;
    case "text":
    default:
      return <div className="text-body"><div>{slide.body && <p>{slide.body}</p>}</div><ul>{slide.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></div>;
  }
};

export const SlideFrame: React.FC<SlideFrameProps> = ({ slide, index, presentation }) => {
  const frame = useCurrentFrame();
  const { fps, theme } = presentation;
  const hasPresenter = presentation.showPresenter && slide.presenter !== "none";
  const presenter = slide.audio && hasPresenter
    ? <TalkingPresenter audioSrc={slide.audio} theme={theme} profile={presentation.presenterProfile} />
    : hasPresenter ? <PresenterCard activity={0.16} theme={theme} profile={presentation.presenterProfile} /> : null;
  return (
    <AbsoluteFill className="slide" style={{ background: theme.ink, color: theme.paper }}>
      <div className="grid" style={{ backgroundImage: `linear-gradient(${theme.muted}12 1px, transparent 1px), linear-gradient(90deg, ${theme.muted}12 1px, transparent 1px)` }} />
      <div className="aura" style={{ background: theme.accent, opacity: 0.1 }} />
      <div className="slide-safe">
        <SlideHeader slide={slide} index={index} total={presentation.slides.length} theme={theme} />
        <main className={`slide-main layout-${slide.type}`} style={fadeIn(frame, fps, 5)}>
          <SlideBody slide={slide} theme={theme} />
          {presenter && <div className={`presenter-slot presenter-${slide.presenter}`}>{presenter}</div>}
        </main>
        <CaptionOverlay captions={slide.captions} show={presentation.showCaptions} theme={theme} />
        <footer className="slide-footer" style={{ color: theme.muted }}>
          <span>{presentation.title}</span>
          <span className="footer-rule" style={{ background: theme.accent }} />
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
