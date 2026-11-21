import SwiftUI
import AppKit

// MARK: - Piezas

struct Modulo<Contenido: View>: View {
    var titulo: String? = nil
    var derecha: String? = nil
    @ViewBuilder var contenido: () -> Contenido
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            if let titulo {
                HStack {
                    Text(titulo).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
                    Spacer()
                    if let derecha { Text(derecha).font(.system(size: 11)).foregroundStyle(.secondary) }
                }
            }
            contenido()
        }
        .padding(.horizontal, 11).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Color(red: 0.19, green: 0.195, blue: 0.21)))
    }
}

struct Punto: View {
    let nivel: Nivel
    var body: some View { Circle().fill(nivel.color).frame(width: 8, height: 8) }
}

struct Icono: View {
    let simbolo: String
    var activo = true
    var body: some View {
        ZStack {
            Circle().fill(activo ? Color.accentColor : Color.white.opacity(0.16))
            Image(systemName: simbolo).font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
        }
        .frame(width: 26, height: 26)
    }
}

/// Gráfica de línea con relleno (estilo de los paneles del sistema).
struct GraficaLinea: View {
    let valores: [Double]
    let color: Color
    var techo: Double? = nil

    var body: some View {
        GeometryReader { g in
            let pts = puntos(g.size)
            ZStack {
                if pts.count > 1 {
                    Path { p in
                        p.move(to: CGPoint(x: pts[0].x, y: g.size.height))
                        for q in pts { p.addLine(to: q) }
                        p.addLine(to: CGPoint(x: pts[pts.count - 1].x, y: g.size.height))
                        p.closeSubpath()
                    }
                    .fill(color.opacity(0.16))
                    Path { p in
                        p.move(to: pts[0])
                        for q in pts.dropFirst() { p.addLine(to: q) }
                    }
                    .stroke(color, style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                } else {
                    Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1)
                }
            }
            .frame(width: g.size.width, height: g.size.height, alignment: .bottom)
        }
    }

    private func puntos(_ s: CGSize) -> [CGPoint] {
        guard valores.count > 1, s.width > 0 else { return [] }
        let maximo = max(valores.max() ?? 1, techo ?? 0, 1)
        let paso = s.width / CGFloat(valores.count - 1)
        return valores.enumerated().map { i, v in
            CGPoint(x: CGFloat(i) * paso, y: s.height - 1 - CGFloat(v / maximo) * (s.height - 3))
        }
    }
}

struct BotonChico: View {
    let titulo: String
    var ayuda: String = ""
    let accion: () -> Void
    var body: some View {
        Button(titulo, action: accion).controlSize(.small).help(ayuda)
    }
}

struct FilaMenu: View {
    let titulo: String
    let atajo: String
    let accion: () -> Void
    @State private var encima = false
    var body: some View {
        Button(action: accion) {
            HStack {
                Text(titulo)
                Spacer()
                Text(atajo).foregroundStyle(encima ? Color.white : Color.secondary)
            }
            .padding(.horizontal, 8).padding(.vertical, 4)
            .contentShape(Rectangle())
            .background(RoundedRectangle(cornerRadius: 6).fill(encima ? Color.accentColor : Color.clear))
        }
        .buttonStyle(.plain)
        .onHover { encima = $0 }
    }
}

// MARK: - Monitoreo de un ambiente

struct MosaicoEntorno: View {
    @EnvironmentObject var monitor: Monitor
    @EnvironmentObject var servicios: Servicios
    let entorno: EntornoRemoto

    var body: some View {
        let e = monitor.estados[entorno.nombre] ?? EstadoEntorno()
        Modulo {
            HStack(spacing: 7) {
                Punto(nivel: e.nivel)
                Text(entorno.nombre).font(.system(size: 13, weight: .semibold))
                Text(e.detalle).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                Spacer()
                if let ms = e.ms { Text("\(ms) ms").font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary) }
                Button { servicios.abrirURL(entorno.url) } label: { Image(systemName: "arrow.up.right.square") }
                    .buttonStyle(.borderless).help("Abrir \(entorno.url)")
            }
            GraficaLinea(valores: e.historial.compactMap { m in m.ms.map { Double($0) } }, color: e.nivel == .desconocido ? .gray : e.nivel.color)
                .frame(height: 24)
            if let t = e.apiTexto { Text(t).font(.system(size: 11)).foregroundStyle(.secondary) }
            HStack {
                if let t = e.bdTexto { Text(t).font(.system(size: 11)).foregroundStyle(.secondary) }
                Spacer()
                if !entorno.esLocal {
                    Toggle("Revisar base", isOn: Binding(get: { entorno.revisarBD }, set: { _ in monitor.alternarBD(entorno.nombre) }))
                        .toggleStyle(.switch).controlSize(.mini).font(.system(size: 11))
                        .help("Revisar la base despierta Azure SQL Serverless y puede generar cobro")
                }
            }
        }
    }
}

