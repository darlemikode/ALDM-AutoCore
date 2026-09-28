# ALDM Súper Admin

App para administrar TODOS los talleres de ALDM AutoCore: estadísticas,
talleres (alta, suscripción, pagos/renovaciones, suspender/reactivar, QR),
paquetes y módulos, tipos de cobro, reglas de días (prueba, gracia,
conservación) y a qué talleres entra cada usuario.

Solo pueden entrar usuarios con `es_superadmin` (el `admin` original ya lo es).

## Arrancar

```
cd mobile-superadmin
npm install
npx expo start
```

La dirección del servidor se toma de `app.json` → `expo.extra.apiUrl`, o se
cambia desde la pantalla de inicio de sesión ("Cambiar servidor").
