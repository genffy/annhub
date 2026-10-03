// swift-tools-version:5.9
// AnnHubCore — Swift port of learning-core/ for the macOS desktop client.
// Contract owners are the docs/v2/ files; this package mirrors the extension's
// learning domain so both ends interoperate through the same JSON envelopes.
import PackageDescription

let package = Package(
    name: "AnnHubCore",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "AnnHubCore", targets: ["AnnHubCore"])
    ],
    targets: [
        .target(
            name: "AnnHubCore",
            path: "Sources/AnnHubCore"
        ),
        .testTarget(
            name: "AnnHubCoreTests",
            dependencies: ["AnnHubCore"],
            path: "Tests/AnnHubCoreTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)
