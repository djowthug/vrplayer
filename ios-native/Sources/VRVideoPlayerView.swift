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
    @Published public var orientation: SCNVector4 = SCNVector4(x: 0, y: 0, z: 0, w: 1)
    
    public var yawOffset: Float = 0
    public var pitchOffset: Float = 0
    
    public init() {}
    
    public func start(onUpdate: ((SCNVector4) -> Void)? = nil) {
        guard motionManager.isDeviceMotionAvailable else { return }
        motionManager.deviceMotionUpdateInterval = 1.0 / 60.0
        motionManager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] motion, _ in
            guard let self = self, let motion = motion else { return }
            let attitude = motion.attitude
            let q = attitude.quaternion
            
            let pitch = Float(attitude.pitch) + self.pitchOffset
            let roll = Float(attitude.roll)
            let yaw = Float(attitude.yaw) + self.yawOffset
            
            let newOri = SCNVector4(x: pitch, y: yaw, z: roll, w: Float(q.w))
            self.orientation = newOri
            onUpdate?(newOri)
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

// MARK: - VR Player View Model

public final class VRPlayerViewModel: ObservableObject {
    public let video: VideoItem
    public let serverBaseURL: String
    
    @Published public var player: AVPlayer?
    @Published public var isPlaying: Bool = true
    @Published public var currentTime: Double = 0
    @Published public var duration: Double = 0
    @Published public var isSeeking: Bool = false
    @Published public var showControls: Bool = true
    
    @Published public var projection: VRProjectionMode = .vr180
    @Published public var stereo: VRStereoMode = .sbs
    @Published public var displayMode: VRDisplayMode = .stereoHeadset
    @Published public var isEyeSwapped: Bool = false
    
    public let leftScene = SCNScene()
    public let rightScene = SCNScene()
    public let leftCameraNode = SCNNode()
    public let rightCameraNode = SCNNode()
    public let leftDomeNode = SCNNode()
    public let rightDomeNode = SCNNode()
    
    public var panYaw: Float = 0
    public var panPitch: Float = 0
    
    public let motionController = VRMotionController()
    
    private var timeObserverToken: Any?
    private var profileTimer: AnyCancellable?
    private var controlsTimer: AnyCancellable?
    
    public init(video: VideoItem, serverBaseURL: String) {
        self.video = video
        self.serverBaseURL = serverBaseURL
        self.projection = video.initialProjection
        self.stereo = video.initialStereo
    }
    
    public func setup() {
        UIApplication.shared.isIdleTimerDisabled = true
        setupAudioSession()
        setupScenes()
        setupPlayer()
        setupMotion()
        resetControlsTimer()
        loadProfileAndResume()
        
        // Sync de perfil a cada 5 segundos
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
    
    private func setupAudioSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
    }
    
    private func setupScenes() {
        let leftCamera = SCNCamera()
        leftCamera.zNear = 0.1
        leftCamera.zFar = 200.0
        leftCamera.fieldOfView = 90
        leftCameraNode.camera = leftCamera
        leftCameraNode.position = SCNVector3(x: -0.032, y: 0, z: 0)
        leftScene.rootNode.addChildNode(leftCameraNode)
        leftScene.rootNode.addChildNode(leftDomeNode)
        
        let rightCamera = SCNCamera()
        rightCamera.zNear = 0.1
        rightCamera.zFar = 200.0
        rightCamera.fieldOfView = 90
        rightCameraNode.camera = rightCamera
        rightCameraNode.position = SCNVector3(x: 0.032, y: 0, z: 0)
        rightScene.rootNode.addChildNode(rightCameraNode)
        rightScene.rootNode.addChildNode(rightDomeNode)
        
        rebuildGeometry()
    }
    
