import Foundation
import SwiftUI
import AppKit
import UserNotifications

/// Recursos de Azure que se vigilan con la CLI `az` (usa tu sesión de `az login`; el panel no guarda credenciales).
struct ConfigAzure: Codable, Equatable {
    var grupo: String
    var app: String
    var servidorSQL: String
    var baseSQL: String
    var cadaSegundos: Int
    var alertaCPU: Double
    var alertaMemoria: Double

    static var porDefecto: ConfigAzure {
        ConfigAzure(grupo: "ALDM_AutoCore_GrpRs", app: "aldm-autocore-app",
                    servidorSQL: "aldm-autocore-sqlsr", baseSQL: "ALDM_AutoCore_DB",
                    cadaSegundos: 300, alertaCPU: 80, alertaMemoria: 85)
    }
}

struct Serie: Identifiable {
    let id: String
    let titulo: String
    let unidad: String
    let valores: [Double]
    let alerta: Double?      // umbral a partir del cual se pinta en amarillo
    var actual: Double { valores.last ?? 0 }
    var pico: Double { valores.max() ?? 0 }
    var enAlerta: Bool { alerta.map { pico >= $0 } ?? false }
}

@MainActor
final class Azure: ObservableObject {
    @Published var mensaje = "Consultando Azure…"
    @Published var estadoApp = "—"
    @Published var estadoBD = "—"
    @Published var nivelApp: Nivel = .desconocido
    @Published var nivelBD: Nivel = .desconocido
    @Published var series: [Serie] = []
    @Published var ultima: Date? = nil
    @Published var nivel: Nivel = .desconocido
    @Published var cargando = false
    private var idApp = ""
    private var tarea: Task<Void, Never>?
    private var nivelAvisado: Nivel?

    init() { arrancar() }

    func arrancar() {
        tarea?.cancel()
        tarea = Task { [weak self] in
            while !Task.isCancelled {
                await self?.revisar()
                let s = (Configuracion.cargar().azure ?? .porDefecto).cadaSegundos
                try? await Task.sleep(nanoseconds: UInt64(max(60, s)) * 1_000_000_000)
            }
        }
    }

    func abrirPortal() {
        let destino = idApp.isEmpty ? "https://portal.azure.com" : "https://portal.azure.com/#resource\(idApp)/overview"
        if let u = URL(string: destino) { NSWorkspace.shared.open(u) }
    }

    /// Ejecuta un comando en un shell de login, fuera del hilo principal. Devuelve (código de salida, salida estándar).
    nonisolated static func shell(_ comando: String) async -> (Int32, String) {
        await Task.detached(priority: .utility) { () -> (Int32, String) in
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/bin/zsh")
            p.arguments = ["-lc", comando]
            let salida = Pipe()
            p.standardOutput = salida
            p.standardError = FileHandle.nullDevice
            do { try p.run() } catch { return (-1, "") }
            let datos = salida.fileHandleForReading.readDataToEndOfFile()
            p.waitUntilExit()
            return (p.terminationStatus, String(data: datos, encoding: .utf8) ?? "")
        }.value
    }

