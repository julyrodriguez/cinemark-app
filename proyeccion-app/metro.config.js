// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");

const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("xlsx");
config.resolver.assetExts.push("xls");

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  canvas: path.resolve(__dirname, "lib/programacion/mocks/canvasMock.js"),
};

module.exports = config;