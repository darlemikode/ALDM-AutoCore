"""Métricas reales de usuarios (RUM): la web manda LCP, CLS, INP y tiempos de carga con sendBeacon.
Se guardan en el log del servidor (nombre «rum») para verlas en Azure Log Analytics / Application Insights."""
import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ..rate_limit import limiter

router = APIRouter(prefix="/metricas-web", tags=["Métricas web"])
log = logging.getLogger("rum")


class MetricasIn(BaseModel):
    ruta: str = Field("", max_length=120)
    red: str = Field("", max_length=12)
    lcp: int = Field(0, ge=0, le=600000)
    cls: float = Field(0, ge=0, le=100)
    inp: int = Field(0, ge=0, le=600000)
    ttfb: int = Field(0, ge=0, le=600000)
    carga: int = Field(0, ge=0, le=600000)


@router.post("", status_code=204)
@limiter.limit("60/minute")
async def recibir(request: Request, datos: MetricasIn):
    log.info("rum ruta=%s red=%s lcp=%s cls=%s inp=%s ttfb=%s carga=%s", datos.ruta, datos.red, datos.lcp, datos.cls, datos.inp, datos.ttfb, datos.carga)
