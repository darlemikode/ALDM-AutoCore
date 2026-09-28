# Estructura de tablas — Sistema Mecánico

Sacado directamente de `backend/app/models.py` (fuente de verdad). Marca aquí mismo qué campo agregar (➕) o quitar (➖) en cada tabla, y lo aplico.

**Leyenda:** *oblig.* = obligatorio · *opc.* = opcional · FK = llave foránea a otra tabla

---

## Autenticación

### `usuarios`
| Campo | Tipo | Oblig/Opc | Notas |
|---|---|---|---|
| id_usuario | entero | — | llave primaria |
| username | texto(50) | oblig. | único |
| hashed_password | texto | oblig. | nunca se guarda en texto plano |
| nombre_completo | texto(150) | oblig. | |
| rol | texto(20) | oblig. | "admin" o "tecnico" |
| activo | booleano | — | default: true |
| telefono | texto(20) | opc. | para recuperar contraseña |
| correo | texto(120) | opc. | para recuperar contraseña |

### `solicitudes_recuperacion`
| Campo | Tipo | Oblig/Opc | Notas |
|---|---|---|---|
| id_solicitud | entero | — | llave primaria |
| id_usuario | entero (FK→usuarios) | oblig. | |
| identificador_usado | texto(120) | oblig. | lo que la persona escribió |
| fecha_solicitud | fecha/hora | — | automática |
| atendida | booleano | — | default: false |
| fecha_atencion | fecha/hora | opc. | |
| atendida_por | texto(50) | opc. | username del admin |

---

## Catálogos geográficos

### `paises`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_pais | entero | — |
| nombre_pais | texto(100) | oblig. |
| activo | booleano | — |

### `estados`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_estado | entero | — |
| nombre_estado | texto(100) | oblig. |
| id_pais | FK→paises | oblig. |
| activo | booleano | — |

### `ciudades`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_ciudad | entero | — |
| nombre_ciudad | texto(100) | oblig. |
| id_estado | FK→estados | oblig. |
| activo | booleano | — |

---

## Catálogos de vehículos / refacciones / herramientas

### `colores_vehiculos`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_color | entero | — |
| nombre_color | texto(50) | oblig. |

### `vehiculos_marcas`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_marca_vehiculo | entero | — |
| nombre_marca | texto(80) | oblig. |
| comentarios | texto largo | opc. |

### `vehiculos_modelos`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_modelo_vehiculo | entero | — |
| id_marca_vehiculo | FK→vehiculos_marcas | oblig. |
| nombre_modelo | texto(80) | oblig. |
| comentario | texto largo | opc. |

### `refacciones_marcas`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_marca_refaccion | entero | — |
| nombre_marca | texto(80) | oblig. |
| comentarios | texto largo | opc. |

### `herramientas_marcas`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_herramienta_marca | entero | — |
| nombre_marca | texto(80) | oblig. |
| comentario | texto largo | opc. |

### `tipos_servicio`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_tipo_servicio | entero | — |
| nombre_tipo | texto(100) | oblig. |

---

## Clientes / Vehículos

### `clientes`
| Campo | Tipo | Oblig/Opc | Notas |
|---|---|---|---|
| id_cliente | entero | — | llave primaria |
| numero_cuenta | texto(20) | — | autogenerado, único (CTE-000001) |
| nombre_cliente | texto(80) | oblig. | |
| paterno_cliente | texto(80) | opc. | |
| materno_cliente | texto(80) | opc. | |
| calle_cliente | texto(120) | opc. | |
| numexterior_cliente | texto(20) | opc. | |
| numinterior_cliente | texto(20) | opc. | |
| colonia_cliente | texto(100) | opc. | |
| cp_cliente | texto(10) | opc. | |
| telefono1 | texto(20) | opc. | |
| telefono2 | texto(20) | opc. | |
| id_ciudad | FK→ciudades | opc. | |
| id_estado | FK→estados | opc. | |
| id_pais | FK→paises | opc. | |
| empresa_cliente | texto(120) | opc. | |
| rfc_cliente | texto(20) | opc. | |
| correo_cliente | texto(120) | opc. | |
| comentarios | texto largo | opc. | |
| status_cliente | entero | — | 1 activo / 0 inactivo (baja lógica) |

> ⚠️ **Nota:** la maqueta móvil usa un solo campo "nombre" (nombre completo junto) y no tiene aún ciudad/estado/país ni apellidos por separado. El backend real sí los soporta — si quieres que la maqueta empate 100%, dímelo.

### `vehiculos`
| Campo | Tipo | Oblig/Opc | Notas |
|---|---|---|---|
| id_vehiculo | entero | — | llave primaria |
| numero_cuenta | texto(30) | — | autogenerado, único (CTE-000001-01) |
| id_modelo_vehiculo | FK→vehiculos_modelos | opc. | |
| id_marca_vehiculo | FK→vehiculos_marcas | opc. | |
| id_cliente | FK→clientes | oblig. | no se puede reasignar después de creado |
| numserie_vehiculo | texto(50) | opc. | VIN, único si se captura |
| placas_vehiculo | texto(20) | opc. | |
| id_color | FK→colores_vehiculos | opc. | |
| cilindraje_vehiculo | texto(20) | opc. | |
| id_year_vehiculo | texto(10) | opc. | año |
| km_vehiculo | texto(20) | opc. | |
| comentarios | texto largo | opc. | |