    private func setupPlayer() {
        guard let streamURL = video.fullStreamURL(baseURL: serverBaseURL) else { return }
        
        let asset = AVURLAsset(url: streamURL)
        let playerItem = AVPlayerItem(asset: asset)
        playerItem.preferredForwardBufferDuration = 4.0
        
        let avPlayer = AVPlayer(playerItem: playerItem)
        avPlayer.automaticallyWaitsToMinimizeStalling = true
        self.player = avPlayer
        
        timeObserverToken = avPlayer.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] time in
            guard let self = self else { return }
            if !self.isSeeking {
                self.currentTime = time.seconds
            }
            let d = playerItem.duration.seconds
            if !d.isNaN && d > 0 {
                self.duration = d
            }
        }
        
        updateMaterials()
        avPlayer.play()
        isPlaying = true
    }
    
    private func setupMotion() {
        motionController.start { [weak self] _ in
            self?.updateCameraOrientations()
        }
    }
    
    public func updateCameraOrientations() {
        let orientation = motionController.orientation
        let eulerX = orientation.x + panPitch
        let eulerY = orientation.y + panYaw
        let eulerZ = orientation.z
        
        let angles = SCNVector3(x: eulerX, y: eulerY, z: eulerZ)
        leftCameraNode.eulerAngles = angles
        rightCameraNode.eulerAngles = angles
    }
    
    public func recenter() {
        panYaw = 0
        panPitch = 0
        motionController.recenter()
        updateCameraOrientations()
    }
    
    public func rebuildGeometry() {
        let geometry = VRGeometryBuilder.createDome(projection: projection)
        
        if projection == .flat {
            leftDomeNode.geometry = geometry
            leftDomeNode.position = SCNVector3(x: 0, y: 0, z: -20)
            rightDomeNode.geometry = geometry
            rightDomeNode.position = SCNVector3(x: 0, y: 0, z: -20)
        } else {
            leftDomeNode.geometry = geometry
            leftDomeNode.position = SCNVector3(x: 0, y: 0, z: 0)
            rightDomeNode.geometry = geometry
            rightDomeNode.position = SCNVector3(x: 0, y: 0, z: 0)
        }
        
        updateMaterials()
    }
    
    public func updateMaterials() {
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
    
    public func togglePlayPause() {
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
    
    public func seekBy(_ seconds: Double) {
        guard let p = player else { return }
        let target = max(0, min(duration, currentTime + seconds))
        p.seek(to: CMTime(seconds: target, preferredTimescale: 600))
        currentTime = target
        resetControlsTimer()
    }
    
    public func resetControlsTimer() {
        controlsTimer?.cancel()
        controlsTimer = Just(())
            .delay(for: .seconds(4), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                withAnimation(.easeInOut(duration: 0.25)) {
                    self?.showControls = false
                }
            }
    }
    
    public func loadProfileAndResume() {
        let key = video.profileKey
        let trimmedBase = serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBase)/api/profiles?key=\(key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key)") else { return }
        
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data, let self = self else { return }
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
    
    public func saveProfileSync(completed: Bool) {
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

// MARK: - VR Video Player View

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
            ZStack {
                Color.black.ignoresSafeArea()
                
                // 3D VR Viewports
                if vm.displayMode == .stereoHeadset {
                    HStack(spacing: 0) {
                        SCNVRViewContainer(scene: vm.leftScene, pointOfView: vm.leftCameraNode)
                            .frame(width: geometry.size.width / 2, height: geometry.size.height)
                        
                        Rectangle()
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: 2)
                        
                        SCNVRViewContainer(scene: vm.rightScene, pointOfView: vm.rightCameraNode)
                            .frame(width: geometry.size.width / 2 - 2, height: geometry.size.height)
                    }
                } else {
                    SCNVRViewContainer(scene: vm.leftScene, pointOfView: vm.leftCameraNode)
                        .frame(width: geometry.size.width, height: geometry.size.height)
                }
                
                // Touch Pan Gestures
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                vm.panYaw += Float(value.translation.width * 0.0003)
                                vm.panPitch += Float(value.translation.height * 0.0003)
                                vm.updateCameraOrientations()
                                vm.resetControlsTimer()
                            }
                    )
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            vm.showControls.toggle()
                        }
                        if vm.showControls {
                            vm.resetControlsTimer()
                        }
                    }
                
                // VR On-Screen HUD Overlay
                if vm.showControls {
                    vrControlsHUD
                        .transition(.opacity)
                }
            }
        }
        .statusBarHidden(true)
        .onAppear {
            vm.setup()
        }
        .onDisappear {
            vm.cleanup()
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
                        Text(vm.projection.displayName)
                            .font(.system(size: 10))
                            .foregroundColor(.cyan)
                    }
                }
                
                Spacer()
                
                Button(action: {
                    vm.recenter()
                }) {
                    Label("Recentralizar", systemImage: "scope")
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.6))
                        .foregroundColor(.white)
                        .cornerRadius(20)
                }
                
                Button(action: {
                    withAnimation {
                        vm.displayMode = (vm.displayMode == .stereoHeadset) ? .magicWindow : .stereoHeadset
                    }
                    vm.updateMaterials()
                }) {
                    Image(systemName: vm.displayMode.iconName)
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
                Button(action: { vm.seekBy(-10) }) {
                    Image(systemName: "gobackward.10")
                        .font(.system(size: 32))
                        .foregroundColor(.white)
                }
                
                Button(action: { vm.togglePlayPause() }) {
                    Image(systemName: vm.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 56))
                        .foregroundColor(.white)
                }
                
                Button(action: { vm.seekBy(10) }) {
                    Image(systemName: "goforward.10")
                        .font(.system(size: 32))
                        .foregroundColor(.white)
                }
            }
            .padding(.vertical, 20)
            
            Spacer()
            
            // Bottom Scrubber and Settings Bar
            VStack(spacing: 12) {
                HStack(spacing: 12) {
                    Text(formatTime(vm.currentTime))
                        .font(.caption)
                        .foregroundColor(.white)
                        .monospacedDigit()
                    
                    Slider(
                        value: Binding(
                            get: { vm.currentTime },
                            set: { newVal in
                                vm.currentTime = newVal
                                vm.isSeeking = true
                            }
                        ),
                        in: 0...max(vm.duration, 1),
                        onEditingChanged: { editing in
                            if !editing {
                                vm.player?.seek(to: CMTime(seconds: vm.currentTime, preferredTimescale: 600)) { _ in
                                    vm.isSeeking = false
                                }
                            }
                        }
                    )
                    .accentColor(.cyan)
                    
                    Text(formatTime(vm.duration))
                        .font(.caption)
                        .foregroundColor(.gray)
                        .monospacedDigit()
                }
                
                HStack(spacing: 16) {
                    Menu {
                        ForEach(VRProjectionMode.allCases) { mode in
                            Button(action: {
                                vm.projection = mode
                                vm.rebuildGeometry()
                            }) {
                                HStack {
                                    Text(mode.displayName)
                                    if vm.projection == mode { Image(systemName: "checkmark") }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: vm.projection.iconName)
                            Text(vm.projection.displayName)
                        }
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.2))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    
                    Menu {
                        ForEach(VRStereoMode.allCases) { s in
                            Button(action: {
                                vm.stereo = s
                                vm.updateMaterials()
                            }) {
                                HStack {
                                    Text(s.displayName)
                                    if vm.stereo == s { Image(systemName: "checkmark") }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: vm.stereo.iconName)
                            Text(vm.stereo.displayName)
                        }
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.2))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    
                    Button(action: {
                        vm.isEyeSwapped.toggle()
                        vm.updateMaterials()
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.left.arrow.right")
                            Text("Inverter Olhos")
                        }
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(vm.isEyeSwapped ? Color.blue : Color.white.opacity(0.2))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                }
            }
            .padding()
            .background(LinearGradient(colors: [Color.clear, Color.black.opacity(0.9)], startPoint: .top, endPoint: .bottom))
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
}
