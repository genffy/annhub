// Wire contract for extension → Desktop per-item delivery (docs/v2/storage.md §8).
// Exact mirror of learning-core/wire.ts — change both or neither.
//
// Both ends hash capture fields byte-wise, so canonical JSON is implemented
// explicitly instead of relying on platform JSON encoders:
//   - object keys sorted (UTF-16 code-unit order, same as JS default sort),
//     no whitespace
//   - strings escape only " \ and \n \r \t; other control chars (< 0x20 or
//     0x7F) as \u00xx with LOWERCASE hex (validation already rejects them in
//     stored text)
//   - integers render as digits; non-integers format %.6f then trim trailing
//     zeros and the trailing '.' (rect floats live in [0, 1]; never exponent)
// Arrays preserve order; null/true/false as-is.

import Foundation
import CryptoKit

/// Shared per-image byte ceiling; Desktop answers 413 above it (storage.md §8).
public let MAX_IMAGE_BYTES = 10 * 1024 * 1024

// ── Generic JSON tree ────────────────────────────────────────────────────

/// A lossless in-memory JSON tree. Numbers keep their integer-ness so
/// canonical formatting matches JS `Number.isInteger` semantics (1.0 → "1").
public enum WireValue: Equatable, Sendable {
    case null
    case bool(Bool)
    case int(Int64)
    case double(Double)
    case string(String)
    case array([WireValue])
    case object([String: WireValue])
}

extension WireValue: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        // Order matters: Bool before numbers (JSONSerialization-typed booleans
        // only decode as Bool), Int64 before Double so integer literals keep
        // integer formatting.
        if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let i = try? c.decode(Int64.self) {
            self = .int(i)
        } else if let d = try? c.decode(Double.self) {
            self = .double(d)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let o = try? c.decode([String: WireValue].self) {
            self = .object(o)
        } else if let a = try? c.decode([WireValue].self) {
            self = .array(a)
        } else {
            self = .null
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .int(let i): try c.encode(i)
        case .double(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

public extension WireValue {
    var objectValue: [String: WireValue]? {
        if case let .object(o) = self { return o }
        return nil
    }

    var arrayValue: [WireValue]? {
        if case let .array(a) = self { return a }
        return nil
    }

    var stringValue: String? {
        if case let .string(s) = self { return s }
        return nil
    }

    var intValue: Int? {
        switch self {
        case .int(let i): return Int(i)
        default: return nil
        }
    }
}

// ── canonical JSON ───────────────────────────────────────────────────────

func canonicalString(_ text: String) -> String {
    var out = "\""
    for scalar in text.unicodeScalars {
        switch scalar {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if scalar.value < 0x20 || scalar.value == 0x7F {
                // \u00xx — lowercase hex, zero-padded to 4.
                out += String(format: "\\u%04x", Int(scalar.value))
            } else {
                out.unicodeScalars.append(scalar)
            }
        }
    }
    return out + "\""
}

func canonicalNumber(_ n: Double) -> String {
    // JS Number.isInteger(n) → String(n): integer-valued doubles render as digits.
    if n == n.rounded(), let i = Int64(exactly: n) {
        return String(i)
    }
    // NSString formatting is locale-aware — pin POSIX so the decimal point
    // never turns into ',' under e.g. de_DE.
    var fixed = String(format: "%.6f", locale: Locale(identifier: "en_US_POSIX"), n)
    if fixed.contains(".") {
        while fixed.hasSuffix("0") { fixed.removeLast() }
        if fixed.hasSuffix(".") { fixed.removeLast() }
    }
    return fixed
}

public func canonicalJson(_ value: WireValue) -> String {
    switch value {
    case .null: return "null"
    case .bool(let b): return b ? "true" : "false"
    case .int(let i): return String(i)
    case .double(let d): return canonicalNumber(d)
    case .string(let s): return canonicalString(s)
    case .array(let items):
        return "[" + items.map(canonicalJson).joined(separator: ",") + "]"
    case .object(let fields):
        // JS Array.prototype.sort compares UTF-16 code units.
        let keys = fields.keys.sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }
        return "{"
            + keys.map { canonicalString($0) + ":" + canonicalJson(fields[$0]!) }
            .joined(separator: ",") + "}"
    }
}

// ── fragment wire (storage.md §8: review never travels) ─────────────────

/// A Fragment reduced to its capture fields — the hash input on both ends.
public func toFragmentWire(_ record: FragmentRecord) -> WireValue {
    .object([
        "schemaVersion": .int(Int64(record.schemaVersion)),
        "id": .string(record.id),
        "captureRevision": .int(Int64(record.captureRevision)),
        "kind": .string(record.kind),
        "content": .string(record.content),
        "normalizedContent": .string(record.normalizedContent),
        "context": encodeDetail(record.context),
        "processing": encodeDetail(record.processing),
        "detail": record.detail,
        "tags": .array(record.tags.map(WireValue.string)),
        "createdAt": .int(Int64(record.createdAt)),
        "updatedAt": .int(Int64(record.updatedAt)),
    ])
}

// ── hashing ──────────────────────────────────────────────────────────────

public func sha256Hex(_ input: String) -> String {
    sha256Hex(Data(input.utf8))
}

public func sha256Hex(_ input: Data) -> String {
    SHA256.hash(data: input).map { String(format: "%02x", $0) }.joined()
}

/// SHA-256 over the canonical JSON of a fragment's capture fields (storage.md §8).
public func fragmentWireHash(_ wire: WireValue) -> String {
    sha256Hex(canonicalJson(wire))
}
