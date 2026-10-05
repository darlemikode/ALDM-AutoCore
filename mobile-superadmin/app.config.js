// Por defecto la app usa lo de app.json (Azure). Si se define API_URL (lo hacen los
// .bat de DEV), apunta al backend local de tu PC. Los builds de EAS no heredan variables
// del shell, asi que compilar-apk-*-dev.bat escribe api-dev.json (y lo borra al terminar).
// Sin ese archivo los APK siguen apuntando a Azure.
const fs = require("fs");
const path = require("path");
module.exports = ({ config }) => {
  let api = process.env.API_URL;
  let ws = process.env.WS_URL;
  try {
    const f = JSON.parse(fs.readFileSync(path.join(__dirname, "api-dev.json"), "utf8"));
    api = api || f.apiUrl; ws = ws || f.wsUrl;
  } catch (e) { /* sin archivo = Azure */ }
  if (!api) return config;
  return { ...config, extra: { ...config.extra, apiUrl: api, wsUrl: ws || config.extra?.wsUrl } };
};
