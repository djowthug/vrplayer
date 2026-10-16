import SwiftUI
import SceneKit
import AVFoundation
import CoreMotion
import Combine

// MARK: - VR Geometry Builder

public final class VRGeometryBuilder {
    
    public static func createDome(projection: VRProjectionMode, radius: Float = 50.0, latSegments: Int = 40, lonSegments: Int = 40) -> SCNGeometry {
        switch projection {
        case .flat:
            let plane = SCNPlane(width: 32, height: 18)
            plane.firstMaterial?.lightingModel = .constant
            plane.firstMaterial?.isDoubleSided = true
            return plane
            
        case .vr360:
            return buildEquirectangularMesh(
                radius: radius,
                latSegments: latSegments,
                lonSegments: lonSegments,
                minLat: -Float.pi / 2,
                maxLat: Float.pi / 2,
                minLon: -Float.pi,
                maxLon: Float.pi,
                isFisheye: false
            )
            
        case .vr180:
            return buildEquirectangularMesh(
                radius: radius,
                latSegments: latSegments,
                lonSegments: lonSegments,
                minLat: -Float.pi / 2,
                maxLat: Float.pi / 2,
                minLon: -Float.pi / 2,
                maxLon: Float.pi / 2,
                isFisheye: false
            )
            
        case .fisheye180:
            return buildEquirectangularMesh(
                radius: radius,
                latSegments: latSegments,
                lonSegments: lonSegments,
                minLat: -Float.pi / 2,
                maxLat: Float.pi / 2,
                minLon: -Float.pi / 2,
                maxLon: Float.pi / 2,
                isFisheye: true
            )
        }
    }
    
    private static func buildEquirectangularMesh(
        radius: Float,
        latSegments: Int,
        lonSegments: Int,
        minLat: Float,
        maxLat: Float,
        minLon: Float,
        maxLon: Float,
        isFisheye: Bool
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
                
                // Coordenadas esféricas em direção ao observador no centro (0,0,0)
                let x = radius * cos(phi) * sin(theta)
                let y = radius * sin(phi)
                let z = -radius * cos(phi) * cos(theta)
                
                vertices.append(SCNVector3(x, y, z))
                
                // Normais apontando para dentro (em direção à câmera)
                normals.append(SCNVector3(-x / radius, -y / radius, -z / radius))
                
                if isFisheye {
                    // Mapeamento equidistante circular Fisheye
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
                    // Equirretangular padrão
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
                
                // Triângulos com enrolamento interno
                indices.append(p0)
                indices.append(p2)
                indices.append(p1)
                
                indices.append(p1)
                indices.append(p2)
                indices.append(p3)
            }
        }
        
        let vertexSource = SCNGeometrySource(vertices: vertices)
        let normalSource = SCNGeometrySource(normals: normals)
        let uvSource = SCNGeometrySource(textureCoordinates: uvs)
        let element = SCNGeometryElement(indices: indices, primitiveType: .triangles)
        
        let geometry = SCNGeometry(sources: [vertexSource, normalSource, uvSource], elements: [element])
        geometry.firstMaterial?.lightingModel = .constant
        geometry.firstMaterial?.isDoubleSided = true
        return geometry
    }
}

// MARK: - SceneKit Metal View Representable

public struct SCNVRViewContainer: UIViewRepresentable {
    public let scene: SCNScene
    public let pointOfView: SCNNode
    
    public init(scene: SCNScene, pointOfView: SCNNode) {
        self.scene = scene
        self.pointOfView = pointOfView
    }
    
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
    @Published public var orientation: SCNVector4 = SCNVector4(0, 0, 0, 1)
    
    public var yawOffset: Float = 0
    public var pitchOffset: Float = 0
    
    public init() {}
    
    public func start() {
        guard motionManager.isDeviceMotionAvailable else { return }
        motionManager.deviceMotionUpdateInterval = 1.0 / 60.0
        motionManager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] motion, _ in
            guard let self = self, let motion = motion else { return }
            let attitude = motion.attitude
            
            // Converte rotação do giroscópio para orientação em eixos do SceneKit
            let q = attitude.quaternion
            