// MARK: - Azure

struct MosaicoSerie: View {
    let serie: Serie
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(serie.titulo).font(.system(size: 10.5)).foregroundStyle(.secondary).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text(Azure.num(serie.actual)).font(.system(size: 17, weight: .semibold)).monospacedDigit()
                Text(serie.unidad).font(.system(size: 10.5, weight: .medium)).foregroundStyle(.secondary)
            }
            GraficaLinea(valores: serie.valores, color: serie.enAlerta ? .orange : .accentColor, techo: serie.alerta)
                .frame(height: 22).padding(.vertical, 2)
            Text("pico \(Azure.num(serie.pico))\(serie.unidad)")
                .font(.system(size: 10, weight: serie.enAlerta ? .semibold : .regular)).monospacedDigit()
                .foregroundStyle(serie.enAlerta ? Color.orange : Color.secondary)
        }
        .padding(.horizontal, 8).padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Color.white.opacity(0.10)))
    }
}

struct ModuloAzure: View {
    @EnvironmentObject var azure: Azure
    private let columnas = Array(repeating: GridItem(.flexible(), spacing: 6), count: 3)

    var body: some View {
        Modulo(titulo: "Azure · última hora", derecha: azure.ultima?.formatted(date: .omitted, time: .shortened)) {
            HStack(spacing: 9) {
                Icono(simbolo: "server.rack", activo: azure.nivelApp == .ok)
                VStack(alignment: .leading, spacing: 0) {
                    Text("App Service").font(.system(size: 13, weight: .semibold))
                    Text(azure.estadoApp).font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer()
                if azure.cargando { ProgressView().controlSize(.small) }
                Button { azure.abrirPortal() } label: { Image(systemName: "arrow.up.right.square") }
                    .buttonStyle(.borderless).help("Abrir en el portal de Azure")
                Punto(nivel: azure.nivelApp)
            }
            HStack(spacing: 9) {
                Icono(simbolo: "cylinder.split.1x2", activo: azure.nivelBD == .ok)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Azure SQL").font(.system(size: 13, weight: .semibold))
                    Text(azure.estadoBD).font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer()
                Punto(nivel: azure.nivelBD)
            }
            if !azure.series.isEmpty {
                LazyVGrid(columns: columnas, spacing: 6) {
                    ForEach(azure.series) { MosaicoSerie(serie: $0) }
                }
            }
            if !azure.mensaje.isEmpty {
                Text(azure.mensaje).font(.system(size: 11)).foregroundStyle(.secondary).textSelection(.enabled)
            }
        }
    }
}

// MARK: - Servidores de esta Mac

struct FilaInterruptor: View {
    let simbolo: String
    let titulo: String
    let puerto: Int
    let corriendo: Bool
    let iniciando: Bool
    let iniciar: () -> Void
    let detener: () -> Void
    var log: (() -> Void)? = nil
    var abrir: (() -> Void)? = nil
    var reiniciar: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 9) {
            Icono(simbolo: simbolo, activo: corriendo)
            VStack(alignment: .leading, spacing: 0) {
                Text(titulo).font(.system(size: 13, weight: .semibold))
                Text("\(corriendo ? "En línea" : (iniciando ? "Iniciando…" : "Detenido")) · puerto \(String(puerto))")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Spacer()
            if let reiniciar, corriendo || iniciando { Button { reiniciar() } label: { Image(systemName: "arrow.clockwise") }.buttonStyle(.borderless).help("Reset: detener y volver a iniciar") }
            if let log { Button { log() } label: { Image(systemName: "doc.text") }.buttonStyle(.borderless).help("Ver log") }
            if let abrir, corriendo { Button { abrir() } label: { Image(systemName: "arrow.up.right.square") }.buttonStyle(.borderless).help("Abrir en el navegador") }
            Toggle("", isOn: Binding(get: { corriendo || iniciando }, set: { $0 ? iniciar() : detener() }))
                .toggleStyle(.switch).labelsHidden()
        }
    }
}

