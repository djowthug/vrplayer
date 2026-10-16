import SwiftUI
import SceneKit
import AVFoundation
import CoreMotion
import Combine

// MARK: - Enums Extras do Design Completo do PWA

public enum VRDominantEye: String, CaseIterable, Identifiable {
    case left = "Olho Esquerdo"
    case both = "Ambos"
    case right = "Olho Direito"
    public var id: String { rawValue }
}

public enum VREnvironmentMode: String, CaseIterable, Identifiable {
    case imax = "Cinema IMAX"
    case cosmos = "Cosmos"
    case cyberGrid = "Cyber Grid"
    case void = "Vazio"
    public var id: String { rawValue }
}

public enum VRHUDTargetElement: String, CaseIterable, Identifiable {
    case topBar = "Barra de funções"
    case bottomBar = "Barra de reprodução"
    case telemetry = "Card de telemetria"
    public var id: String { rawValue }
}

public struct HUDElementLayout: Codable {
    public var offsetXPercent: Double = 0.0
    public var offsetYPercent: Double = 0.0
    public var scalePercent: Double = 100.0
}

// MARK: - VR Geometry Builder (Esfera, VR180, Fisheye e Ambientes 3D)

public final class VRGeometryBuilder {
    
    public static func createDome(projection: VRProjectionMode, radius: Float = 50.0, latSegments: Int = 48, lonSegments: Int = 48) -> SCNGeometry {
        switch projection {
        case .flat:
            let plane = SCNPlane(width: 32, height: 18)
            plane.cornerRadius = 0.4
            plane.firstMaterial?.lightingModel = .constant
            plane.firstMaterial?.isDoubleSided = true
            return plane
            
        case .vr360:
            return buildEquirectangularMesh(
                radius: radius, latSegments: latSegments, lonSegments: lonSegments,
                minLat: -Float.pi / 2, maxLat: Float.pi / 2,
                minLon: -Float.pi, maxLon: Float.pi, isFisheye: false
            )
            
        case .vr180:
            return buildEquirectangularMesh(
                radius: radius, latSegments: latSegments, lonSegments: lonSegments,
                minLat: -Float.pi / 2, maxLat: Float.pi / 2,
                minLon: -Float.pi / 2, maxLon: Float.pi / 2, isFisheye: false
            )
            
        case .fisheye180:
            return buildEquirectangularMesh(
                radius: radius, latSegments: latSegments, lonSegments: lonSegments,
                minLat: -Float.pi / 2, maxLat: Float.pi / 2,
                minLon: -Float.pi / 2, maxLon: Float.pi / 2, isFisheye: true
            )
        }
    }
    
    private static func buildEquirectangularMesh(
        radius: Float, latSegments: Int, lonSegments: Int,
        minLat: Float, maxLat: Float, minLon: Float, maxLon: Float, isFisheye: Bool
    ) -> SCNGeometry {
        var vertices: [SCNVector3] = []
        var normals: [SCNVector3] = []
        var uvs: [CGPoint] = []
        var indices: [Int32] = []
        
        for i in 0...latSegments {
            let vRatio = Float(i) / Float(latSegments)
            let phi = minLat + vRatio * (maxLat - minLat)
            
            for j in 0...lonSegments {
                let uRatio = Float(j) / Float(lonSegments)
                let theta = minLon + uRatio * (maxLon - minLon)
                
                let x = radius * cos(phi) * sin(theta)
                let y = radius * sin(phi)
                let z = -radius * cos(phi) * cos(theta)
                
                vertices.append(SCNVector3(x: x, y: y, z: z))
                normals.append(SCNVector3(x: -x / radius, y: -y / radius, z: -z / radius))
                
                if isFisheye {
                    let normX = x / radius
                    let normY = y / radius
                    let normZ = z / radius
                    let alpha = acos(max(-1.0, min(1.0, -normZ)))
                    let beta = atan2(normY, normX)
                    let normalizedR = alpha / (Float.pi / 2)
                    let u = 0.5 + 0.5 * normalizedR * cos(beta)
                    let v = 0.5 - 0.5 * normalizedR * sin(beta)
                    uvs.append(CGPoint(x: CGFloat(u), y: CGFloat(v)))
                } else {
                    uvs.append(CGPoint(x: CGFloat(uRatio), y: CGFloat(1.0 - vRatio)))
                }
            }
        }
        
        let cols = lonSegments + 1
        for i in 0..<latSegments {
            for j in 0..<lonSegments {
                let p0 = Int32(i * cols + j)
                let p1 = Int32(i * cols + (j + 1))
                let p2 = Int32((i + 1) * cols + j)
                let p3 = Int32((i + 1) * cols + (j + 1))
                
                indices.append(contentsOf: [p0, p2, p1, p1, p2, p3])
            }
        }
        
        let geometry = SCNGeometry(
            sources: [
                SCNGeometrySource(vertices: vertices),
                SCNGeometrySource(normals: normals),
                SCNGeometrySource(textureCoordinates: uvs)
            ],
            elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)]
        )
        geometry.firstMaterial?.lightingModel = .constant
        geometry.firstMaterial?.isDoubleSided = true
        return geometry
    }
    
    public static func createEnvironmentNode(mode: VREnvironmentMode) -> SCNNode {
        let root = SCNNode()
        switch mode {
        case .void:
            break
        case .imax:
            let floor = SCNBox(width: 60, height: 0.2, length: 60, chamferRadius: 0)
            floor.firstMaterial?.lightingModel = .constant
            floor.firstMaterial?.diffuse.contents = UIColor(red: 0.08, green: 0.02, blue: 0.03, alpha: 1.0)
            let floorNode = SCNNode(geometry: floor)
            floorNode.position = SCNVector3(x: 0, y: -12, z: -15)
            root.addChildNode(floorNode)
        case .cosmos:
            for _ in 0..<240 {
                let theta = Float.random(in: -Float.pi...Float.pi)
                let phi = Float.random(in: -Float.pi/2...Float.pi/2)
                let r: Float = 85.0
                let star = SCNSphere(radius: CGFloat.random(in: 0.08...0.22))
                star.firstMaterial?.lightingModel = .constant
                star.firstMaterial?.diffuse.contents = UIColor(white: 1.0, alpha: CGFloat.random(in: 0.4...1.0))
                let node = SCNNode(geometry: star)
                node.position = SCNVector3(x: r * cos(phi) * sin(theta), y: r * sin(phi), z: -r * cos(phi) * cos(theta))
                root.addChildNode(node)
            }
        case .cyberGrid:
            let gridNode = SCNNode()
            gridNode.position = SCNVector3(x: 0, y: -10, z: 0)
            let lineMat = SCNMaterial()
            lineMat.lightingModel = .constant
            lineMat.diffuse.contents = UIColor.cyan.withAlphaComponent(0.35)
            for i in -14...14 {
                let pos = Float(i) * 4.0
                let lineX = SCNBox(width: 110, height: 0.04, length: 0.04, chamferRadius: 0)
                lineX.materials = [lineMat]
                let nodeX = SCNNode(geometry: lineX)
                nodeX.position = SCNVector3(x: 0, y: 0, z: pos)
                gridNode.addChildNode(nodeX)
                
                let lineZ = SCNBox(width: 0.04, height: 0.04, length: 110, chamferRadius: 0)
                lineZ.materials = [lineMat]
                let nodeZ = SCNNode(geometry: lineZ)
                nodeZ.position = SCNVector3(x: pos, y: 0, z: 0)
                gridNode.addChildNode(nodeZ)
            }
            root.addChildNode(gridNode)
        }
        return root
    }
}

