const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build imports `wa-sqlite.wasm` directly. Add wasm
// to Metro's assetExts so the file is resolved as a static asset
// instead of bombing the bundle. Native platforms ignore this — they
// use the native SQLite bridge and never touch the wasm path.
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

module.exports = withNativeWind(config, { input: "./global.css", inlineRem: false });
