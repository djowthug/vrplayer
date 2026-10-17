import Foundation
import SwiftUI

// MARK: - API Response Models

public struct VideoListResponse: Codable {
    public let folder: String?
    public let folders: [String]?
    public let count: Int?
    public let videos: [VideoItem]
    
    public init(folder: String? = nil, folders: [String]? = nil, count: Int? = nil, videos: [VideoItem] = []) {
        self.folder = folder
        self.folders = folders
        self.count = count
        self.videos = videos
    }
}

public struct FormatHint: Codable, Hashable {
    public let projection: String?
    public let layout: String?
    public let spatialAudio: String?
    
    public init(projection: String? = nil, layout: String? = nil, spatialAudio: String? = nil) {
        self.projection = projection
        self.layout = layout
        self.spatialAudio = spatialAudio
    }
}

public struct VideoItem: Identifiable, Hashable, Codable {
    public let id: String
    public let name: String
    public let relPath: String
    public let folderRoot: String?
    public let folderName: String?
    public let subfolder: String?
    public let size: String?
    public let sizeBytes: Int64?
    public let mtime: Double?
    public let formatHint: FormatHint?
    public let url: String
    public let thumbUrl: String?
    public let durationFormatted: String?
    public let resolutionBadge: String?
    public let streamType: String?
    public let needsDownscale: Bool?
    public let videoCodec: String?
    public let audioCodec: String?
    public let audioSpatialType: String?
    public let width: Int?
    public let height: Int?
    public let duration: Double?
    public let reason: String?
    
    public init(
        id: String,
        name: String,
        relPath: String,
        folderRoot: String? = nil,
        folderName: String? = nil,
        subfolder: String? = nil,
        size: String? = nil,
        sizeBytes: Int64? = nil,
        mtime: Double? = nil,
        formatHint: FormatHint? = nil,
        url: String,
        thumbUrl: String? = nil,
        durationFormatted: String? = nil,
        resolutionBadge: String? = nil,
        streamType: String? = nil,
        needsDownscale: Bool? = nil,
        videoCodec: String? = nil,
        audioCodec: String? = nil,
        audioSpatialType: String? = nil,
        width: Int? = nil,
        height: Int? = nil,
        duration: Double? = nil,
        reason: String? = nil
    ) {
        self.id = id
        self.name = name
        self.relPath = relPath
        self.folderRoot = folderRoot
        self.folderName = folderName
        self.subfolder = subfolder
        self.size = size
        self.sizeBytes = sizeBytes
        self.mtime = mtime
        self.formatHint = formatHint
        self.url = url
        self.thumbUrl = thumbUrl
        self.durationFormatted = durationFormatted
        self.resolutionBadge = resolutionBadge
        self.streamType = streamType
        self.needsDownscale = needsDownscale
        self.videoCodec = videoCodec
        self.audioCodec = audioCodec
        self.audioSpatialType = audioSpatialType
        self.width = width
        self.height = height
        self.duration = duration
        self.reason = reason
    }
    
    /// Chave normalizada idêntica à gerada pelo backend Node.js (`vid_nome_tamanho`)
    public var profileKey: String {
        let safeName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\", with: "_")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\"", with: "")
            .replacingOccurrences(of: "'", with: "")
            .replacingOccurrences(of: ":", with: "")
            .replacingOccurrences(of: "?", with: "")
            .replacingOccurrences(of: "*", with: "")
            .replacingOccurrences(of: "<", with: "")
            .replacingOccurrences(of: ">", with: "")
            .replacingOccurrences(of: "|", with: "")
        let safeSize = sizeBytes ?? 0
        return "vid_\(safeName)_\(safeSize)"
    }
    
    /// Resolve a URL absoluta de streaming baseada na URL do servidor configurado
    public func fullStreamURL(baseURL: String) -> URL? {
        let trimmedBase = baseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if url.lowercased().hasPrefix("http://") || url.lowercased().hasPrefix("https://") {
            if let direct = URL(string: url) { return direct }
            if let encoded = url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { return URL(string: encoded) }
            return nil
        }
        let cleanRel = url.hasPrefix("/") ? String(url.dropFirst()) : url
        let combined = "\(trimmedBase)/\(cleanRel)"
        if let direct = URL(string: combined) { return direct }
        if let encoded = combined.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { return URL(string: encoded) }
        return nil
    }
    
    /// Resolve a URL absoluta da miniatura (thumbnail) baseada na URL do servidor configurado
    public func fullThumbURL(baseURL: String) -> URL? {
        guard let thumbUrl = thumbUrl, !thumbUrl.isEmpty else { return nil }
        let trimmedBase = baseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if thumbUrl.lowercased().hasPrefix("http://") || thumbUrl.lowercased().hasPrefix("https://") {
            if let direct = URL(string: thumbUrl) { return direct }
            if let encoded = thumbUrl.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { return URL(string: encoded) }
            return nil
        }
        let cleanRel = thumbUrl.hasPrefix("/") ? String(thumbUrl.dropFirst()) : thumbUrl
        let combined = "\(trimmedBase)/\(cleanRel)"
        if let direct = URL(string: combined) { return direct }
        if let encoded = combined.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { return URL(string: encoded) }
        return nil
    }
    
    /// Detecta a projeção padrão recomendada
    public var initialProjection: VRProjectionMode {
        if let proj = formatHint?.projection?.lowercased() {
            if proj == "fisheye" { return .fisheye180 }
            if proj == "360" { return .vr360 }
            if proj == "180" { return .vr180 }
            if proj == "flat" { return .flat }
        }
        let n = name.lowercased()
        if n.contains("fisheye") || n.contains("_fe180") || n.contains("_rf52") {
            return .fisheye180
        }
        if n.contains("360") {
            return .vr360
        }
        return .vr180
    }
    
    /// Detecta o layout estereoscópico recomendado
    public var initialStereo: VRStereoMode {
        if let lay = formatHint?.layout?.lowercased() {
            if lay == "sbs" || lay == "lr" { return .sbs }
            if lay == "tb" || lay == "ou" { return .topBottom }
            if lay == "mono" { return .mono }
        }
        let n = name.lowercased()
        if n.contains("_tb") || n.contains("_ou") || n.contains("top_bottom") {
            return .topBottom
        }
        if n.contains("_mono") || n.contains("2d") {
            return .mono
        }
        return .sbs
    }
}

