# Cómo activar estos archivos (la carpeta .github está protegida para mí)

Desde la raíz del repo (cmd):

```
copy /Y docs\seguridad\github\dependabot.yml .github\dependabot.yml
copy /Y docs\seguridad\github\CODEOWNERS .github\CODEOWNERS
copy /Y docs\seguridad\github\workflows\seguridad.yml .github\workflows\seguridad.yml
copy /Y docs\seguridad\github\workflows\desplegar-azure.yml .github\workflows\desplegar-azure.yml
```

Antes: crear en GitHub el entorno **produccion** (Settings → Environments → New) y agregarte como *Required reviewer*; si no, el despliegue se queda esperando.
Edita CODEOWNERS y cambia TU_USUARIO_GITHUB.
