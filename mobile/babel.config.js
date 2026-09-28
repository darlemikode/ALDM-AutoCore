module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Requerido por react-native-reanimated (usa el drawer lateral) — debe
    // ir siempre al final de la lista de plugins.
    plugins: ["react-native-reanimated/plugin"],
  };
};