// MARK: - SceneKit Metal View Representable

public struct SCNVRViewContainer: UIViewRepresentable {
    public let scene: SCNScene
    public let pointOfView: SCNNode
    
    public func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.scene = scene
        scnView.pointOfView = pointOfView
        scnView.backgroundColor = .black
        scnView.preferredFramesPerSecond = 60
        scnView.rendersContinuously = true
        scnView.antialiasingMode = .none
        return scnView
    }
    
    public func updateUIView(_ uiView: SCNView, context: Context) {
        uiView.scene = scene
        uiView.pointOfView = pointOfView
    }
}

// MARK: - CoreMotion Controller

public final class VRMotionController: ObservableObject {
    private let motionManager = CMMotionManager()
    public var yawOffset: Float = 0
    public var pitchOffset: Float = 0
    
    public func start(onUpdate: ((Float, Float, Float) -> Void)? = nil) {
        guard motionManager.isDeviceMotionAvailable else { return }
        motionManager.deviceMotionUpdateInterval = 1.0 / 60.0
        motionManager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] motion, _ in
            guard let self = self, let motion = motion else { return }
            let attitude = motion.attitude
            let pitch = Float(-attitude.roll) + self.pitchOffset
            let yaw = Float(-attitude.yaw) + self.yawOffset
            let roll = Float(-attitude.pitch)
            onUpdate?(pitch, yaw, roll)
        }
    }
    
    public func stop() {
        motionManager.stopDeviceMotionUpdates()
    }
    
    public func recenter() {
        guard let motion = motionManager.deviceMotion else {
            yawOffset = 0
            pitchOffset = 0
            return
        }
        yawOffset = Float(motion.attitude.yaw)
        pitchOffset = Float(motion.attitude.roll)
    }
}

// MARK: - VR Player View Model

public final class VRPlayerViewModel: ObservableObject {
    public let video: VideoItem
    public let serverBaseURL: String
    
    // Estado de Reprodução
    @Published public var player: AVPlayer?
    @Published public var isPlaying: Bool = true
    @Published public var currentTime: Double = 0
    @Published public var duration: Double = 1.0
    @Published public var isSeeking: Bool = false
    @Published public var showControls: Bool = true
    @Published public var isMuted: Bool = false
    
    // Telemetria (Imagem 2, 3 e 4)
    @Published public var showTelemetry: Bool = false
    @Published public var currentFPS: Int = 60
    @Published public var bufferSeconds: Double = 0.0
    @Published public var droppedFrames: Int = 0
    
    // Modais do PWA (Imagem 1 e 2)
    @Published public var showSettingsModal: Bool = false
    @Published public var showHUDLayoutModal: Bool = false
    @Published public var showDoInicioPill: Bool = false
    
    // Configurações VR & Olho Dominante (Imagem 1)
    @Published public var projection: VRProjectionMode = .vr180
    @Published public var stereo: VRStereoMode = .sbs
    @Published public var displayMode: VRDisplayMode = .magicWindow
    @Published public var dominantEye: VRDominantEye = .right
    @Published public var environmentMode: VREnvironmentMode = .cosmos
    @Published public var isEyeSwapped: Bool = false
    @Published public var isGyroEnabled: Bool = true
    @Published public var videoRotationAngle: Int = 0
    @Published public var currentFOV: CGFloat = 95.0
    
    // Layout dos HUDs Customizável (Imagem 2)
    @Published public var selectedHUDTarget: VRHUDTargetElement = .topBar
    @Published public var hudLayouts: [VRHUDTargetElement: HUDElementLayout] = [
        .topBar: HUDElementLayout(),
        .bottomBar: HUDElementLayout(),
        .telemetry: HUDElementLayout()
    ]
    @Published public var safeMarginPercent: Double = 8.0
    @Published public var hudOpacityPercent: Double = 100.0
    @Published public var autoHideSeconds: Double = 3.5
    @Published public var opticalCenterFollow: Bool = false
    
    // Shaders de Imagem (Exposição, Contraste, Saturação, Gama)
    @Published public var exposure: Float = 0.0
    @Published public var contrast: Float = 1.0
    @Published public var saturation: Float = 1.0
    @Published public var gamma: Float = 1.0
    
    // SceneKit Nodes
    public let leftScene = SCNScene()
    public let rightScene = SCNScene()
    public let leftCameraNode = SCNNode()
    public let rightCameraNode = SCNNode()
    public let leftDomeNode = SCNNode()
    public let rightDomeNode = SCNNode()
    private var leftEnvNode = SCNNode()
    private var rightEnvNode = SCNNode()
    
    public var gyroPitch: Float = 0
    public var gyroYaw: Float = 0
    public var gyroRoll: Float = 0
    public var panYaw: Float = 0
    public var panPitch: Float = 0
    
    public let motionController = VRMotionController()
    
    private var timeObserverToken: Any?
    private var profileTimer: AnyCancellable?
    private var controlsTimer: AnyCancellable?
    
    private let colorGradingShader = """
    #pragma arguments
    float exposureVal;
    float contrastVal;
    float saturationVal;
    float gammaVal;

    #pragma body
    float3 rgb = _output.color.rgb;
    rgb = rgb * pow(2.0, exposureVal);
    rgb = (rgb - 0.5) * contrastVal + 0.5;
    float luma = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    rgb = mix(float3(luma), rgb, saturationVal);
    rgb = pow(max(rgb, float3(0.0)), float3(1.0 / max(gammaVal, 0.01)));
    _output.color.rgb = clamp(rgb, 0.0, 1.0);
    """
    
    public init(video: VideoItem, serverBaseURL: String) {
        self.video = video
        self.serverBaseURL = serverBaseURL
        self.projection = video.initialProjection
        self.stereo = video.initialStereo
        self.duration = (video.duration ?? 0) > 0 ? (video.duration ?? 1.0) : 1.0
    }
    
    public func setup() {
        UIApplication.shared.isIdleTimerDisabled = true
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
        setupScenes()
        setupPlayer()
        setupMotion()
        resetControlsTimer()
        loadProfileAndResume()
        
        profileTimer = Timer.publish(every: 5.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.saveProfileSync(completed: false)
            }
    }
    
