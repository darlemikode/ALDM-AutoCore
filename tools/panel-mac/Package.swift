// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PanelALDM",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "PanelALDM", path: "Sources/PanelALDM")
    ]
)