            // Correção para visualização Landscape com pitch/yaw centralizados
            let pitch = Float(attitude.pitch) + self.pitchOffset
            let roll = Float(attitude.roll)
            let yaw = Float(attitude.yaw) + self.yawOffset
            
            self.orientation = SCNVector4(pitch, yaw, roll, Float(q.w))
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
        yawOffset = -Float(motion.attitude.yaw)
        pitchOffset = -Float(motion.attitude.pitch)
    }
}

// MARK: - VR Video Player View

public struct VRVideoPlayerView: View {
    public let video: VideoItem
    public let serverBaseURL: String
    @Environment(\.dismiss) private var dismiss
    
    // Player State
    @State private var player: AVPlayer?
    @State private var isPlaying: Bool = true
    @State private var currentTime: Double = 0
    @State private var duration: Double = 0
    @State private var isSeeking: Bool = false
    @State private var showControls: Bool = true
    @State private var controlsTimer: AnyCancellable?
    
    // VR Configurations
    @State private var projection: VRProjectionMode = .vr180
    @State private var stereo: VRStereoMode = .sbs
    @State private var displayMode: VRDisplayMode = .stereoHeadset
    @State private var isEyeSwapped: Bool = false
    
    // SceneKit Scenes
    @State private var leftScene = SCNScene()
    @State private var rightScene = SCNScene()
    @State private var leftCameraNode = SCNNode()
    @State private var rightCameraNode = SCNNode()
    @State private var leftDomeNode = SCNNode()
    @State private var rightDomeNode = SCNNode()
    
    // Gesture Look Around
    @State private var panYaw: Float = 0
    @State private var panPitch: Float = 0
    
    // CoreMotion
    @StateObject private var motionController = VRMotionController()
    
    // Profile Sync
    @State private var profileSyncCancellable: AnyCancellable?
    
    public init(video: VideoItem, serverBaseURL: String) {
        self.video = video
        self.serverBaseURL = serverBaseURL
    }
    
    public var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.black.ignoresSafeArea()
                