    nonisolated static func objeto(_ texto: String) -> [String: Any] {
        guard let d = texto.data(using: .utf8),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return [:] }
        return j
    }

    /// Extrae de `az monitor metrics list` los valores de cada métrica (se omiten los minutos aún sin dato).
    nonisolated static func metricas(_ texto: String, campo: String) -> [String: [Double]] {
        guard let lista = objeto(texto)["value"] as? [[String: Any]] else { return [:] }
        var r: [String: [Double]] = [:]
        for m in lista {
            let nombre = ((m["name"] as? [String: Any])?["value"] as? String) ?? ""
            let datos = ((m["timeseries"] as? [[String: Any]])?.first?["data"] as? [[String: Any]]) ?? []
            r[nombre] = datos.compactMap { ($0[campo] as? NSNumber)?.doubleValue }
        }
        return r
    }

    private func consultar(_ id: String, _ nombres: String, _ agregacion: String) async -> [String: [Double]] {
        let campo = agregacion.lowercased()
        let (_, txt) = await Azure.shell("az monitor metrics list --resource '\(id)' --metrics \(nombres) --aggregation \(agregacion) --interval PT1M --offset 1h -o json")
        return Azure.metricas(txt, campo: campo)
    }

    func revisar() async {
        let c = Configuracion.cargar().azure ?? .porDefecto
        cargando = true
        defer { cargando = false }

        if await Azure.shell("command -v az").0 != 0 {
            mensaje = "Falta la CLI de Azure:  brew install azure-cli  y luego  az login"
            nivel = .desconocido
            return
        }
        if await Azure.shell("az account show -o none").0 != 0 {
            mensaje = "Sin sesión de Azure: ejecuta  az login  en Terminal"
            nivel = .desconocido
            return
        }

        // Estado de los recursos (plano de control: no despierta la base ni genera cobro)
        let app = Azure.objeto(await Azure.shell("az webapp show -g '\(c.grupo)' -n '\(c.app)' --query '{id:id,estado:state,plan:appServicePlanId}' -o json").1)
        let bd = Azure.objeto(await Azure.shell("az sql db show -g '\(c.grupo)' -s '\(c.servidorSQL)' -n '\(c.baseSQL)' --query '{id:id,estado:status}' -o json").1)
        idApp = app["id"] as? String ?? ""
        let idPlan = app["plan"] as? String ?? ""
        let idBD = bd["id"] as? String ?? ""

        let eApp = app["estado"] as? String ?? ""
        estadoApp = eApp.isEmpty ? "No encontrado" : (eApp == "Running" ? "En ejecución" : eApp)
        nivelApp = eApp == "Running" ? .ok : (eApp.isEmpty ? .desconocido : .caido)

        let eBD = bd["estado"] as? String ?? ""
        switch eBD {
        case "Online": estadoBD = "En línea"; nivelBD = .ok
        case "Paused": estadoBD = "En pausa (sin uso; despierta sola)"; nivelBD = .desconocido
        case "Pausing", "Resuming": estadoBD = eBD == "Pausing" ? "Pausándose" : "Despertando"; nivelBD = .degradado
        case "": estadoBD = "No encontrada"; nivelBD = .desconocido
        default: estadoBD = eBD; nivelBD = .caido
        }

        // Métricas de la última hora, minuto a minuto
        var nuevas: [Serie] = []
        if !idPlan.isEmpty {
            let m = await consultar(idPlan, "CpuPercentage MemoryPercentage", "Average")
            if let v = m["CpuPercentage"], !v.isEmpty { nuevas.append(Serie(id: "cpu", titulo: "CPU servidor", unidad: "%", valores: v, alerta: c.alertaCPU)) }
            if let v = m["MemoryPercentage"], !v.isEmpty { nuevas.append(Serie(id: "mem", titulo: "Memoria servidor", unidad: "%", valores: v, alerta: c.alertaMemoria)) }
        }
        if !idApp.isEmpty {
            let t = await consultar(idApp, "Requests Http5xx", "Total")
            if let v = t["Requests"], !v.isEmpty { nuevas.append(Serie(id: "req", titulo: "Peticiones/min", unidad: "", valores: v, alerta: nil)) }
            if let v = t["Http5xx"], !v.isEmpty { nuevas.append(Serie(id: "5xx", titulo: "Errores 5xx/min", unidad: "", valores: v, alerta: 1)) }
            let r = await consultar(idApp, "HttpResponseTime", "Average")
            if let v = r["HttpResponseTime"], !v.isEmpty { nuevas.append(Serie(id: "resp", titulo: "Respuesta", unidad: " ms", valores: v.map { $0 * 1000 }, alerta: 2000)) }
        }
        if !idBD.isEmpty {
            let m = await consultar(idBD, "cpu_percent", "Average")
            if let v = m["cpu_percent"], !v.isEmpty { nuevas.append(Serie(id: "bdcpu", titulo: "CPU base", unidad: "%", valores: v, alerta: c.alertaCPU)) }
        }
        series = nuevas
        ultima = Date()
        mensaje = nuevas.isEmpty && idApp.isEmpty ? "No se encontraron los recursos; revisa los nombres en Configuración…" : ""

        // Semáforo: caído si el App Service o la base no están arriba; amarillo si hay picos en la última hora
        let picos = nuevas.filter { $0.enAlerta }
        if nivelApp == .caido || nivelBD == .caido { nivel = .caido }
        else if !picos.isEmpty || nivelBD == .degradado { nivel = .degradado }
        else if nivelApp == .ok { nivel = .ok }
        else { nivel = .desconocido }

        if let antes = nivelAvisado, antes != nivel, nivel != .desconocido {
            let cuerpo = nivel == .ok ? "Sin picos en la última hora."
                : (nivel == .caido ? "App Service: \(estadoApp) · Base: \(estadoBD)"
                   : picos.map { "\($0.titulo) pico \(Azure.num($0.pico))\($0.unidad)" }.joined(separator: " · "))
            Azure.notificar(nivel == .ok ? "Azure recuperado" : "Azure: \(nivel.texto)", cuerpo)
        }
        if nivel != .desconocido { nivelAvisado = nivel }
    }

    nonisolated static func num(_ v: Double) -> String {
        v >= 100 || v == v.rounded() ? String(Int(v.rounded())) : String(format: "%.1f", v)
    }

    nonisolated static func notificar(_ titulo: String, _ cuerpo: String) {
        guard Bundle.main.bundleIdentifier != nil else { return }
        let n = UNMutableNotificationContent()
        n.title = titulo
        n.body = cuerpo
        n.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: n, trigger: nil))
    }
}
