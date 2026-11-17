import Foundation
import AppKit

/// Control de los servidores de esta Mac (API :8000, web :5173, QA :8001) y atajos a los scripts de mac/.
@MainActor
final class Servicios: ObservableObject {
    @Published var apiCorriendo = false
    @Published var webCorriendo = false
    @Published var qaCorriendo = false
    @Published var mensaje: String = ""
    private var inicios: [Int: Date] = [:]   // puerto -> momento en que se pidió iniciar
    private var vigia: Task<Void, Never>?

    // Importante: nunca se espera un proceso en el hilo principal (hacerlo durante el arranque de SwiftUI
    // cierra la app). Todos los comandos corren en segundo plano con Azure.shell.
    init() {
        vigia = Task { [weak self] in
            while !Task.isCancelled {
                await self?.revisarPuertos()
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
    }

    /// Revisa de una vez los tres puertos; devuelve los que están escuchando.
    private func revisarPuertos() async {
        let (_, salida) = await Azure.shell("for p in 8000 5173 8001; do lsof -nP -iTCP:$p -sTCP:LISTEN -t >/dev/null 2>&1 && echo $p; done")
        let arriba = Set(salida.split(whereSeparator: { $0.isNewline }).compactMap { Int($0) })
        apiCorriendo = arriba.contains(8000)
        webCorriendo = arriba.contains(5173)
        qaCorriendo = arriba.contains(8001)
        for (puerto, fecha) in inicios {
            let arriba = puerto == 8000 ? apiCorriendo : (puerto == 5173 ? webCorriendo : qaCorriendo)
            if arriba || Date().timeIntervalSince(fecha) > 25 { inicios[puerto] = nil }
        }
    }

    func refrescar() { Task { await revisarPuertos() } }

    private func matar(_ puerto: Int) async {
        _ = await Azure.shell("pkill -f 'app.main:app.*--port \(puerto)'; lsof -nP -iTCP:\(puerto) -sTCP:LISTEN -t | xargs kill 2>/dev/null")
        inicios[puerto] = nil
        await revisarPuertos()
    }

    /// Verdadero mientras el servidor arranca (el interruptor se queda encendido aunque el puerto aún no escuche).
    func iniciando(_ puerto: Int) -> Bool { inicios[puerto] != nil }

    private func carpetaLogs() -> String {
        let dir = NSString(string: "~/Library/Logs/PanelALDM").expandingTildeInPath
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        return dir
    }

    private func lanzar(_ comando: String, log: String, puerto: Int) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lc", comando]
        let ruta = carpetaLogs() + "/" + log
        FileManager.default.createFile(atPath: ruta, contents: nil)
        if let h = FileHandle(forWritingAtPath: ruta) {
            p.standardOutput = h
            p.standardError = h
        }
        do {
            try p.run()
            inicios[puerto] = Date()
        } catch {
            mensaje = "No se pudo iniciar: \(error.localizedDescription)"
        }
    }

    private func detener(_ puerto: Int) { Task { await matar(puerto) } }

    private func hayEntorno(_ config: Configuracion) -> Bool {
        if FileManager.default.fileExists(atPath: config.repo + "/backend/venv/bin/python") { return true }
        mensaje = "Falta preparar el backend: abre una vez mac/correr-dev.command."
        return false
    }

    // MARK: API local (:8000)

    func iniciarAPI(config: Configuracion) {
        guard hayEntorno(config) else { return }
        let azure = config.ambienteAPILocal == "azure"
        if azure, !FileManager.default.fileExists(atPath: config.repo + "/backend/.env.azure") {
            mensaje = "Falta backend/.env.azure (conexión a la base de Azure)."
            return
        }
        lanzar("cd '\(config.repo)/backend' && ENV_FILE='\(azure ? ".env.azure" : "")' exec venv/bin/python -m uvicorn app.main:app --reload --host \(azure ? "127.0.0.1" : "0.0.0.0") --port 8000", log: "api.log", puerto: 8000)
        mensaje = "Iniciando API (\(azure ? "base de Azure" : "SQLite local"))…"
    }

    func detenerAPI() { detener(8000); mensaje = "API detenida." }

    // MARK: Web admin (:5173)

    func iniciarWeb(config: Configuracion) {
        guard FileManager.default.fileExists(atPath: config.repo + "/web-admin/node_modules") else {
            mensaje = "Falta instalar la web: abre una vez mac/correr-dev.command."
            return
        }
        lanzar("cd '\(config.repo)/web-admin' && VITE_API_TARGET=http://localhost:8000 exec npm run dev -- --port 5173", log: "web.log", puerto: 5173)
        mensaje = "Iniciando web…"
    }

    func detenerWeb() { detener(5173); mensaje = "Web detenida." }

    // MARK: QA (:8001 sobre una copia de la base local; nunca toca la base de desarrollo ni producción)

    private func rutaCopiaQA(_ config: Configuracion) -> String { config.repo + "/_qa_tmp/qa_copy.db" }

    func fechaCopiaQA(config: Configuracion) -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: rutaCopiaQA(config)))?[.modificationDate] as? Date
    }

    /// Vuelve a copiar la base de desarrollo; si el servidor QA está encendido lo reinicia sobre la copia nueva.
    func actualizarCopiaQA(config: Configuracion) async {
        let estabaArriba = qaCorriendo
        if estabaArriba { await matar(8001) }
        guard copiarBaseQA(config: config) else { return }
        if estabaArriba { iniciarQA(config: config) }
    }

    /// Copia la base de desarrollo a _qa_tmp/qa_copy.db. Devuelve false si no hay base que copiar.
    private func copiarBaseQA(config: Configuracion) -> Bool {
        let origen = config.repo + "/backend/sistema_mecanico.db"
        let fm = FileManager.default
        guard fm.fileExists(atPath: origen) else {
            mensaje = "No existe la base local (backend/sistema_mecanico.db). Enciende la API una vez en Dev."
            return false
        }
        do {
            try fm.createDirectory(atPath: config.repo + "/_qa_tmp", withIntermediateDirectories: true)
            if fm.fileExists(atPath: rutaCopiaQA(config)) { try fm.removeItem(atPath: rutaCopiaQA(config)) }
            try fm.copyItem(atPath: origen, toPath: rutaCopiaQA(config))
            mensaje = "Copia QA actualizada desde la base de desarrollo."
        } catch {
            mensaje = "No se pudo copiar la base: \(error.localizedDescription)"
            return false
        }
        objectWillChange.send()
        return true
    }

    func iniciarQA(config: Configuracion) {
        guard hayEntorno(config) else { return }
        if !FileManager.default.fileExists(atPath: rutaCopiaQA(config)), !copiarBaseQA(config: config) { return }
        // El backend carga su .env con prioridad sobre el ambiente, así que se le da un .env propio de QA:
        // el mismo de desarrollo pero con DATABASE_URL apuntando a la copia.
        let qa = config.repo + "/_qa_tmp"
        let preparar = "cd '\(config.repo)' && { grep -v '^DATABASE_URL=' backend/.env 2>/dev/null; echo 'DATABASE_URL=sqlite:///\(rutaCopiaQA(config))'; } > '\(qa)/qa.env' && chmod 600 '\(qa)/qa.env'"
        lanzar("\(preparar) && cd backend && ENV_FILE='\(qa)/qa.env' exec venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001", log: "qa.log", puerto: 8001)
        mensaje = "Iniciando servidor QA sobre la copia…"
    }

    func detenerQA() { detener(8001); mensaje = "Servidor QA detenido." }

    // MARK: Atajos

    func abrirLog(_ nombre: String) {
        NSWorkspace.shared.open(URL(fileURLWithPath: carpetaLogs() + "/" + nombre))
    }

    func abrirURL(_ url: String) {
        if let u = URL(string: url) { NSWorkspace.shared.open(u) }
    }

    /// Abre un script de la carpeta mac/ en Terminal (Expo y las compilaciones necesitan su propia ventana).
    func abrirScript(_ nombre: String, config: Configuracion) {
        let ruta = config.repo + "/mac/" + nombre
        guard FileManager.default.fileExists(atPath: ruta) else { mensaje = "No existe \(ruta)"; return }
        Task { _ = await Azure.shell("chmod +x '\(ruta)' && open '\(ruta)'") }
    }
}
