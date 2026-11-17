import Foundation
import SwiftUI

enum Nivel: String {
    case ok, degradado, caido, desconocido

    var color: Color {
        switch self {
        case .ok: return .green
        case .degradado: return .yellow
        case .caido: return .red
        case .desconocido: return .gray
        }
    }
    var emoji: String {
        switch self {
        case .ok: return "🟢"
        case .degradado: return "🟡"
        case .caido: return "🔴"
        case .desconocido: return "⚪️"
        }
    }
    var texto: String {
        switch self {
        case .ok: return "En línea"
        case .degradado: return "Degradado"
        case .caido: return "Caído"
        case .desconocido: return "Sin datos"
        }
    }
    var gravedad: Int {
        switch self {
        case .caido: return 3
        case .degradado: return 2
        case .desconocido: return 1
        case .ok: return 0
        }
    }
}

struct EntornoRemoto: Codable, Identifiable, Equatable {
    var nombre: String
    var url: String
    var clave: String
    var revisarBD: Bool
    var cadaSegundos: Int
    var id: String { nombre }
    /// Servidor de esta Mac: si no responde está "Detenido", no "Caído" (no dispara alertas).
    var esLocal: Bool { url.contains("localhost") || url.contains("127.0.0.1") }
}

struct Configuracion: Codable {
    var repo: String
    var ambienteAPILocal: String   // "local" (SQLite) | "azure" (.env.azure)
    var entornos: [EntornoRemoto]
    var azure: ConfigAzure? = nil   // recursos de Azure a vigilar (si falta, se usan los de ALDM)

    static var porDefecto: Configuracion {
        Configuracion(
            repo: NSString(string: "~/Documents/sistema-mecanico").expandingTildeInPath,
            ambienteAPILocal: "local",
            entornos: [
                EntornoRemoto(nombre: "Local", url: "http://localhost:8000", clave: "", revisarBD: true, cadaSegundos: 15),
                EntornoRemoto(nombre: "QA", url: "http://localhost:8001", clave: "", revisarBD: true, cadaSegundos: 15),
                EntornoRemoto(nombre: "Producción", url: "https://app.aldmautocore.com", clave: "", revisarBD: false, cadaSegundos: 60),
            ],
            azure: ConfigAzure.porDefecto
        )
    }

    static var carpeta: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("PanelALDM", isDirectory: true)
    }
    static var archivo: URL { carpeta.appendingPathComponent("config.json") }

    static func cargar() -> Configuracion {
        try? FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        if let datos = try? Data(contentsOf: archivo), let c = try? JSONDecoder().decode(Configuracion.self, from: datos) {
            return c
        }
        let c = porDefecto
        c.guardar()
        return c
    }

    func guardar() {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        if let datos = try? enc.encode(self) {
            try? datos.write(to: Configuracion.archivo, options: .atomic)
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: Configuracion.archivo.path)
        }
    }
}

struct Muestra: Identifiable {
    let id = UUID()
    let fecha: Date
    let ms: Int?
    let nivel: Nivel
}

struct EstadoEntorno {
    var nivel: Nivel = .desconocido
    var detalle: String = "Sin revisar"
    var ms: Int? = nil
    var bdTexto: String? = nil
    var apiTexto: String? = nil
    var version: String? = nil
    var ultima: Date? = nil
    var historial: [Muestra] = []
}
