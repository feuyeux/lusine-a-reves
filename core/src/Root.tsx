import { Composition, Folder, type CalculateMetadataFunction } from "remotion";
import { audioManifest, presentation } from "./content";
import { PresentationVideo } from "./Presentation";
import { AudioManifestSchema, parsePresentation } from "./domain";
import { buildTimeline } from "./timeline";

export type PresentationCompositionProps = {
  presentation: unknown;
  audioManifest: unknown;
};

const defaultProps: PresentationCompositionProps = { presentation, audioManifest };
const timeline = buildTimeline(presentation, audioManifest);

const calculateMetadata: CalculateMetadataFunction<PresentationCompositionProps> = ({ props }) => {
  const normalizedPresentation = parsePresentation(props.presentation);
  const normalizedManifest = AudioManifestSchema.parse(props.audioManifest);
  const normalizedTimeline = buildTimeline(normalizedPresentation, normalizedManifest);
  return {
    durationInFrames: normalizedTimeline.totalFrames,
    fps: normalizedPresentation.fps,
    width: normalizedPresentation.width,
    height: normalizedPresentation.height,
    props: { presentation: normalizedPresentation, audioManifest: normalizedManifest },
  };
};

export const RemotionRoot: React.FC = () => (
  <Folder name="MetaBuilder">
    <Composition
      id="Presentation"
      component={PresentationVideo}
      defaultProps={defaultProps}
      durationInFrames={timeline.totalFrames}
      fps={presentation.fps}
      width={presentation.width}
      height={presentation.height}
      calculateMetadata={calculateMetadata}
    />
  </Folder>
);
