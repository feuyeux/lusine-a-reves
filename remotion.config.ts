import { Config } from "@remotion/cli/config";

// Remotion 4+ defaults to rspack via this flag (the legacy webpack path is
// still available via setOverrideWebpackConfig). @rspack/core ships as a
// transitive dependency of @remotion/cli so no extra install is required.
Config.setRspack(true);
// PNG avoids an intermediate JPEG generation loss on small slide text.
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setPublicDir("example/public");
