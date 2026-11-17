import Foundation
import UserNotifications

@MainActor
final class Monitor: ObservableObject {
    @Published var config: Configuracion
    @Published var estados: [String: EstadoEntorno] = [:]
    private var tareas: [String: Task<Void, Never>] = [:]
    private var confirmado: [String: Nivel] = [:]      // último nivel avisado
    private var candidato: [String: (Nivel, Int)] = [:] // cambio pendiente de confirmar (2 lecturas)

    init() {
        config = Configuracion.cargar()
        pedirPermisoNotificaciones()
        arrancar()
    }

    var nivelGeneral: Nivel {
        // Los ambientes sin datos (p. ej. servidores locales apagados) no cuentan para el semáforo
        let niveles = config.entornos.map { estados[$0.nombre]?.nivel ?? .desconocido }.filter { $0 != .desconocido }
        return niveles.max(by: { $0.gravedad < $1.gravedad }) ?? .desconocido
    }

    func arrancar() {
        for t in tareas.values { t.cancel() }
        tareas = [:]
        for e in config.entornos {
            tareas[e.nombre] = Task { [weak self] in
                while !Task.isCancelled {
                    await self?.revisar(e)
                    try? await Task.sleep(nanoseconds: UInt64(max(5, e.cadaSegundos)) * 1_000_000_000)
                }
            }
        }
    }

    func recargarConfig() {
        config = Configuracion.cargar()
        arrancar()
    }

    func alternarBD(_ nombre: String) {
        guard let i = config.entornos.firstIndex(where: { $0.nombre == nombre }) else { return }
        config.entornos[i].revisarBD.toggle()
        config.guardar()
        arrancar()
    }

    func revisarYa() {
        for e in config.entornos { Task { await revisar(e) } }
    }

    private func revisar(_ e: EntornoRemoto) async {
        guard var comps = URLComponents(string: e.url + "/api/salud") else { return }
        comps.queryItems = [URLQueryItem(name: "bd", value: e.revisarBD ? "1" : "0")]
        guard let url = comps.url else { return }
        var req = URLRequest(url: url)
        req.timeoutInterval = 15
        req.cachePolicy = .reloadIgnoringLocalCacheData
        if !e.clave.isEmpty { req.setValue(e.clave, forHTTPHeaderField: "X-Salud-Key") }

        var r = EstadoEntorno()
        let anterior = estados[e.nombre]
        r.historial = anterior?.historial ?? []
        let t0 = Date()
        do {
            let (datos, resp) = try await URLSession.shared.data(for: req)
            let ms = Int(Date().timeIntervalSince(t0) * 1000)
            let codigo = (resp as? HTTPURLResponse)?.statusCode ?? 0
            r.ms = ms
            r.ultima = Date()
            if codigo == 200, let j = try? JSONSerialization.jsonObject(with: datos) as? [String: Any] {
                let est = (j["estado"] as? String) ?? "ok"
                r.nivel = Nivel(rawValue: est) ?? .ok
                r.version = j["version"] as? String
                if let api = j["api"] as? [String: Any] {
                    let n = api["req_5m"] as? Int ?? 0
                    let err = api["err5xx_5m"] as? Int ?? 0
                    let p95 = api["p95_ms"] as? Int ?? 0
                    r.apiTexto = "\(n) peticiones/5 min · \(err) errores 5xx · p95 \(p95) ms"
                }
                if let bd = j["bd"] as? [String: Any] {
                    let ok = bd["ok"] as? Bool ?? false
                    r.bdTexto = ok ? "Base OK · \(bd["ms"] as? Int ?? 0) ms" : "Base CAÍDA"
                } else {
                    r.bdTexto = "Base sin revisar"
                }
                if let errs = j["errores_15m"] as? Int, errs > 0 { r.bdTexto = (r.bdTexto ?? "") + " · \(errs) errores 15 min" }
                r.detalle = r.nivel.texto
            } else if codigo == 404 || codigo == 401 || codigo == 403 {
                // El servidor responde pero /api/salud no está disponible: se revisa solo que viva
                r.nivel = .ok
                r.detalle = "Responde (sin /api/salud: falta SALUD_KEY o clave)"
            } else if codigo >= 500 {
                r.nivel = .caido
                r.detalle = "HTTP \(codigo)"
            } else {
                r.nivel = .degradado
                r.detalle = "HTTP \(codigo)"
            }
        } catch {
            if e.esLocal {
                r.nivel = .desconocido
                r.detalle = "Detenido"
            } else {
                r.nivel = .caido
                r.detalle = (error as NSError).localizedDescription
            }
        }
        r.historial.append(Muestra(fecha: Date(), ms: r.ms, nivel: r.nivel))
        if r.historial.count > 60 { r.historial.removeFirst(r.historial.count - 60) }
        estados[e.nombre] = r
        evaluarAviso(e.nombre, r)
    }

    /// Avisa solo si el cambio se confirma en 2 lecturas seguidas (evita falsas alarmas).
    private func evaluarAviso(_ nombre: String, _ r: EstadoEntorno) {
        if r.nivel == .desconocido { confirmado[nombre] = nil; candidato[nombre] = nil; return }
        guard let base = confirmado[nombre] else { confirmado[nombre] = r.nivel; return }
        if r.nivel == base { candidato[nombre] = nil; return }
        let (nivelC, veces) = candidato[nombre] ?? (r.nivel, 0)
        if nivelC != r.nivel { candidato[nombre] = (r.nivel, 1); return }
        if veces + 1 < 2 { candidato[nombre] = (nivelC, veces + 1); return }
        candidato[nombre] = nil
        confirmado[nombre] = r.nivel
        let titulo = r.nivel == .ok ? "\(nombre) recuperado" : "\(nombre): \(r.nivel.texto)"
        notificar(titulo, r.detalle)
    }

    private func pedirPermisoNotificaciones() {
        guard Bundle.main.bundleIdentifier != nil else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func notificar(_ titulo: String, _ cuerpo: String) {
        guard Bundle.main.bundleIdentifier != nil else { return }
        let c = UNMutableNotificationContent()
        c.title = titulo
        c.body = cuerpo
        c.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
    }
}