// MARK: - Profiles and Calibration

public struct ProfileConfig: Codable, Hashable {
    public var projection: String?
    public var stereo: String?
    public var swap: Bool?
    public var fisheyeFov: Double?
    public var fisheyeScale: Double?
    
    public init(
        projection: String? = nil,
        stereo: String? = nil,
        swap: Bool? = nil,
        fisheyeFov: Double? = nil,
        fisheyeScale: Double? = nil
    ) {
        self.projection = projection
        self.stereo = stereo
        self.swap = swap
        self.fisheyeFov = fisheyeFov
        self.fisheyeScale = fisheyeScale
    }
}

public struct VideoProfile: Codable, Hashable {
    public var currentTime: Double
    public var duration: Double
    public var completed: Bool
    public var updatedAt: Int64
    public var profile: ProfileConfig?
    
    public init(
        currentTime: Double = 0,
        duration: Double = 0,
        completed: Bool = false,
        updatedAt: Int64 = Int64(Date().timeIntervalSince1970 * 1000),
        profile: ProfileConfig? = nil
    ) {
        self.currentTime = currentTime
        self.duration = duration
        self.completed = completed
        self.updatedAt = updatedAt
        self.profile = profile
    }
}

public struct ProfileSavePayload: Codable {
    public let key: String
    public let data: VideoProfile
    
    public init(key: String, data: VideoProfile) {
        self.key = key
        self.data = data
    }
}

// MARK: - VR Projection Modes

public enum VRProjectionMode: String, CaseIterable, Identifiable, Codable {
    case vr180 = "180"
    case vr360 = "360"
    case fisheye180 = "fisheye"
    case flat = "flat"
    
    public var id: String { rawValue }
    
    public var displayName: String {
        switch self {
        case .vr180: return "VR 180°"
        case .vr360: return "VR 360°"
        case .fisheye180: return "Fisheye 180°"
        case .flat: return "Cinema Plano"
        }
    }
    
    public var iconName: String {
        switch self {
        case .vr180: return "circle.lefthalf.filled"
        case .vr360: return "globe"
        case .fisheye180: return "camera.aperture"
        case .flat: return "rectangle"
        }
    }
}

// MARK: - VR Stereo Modes

public enum VRStereoMode: String, CaseIterable, Identifiable, Codable {
    case sbs = "sbs"          // Lado a Lado (Left / Right)
    case topBottom = "tb"     // Cima / Baixo (Over / Under)
    case mono = "mono"        // 2D Monoscópico
    
    public var id: String { rawValue }
    
    public var displayName: String {
        switch self {
        case .sbs: return "Lado a Lado (SBS)"
        case .topBottom: return "Cima / Baixo (TB)"
        case .mono: return "Mono 2D"
        }
    }
    
    public var iconName: String {
        switch self {
        case .sbs: return "square.split.2x1"
        case .topBottom: return "square.split.1x2"
        case .mono: return "square"
        }
    }
}

// MARK: - VR Viewport Mode (Óculos vs Celular na Mão)

public enum VRDisplayMode: String, CaseIterable, Identifiable {
    case stereoHeadset = "headset" // Divisão de tela para óculos VR (Cardboard, etc.)
    case magicWindow = "window"    // Tela cheia monoscópica para segurar com as mãos
    
    public var id: String { rawValue }
    
    public var displayName: String {
        switch self {
        case .stereoHeadset: return "Óculos VR"
        case .magicWindow: return "Janela Mágica"
        }
    }
    
    public var iconName: String {
        switch self {
        case .stereoHeadset: return "eyeglasses"
        case .magicWindow: return "iphone"
        }
    }
}