struct FilaApp: View {
    @EnvironmentObject var monitor: Monitor
    @EnvironmentObject var servicios: Servicios
    let nombre: String
    let clave: String        // taller | cliente | superadmin
    let produccion: Bool

    var body: some View {
        HStack(spacing: 5) {
            Text(nombre).lineLimit(1)
            Spacer()
            if produccion {
                BotonChico(titulo: "Expo", ayuda: "Expo en el celular con la API de producción (datos reales)") { abrir("probar-app-\(clave)-azure.command") }
                BotonChico(titulo: "iOS", ayuda: "Simulador de iPhone con la API de producción (requiere Xcode)") { abrir("probar-app-\(clave)-ios-azure.command") }
                BotonChico(titulo: "Android", ayuda: "Emulador de Android con el APK de producción (lo compila en esta Mac si falta)") { abrir("android-\(clave).command") }
                BotonChico(titulo: "APK", ayuda: "Compilar el APK de producción en esta Mac (sin Expo; queda en Descargas)") { abrir("compilar-apk-\(clave).command") }
            } else {
                BotonChico(titulo: "Expo", ayuda: "Expo en el celular con la API de esta Mac") { abrir("probar-app-\(clave)-dev.command") }
                BotonChico(titulo: "iOS", ayuda: "Simulador de iPhone con la API de esta Mac (requiere Xcode)") { abrir("probar-app-\(clave)-ios.command") }
                BotonChico(titulo: "Android", ayuda: "Emulador de Android con tu app y cambios en tiempo real (API de esta Mac)") { abrir("android-\(clave)-dev.command") }
                BotonChico(titulo: "APK", ayuda: "Compilar en esta Mac un APK que apunta a la API de esta Mac (queda en Descargas)") { abrir("compilar-apk-\(clave)-dev.command") }
            }
        }
    }
    private func abrir(_ script: String) { servicios.abrirScript(script, config: monitor.config) }
}

struct ModuloApps: View {
    let produccion: Bool
    var body: some View {
        Modulo(titulo: produccion ? "Apps móviles · producción" : "Apps móviles · API de esta Mac") {
            FilaApp(nombre: "Taller", clave: "taller", produccion: produccion)
            FilaApp(nombre: "Clientes", clave: "cliente", produccion: produccion)
            FilaApp(nombre: "Súper Admin", clave: "superadmin", produccion: produccion)
        }
    }
}

// MARK: - Pestañas

struct PestanaDev: View {
    @EnvironmentObject var monitor: Monitor
    @EnvironmentObject var servicios: Servicios

    var body: some View {
        if let e = monitor.config.entornos.first(where: { $0.nombre == "Local" }) { MosaicoEntorno(entorno: e) }
        Modulo(titulo: "En esta Mac") {
            FilaInterruptor(simbolo: "chevron.left.forwardslash.chevron.right", titulo: "API", puerto: 8000,
                            corriendo: servicios.apiCorriendo, iniciando: servicios.iniciando(8000),
                            iniciar: { servicios.iniciarAPI(config: monitor.config) },
                            detener: { servicios.detenerAPI() },
                            log: { servicios.abrirLog("api.log") },
                            reiniciar: { servicios.reiniciarAPI(config: monitor.config) })
            Picker("Base de datos", selection: Binding(
                get: { monitor.config.ambienteAPILocal },
                set: { monitor.config.ambienteAPILocal = $0; monitor.config.guardar() })) {
                Text("SQLite local").tag("local")
                Text("Base de Azure").tag("azure")
            }
            .pickerStyle(.segmented).labelsHidden()
            .disabled(servicios.apiCorriendo || servicios.iniciando(8000))
            if monitor.config.ambienteAPILocal == "azure" {
                Label("La API local usará los datos reales de producción.", systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 11)).foregroundStyle(.orange)
            }
            Divider()
            FilaInterruptor(simbolo: "globe", titulo: "Web admin", puerto: 5173,
                            corriendo: servicios.webCorriendo, iniciando: servicios.iniciando(5173),
                            iniciar: { servicios.iniciarWeb(config: monitor.config) },
                            detener: { servicios.detenerWeb() },
                            log: { servicios.abrirLog("web.log") },
                            abrir: { servicios.abrirURL("http://localhost:5173") },
                            reiniciar: { servicios.reiniciarWeb(config: monitor.config) })
        }
        ModuloApps(produccion: false)
    }
}

