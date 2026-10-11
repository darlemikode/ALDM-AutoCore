@echo off
REM Vista previa de la PAGINA DE PUBLICIDAD (sitio-web) tal como quedaria en el dominio.
REM Solo levanta un servidor local de archivos en http://localhost:8080 . No toca Azure.
REM Nota: el formulario "Quiero una demo" envia a app.aldmautocore.com; desde localhost
REM ese envio no esta permitido (CORS), asi que aqui solo se revisa el diseno.
cd /d %~dp0sitio-web
set PY=
if exist "%~dp0backend\venv\Scripts\python.exe" set PY="%~dp0backend\venv\Scripts\python.exe"
if not defined PY (
  where python >nul 2>&1 && set PY=python
)
if not defined PY (
  echo No se encontro Python. Instala Python o crea backend\venv con correr-dev.bat.
  pause
  exit /b
)
echo.
echo Pagina en: http://localhost:8080
echo Para ver otra vez la animacion de bienvenida abre una ventana de incognito
echo (la escena se muestra una vez por sesion del navegador).
echo Cierra esta ventana para apagar el servidor.
echo.
start "" http://localhost:8080/index.html
%PY% -m http.server 8080 --bind 127.0.0.1
pause