---

## Proveedores / Refacciones / Herramientas (inventario)

### `proveedores`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_proveedor | entero | — |
| nombre_proveedor | texto(120) | oblig. |
| calle_proveedor | texto(120) | opc. |
| numexterior_proveedor | texto(20) | opc. |
| numinterior_proveedor | texto(20) | opc. |
| colonia_proveedor | texto(100) | opc. |
| telefono1_proveedor | texto(20) | opc. |
| telefono2_proveedor | texto(20) | opc. |
| correo_proveedor | texto(120) | opc. |
| empresa_proveedor | texto(120) | opc. |
| rfc_proveedor | texto(20) | opc. |

### `proveedor_productos`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_producto_proveedor | entero | — |
| id_proveedor | FK→proveedores | oblig. |
| nombre_producto | texto(120) | oblig. |
| id_marca_refaccion | FK→refacciones_marcas | opc. |
| comentario | texto largo | opc. |

### `refacciones`
| Campo | Tipo | Oblig/Opc | Notas |
|---|---|---|---|
| id_refaccion | entero | — | |
| id_marca_refaccion | FK→refacciones_marcas | opc. | |
| id_proveedor | FK→proveedores | opc. | |
| nombre_refaccion | texto(150) | oblig. | |
| numero_refaccion | texto(60) | opc. | número de parte |
| preciopropio_refaccion | decimal | — | precio de costo |
| preciocliente_refaccion | decimal | — | precio de venta |
| cantidad_refaccion | entero | — | stock |
| fecha_refaccion | fecha | — | automática al crear |

### `proveedor_deuda`
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_deuda | entero | — |
| id_proveedor | FK→proveedores | oblig. |
| id_producto_proveedor | FK→proveedor_productos | opc. |
| monto_total | decimal | — |
| saldo_total | decimal | — |
| cantidad_producto | entero | — |
| comentario | texto largo | opc. |
| fecha | fecha | — |

### `herramientas_inventario`
| Campo | Tipo | Oblig/Opc | Notas |
|---|---|---|---|
| id_herramienta | entero | — | |
| id_herramienta_marca | FK→herramientas_marcas | opc. | |
| nombre_herramienta | texto(120) | oblig. | |
| medida_herramienta | texto(50) | opc. | |
| cantidad_herramienta | entero | — | |
| factura_herramienta | texto(60) | opc. | |
| modelo_herramienta | texto(60) | opc. | |
| foto_herramienta | texto(255) | opc. | ruta de imagen — **sin subida de foto implementada aún** |
| costo_herramienta | decimal | — | |
| comentario | texto largo | opc. | |

---

## Servicios (órdenes de trabajo)

### `servicios`
| Campo | Tipo | Oblig/Opc | Notas |
|---|---|---|---|
| id_servicio | entero | — | |
| id_cliente | FK→clientes | oblig. | |
| id_vehiculo | FK→vehiculos | oblig. | |
| nombre_servicio | texto(150) | oblig. | descripción |
| km_llegada | texto(20) | opc. | |
| km_proximo_servicio | texto(20) | opc. | |
| fecha_entrada_servicio | fecha/hora | — | automática |
| fecha_salida_servicio | fecha/hora | opc. | se llena al cerrar |
| status | texto(20) | — | abierto / cerrado / cancelado |
| pagado | booleano | — | se calcula solo (saldo ≤ 0) |
| iva_porcentaje | decimal | — | default 16.0 |

> ⚠️ **Nota:** aquí no existen todavía campos de "diagnóstico", "tipo de mantenimiento" ni "operaciones" ni el check de autorización que agregamos en la maqueta — esos campos están en la maqueta pero **aún no en el backend real**. Si quieres que la orden de servicio real los guarde, hay que agregarlos a esta tabla.

### `servicios_detalles` (conceptos: mano de obra / refacción / extra)
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_servicio_detalle | entero | — |
| id_servicio | FK→servicios | oblig. |
| id_tipo_servicio | FK→tipos_servicio | opc. |
| id_refaccion | FK→refacciones | opc. |
| descripcion | texto(255) | opc. |
| cantidad | entero | — | default 1 |
| costo_mano_obra | decimal | — |
| costo_refaccion | decimal | — |
| costo_extra | decimal | — |
| fecha_detalle | fecha/hora | — |

### `servicios_abonos` (pagos parciales)
| Campo | Tipo | Oblig/Opc |
|---|---|---|
| id_abono | entero | — |
| id_servicio | FK→servicios | oblig. |
| numero_abono | entero | oblig. |
| monto_abono | decimal | oblig. |
| fecha_pago | fecha/hora | — |
| comentario | texto largo | opc. |

---

## Resumen de brechas conocidas (maqueta móvil vs. backend real)

1. **Clientes**: la maqueta usa un solo campo de nombre; el backend separa nombre/paterno/materno y tiene ciudad/estado/país.
2. **Servicios**: diagnóstico, tipo de mantenimiento, operaciones y autorización del cliente existen en la maqueta pero **no en el backend real todavía**.
3. **Herramientas**: `foto_herramienta` existe en el backend pero no hay subida de imagen implementada en ningún lado.
4. **Proveedor_productos** y **proveedor_deuda** no están representados como submódulos en la maqueta (solo el proveedor en sí).
