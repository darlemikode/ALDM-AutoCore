"""
Carga el catálogo de códigos postales (CSV) a la tabla `codigos_postales`.

Uso:
    python -m app.seed_codigos_postales

Por ahora el CSV incluido (`app/data/codigos_postales_leon.csv`) es solo la
prueba piloto de León, Guanajuato (1,277 registros). Para cargar el catálogo
nacional completo de Sepomex más adelante:
  1. Reemplaza ese archivo por el CSV completo (mismas columnas: cp,
     asentamiento, tipo_asentamiento, municipio, estado, ciudad, zona).
  2. Vuelve a correr este script — primero borra lo ya cargado para no
     duplicar (ver `--reemplazar` abajo).
"""
import csv
import os
import sys

from .database import Base, engine, SessionLocal
from . import models

ARCHIVO_CSV = os.path.join(os.path.dirname(__file__), "data", "codigos_postales_leon.csv")


def run(reemplazar: bool = False):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existentes = db.query(models.CodigoPostal).count()
        if existentes > 0 and not reemplazar:
            print(f"Ya hay {existentes} registros cargados. Usa --reemplazar para volver a cargar desde cero.")
            return

        if existentes > 0 and reemplazar:
            db.query(models.CodigoPostal).delete()
            db.commit()
            print(f"Se borraron {existentes} registros previos.")

        if not os.path.exists(ARCHIVO_CSV):
            print(f"No se encontró el archivo {ARCHIVO_CSV}")
            return

        lote = []
        total = 0
        with open(ARCHIVO_CSV, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for fila in reader:
                lote.append(models.CodigoPostal(
                    cp=fila["cp"],
                    asentamiento=fila["asentamiento"],
                    tipo_asentamiento=fila.get("tipo_asentamiento") or None,
                    municipio=fila.get("municipio") or None,
                    estado=fila.get("estado") or None,
                    ciudad=fila.get("ciudad") or None,
                    zona=fila.get("zona") or None,
                ))
                if len(lote) >= 1000:
                    db.bulk_save_objects(lote)
                    db.commit()
                    total += len(lote)
                    lote = []
            if lote:
                db.bulk_save_objects(lote)
                db.commit()
                total += len(lote)

        print(f"Listo: se cargaron {total} códigos postales.")
    finally:
        db.close()


if __name__ == "__main__":
    run(reemplazar="--reemplazar" in sys.argv)
