import rawPresentation from "../../example/content/presentation.json";
import rawAudioManifest from "../../example/content/audio-manifest.json";
import { parsePresentation, AudioManifestSchema } from "./domain";

/*
 * The bundled example is the Studio default only. To preview your own topic,
 * use `npm run dev -- --presentation <path> --manifest <path> --public-dir <path>`;
 * core/scripts/studio.mjs forwards it as Remotion input props, so no Node-only
 * API is needed inside this browser-bundled module.
 */
export const presentation = parsePresentation(rawPresentation);
export const audioManifest = AudioManifestSchema.parse(rawAudioManifest);
