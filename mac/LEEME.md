# Scripts para Mac

Equivalentes de los `.bat` de Windows. Haz doble clic en el `.command` o corre `./mac/nombre.command`.

**Una sola vez** (el permiso de ejecución no viaja por la herramienta de archivos):

```
cd ~/Documents/sistema-mecanico
chmod +x mac/*.command
```

Requisitos: Homebrew (https://brew.sh), `brew install python@3.12 node`. Las apps móviles de prueba usan Expo Go; para compilar APK necesitas `eas login`.

| Windows | Mac |
|---|---|
| correr-dev.bat | mac/correr-dev.command |
| correr-dev-azure-db.bat | mac/correr-dev-azure-db.command (requiere `backend/.env.azure` y `brew install unixodbc`) |
| probar-app-(taller\|cliente\|superadmin)-(dev\|azure).bat | mac/probar-app-…command |
| compilar-apk-(taller\|cliente\|superadmin)[-dev].bat | mac/compilar-apk-…command |
| probar-web-remoto.bat / ver-pagina-celular.bat | mac/probar-web-remoto.command / mac/ver-pagina-celular.command (instalan `cloudflared` con brew) |
| ver-pagina-web.bat | mac/ver-pagina-web.command |

`backend/.env` se crea solo desde `.env.example` si no existe. Los `.env` reales no se suben a git.
