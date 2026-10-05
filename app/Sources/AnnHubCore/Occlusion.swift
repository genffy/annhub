// R4 visual occlusion — pure pixel helper so the review card can render the
// image pixelated before 揭示 and the original after (review.md / roadmap
// R4.1). The Desktop view draws the small bitmap scaled up with
// nearest-neighbor interpolation; no third-party image dependencies.

import Foundation

/// A plain 8-bit RGBA bitmap, row-major, `rgba.count == width * height * 4`.
public struct OcclusionBitmap: Equatable, Sendable {
    public var width: Int
    public var height: Int
    public var rgba: [UInt8]

    public init(width: Int, height: Int, rgba: [UInt8]) {
        self.width = width
        self.height = height
        self.rgba = rgba
    }
}

/// Box-average downsample to `targetWidth` pixels wide (~24 in the UI),
/// preserving aspect ratio. The result is the SMALL bitmap; the caller upscales
/// with nearest-neighbor sampling for the occluded look. Pure and testable —
/// no AppKit, no context state.
public func pixelateBitmap(_ bitmap: OcclusionBitmap, targetWidth: Int) -> OcclusionBitmap {
    precondition(bitmap.width > 0 && bitmap.height > 0, "empty bitmap")
    precondition(bitmap.rgba.count >= bitmap.width * bitmap.height * 4, "short pixel buffer")
    let w = max(1, min(targetWidth, bitmap.width))
    let h = max(1, Int((Double(bitmap.height) * Double(w) / Double(bitmap.width)).rounded()))
    var out = OcclusionBitmap(width: w, height: h, rgba: Array(repeating: 0, count: w * h * 4))
    for y in 0..<h {
        let y0 = y * bitmap.height / h
        var y1 = (y + 1) * bitmap.height / h
        if y1 <= y0 { y1 = y0 + 1 }
        for x in 0..<w {
            let x0 = x * bitmap.width / w
            var x1 = (x + 1) * bitmap.width / w
            if x1 <= x0 { x1 = x0 + 1 }
            var sum = [Int](repeating: 0, count: 4)
            var count = 0
            for yy in y0..<min(y1, bitmap.height) {
                for xx in x0..<min(x1, bitmap.width) {
                    let idx = (yy * bitmap.width + xx) * 4
                    for c in 0..<4 where idx + c < bitmap.rgba.count {
                        sum[c] += Int(bitmap.rgba[idx + c])
                    }
                    count += 1
                }
            }
            let o = (y * w + x) * 4
            for c in 0..<4 where o + c < out.rgba.count {
                out.rgba[o + c] = UInt8(sum[c] / max(count, 1))
            }
        }
    }
    return out
}

/// mm:ss for media-clip time ranges (R4.2 reference display).
public func mmss(_ milliseconds: Int) -> String {
    let totalSeconds = max(0, milliseconds) / 1000
    return String(format: "%02d:%02d", totalSeconds / 60, totalSeconds % 60)
}
