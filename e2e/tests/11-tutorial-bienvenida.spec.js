// Tutorial 1 · recorrido de bienvenida: aparece la primera vez, el globo nunca
// tapa lo iluminado, se recuerda por usuario y se repite desde Configuración → Ayuda.
const { test, expect } = require("@playwright/test");
const { apiComo, crearTallerConAdmin, entrar } = require("./helpers");

async function revisarPasos(page) {
  const vistos = [];
  for (let n = 0; n < 12; n++) {
    const globo = page.locator(".tour-globo");
    await expect(globo).toBeVisible();
    await page.waitForTimeout(450); // termina de ubicarse
    const g = await globo.boundingBox();
    const vp = page.viewportSize();
    // Dentro de la pantalla
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeGreaterThanOrEqual(0);
    expect(g.x + g.width).toBeLessThanOrEqual(vp.width + 1);
    expect(g.y + g.height).toBeLessThanOrEqual(vp.height + 1);
    // Sin encimarse con lo iluminado
    const foco = page.locator(".tour-foco");
    if (await foco.count()) {
      const f = await foco.boundingBox();
      const encima = !(g.x + g.width <= f.x || f.x + f.width <= g.x || g.y + g.height <= f.y || f.y + f.height <= g.y);
      expect(encima, `el globo tapa lo iluminado en "${await page.locator(".tour-titulo").textContent()}"`).toBeFalsy();
    }
    vistos.push(await page.locator(".tour-titulo").textContent());
    const boton = page.locator(".tour-nav .btn-primary");
    const texto = await boton.textContent();
    await boton.click();
    if (texto.includes("Terminar")) break;
  }
  return vistos;
}

test("bienvenida: aparece una vez, no tapa nada y se repite desde Ayuda @celular", async ({ page }) => {
  const sa = await apiComo();
  const T = await crearTallerConAdmin(sa);
  await entrar(page, T.usuario, T.password, { conTutoriales: true });
  await expect(page.locator(".tour-globo")).toBeVisible({ timeout: 8000 });
  const vistos = await revisarPasos(page);
  expect(vistos.length).toBeGreaterThanOrEqual(5);
  await expect(page.locator(".tour-capa")).toHaveCount(0);
  // Ya visto: al recargar no vuelve a salir
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.locator(".tour-capa")).toHaveCount(0);
  // «?» lleva a Configuración → Ayuda, desglosada por módulo
  await page.locator(".ayuda-flotante").click();
  await expect(page).toHaveURL(/\/configuracion#ayuda$/);
  const ayuda = page.locator("#ayuda");
  await expect(ayuda).toBeInViewport();
  expect(await ayuda.locator(".ayuda-modulo").count()).toBeGreaterThanOrEqual(5);
  await expect(ayuda.locator(".ayuda-pronto").first()).toBeVisible();
  const item = ayuda.locator(".ayuda-item", { hasText: "Recorrido de bienvenida" });
  await expect(item.locator(".ayuda-visto")).toBeVisible();
  // «Ver» regresa al panel y abre el recorrido; Esc lo cierra
  await item.locator(".ayuda-ver").click();
  await expect(page.locator(".tour-globo")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour-capa")).toHaveCount(0);
  await sa.cerrar();
});
