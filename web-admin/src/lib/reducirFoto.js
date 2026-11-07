/** Reduce una foto del celular (4-8 MB) a un JPEG de máx. 1600 px antes de subirla. Si falla, devuelve la original. */
export async function reducirFoto(archivo) {
  try {
    const bmp = await createImageBitmap(archivo);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bmp.width * k);
    lienzo.height = Math.round(bmp.height * k);
    lienzo.getContext("2d").drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.82));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : archivo;
  } catch {
    return archivo;
  }
}
