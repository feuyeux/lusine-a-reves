import rawPresentation from "../content/presentation.json";
import rawAudioManifest from "../content/audio-manifest.json";
import { parsePresentation, AudioManifestSchema } from "./domain";

export const presentation = parsePresentation(rawPresentation);
export const audioManifest = AudioManifestSchema.parse(rawAudioManifest);
