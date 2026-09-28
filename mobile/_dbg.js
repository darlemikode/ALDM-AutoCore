process.env.EXPO_NO_TELEMETRY = "1";
(async () => {
  try {
    const { getDefaultConfig } = require("@expo/metro-config");
    const config = await getDefaultConfig(process.cwd());
    const Transformer = require("metro/src/DeltaBundler/Transformer").default;
    const t = new Transformer(config, { getOrComputeSha1: async () => "x" });
    console.log("Transformer constructed OK");
  } catch (e) {
    console.log("REAL ERROR:", e && e.stack || e);
  }
})();
