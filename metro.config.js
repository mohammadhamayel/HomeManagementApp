// @ts-check
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Allow phones/tablets on the LAN to reach Metro (pair with `expo start --lan` / `npm start`).
config.server = {
  ...config.server,
  host: "0.0.0.0",
};

module.exports = config;