    public func cleanup() {
        motionController.stop()
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
            timeObserverToken = nil
        }
        player?.pause()
        saveProfileSync(completed: (duration > 0 && currentTime >= duration - 5))
        profileTimer?.cancel()
        controlsTimer?.cancel()
        UIApplication.shared.isIdleTimerDisabled = false
    }
    
    private func setupScenes() {
        let leftCamera = SCNCamera()
        leftCamera.zNear = 0.1
        leftCamera.zFar = 200.0
        leftCamera.fieldOfView = currentFOV
        leftCameraNode.camera = leftCamera
        leftCameraNode.position = SCNVector3(x: -0.032, y: 0, z: 0)
        leftScene.rootNode.addChildNode(leftCameraNode)
        leftScene.rootNode.addChildNode(leftDomeNode)
        
        let rightCamera = SCNCamera()
        rightCamera.zNear = 0.1
        rightCamera.zFar = 200.0
        rightCamera.fieldOfView = currentFOV
        rightCameraNode.camera = rightCamera
        rightCameraNode.position = SCNVector3(x: 0.032, y: 0, z: 0)
        rightScene.rootNode.addChildNode(rightCameraNode)
        rightScene.rootNode.addChildNode(rightDomeNode)
        
        rebuildGeometry()
        rebuildEnvironment()
    }
    
    private func setupPlayer() {
        guard let streamURL = video.fullStreamURL(baseURL: serverBaseURL) else { return }
        let asset = AVURLAsset(url: streamURL)
        let playerItem = AVPlayerItem(asset: asset)
        playerItem.preferredForwardBufferDuration = 10.0
        
        let avPlayer = AVPlayer(playerItem: playerItem)
        avPlayer.automaticallyWaitsToMinimizeStalling = true
        self.player = avPlayer
        
        timeObserverToken = avPlayer.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] time in
            guard let self = self else { return }
            if !self.isSeeking {
                self.currentTime = time.seconds
            }
            let d = playerItem.duration.seconds
            if !d.isNaN && d > 0 && abs(d - self.duration) > 0.5 {
                self.duration = d
            }
            // Atualiza Telemetria Real (Buffer e Quadros Perdidos)
            if let range = playerItem.loadedTimeRanges.first?.timeRangeValue {
                let bufferedEnd = CMTimeGetSeconds(CMTimeAdd(range.start, range.duration))
                self.bufferSeconds = max(0, bufferedEnd - self.currentTime)
            }
            if let log = playerItem.accessLog()?.events.last {
                self.droppedFrames = max(0, log.numberOfDroppedVideoFrames)
            }
        }
        
        updateMaterials()
        avPlayer.play()
        isPlaying = true
    }
    
    private func setupMotion() {
        motionController.start { [weak self] pitch, yaw, roll in
            guard let self = self else { return }
            self.gyroPitch = pitch
            self.gyroYaw = yaw
            self.gyroRoll = roll
            self.updateCameraOrientations()
        }
    }
    
    public func updateCameraOrientations() {
        let angles: SCNVector3
        if isGyroEnabled {
            angles = SCNVector3(x: gyroPitch + panPitch, y: gyroYaw + panYaw, z: gyroRoll)
        } else {
            angles = SCNVector3(x: panPitch, y: panYaw, z: 0)
        }
        leftCameraNode.eulerAngles = angles
        rightCameraNode.eulerAngles = angles
    }
    
    public func recenter() {
        panYaw = 0
        panPitch = 0
        motionController.recenter()
        updateCameraOrientations()
        resetControlsTimer()
    }
    
    public func adjustFOV(delta: CGFloat) {
        currentFOV = min(120.0, max(55.0, currentFOV + delta))
        leftCameraNode.camera?.fieldOfView = currentFOV
        rightCameraNode.camera?.fieldOfView = currentFOV
        resetControlsTimer()
    }
    
    public func rebuildEnvironment() {
        leftEnvNode.removeFromParentNode()
        rightEnvNode.removeFromParentNode()
        leftEnvNode = VRGeometryBuilder.createEnvironmentNode(mode: environmentMode)
        rightEnvNode = VRGeometryBuilder.createEnvironmentNode(mode: environmentMode)
        leftScene.rootNode.addChildNode(leftEnvNode)
        rightScene.rootNode.addChildNode(rightEnvNode)
    }
    
    public func rebuildGeometry() {
        let geometry = VRGeometryBuilder.createDome(projection: projection)
        let zPos: Float = (projection == .flat) ? -22.0 : 0.0
        leftDomeNode.geometry = geometry
        leftDomeNode.position = SCNVector3(x: 0, y: 0, z: zPos)
        rightDomeNode.geometry = geometry
        rightDomeNode.position = SCNVector3(x: 0, y: 0, z: zPos)
        
        let rotZ = Float(videoRotationAngle) * Float.pi / 180.0
        leftDomeNode.eulerAngles = SCNVector3(x: 0, y: 0, z: rotZ)
        rightDomeNode.eulerAngles = SCNVector3(x: 0, y: 0, z: rotZ)
        updateMaterials()
    }
    
    public func updateMaterials() {
        guard let avPlayer = player else { return }
        
        let leftMat = SCNMaterial()
        leftMat.lightingModel = .constant
        leftMat.isDoubleSided = true
        leftMat.diffuse.contents = avPlayer
        leftMat.diffuse.contentsTransform = calculateTransform(isRightEye: false)
        leftMat.shaderModifiers = [.fragment: colorGradingShader]
        
        let rightMat = SCNMaterial()
        rightMat.lightingModel = .constant
        rightMat.isDoubleSided = true
        rightMat.diffuse.contents = avPlayer
        rightMat.diffuse.contentsTransform = calculateTransform(isRightEye: true)
        rightMat.shaderModifiers = [.fragment: colorGradingShader]
        
        leftDomeNode.geometry?.materials = [leftMat]
        rightDomeNode.geometry?.materials = [rightMat]
        applyShaderUniforms()
    }
    
    public func applyShaderUniforms() {
        let mats = (leftDomeNode.geometry?.materials ?? []) + (rightDomeNode.geometry?.materials ?? [])
        for mat in mats {
            mat.setValue(exposure, forKey: "exposureVal")
            mat.setValue(contrast, forKey: "contrastVal")
            mat.setValue(saturation, forKey: "saturationVal")
            mat.setValue(gamma, forKey: "gammaVal")
        }
    }
    
    private func calculateTransform(isRightEye: Bool) -> SCNMatrix4 {
        let effectiveRight = isEyeSwapped ? !isRightEye : isRightEye
        if displayMode == .magicWindow {
            switch stereo {
            case .sbs:
                var t = SCNMatrix4Identity; t.m11 = 0.5; t.m41 = 0.0; return t
            case .topBottom:
                var t = SCNMatrix4Identity; t.m22 = 0.5; t.m42 = 0.0; return t
            case .mono:
                return SCNMatrix4Identity
            }
        }
        switch stereo {
        case .sbs:
            var t = SCNMatrix4Identity; t.m11 = 0.5; t.m22 = 1.0; t.m41 = effectiveRight ? 0.5 : 0.0; return t
        case .topBottom:
            var t = SCNMatrix4Identity; t.m11 = 1.0; t.m22 = 0.5; t.m42 = effectiveRight ? 0.5 : 0.0; return t
        case .mono:
            return SCNMatrix4Identity
        }
    }
    
    public func togglePlayPause() {
        guard let p = player else { return }
        if isPlaying { p.pause(); isPlaying = false } else { p.play(); isPlaying = true }
        resetControlsTimer()
    }
    
    public func seekBy(_ seconds: Double) {
        guard let p = player else { return }
        let target = max(0, min(duration, currentTime + seconds))
        p.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = target
        resetControlsTimer()
    }
    
    public func resetControlsTimer() {
        controlsTimer?.cancel()
        guard !showSettingsModal && !showHUDLayoutModal else { return }
        controlsTimer = Just(())
            .delay(for: .seconds(autoHideSeconds), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                withAnimation(.easeInOut(duration: 0.25)) {
                    self?.showControls = false
                }
            }
    }
    
    // Funções do Editor de Layout dos HUDs (Imagem 2)
    public func moveSelectedHUD(dx: Double, dy: Double) {
        var current = hudLayouts[selectedHUDTarget] ?? HUDElementLayout()
        current.offsetXPercent = min(40, max(-40, current.offsetXPercent + dx))
        current.offsetYPercent = min(40, max(-40, current.offsetYPercent + dy))
        hudLayouts[selectedHUDTarget] = current
    }
    
    public func scaleSelectedHUD(delta: Double) {
        var current = hudLayouts[selectedHUDTarget] ?? HUDElementLayout()
        current.scalePercent = min(150, max(60, current.scalePercent + delta))
        hudLayouts[selectedHUDTarget] = current
    }
    
    public func resetCurrentHUDElement() {
        hudLayouts[selectedHUDTarget] = HUDElementLayout()
    }
    
    public func resetAllHUDDefaults() {
        hudLayouts = [.topBar: HUDElementLayout(), .bottomBar: HUDElementLayout(), .telemetry: HUDElementLayout()]
        safeMarginPercent = 8.0
        hudOpacityPercent = 100.0
        autoHideSeconds = 3.5
        opticalCenterFollow = false
    }
    
    public func loadProfileAndResume() {
        let key = video.profileKey
        let trimmedBase = serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBase)/api/profiles?key=\(key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key)") else { return }
        
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data, let self = self else { return }
            struct SingleProfileResponse: Codable { let success: Bool?; let profile: VideoProfile? }
            if let resp = try? JSONDecoder().decode(SingleProfileResponse.self, from: data), let prof = resp.profile {
                DispatchQueue.main.async {
                    if prof.currentTime > 5 && !prof.completed {
                        self.player?.seek(to: CMTime(seconds: prof.currentTime, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
                        self.showDoInicioPill = true
                    }
                    if prof.duration > 0 { self.duration = prof.duration }
                    if let cfg = prof.profile {
                        if let p = cfg.projection, let projMode = VRProjectionMode(rawValue: p) { self.projection = projMode; self.rebuildGeometry() }
                        if let s = cfg.stereo, let stereoMode = VRStereoMode(rawValue: s) { self.stereo = stereoMode; self.updateMaterials() }
                        if let swap = cfg.swap { self.isEyeSwapped = swap; self.updateMaterials() }
                    }
                }
            }
        }.resume()
    }
    
    public func saveProfileSync(completed: Bool) {
        guard currentTime > 0 else { return }
        let trimmedBase = serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBase)/api/profiles") else { return }
        let profileConfig = ProfileConfig(projection: projection.rawValue, stereo: stereo.rawValue, swap: isEyeSwapped)
        let videoProf = VideoProfile(currentTime: currentTime, duration: duration, completed: completed, updatedAt: Int64(Date().timeIntervalSince1970 * 1000), profile: profileConfig)
        let payload = ProfileSavePayload(key: video.profileKey, data: videoProf)
        guard let body = try? JSONEncoder().encode(payload) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        URLSession.shared.dataTask(with: request).resume()
    }
}

