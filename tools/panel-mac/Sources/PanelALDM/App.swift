import SwiftUI
import AppKit

@main
struct PanelALDMApp: App {
    @StateObject private var monitor = Monitor()
    @StateObject private var servicios = Servicios()
    @StateObject private var azure = Azure()

    private var nivel: Nivel {
        azure.nivel != .desconocido && azure.nivel.gravedad > monitor.nivelGeneral.gravedad ? azure.nivel : monitor.nivelGeneral
    }

    var body: some Scene {
        MenuBarExtra {
            VistaPanel()
                .environmentObject(monitor)
                .environmentObject(servicios)
                .environmentObject(azure)
                .preferredColorScheme(.dark)
                .onAppear { NSApplication.shared.appearance = NSAppearance(named: .darkAqua) }
        } label: {
            Text("\(nivel.emoji) ALDM")
        }
        .menuBarExtraStyle(.window)
    }
}