                // 3D VR Viewports (Stereo Headset Split vs Magic Window)
                if displayMode == .stereoHeadset {
                    HStack(spacing: 0) {
                        // Olho Esquerdo
                        SCNVRViewContainer(scene: leftScene, pointOfView: leftCameraNode)
                            .frame(width: geometry.size.width / 2, height: geometry.size.height)
                        
                        // Linha divisora ótica central para headsets
                        Rectangle()
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: 2)
                        
                        // Olho Direito
                        SCNVRViewContainer(scene: rightScene, pointOfView: rightCameraNode)
                            .frame(width: geometry.size.width / 2 - 2, height: geometry.size.height)
                    }
                } else {
                    // Janela Mágica (Tela Cheia Monoscópica)
                    SCNVRViewContainer(scene: leftScene, pointOfView: leftCameraNode)
                        .frame(width: geometry.size.width, height: geometry.size.height)
                }
                
                // Touch Pan Gestures para olhar ao redor com os dedos
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                panYaw += Float(value.translation.width * 0.0003)
                                panPitch += Float(value.translation.height * 0.0003)
                                resetControlsTimer()
                            }
                    )
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            showControls.toggle()
                        }
                        if showControls {
                            resetControlsTimer()
                        }
                    }
                
                // VR On-Screen HUD Overlay
                if showControls {
                    vrControlsHUD
                        .transition(.opacity)
                }
            }
        }
        .statusBar(hidden: true)
        .onAppear {
            setupInitialSettings()
            setupPlayerAndScenes()
            motionController.start()
            resetControlsTimer()
            loadProfileAndResume()
        }
        .onDisappear {
            motionController.stop()
            player?.pause()
            saveProfileSync(completed: (duration > 0 && currentTime >= duration - 5))
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
    
    // MARK: - VR HUD Controls
    
    private var vrControlsHUD: some View {
        VStack {
            // Top Bar
            HStack(spacing: 16) {
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                }
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(video.name)
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                        .lineLimit(1)
                    
                    HStack(spacing: 6) {
                        if let res = video.resolutionBadge, !res.isEmpty {
                            Text(res)
                                .font(.system(size: 10, weight: .bold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.blue.opacity(0.8))
                                .cornerRadius(4)
                        }
                        if let codec = video.videoCodec {
                            Text(codec.uppercased())
                                .font(.system(size: 10))
                                .foregroundColor(.gray)
                        }
                        Text(projection.displayName)
                            .font(.system(size: 10))
                            .foregroundColor(.cyan)
                    }
                }
                
                Spacer()
                
                // Recenter
                Button(action: {
                    panYaw = 0
                    panPitch = 0
                    motionController.recenter()
                    updateCameraOrientations()
                }) {
                    Label("Recentralizar", systemImage: "scope")
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.6))
                        .foregroundColor(.white)
                        .cornerRadius(20)
                }
                
                // Display Mode Toggle (Headset vs Magic Window)
                Button(action: {
                    withAnimation {
                        displayMode = (displayMode == .stereoHeadset) ? .magicWindow : .stereoHeadset
                    }
                    updateMaterials()
                }) {
                    Image(systemName: displayMode.iconName)
                        .font(.title3)
                        .padding(8)
                        .background(Color.black.opacity(0.6))
                        .foregroundColor(.white)
                        .clipShape(Circle())
                }
            }
            .padding()
            .background(LinearGradient(colors: [Color.black.opacity(0.8), Color.clear], startPoint: .top, endPoint: .bottom))
            
            Spacer()
            
            // Central Play/Pause Action
            HStack(spacing: 40) {
                Button(action: { seekBy(-10) }) {
                    Image(systemName: "gobackward.10")
                        .font(.system(size: 32))
                        .foregroundColor(.white)
                }
                
                Button(action: togglePlayPause) {
                    Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 56))
                        .foregroundColor(.white)
                }
                
                Button(action: { seekBy(10) }) {
                    Image(systemName: "goforward.10")
                        .font(.system(size: 32))
                        .foregroundColor(.white)
                }
            }
            .padding(.vertical, 20)
            
            Spacer()
            
            // Bottom Scrubber and Settings Bar
            VStack(spacing: 12) {
                // Seek Bar
                HStack(spacing: 12) {
                    Text(formatTime(currentTime))
                        .font(.caption)
                        .foregroundColor(.white)
                        .monospacedDigit()
                    
                    Slider(
                        value: Binding(
                            get: { currentTime },
                            set: { newVal in
                                currentTime = newVal
                                isSeeking = true
                            }
                        ),
                        in: 0...max(duration, 1),
                        onEditingChanged: { editing in
                            if !editing {
                                player?.seek(to: CMTime(seconds: currentTime, preferredTimescale: 600)) { _ in
                                    isSeeking = false
                                }
                            }
                        }
                    )
                    .accentColor(.cyan)
                    
                    Text(formatTime(duration))
                        .font(.caption)
                        .foregroundColor(.gray)
                        .monospacedDigit()
                }
                
                // Quick VR Setting Buttons
                HStack(spacing: 16) {
                    // Projeção
                    Menu {
                        ForEach(VRProjectionMode.allCases) { mode in
                            Button(action: {
                                projection = mode
                                rebuildGeometry()
                            }) {
                                HStack {
                                    Text(mode.displayName)
                                    if projection == mode { Image(systemName: "checkmark") }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: projection.iconName)
                            Text(projection.displayName)
                        }
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.2))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    
                    // Estereoscopia
                    Menu {
                        ForEach(VRStereoMode.allCases) { s in
                            Button(action: {
                                stereo = s
                                updateMaterials()
                            }) {
                                HStack {
                                    Text(s.displayName)
                                    if stereo == s { Image(systemName: "checkmark") }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: stereo.iconName)
                            Text(stereo.displayName)
                        }
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.2))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    
                    // Inversão 3D (Eye Swap)
                    Button(action: {
                        isEyeSwapped.toggle()
                        updateMaterials()
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.left.arrow.right")
                            Text("Inverter Olhos")
                        }
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(isEyeSwapped ? Color.blue : Color.white.opacity(0.2))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                }
            }
            .padding()
            .background(LinearGradient(colors: [Color.clear, Color.black.opacity(0.9)], startPoint: .top, endPoint: .bottom))
        }
    }
    
    // MARK: - Initial Setup
    
    private func setupInitialSettings() {
        UIApplication.shared.isIdleTimerDisabled = true
        projection = video.initialProjection
        stereo = video.initialStereo
    }
    
    private func setupPlayerAndScenes() {
        guard let streamURL = video.fullStreamURL(baseURL: serverBaseURL) else { return }
        
        // Ativa sessão de áudio para reprodução contínua
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
        
        // Configuração otimizada para Streaming HTTP 206 Range AVPlayer
        let asset = AVURLAsset(url: streamURL)
        let playerItem = AVPlayerItem(asset: asset)
        playerItem.preferredForwardBufferDuration = 4.0 // Buffer adiantado para fluidez 4K/8K
        
        let avPlayer = AVPlayer(playerItem: playerItem)
        avPlayer.automaticallyWaitsToMinimizeStalling = true
        self.player = avPlayer
        
        // Observer de tempo para scrubber e persistência
        avPlayer.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { time in
            if !isSeeking {
                currentTime = time.seconds
            }
            if let d = playerItem.duration.seconds, !d.isNaN, d > 0 {
                duration = d
            }
        }
        
        // Sincronização periódica de perfil a cada 5 segundos
        profileSyncCancellable = Timer.publish(every: 5.0, on: .main, in: .common)
            .autoconnect()
            .sink { _ in
                saveProfileSync(completed: false)
            }
        
        // Setup SceneKit Câmeras e Cenas
        setupSceneNodes()
        rebuildGeometry()
        updateMaterials()
        
        avPlayer.play()
        isPlaying = true
    }
    
    private func setupSceneNodes() {
        // Câmera Olho Esquerdo
        let leftCamera = SCNCamera()
        leftCamera.zNear = 0.1
        leftCamera.zFar = 200.0
        leftCamera.fieldOfView = 90
        leftCameraNode.camera = leftCamera
        leftCameraNode.position = SCNVector3(x: -0.032, y: 0, z: 0) // IPD médio
        leftScene.rootNode.addChildNode(leftCameraNode)
        leftScene.rootNode.addChildNode(leftDomeNode)
        
        // Câmera Olho Direito
        let rightCamera = SCNCamera()
        rightCamera.zNear = 0.1
        rightCamera.zFar = 200.0
        rightCamera.fieldOfView = 90
        rightCameraNode.camera = rightCamera
        rightCameraNode.position = SCNVector3(x: 0.032, y: 0, z: 0) // IPD médio
        rightScene.rootNode.addChildNode(rightCameraNode)
        rightScene.rootNode.addChildNode(rightDomeNode)
        
        // Câmera tracking updater (60fps)
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            updateCameraOrientations()
        }
    }
    
    private func updateCameraOrientations() {
        let orientation = motionController.orientation
        let eulerX = orientation.x + panPitch
        let eulerY = orientation.y + panYaw
        let eulerZ = orientation.z
        
        let angles = SCNVector3(x: eulerX, y: eulerY, z: eulerZ)
        leftCameraNode.eulerAngles = angles
        rightCameraNode.eulerAngles = angles
    }
    
    private func rebuildGeometry() {
        let geometry = VRGeometryBuilder.createDome(projection: projection)
        
        if projection == .flat {
            leftDomeNode.geometry = geometry
            leftDomeNode.position = SCNVector3(0, 0, -20)
            rightDomeNode.geometry = geometry
            rightDomeNode.position = SCNVector3(0, 0, -20)
        } else {
            leftDomeNode.geometry = geometry
            leftDomeNode.position = SCNVector3(0, 0, 0)
            rightDomeNode.geometry = geometry
            rightDomeNode.position = SCNVector3(0, 0, 0)
        }
        
        updateMaterials()
    }
    
    private func updateMaterials() {
        guard let avPlayer = player else { return }
        
        let leftMat = SCNMaterial()
        leftMat.lightingModel = .constant
        leftMat.isDoubleSided = true
        leftMat.diffuse.contents = avPlayer
        leftMat.diffuse.contentsTransform = calculateTransform(isRightEye: false)
        
        let rightMat = SCNMaterial()
        rightMat.lightingModel = .constant
        rightMat.isDoubleSided = true
        rightMat.diffuse.contents = avPlayer
        rightMat.diffuse.contentsTransform = calculateTransform(isRightEye: true)
        
        leftDomeNode.geometry?.materials = [leftMat]
        rightDomeNode.geometry?.materials = [rightMat]
    }
    
    private func calculateTransform(isRightEye: Bool) -> SCNMatrix4 {
        let effectiveRight = isEyeSwapped ? !isRightEye : isRightEye
        
        if displayMode == .magicWindow {
            // Em modo Magic Window sem headset, se for SBS ou TB, exibe a metade do olho esquerdo expandida
            switch stereo {
            case .sbs:
                var t = SCNMatrix4Identity
                t.m11 = 0.5
                t.m41 = 0.0
                return t
            case .topBottom:
                var t = SCNMatrix4Identity
                t.m22 = 0.5
                t.m42 = 0.0
                return t
            case .mono:
                return SCNMatrix4Identity
            }
        }
        
        switch stereo {
        case .sbs:
            var t = SCNMatrix4Identity
            t.m11 = 0.5
            t.m22 = 1.0
            t.m41 = effectiveRight ? 0.5 : 0.0
            return t
            
        case .topBottom:
            var t = SCNMatrix4Identity
            t.m11 = 1.0
            t.m22 = 0.5
            t.m42 = effectiveRight ? 0.5 : 0.0
            return t
            
        case .mono:
            return SCNMatrix4Identity
        }
    }
    
    // MARK: - Playback Actions
    
    private func togglePlayPause() {
        guard let p = player else { return }
        if isPlaying {
            p.pause()
            isPlaying = false
        } else {
            p.play()
            isPlaying = true
        }
        resetControlsTimer()
    }
    
    private func seekBy(_ seconds: Double) {
        guard let p = player else { return }
        let target = max(0, min(duration, currentTime + seconds))
        p.seek(to: CMTime(seconds: target, preferredTimescale: 600))
        currentTime = target
        resetControlsTimer()
    }
    
    private func resetControlsTimer() {
        controlsTimer?.cancel()
        controlsTimer = Just(())
            .delay(for: .seconds(4), scheduler: RunLoop.main)
            .sink { _ in
                withAnimation(.easeInOut(duration: 0.25)) {
                    showControls = false
                }
            }
    }
    
    private func formatTime(_ seconds: Double) -> String {
        guard !seconds.isNaN, seconds >= 0 else { return "00:00" }
        let total = Int(seconds)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%02d:%02d", m, s)
    }
    
    // MARK: - Profile Resumption & Server Sync
    
    private func loadProfileAndResume() {
        let key = video.profileKey
        let trimmedBase = serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBase)/api/profiles?key=\(key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key)") else { return }
        
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data = data else { return }
            struct SingleProfileResponse: Codable {
                let success: Bool?
                let profile: VideoProfile?
            }
            if let resp = try? JSONDecoder().decode(SingleProfileResponse.self, from: data),
               let prof = resp.profile {
                DispatchQueue.main.async {
                    if prof.currentTime > 5 && !prof.completed {
                        self.player?.seek(to: CMTime(seconds: prof.currentTime, preferredTimescale: 600))
                    }
                    if let cfg = prof.profile {
                        if let p = cfg.projection, let projMode = VRProjectionMode(rawValue: p) {
                            self.projection = projMode
                            self.rebuildGeometry()
                        }
                        if let s = cfg.stereo, let stereoMode = VRStereoMode(rawValue: s) {
                            self.stereo = stereoMode
                            self.updateMaterials()
                        }
                        if let swap = cfg.swap {
                            self.isEyeSwapped = swap
                            self.updateMaterials()
                        }
                    }
                }
            }
        }.resume()
    }
    
    private func saveProfileSync(completed: Bool) {
        guard currentTime > 0 else { return }
        let trimmedBase = serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBase)/api/profiles") else { return }
        
        let profileConfig = ProfileConfig(
            projection: projection.rawValue,
            stereo: stereo.rawValue,
            swap: isEyeSwapped
        )
        
        let videoProf = VideoProfile(
            currentTime: currentTime,
            duration: duration,
            completed: completed,
            updatedAt: Int64(Date().timeIntervalSince1970 * 1000),
            profile: profileConfig
        )
        
        let payload = ProfileSavePayload(key: video.profileKey, data: videoProf)
        guard let body = try? JSONEncoder().encode(payload) else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        
        URLSession.shared.dataTask(with: request).resume()
    }
}