// MARK: - VR Video Player View (Fiel às 6 Capturas do PWA)

public struct VRVideoPlayerView: View {
    public let video: VideoItem
    public let serverBaseURL: String
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm: VRPlayerViewModel
    
    public init(video: VideoItem, serverBaseURL: String) {
        self.video = video
        self.serverBaseURL = serverBaseURL
        _vm = StateObject(wrappedValue: VRPlayerViewModel(video: video, serverBaseURL: serverBaseURL))
    }
    
    public var body: some View {
        GeometryReader { geometry in
            let w = geometry.size.width
            let h = geometry.size.height
            
            ZStack {
                Color.black.ignoresSafeArea(.all)
                
                // 1. RENDERIZAÇÃO 3D (1 Tela ou 2 Telas com Máscara de Lente VR da Imagem 2 e 3)
                if vm.displayMode == .stereoHeadset {
                    HStack(spacing: 0) {
                        SCNVRViewContainer(scene: vm.leftScene, pointOfView: vm.leftCameraNode)
                            .frame(width: w / 2, height: h)
                            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                            .padding(.leading, 8)
                            .padding(.trailing, 4)
                            .padding(.vertical, 6)
                        
                        SCNVRViewContainer(scene: vm.rightScene, pointOfView: vm.rightCameraNode)
                            .frame(width: w / 2, height: h)
                            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                            .padding(.leading, 4)
                            .padding(.trailing, 8)
                            .padding(.vertical, 6)
                    }
                } else {
                    SCNVRViewContainer(scene: vm.leftScene, pointOfView: vm.leftCameraNode)
                        .frame(width: w, height: h)
                }
                
                // 2. GESTOS DE PAN & TAP
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                vm.panYaw += Float(value.translation.width * 0.0005)
                                vm.panPitch += Float(value.translation.height * 0.0005)
                                vm.updateCameraOrientations()
                                vm.resetControlsTimer()
                            }
                    )
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            if vm.showSettingsModal || vm.showHUDLayoutModal {
                                vm.showSettingsModal = false
                                vm.showHUDLayoutModal = false
                            } else {
                                vm.showControls.toggle()
                            }
                        }
                        if vm.showControls { vm.resetControlsTimer() }
                    }
                
                // 3. TELEMETRIA (Sempre visível no olho esquerdo ou canto superior esquerdo quando ativa - Imagem 2, 3 e 4)
                if vm.showTelemetry {
                    telemetryOverlay(totalSize: geometry.size)
                }
                
                // 4. HUD E MODAIS (Respeitando o Olho Dominante no Modo Óculos - Imagem 1, 2 e 3)
                if vm.showControls || vm.showSettingsModal || vm.showHUDLayoutModal {
                    hudRouter(totalSize: geometry.size)
                        .opacity(vm.hudOpacityPercent / 100.0)
                        .transition(.opacity)
                }
            }
        }
        .ignoresSafeArea(.all)
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .onAppear {
            forceLandscapeOrientation()
            vm.setup()
        }
        .onDisappear {
            unlockOrientation()
            vm.cleanup()
        }
    }
    
    // MARK: - Roteador de Olho Dominante (Exibe HUD na Tela Inteira ou só no Olho Dominante)
    
    @ViewBuilder
    private func hudRouter(totalSize: CGSize) -> some View {
        if vm.displayMode == .magicWindow {
            // Modo 1 Tela (Imagem 4)
            singleScreenHUD(size: totalSize)
        } else {
            // Modo Óculos 2 Telas (Imagens 1, 2 e 3)
            let halfSize = CGSize(width: totalSize.width / 2, height: totalSize.height)
            HStack(spacing: 0) {
                // Metade Esquerda
                ZStack {
                    if vm.dominantEye == .left || vm.dominantEye == .both {
                        vrEyeHUD(eyeSize: halfSize)
                    }
                }
                .frame(width: halfSize.width, height: halfSize.height)
                
                // Metade Direita
                ZStack {
                    if vm.dominantEye == .right || vm.dominantEye == .both {
                        vrEyeHUD(eyeSize: halfSize)
                    }
                }
                .frame(width: halfSize.width, height: halfSize.height)
            }
        }
    }
    
    // MARK: - HUD Modo 1 Tela (Idêntico à Imagem 4)
    
    private func singleScreenHUD(size: CGSize) -> some View {
        let topLayout = vm.hudLayouts[.topBar] ?? HUDElementLayout()
        let bottomLayout = vm.hudLayouts[.bottomBar] ?? HUDElementLayout()
        
        return ZStack {
            VStack(spacing: 0) {
                // Barra Superior de 1 Linha (Imagem 4)
                HStack(spacing: 10) {
                    closeButton
                    titlePill(maxWidth: 320)
                    Spacer(minLength: 8)
                    HStack(spacing: 16) {
                        toolbarIconsRow
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 40)
                    .background(Color(white: 0.10).opacity(0.88))
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                }
                .scaleEffect(topLayout.scalePercent / 100.0)
                .offset(x: size.width * (topLayout.offsetXPercent / 100.0), y: size.height * (topLayout.offsetYPercent / 100.0))
                .padding(.horizontal, 24)
                .padding(.top, 14)
                
                if vm.showDoInicioPill {
                    doInicioPill
                        .padding(.top, 10)
                }
                
                Spacer()
                
                // Botão Play Central Translúcido Grande (Imagem 4)
                if !vm.showSettingsModal && !vm.showHUDLayoutModal {
                    Button(action: { vm.togglePlayPause() }) {
                        Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: vm.isPlaying ? 0 : 2)
                            .frame(width: 76, height: 76)
                            .background(Color(white: 0.14).opacity(0.78))
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 1))
                    }
                }
                
                Spacer()
                
                // Barra Inferior de Reprodução (Imagem 4)
                bottomPlaybackCard(compact: false)
                    .scaleEffect(bottomLayout.scalePercent / 100.0)
                    .offset(x: size.width * (bottomLayout.offsetXPercent / 100.0), y: size.height * (bottomLayout.offsetYPercent / 100.0))
                    .padding(.horizontal, 24)
                    .padding(.bottom, 18)
            }
            
            // Modais Flutuantes (Imagem 1 e 2)
            if vm.showSettingsModal {
                settingsModalView
            }
            if vm.showHUDLayoutModal {
                hudLayoutEditorModalView
            }
        }
    }
    
    // MARK: - HUD Modo Óculos Compacto por Olho (Idêntico às Imagens 1, 2 e 3)
    
    private func vrEyeHUD(eyeSize: CGSize) -> some View {
        let topLayout = vm.hudLayouts[.topBar] ?? HUDElementLayout()
        let bottomLayout = vm.hudLayouts[.bottomBar] ?? HUDElementLayout()
        let margin = eyeSize.width * (vm.safeMarginPercent / 100.0)
        
        return ZStack {
            if !vm.showSettingsModal && !vm.showHUDLayoutModal {
                VStack(alignment: .leading, spacing: 8) {
                    // Na Imagem 3: Botão X em cima, Título embaixo, e Grid 5x2 de Ícones!
                    VStack(alignment: .leading, spacing: 8) {
                        closeButton
                        titlePill(maxWidth: 230)
                        
                        // Grid 5x2 de Ícones (Idêntico à Imagem 3)
                        VStack(spacing: 10) {
                            HStack(spacing: 16) {
                                toolbarIconsFirstHalf
                            }
                            HStack(spacing: 16) {
                                toolbarIconsSecondHalf
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color(white: 0.14).opacity(0.88))
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(vm.showHUDLayoutModal && vm.selectedHUDTarget == .topBar ? Color.blue : Color.white.opacity(0.1), lineWidth: 1)
                        )
                    }
                    .scaleEffect(topLayout.scalePercent / 100.0)
                    .offset(x: eyeSize.width * (topLayout.offsetXPercent / 100.0), y: eyeSize.height * (topLayout.offsetYPercent / 100.0))
                    
                    Spacer()
                    
                    // Barra de Reprodução Compacta para caber em 1 Olho
                    bottomPlaybackCard(compact: true)
                        .scaleEffect(bottomLayout.scalePercent / 100.0)
                        .offset(x: eyeSize.width * (bottomLayout.offsetXPercent / 100.0), y: eyeSize.height * (bottomLayout.offsetYPercent / 100.0))
                }
                .padding(.horizontal, max(16, margin))
                .padding(.vertical, 24)
            }
            
            // Modal de Configurações no Olho Dominante (Imagem 1)
            if vm.showSettingsModal {
                settingsModalView
            }
            
            // Modal Layout dos HUDs no Olho Dominante (Imagem 2)
            if vm.showHUDLayoutModal {
                hudLayoutEditorModalView
            }
        }
    }
    
    // MARK: - Telemetria (Idêntica às Imagens 2, 3 e 4)
    
    private func telemetryOverlay(totalSize: CGSize) -> some View {
        let telLayout = vm.hudLayouts[.telemetry] ?? HUDElementLayout()
        return VStack(alignment: .leading, spacing: 8) {
            // Pílula compacta superior (aparece no Modo Óculos - Imagem 2 e 3)
            if vm.displayMode == .stereoHeadset {
                HStack(spacing: 6) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.orange)
                    Text("\(vm.currentFPS) FPS  ·  Buf: \(String(format: "%.1fs", vm.bufferSeconds))  ·  Drops: \(vm.droppedFrames)")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.black.opacity(0.78))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.1), lineWidth: 1))
            }
            
            // Card Detalhado de Telemetria (Imagens 2, 3 e 4)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 8, height: 8)
                    Text("\(vm.currentFPS) FPS")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                    Spacer()
                    Text(video.resolutionBadge ?? "4K")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(red: 0.3, green: 0.65, blue: 1.0))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.blue.opacity(0.25))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Buffer AVPlayer:")
                            .foregroundColor(.white.opacity(0.6))
                        Spacer()
                        Text(String(format: "%.1fs", vm.bufferSeconds))
                            .foregroundColor(.green)
                            .fontWeight(.semibold)
                    }
                    HStack {
                        Text("Quadros Perdidos:")
                            .foregroundColor(.white.opacity(0.6))
                        Spacer()
                        let pct = vm.currentTime > 0 ? (Double(vm.droppedFrames) / (vm.currentTime * 60.0)) * 100.0 : 0.0
                        Text("\(vm.droppedFrames) (\(String(format: "%.1f%%", pct)))")
                            .foregroundColor(vm.droppedFrames > 0 ? .yellow : .green)
                            .fontWeight(.semibold)
                    }
                    HStack {
                        Text("GPU / Stream:")
                            .foregroundColor(.white.opacity(0.6))
                        Spacer()
                        Text("METAL")
                            .foregroundColor(.white)
                            .fontWeight(.bold)
                    }
                }
                .font(.system(size: 11, design: .monospaced))
            }
            .padding(12)
            .frame(width: 215)
            .background(Color(white: 0.14).opacity(0.84))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 1))
        }
        .scaleEffect(telLayout.scalePercent / 100.0)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.leading, 24)
        .padding(.top, vm.displayMode == .stereoHeadset ? 18 : 66)
    }
    
    // MARK: - Modal de Configurações Completo (Idêntico à Imagem 1)
    
    private var settingsModalView: some View {
        ScrollView(showsIndicators: true) {
            VStack(alignment: .leading, spacing: 14) {
                // Cabeçalho com botão fechar
                HStack {
                    Text("LAYOUT")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.55))
                    Spacer()
                    Button(action: { withAnimation { vm.showSettingsModal = false } }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white.opacity(0.7))
                            .frame(width: 26, height: 26)
                            .background(Color.white.opacity(0.1))
                            .clipShape(Circle())
                    }
                }
                
                // Segmented Control: Quadro único | Lado a lado | Cima / baixo
                HStack(spacing: 4) {
                    segmentedButton(title: "Quadro único", isSelected: vm.stereo == .mono) {
                        vm.stereo = .mono; vm.updateMaterials()
                    }
                    segmentedButton(title: "Lado a lado", isSelected: vm.stereo == .sbs) {
                        vm.stereo = .sbs; vm.updateMaterials()
                    }
                    segmentedButton(title: "Cima / baixo", isSelected: vm.stereo == .topBottom) {
                        vm.stereo = .topBottom; vm.updateMaterials()
                    }
                }
                .padding(4)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                
                // Toggle: Inverter olhos
                HStack {
                    Text("Inverter olhos")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white)
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { vm.isEyeSwapped },
                        set: { val in vm.isEyeSwapped = val; vm.updateMaterials() }
                    ))
                    .labelsHidden()
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                
                Text("Ative se o 3D parecer estranho ou cansar a vista (olho esquerdo e direito trocados).")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.5))
                
                // OLHO DOMINANTE (MODO ÓCULOS)
                Text("OLHO DOMINANTE (MODO ÓCULOS)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.55))
                    .padding(.top, 4)
                
                HStack(spacing: 4) {
                    ForEach(VRDominantEye.allCases) { eye in
                        segmentedButton(title: eye.rawValue, isSelected: vm.dominantEye == eye) {
                            vm.dominantEye = eye
                        }
                    }
                }
                .padding(4)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                
                Text("Exibe os menus flutuantes e HUD exclusivamente no olho dominante selecionado para visão 100% limpa no olho oposto.")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.5))
                
                // AMBIENTE VIRTUAL (MODO CINEMA / PLANO)
                Text("AMBIENTE VIRTUAL (MODO CINEMA / PLANO)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.55))
                    .padding(.top, 4)
                
                HStack(spacing: 4) {
                    ForEach(VREnvironmentMode.allCases) { env in
                        segmentedButton(title: env.rawValue, isSelected: vm.environmentMode == env) {
                            vm.environmentMode = env
                            vm.rebuildEnvironment()
                        }
                    }
                }
                .padding(4)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                
                // Botão: Ajustar Posição dos Menus & HUDs (Abre Modal da Imagem 2)
                Button(action: {
                    withAnimation {
                        vm.showSettingsModal = false
                        vm.showHUDLayoutModal = true
                    }
                }) {
                    HStack(spacing: 8) {
                        Image(systemName: "triangle.righttriangle.left.and.line.vertical")
                            .font(.system(size: 13))
                        Text("Ajustar Posição dos Menus & HUDs")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(Color(red: 0.35, green: 0.72, blue: 1.0))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.white.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.top, 4)
                
                // Sliders de Imagem (Exposição, Contraste, Saturação, Gama)
                Divider().background(Color.white.opacity(0.15)).padding(.vertical, 4)
                
                HStack {
                    Text("AJUSTES DE IMAGEM (SHADERS)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.55))
                    Spacer()
                    Button("Resetar") {
                        vm.exposure = 0; vm.contrast = 1; vm.saturation = 1; vm.gamma = 1
                        vm.applyShaderUniforms()
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.cyan)
                }
                
                shaderRow("Exposição", value: $vm.exposure, range: -1.0...1.0)
                shaderRow("Contraste", value: $vm.contrast, range: 0.5...1.5)
                shaderRow("Saturação", value: $vm.saturation, range: 0.0...2.0)
                shaderRow("Gama", value: $vm.gamma, range: 0.5...2.0)
            }
            .padding(18)
        }
        .frame(width: 340, height: 340)
        .background(Color(red: 0.11, green: 0.11, blue: 0.12).opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.12), lineWidth: 1))
    }
    
    // MARK: - Modal Editor "Layout dos HUDs" (Idêntico à Imagem 2)
    
    private var hudLayoutEditorModalView: some View {
        let currentLayout = vm.hudLayouts[vm.selectedHUDTarget] ?? HUDElementLayout()
        
        return VStack(spacing: 10) {
            // Cabeçalho
            HStack {
                Image(systemName: "ruler")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.7))
                Text("Layout dos HUDs")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                Text("(Modo Óculos)")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.5))
                Spacer()
                Button(action: { withAnimation { vm.showHUDLayoutModal = false } }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white.opacity(0.7))
                        .frame(width: 24, height: 24)
                        .background(Color.white.opacity(0.1))
                        .clipShape(Circle())
                }
            }
            
            // Seletor de Elemento (< Barra de funções >)
            HStack {
                Button(action: { cycleHUDTarget(forward: false) }) {
                    Image(systemName: "play.fill")
                        .rotationEffect(.degrees(180))
                        .font(.system(size: 10))
                        .foregroundColor(.white)
                        .frame(width: 28, height: 28)
                        .background(Color.white.opacity(0.08))
                        .clipShape(Circle())
                }
                Spacer()
                VStack(spacing: 2) {
                    Text(vm.selectedHUDTarget.rawValue)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Color(red: 0.35, green: 0.75, blue: 1.0))
                    Text(String(format: "X: %+.0f%% · Y: %+.0f%%", currentLayout.offsetXPercent, currentLayout.offsetYPercent))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(.white.opacity(0.5))
                }
                Spacer()
                Button(action: { cycleHUDTarget(forward: true) }) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.white)
                        .frame(width: 28, height: 28)
                        .background(Color.white.opacity(0.08))
                        .clipShape(Circle())
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            
            // D-Pad Direcional (▲ ◄ + ► ▼)
            VStack(spacing: 4) {
                dpadButton("triangle.fill", rotation: 0) { vm.moveSelectedHUD(dx: 0, dy: -2) }
                HStack(spacing: 4) {
                    dpadButton("triangle.fill", rotation: -90) { vm.moveSelectedHUD(dx: -2, dy: 0) }
                    ZStack {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color.white.opacity(0.04))
                            .frame(width: 30, height: 28)
                        Image(systemName: "plus")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.4))
                    }
                    dpadButton("triangle.fill", rotation: 90) { vm.moveSelectedHUD(dx: 2, dy: 0) }
                }
                dpadButton("triangle.fill", rotation: 180) { vm.moveSelectedHUD(dx: 0, dy: 2) }
            }
            .padding(.vertical, 2)
            
            // Linhas de Ajuste: Escala, Margem segura, Opacidade, Auto-ocultar, Centro óptico
            VStack(spacing: 6) {
                stepperRow(
                    label: "Escala do elemento:",
                    valueText: "\(Int(currentLayout.scalePercent))%",
                    onMinus: { vm.scaleSelectedHUD(delta: -5) },
                    onPlus: { vm.scaleSelectedHUD(delta: 5) }
                )
                stepperRow(
                    label: "Margem segura:",
                    valueText: "\(Int(vm.safeMarginPercent))%",
                    onMinus: { vm.safeMarginPercent = max(0, vm.safeMarginPercent - 2) },
                    onPlus: { vm.safeMarginPercent = min(20, vm.safeMarginPercent + 2) }
                )
                stepperRow(
                    label: "Opacidade:",
                    valueText: "\(Int(vm.hudOpacityPercent))%",
                    onMinus: { vm.hudOpacityPercent = max(30, vm.hudOpacityPercent - 10) },
                    onPlus: { vm.hudOpacityPercent = min(100, vm.hudOpacityPercent + 10) }
                )
                
                HStack {
                    Text("Auto-ocultar:")
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.65))
                    Spacer()
                    Button(action: {
                        vm.autoHideSeconds = vm.autoHideSeconds == 3.5 ? 5.0 : (vm.autoHideSeconds == 5.0 ? 8.0 : 3.5)
                    }) {
                        Text(String(format: "%.1f s", vm.autoHideSeconds).replacingOccurrences(of: ".", with: ","))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.white.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
                
                HStack {
                    Text("Centro óptico:")
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.65))
                    Spacer()
                    Button(action: { vm.opticalCenterFollow.toggle() }) {
                        Text(vm.opticalCenterFollow ? "◎ Seguir: LIGADO" : "◎ Seguir: DESLIGADO")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(vm.opticalCenterFollow ? .cyan : .white.opacity(0.8))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.white.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
            
            // Rodapé: ↺ Elemento | ↺ Padrões | ✓ Concluir
            HStack(spacing: 8) {
                Button(action: { vm.resetCurrentHUDElement() }) {
                    Text("↺ Elemento")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                Button(action: { vm.resetAllHUDDefaults() }) {
                    Text("↺ Padrões")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                Button(action: { withAnimation { vm.showHUDLayoutModal = false } }) {
                    Text("✓ Concluir")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.blue)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding(.top, 2)
        }
        .padding(14)
        .frame(width: 280)
        .background(Color(red: 0.12, green: 0.13, blue: 0.15).opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
    }
    
    // MARK: - Subcomponentes dos Botões da Barra Superior (Com Círculo Branco de Seleção igual às Imagens 3 e 4)
    
    @ViewBuilder
    private var toolbarIconsFirstHalf: some View {
        // 1. Recentralizar
        toolbarIcon("scope", isActive: false) { vm.recenter() }
        // 2. Zoom Out
        toolbarIcon("minus.magnifyingglass", isActive: vm.currentFOV > 95) { vm.adjustFOV(delta: 10) }
        // 3. Zoom In
        toolbarIcon("plus.magnifyingglass", isActive: vm.currentFOV < 95) { vm.adjustFOV(delta: -10) }
        // 4. Telemetria (Ícone de pulso igual às Imagens 3 e 4!)
        toolbarIcon("waveform.path.ecg", isActive: vm.showTelemetry) {
            withAnimation { vm.showTelemetry.toggle() }
        }
        // 5. Enquadramento / Rotação
        toolbarIcon("viewfinder", isActive: vm.videoRotationAngle != 0) {
            vm.videoRotationAngle = (vm.videoRotationAngle + 90) % 360
            vm.rebuildGeometry()
        }
    }
    
    @ViewBuilder
    private var toolbarIconsSecondHalf: some View {
        // 6. Lado a Lado / Estereoscopia
        toolbarIcon("rectangle.split.2x1", isActive: vm.stereo != .mono) {
            let all = VRStereoMode.allCases
            if let idx = all.firstIndex(of: vm.stereo) {
                vm.stereo = all[(idx + 1) % all.count]
                vm.updateMaterials()
            }
        }
        // 7. Pílula "Do início" / Bookmark
        toolbarIcon("bookmark", isActive: vm.showDoInicioPill) {
            withAnimation { vm.showDoInicioPill.toggle() }
        }
        // 8. Modal de Configurações Completo (Imagem 1)
        toolbarIcon("slider.horizontal.3", isActive: vm.showSettingsModal) {
            withAnimation {
                vm.showHUDLayoutModal = false
                vm.showSettingsModal.toggle()
            }
        }
        // 9. Modo Óculos VR (2 Telas vs 1 Tela)
        toolbarIcon("eyeglasses", isActive: vm.displayMode == .stereoHeadset) {
            withAnimation(.easeInOut(duration: 0.2)) {
                vm.displayMode = (vm.displayMode == .stereoHeadset) ? .magicWindow : .stereoHeadset
            }
            vm.updateMaterials()
        }
        // 10. Editor de Layout dos HUDs (Imagem 2)
        toolbarIcon("sidebar.left", isActive: vm.showHUDLayoutModal) {
            withAnimation {
                vm.showSettingsModal = false
                vm.showHUDLayoutModal.toggle()
            }
        }
    }
    
    @ViewBuilder
    private var toolbarIconsRow: some View {
        toolbarIconsFirstHalf
        toolbarIconsSecondHalf
    }
    
    // Na Imagem 3 e 4, os ícones ativos ganham um fundo circular branco sólido com ícone preto!
    private func toolbarIcon(_ systemName: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(isActive ? .black : .white.opacity(0.9))
                .frame(width: 30, height: 30)
                .background(isActive ? Color.white : Color.clear)
                .clipShape(Circle())
        }
    }
    
    private var closeButton: some View {
        Button(action: { dismiss() }) {
            Image(systemName: "xmark")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white.opacity(0.9))
                .frame(width: 38, height: 38)
                .background(Color(white: 0.12).opacity(0.88))
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
        }
    }
    
    private func titlePill(maxWidth: CGFloat) -> some View {
        Text(video.name)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(.white)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.horizontal, 16)
            .frame(height: 38)
            .frame(maxWidth: maxWidth, alignment: .leading)
            .background(Color(white: 0.12).opacity(0.88))
            .clipShape(Capsule())
            .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
    }
    
    private var doInicioPill: some View {
        HStack {
            Spacer()
            Button(action: {
                vm.player?.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
                vm.currentTime = 0
                vm.showDoInicioPill = false
            }) {
                HStack(spacing: 5) {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 11, weight: .semibold))
                    Text("Do início")
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundColor(Color(red: 0.35, green: 0.9, blue: 0.95))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(Color(red: 0.05, green: 0.25, blue: 0.30).opacity(0.9))
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Color(red: 0.2, green: 0.65, blue: 0.75).opacity(0.6), lineWidth: 1))
            }
        }
        .padding(.horizontal, 14)
        .frame(width: 260, height: 46)
        .background(Color(red: 0.04, green: 0.07, blue: 0.11).opacity(0.88))
        .clipShape(Capsule())
        .overlay(Capsule().stroke(Color(red: 0.15, green: 0.35, blue: 0.45).opacity(0.5), lineWidth: 1))
    }
    
    // MARK: - Card Inferior de Reprodução (Com Pílula Combinada "360° · Lado a lado" da Imagem 4)
    
    private func bottomPlaybackCard(compact: Bool) -> some View {
        VStack(spacing: compact ? 8 : 12) {
            HStack(spacing: 10) {
                Text(formatTime(vm.currentTime))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.65))
                    .monospacedDigit()
                
                Slider(
                    value: Binding(
                        get: { vm.currentTime },
                        set: { newVal in vm.currentTime = newVal; vm.isSeeking = true }
                    ),
                    in: 0...max(vm.duration, 1),
                    onEditingChanged: { editing in
                        if !editing {
                            vm.player?.seek(
                                to: CMTime(seconds: vm.currentTime, preferredTimescale: 600),
                                toleranceBefore: .zero, toleranceAfter: .zero
                            ) { [weak vm] _ in vm?.isSeeking = false }
                        }
                        vm.resetControlsTimer()
                    }
                )
                .tint(.white)
                
                Text(formatTime(vm.duration))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.65))
                    .monospacedDigit()
            }
            
            HStack {
                Button(action: { vm.isMuted.toggle(); vm.player?.isMuted = vm.isMuted }) {
                    Image(systemName: vm.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.system(size: compact ? 13 : 15))
                        .foregroundColor(.white.opacity(0.85))
                }
                
                if !compact {
                    Spacer()
                    Button(action: { withAnimation { vm.showSettingsModal.toggle() } }) {
                        Image(systemName: "headphones")
                            .font(.system(size: 15))
                            .foregroundColor(.white.opacity(0.85))
                    }
                }
                
                Spacer()
                
                HStack(spacing: compact ? 16 : 26) {
                    Button(action: { vm.seekBy(-30) }) {
                        Image(systemName: "backward.fill")
                            .font(.system(size: compact ? 12 : 14))
                            .foregroundColor(.white.opacity(0.85))
                    }
                    Button(action: { vm.seekBy(-10) }) {
                        Image(systemName: "gobackward.10")
                            .font(.system(size: compact ? 15 : 18, weight: .medium))
                            .foregroundColor(.white)
                    }
                    Button(action: { vm.togglePlayPause() }) {
                        Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: compact ? 17 : 20, weight: .bold))
                            .foregroundColor(.white)
                    }
                    Button(action: { vm.seekBy(10) }) {
                        Image(systemName: "goforward.10")
                            .font(.system(size: compact ? 15 : 18, weight: .medium))
                            .foregroundColor(.white)
                    }
                    Button(action: { vm.seekBy(30) }) {
                        Image(systemName: "forward.fill")
                            .font(.system(size: compact ? 12 : 14))
                            .foregroundColor(.white.opacity(0.85))
                    }
                }
                
                Spacer()
                
                // Pílula Combinada ("360° · Lado a lado" igual à Imagem 4)
                Menu {
                    Section("Projeção") {
                        ForEach(VRProjectionMode.allCases) { mode in
                            Button(action: { vm.projection = mode; vm.rebuildGeometry() }) {
                                HStack { Text(mode.displayName); if vm.projection == mode { Image(systemName: "checkmark") } }
                            }
                        }
                    }
                    Section("Layout 3D") {
                        ForEach(VRStereoMode.allCases) { s in
                            Button(action: { vm.stereo = s; vm.updateMaterials() }) {
                                HStack { Text(s.displayName); if vm.stereo == s { Image(systemName: "checkmark") } }
                            }
                        }
                    }
                } label: {
                    Text(combinedProjectionStereoLabel)
                        .font(.system(size: compact ? 10 : 12, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, compact ? 10 : 14)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
        }
        .padding(.horizontal, compact ? 14 : 22)
        .padding(.vertical, compact ? 10 : 14)
        .frame(maxWidth: compact ? 330 : 580)
        .background(Color(white: 0.10).opacity(0.90))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }
    
    // MARK: - Helpers
    
    private var combinedProjectionStereoLabel: String {
        let proj: String
        switch vm.projection {
        case .vr360: proj = "360°"
        case .vr180: proj = "180°"
        case .fisheye180: proj = "Fisheye"
        case .flat: proj = "2D"
        }
        let st: String
        switch vm.stereo {
        case .sbs: st = "Lado a lado"
        case .topBottom: st = "Cima / baixo"
        case .mono: return proj
        }
        return "\(proj) · \(st)"
    }
    
    private func segmentedButton(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(isSelected ? Color.white.opacity(0.28) : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
    
    private func dpadButton(_ icon: String, rotation: Double, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 9))
                .rotationEffect(.degrees(rotation))
                .foregroundColor(.white)
                .frame(width: 30, height: 28)
                .background(Color.white.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }
    
    private func stepperRow(label: String, valueText: String, onMinus: @escaping () -> Void, onPlus: @escaping () -> Void) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.65))
            Spacer()
            HStack(spacing: 8) {
                Button(action: onMinus) {
                    Text("-")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 22, height: 22)
                }
                Text(valueText)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
                    .frame(width: 38)
                Button(action: onPlus) {
                    Text("+")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 22, height: 22)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(Color.white.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }
    
    private func shaderRow(_ label: String, value: Binding<Float>, range: ClosedRange<Float>) -> some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.75))
                .frame(width: 65, alignment: .leading)
            Slider(
                value: Binding(
                    get: { value.wrappedValue },
                    set: { v in value.wrappedValue = v; vm.applyShaderUniforms() }
                ),
                in: range
            )
            .tint(.cyan)
            Text(String(format: "%.1f", value.wrappedValue))
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.white.opacity(0.6))
                .frame(width: 28, alignment: .trailing)
        }
    }
    
    private func cycleHUDTarget(forward: Bool) {
        let all = VRHUDTargetElement.allCases
        guard let idx = all.firstIndex(of: vm.selectedHUDTarget) else { return }
        if forward {
            vm.selectedHUDTarget = all[(idx + 1) % all.count]
        } else {
            vm.selectedHUDTarget = all[(idx - 1 + all.count) % all.count]
        }
    }
    
    private func forceLandscapeOrientation() {
        AppDelegate.orientationLock = .landscape
        UIDevice.current.setValue(UIInterfaceOrientation.landscapeRight.rawValue, forKey: "orientation")
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
            windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight))
            windowScene.windows.first?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        }
    }
    
    private func unlockOrientation() {
        AppDelegate.orientationLock = .allButUpsideDown
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
            windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: .allButUpsideDown))
            windowScene.windows.first?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        }
    }
    
    private func formatTime(_ seconds: Double) -> String {
        guard !seconds.isNaN, seconds >= 0 else { return "0:00" }
        let total = Int(seconds)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }
}