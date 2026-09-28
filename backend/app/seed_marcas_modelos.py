"""
Carga el catálogo real de marcas y modelos de vehículo a las tablas
`vehiculos_marcas` / `vehiculos_modelos`.

Uso:
    python -m app.seed_marcas_modelos

Fuente: archivos marcas.xls / modelos.xls proporcionados (79 marcas,
1008 modelos, relacionados por id_marca → id de marca). Se guardan como
CSV en app/data/ para no depender del formato .xls original.
"""
import csv
import os
import sys

from .database import Base, engine, SessionLocal
from . import models

ARCHIVO_MARCAS = os.path.join(os.path.dirname(__file__), "data", "vehiculos_marcas.csv")
ARCHIVO_MODELOS = os.path.join(os.path.dirname(__file__), "data", "vehiculos_modelos.csv")


def run(reemplazar: bool = False):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existentes = db.query(models.VehiculoMarca).count()
        if existentes > 0 and not reemplazar:
            print(f"Ya hay {existentes} marcas cargadas. Usa --reemplazar para volver a cargar desde cero.")
            return

        if existentes > 0 and reemplazar:
            db.query(models.VehiculoModelo).delete()
            db.query(models.VehiculoMarca).delete()
            db.commit()
            print("Se borraron las marcas/modelos previos.")

        if not os.path.exists(ARCHIVO_MARCAS) or not os.path.exists(ARCHIVO_MODELOS):
            print("No se encontraron los archivos de marcas/modelos en app/data/")
            return

        # id original del archivo -> id_marca_vehiculo real ya asignado por
        # la base de datos (por si algún día no coinciden 1 a 1)
        mapa_ids = {}

        with open(ARCHIVO_MARCAS, encoding="utf-8-sig") as f:
            for fila in csv.DictReader(f):
                marca = models.VehiculoMarca(nombre_marca=fila["Nombre"])
                db.add(marca)
                db.flush()
                mapa_ids[fila["id"]] = marca.id_marca_vehiculo
        db.commit()

        total_modelos = 0
        lote = []
        with open(ARCHIVO_MODELOS, encoding="utf-8-sig") as f:
            for fila in csv.DictReader(f):
                id_marca_real = mapa_ids.get(fila["id_marca"])
                if not id_marca_real:
                    continue
                lote.append(models.VehiculoModelo(id_marca_vehiculo=id_marca_real, nombre_modelo=fila["Nombre"]))
                if len(lote) >= 500:
                    db.bulk_save_objects(lote)
                    db.commit()
                    total_modelos += len(lote)
                    lote = []
            if lote:
                db.bulk_save_objects(lote)
                db.commit()
                total_modelos += len(lote)

        print(f"Listo: {len(mapa_ids)} marcas y {total_modelos} modelos cargados.")
    finally:
        db.close()


if __name__ == "__main__":
    run(reemplazar="--reemplazar" in sys.argv)
