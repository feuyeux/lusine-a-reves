import type { AudioManifest, Presentation, Slide } from "./domain";

export type TimelineSlide = Slide & {
  startFrame: number;
  durationInFrames: number;
};

export type PresentationTimeline = {
  slides: TimelineSlide[];
  totalFrames: number;
};

export function getSlideDurationInFrames(
  slide: Slide,
  presentation: Presentation,
  audioManifest: AudioManifest,
): number {
  const audioDuration = slide.audio ? audioManifest[slide.audio]?.durationSec : undefined;
  const minimum = slide.minDurationSec * presentation.fps;
  const narrated = audioDuration === undefined
    ? 0
    : audioDuration * presentation.fps + presentation.tailFrames;
  return Math.max(1, Math.ceil(Math.max(minimum, narrated)));
}

export function buildTimeline(
  presentation: Presentation,
  audioManifest: AudioManifest,
): PresentationTimeline {
  let startFrame = 0;
  const slides = presentation.slides.map((slide) => {
    const durationInFrames = getSlideDurationInFrames(slide, presentation, audioManifest);
    const timelineSlide = { ...slide, startFrame, durationInFrames };
    startFrame += durationInFrames;
    return timelineSlide;
  });
  return { slides, totalFrames: startFrame };
}
