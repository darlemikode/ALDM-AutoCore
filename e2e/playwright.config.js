// Playwright — pruebas de punta a punta del panel web (web-admin) contra el
// backend real, sobre una base de datos de PRUEBAS (nunca la real).
//
// Opción A (recomendada): que Playwright levante todo solo
//   npm run test:levantar
//   → arranca el backend en el puerto 8001 con la base _qa_tmp/e2e.db (se
//     borra en cada corrida) y el panel web (vite) en el 5174 apuntando a él.
//
// Opción B: ya tienes backend + web corriendo sobre una base de pruebas
//   set WEB_URL=http://localhost:5173   (y API_URL=http://localhost:8000/api)
//   set E2E_PASSWORD=<contraseña del usuario admin de ESA base>
//   npm test
const { defineConfig, devices } = require("@playwright/test");
const path = require("path");

const LEVANTAR = process.env.E2E_LEVANTAR === "1";
const RAIZ = path.resolve(__dirname, "..");
const DB = path.join(RAIZ, "_qa_tmp", "e2e.db").replace(/\\/g, "/");
const PYTHON = process.env.E2E_PYTHON || (process.platform === "win32" ? path.join(RAIZ, "backend", "venv", "Scripts", "python.exe") : "python3");

// Base de pruebas limpia en cada corrida (solo en el proceso principal,
// antes de levantar el backend; los workers vuelven a leer este archivo).
if (LEVANTAR && !process.env.E2E_DB_LIMPIA && process.env.TEST_WORKER_INDEX === undefined) {
  const fs = require("fs");
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  for (const f of [DB, `${DB}-journal`]) fs.rmSync(f, { force: true });
  process.env.E2E_DB_LIMPIA = "1";
}

process.env.WEB_URL = process.env.WEB_URL || (LEVANTAR ? "http://localhost:5174" : "http://localhost:5173");
process.env.API_URL = process.env.API_URL || (LEVANTAR ? "http://localhost:8001/api" : "http://localhost:8000/api");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // una sola base SQLite: una prueba a la vez
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "reporte" }]],
  globalSetup: require.resolve("./global-setup.js"),
  use: {
    baseURL: process.env.WEB_URL,
    locale: "es-MX",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // @celular: también se corre en tamaño celular · @solo-celular: únicamente en celular
    { name: "escritorio", use: { ...devices["Desktop Chrome"] }, grepInvert: /@solo-celular/ },
    { name: "celular", use: { ...devices["Pixel 7"] }, grep: /@celular|@solo-celular/ },
  ],
  webServer: LEVANTAR
    ? [
        {
          command: `"${PYTHON}" -m uvicorn app.main:app --port 8001`,
          cwd: path.join(RAIZ, "backend"),
          url: "http://localhost:8001/api/health",
          timeout: 120_000,
          reuseExistingServer: false,
          env: { DATABASE_URL: `sqlite:///${DB}`, ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "admin1234", SECRET_KEY: "e2e-solo-pruebas" },
        },
        {
          command: "npm run dev -- --port 5174 --strictPort",
          cwd: path.join(RAIZ, "web-admin"),
          url: "http://localhost:5174",
          timeout: 120_000,
          reuseExistingServer: false,
          env: { VITE_API_TARGET: "http://localhost:8001" },
        },
      ]
    : undefined,
});
