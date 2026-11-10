"""Enmascara datos personales en las listas del súper administrador: el dato
completo solo se ve al abrir el detalle (y queda en la bitácora de accesos)."""


def correo(valor):
    if not valor or "@" not in valor:
        return valor
    local, dominio = valor.rsplit("@", 1)
    return f"{local[:2] if len(local) > 2 else local[:1]}•••@{dominio}"


def telefono(valor):
    if not valor:
        return valor
    digitos = "".join(c for c in valor if c.isdigit())
    return f"•••••• {digitos[-4:]}" if len(digitos) >= 4 else "••••"


def usuario(valor):
    """El nombre de usuario solo se oculta si es un correo."""
    return correo(valor) if valor and "@" in valor else valor
