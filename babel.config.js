module.exports = function (api) {
  api.cache(true);
  return {
    // require.resolve fixes Metro transform workers that cannot resolve preset by short name
    presets: [require.resolve("babel-preset-expo")],
    plugins: [require.resolve("react-native-reanimated/plugin")],
  };
};