struct PestanaQA: View {
    @EnvironmentObject var monitor: Monitor
    @EnvironmentObject var servicios: Servicios

    var body: some View {
        if let e = monitor.config.entornos.first(where: { $0.nombre == "QA" }) { MosaicoEntorno(entorno: e) }
        Modulo(titulo: "Servidor de pruebas") {
            FilaInterruptor(simbolo: "checklist", titulo: "API de QA", puerto: 8001,
                            corriendo: servicios.qaCorriendo, iniciando: servicios.iniciando(8001),
                            iniciar: { servicios.iniciarQA(config: monitor.config) },
                            detener: { servicios.detenerQA() },
                            log: { servicios.abrirLog("qa.log") })
            Text(textoCopia).font(.system(size: 11)).foregroundStyle(.secondary)
            HStack {
                BotonChico(titulo: "Actualizar copia", ayuda: "Vuelve a copiar la base de desarrollo a la copia de QA") {
                    Task { await servicios.actualizarCopiaQA(config: monitor.config) }
                }
                Spacer()
                BotonChico(titulo: "Correr pruebas", ayuda: "Pruebas integrales y multitaller contra el puerto 8001 (se abre en Terminal)") {
                    servicios.abrirScript("qa-pruebas.command", config: monitor.config)
                }
            }
        }
        Text("QA trabaja sobre una copia de tu base local: no toca la base de desarrollo ni producción.")
            .font(.system(size: 11)).foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4)
    }

    private var textoCopia: String {
        if let f = servicios.fechaCopiaQA(config: monitor.config) {
            return "Copia de la base: \(f.formatted(date: .abbreviated, time: .shortened))"
        }
        return "Aún no hay copia; se crea al encender."
    }
}

struct PestanaProd: View {
    @EnvironmentObject var monitor: Monitor

    var body: some View {
        ForEach(monitor.config.entornos.filter { $0.nombre != "Local" && $0.nombre != "QA" }) { MosaicoEntorno(entorno: $0) }
        ModuloAzure()
        ModuloApps(produccion: true)
    }
}

// MARK: - Panel

struct VistaPanel: View {
    @EnvironmentObject var monitor: Monitor
    @EnvironmentObject var servicios: Servicios
    @EnvironmentObject var azure: Azure
    @State private var pestana = "Dev"

    private var nivelTotal: Nivel {
        azure.nivel != .desconocido && azure.nivel.gravedad > monitor.nivelGeneral.gravedad ? azure.nivel : monitor.nivelGeneral
    }

    private func actualizar() {
        monitor.revisarYa()
        servicios.refrescar()
        Task { await azure.revisar() }
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("ALDM AutoCore").font(.system(size: 15, weight: .bold))
                Spacer()
                HStack(spacing: 5) {
                    Punto(nivel: nivelTotal)
                    Text(nivelTotal == .ok ? "Todo en orden" : nivelTotal.texto).font(.system(size: 11, weight: .semibold))
                }
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(nivelTotal.color.opacity(0.18)))
            }
            .padding(.horizontal, 4).padding(.top, 2)

            Picker("Ambiente", selection: $pestana) {
                Text("Dev").tag("Dev")
                Text("QA").tag("QA")
                Text("Prod").tag("Prod")
            }
            .pickerStyle(.segmented).labelsHidden()

            switch pestana {
            case "QA": PestanaQA()
            case "Prod": PestanaProd()
            default: PestanaDev()
            }

            if !servicios.mensaje.isEmpty {
                Text(servicios.mensaje).font(.system(size: 11)).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4)
            }

            VStack(spacing: 0) {
                FilaMenu(titulo: "Actualizar ahora", atajo: "⌘R") { actualizar() }
                    .keyboardShortcut("r")
                FilaMenu(titulo: "Configuración…", atajo: "⌘,") { NSWorkspace.shared.open(Configuracion.archivo) }
                    .keyboardShortcut(",")
                FilaMenu(titulo: "Recargar configuración", atajo: "") { monitor.recargarConfig(); azure.arrancar() }
                FilaMenu(titulo: "Salir de ALDM AutoCore", atajo: "⌘Q") { NSApplication.shared.terminate(nil) }
                    .keyboardShortcut("q")
            }
        }
        .padding(10)
        .frame(width: 356)
        // Fondo oscuro sólido (el material translúcido dejaba el texto con poco contraste)
        .background(Color(red: 0.105, green: 0.11, blue: 0.125).ignoresSafeArea())
    }
}
