import SwiftUI
import Combine

// MARK: - Gallery View Model

public final class GalleryViewModel: ObservableObject {
    @Published public var videos: [VideoItem] = []
    @Published public var profiles: [String: VideoProfile] = [:]
    @Published public var folders: [String] = []
    @Published public var isLoading: Bool = false
    @Published public var isConnected: Bool = false
    @Published public var errorMessage: String? = nil
    
    // Server Configuration
    @Published public var serverURL: String {
        didSet {
            UserDefaults.standard.set(serverURL, forKey: "vrplayer_server_url")
        }
    }
    
    // Filters & Search
    @Published public var searchText: String = ""
    @Published public var selectedFolder: String = "Todos"
    @Published public var selectedResolution: String = "Todas"
    
    // Playback Navigation
    @Published public var selectedVideo: VideoItem? = nil
    @Published public var showServerConfig: Bool = false
    
    public init() {
        let savedURL = UserDefaults.standard.string(forKey: "vrplayer_server_url")
        self.serverURL = savedURL ?? "http://vrplayer.local:8080"
    }
    
    public var filteredVideos: [VideoItem] {
        videos.filter { item in
            let matchesSearch = searchText.isEmpty ||
                item.name.localizedCaseInsensitiveContains(searchText) ||
                (item.folderName?.localizedCaseInsensitiveContains(searchText) ?? false) ||
                (item.subfolder?.localizedCaseInsensitiveContains(searchText) ?? false)
            
            let matchesFolder = selectedFolder == "Todos" ||
                (item.folderName == selectedFolder) ||
                (item.subfolder == selectedFolder)
            
            let matchesRes = selectedResolution == "Todas" ||
                (item.resolutionBadge == selectedResolution)
            
            return matchesSearch && matchesFolder && matchesRes
        }
    }
    
    public func reloadData() {
        fetchVideos()
        fetchProfiles()
    }
    
    public func fetchVideos() {
        let trimmedBase = serverURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBase)/api/videos") else {
            errorMessage = "URL do servidor inválida."
            isConnected = false
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        var request = URLRequest(url: url)
        request.timeoutInterval = 6.0
        
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isLoading = false
                
                if let error = error {
                    self.errorMessage = "Erro de conexão: \(error.localizedDescription)"
                    self.isConnected = false
                    return
                }
                
                guard let data = data else {
                    self.errorMessage = "Resposta vazia do servidor."
                    self.isConnected = false
                    return
                }
                
                do {
                    let decoded = try JSONDecoder().decode(VideoListResponse.self, from: data)
                    self.videos = decoded.videos
                    self.isConnected = true
                    
                    // Extrai lista única de pastas
                    var folderSet = Set<String>()
                    for v in decoded.videos {
                        if let fn = v.folderName, !fn.isEmpty { folderSet.insert(fn) }
                        if let sf = v.subfolder, !sf.isEmpty { folderSet.insert(sf) }
                    }
                    self.folders = ["Todos"] + folderSet.sorted()
                } catch {
                    self.errorMessage = "Falha ao decodificar lista de vídeos: \(error.localizedDescription)"
                    self.isConnected = false
                }
            }
        }.resume()
    }
    
    public func fetchProfiles() {
        let trimmedBase = serverURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBase)/api/profiles") else { return }
        
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data else { return }
            if let decoded = try? JSONDecoder().decode([String: VideoProfile].self, from: data) {
                DispatchQueue.main.async {
                    self?.profiles = decoded
                }
            }
        }.resume()
    }
}

// MARK: - Gallery View

public struct GalleryView: View {
    @StateObject private var viewModel = GalleryViewModel()
    @State private var serverInputText: String = ""
    
    private let columns = [
        GridItem(.adaptive(minimum: 280, maximum: 380), spacing: 16)
    ]
    
    public init() {}
    
    public var body: some View {
        NavigationView {
            ZStack {
                // Background
                Color(red: 0.07, green: 0.08, blue: 0.12).ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Top Server Bar
                    serverStatusBar
                    
                    // Filter Chips
                    if !viewModel.videos.isEmpty {
                        filterChipsBar
                    }
                    
                    // Content
                    if viewModel.isLoading && viewModel.videos.isEmpty {
                        Spacer()
                        ProgressView("Carregando biblioteca VR...")
                            .tint(.cyan)
                            .foregroundColor(.white)
                        Spacer()
                    } else if let error = viewModel.errorMessage, viewModel.videos.isEmpty {
                        errorStateView(error: error)
                    } else if viewModel.filteredVideos.isEmpty {
                        emptyStateView
                    } else {
                        videoGrid
                    }
                }
            }
            .navigationTitle("VR Player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        serverInputText = viewModel.serverURL
                        viewModel.showServerConfig = true
                    }) {
                        Image(systemName: "gearshape.fill")
                            .foregroundColor(.cyan)
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { viewModel.reloadData() }) {
                        Image(systemName: "arrow.clockwise")
                            .foregroundColor(.white)
                    }
                }
            }
            .sheet(isPresented: $viewModel.showServerConfig) {
                serverConfigSheet
            }
            .fullScreenCover(item: $viewModel.selectedVideo) { video in
                VRVideoPlayerView(video: video, serverBaseURL: viewModel.serverURL)
            }
            .searchable(text: $viewModel.searchText, prompt: "Buscar vídeos VR...")
            .refreshable {
                viewModel.reloadData()
            }
            .onAppear {
                viewModel.reloadData()
            }
        }
        .navigationViewStyle(.stack)
    }
    
    // MARK: - Server Status Bar
    
    private var serverStatusBar: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(viewModel.isConnected ? Color.green : Color.red)
                .frame(width: 8, height: 8)
            
            Text(viewModel.serverURL)
                .font(.caption)
                .foregroundColor(.gray)
                .lineLimit(1)
            
            Spacer()
            
            if viewModel.isConnected {
                Text("\(viewModel.videos.count) vídeos")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.white.opacity(0.1))
                    .foregroundColor(.cyan)
                    .cornerRadius(8)
            } else {
                Button(action: {
                    serverInputText = viewModel.serverURL
                    viewModel.showServerConfig = true
                }) {
                    Text("Conectar")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.3))
    }
    
    // MARK: - Filter Chips
    
    private var filterChipsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Resoluções
                ForEach(["Todas", "8K", "4K", "1080p"], id: \.self) { res in
                    Button(action: { viewModel.selectedResolution = res }) {
                        Text(res)
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(viewModel.selectedResolution == res ? Color.cyan : Color.white.opacity(0.1))
                            .foregroundColor(viewModel.selectedResolution == res ? .black : .white)
                            .cornerRadius(14)
                    }
                }
                
                Divider()
                    .frame(height: 16)
                    .background(Color.gray)
                
                // Pastas
                ForEach(viewModel.folders, id: \.self) { folder in
                    Button(action: { viewModel.selectedFolder = folder }) {
                        HStack(spacing: 4) {
                            if folder != "Todos" {
                                Image(systemName: "folder.fill")
                                    .font(.caption2)
                            }
                            Text(folder)
                        }
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(viewModel.selectedFolder == folder ? Color.blue : Color.white.opacity(0.1))
                        .foregroundColor(.white)
                        .cornerRadius(14)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }
    
    // MARK: - Video Grid
    
    private var videoGrid: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(viewModel.filteredVideos) { video in
                    VideoCard(
                        video: video,
                        baseURL: viewModel.serverURL,
                        profile: viewModel.profiles[video.profileKey],
                        onTap: {
                            viewModel.selectedVideo = video
                        }
                    )
                }
            }
            .padding(16)
        }
    }
    
    // MARK: - Empty & Error Views
    
    private func errorStateView(error: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 48))
                .foregroundColor(.orange)
            
            Text("Não foi possível conectar ao servidor")
                .font(.headline)
                .foregroundColor(.white)
            
            Text(error)
                .font(.caption)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            
            Button(action: {
                serverInputText = viewModel.serverURL
                viewModel.showServerConfig = true
            }) {
                Text("Alterar Endereço do Servidor")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(Color.cyan)
                    .foregroundColor(.black)
                    .cornerRadius(10)
            }
            Spacer()
        }
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "video.slash")
                .font(.system(size: 48))
                .foregroundColor(.gray)
            
            Text("Nenhum vídeo encontrado")
                .font(.headline)
                .foregroundColor(.white)
            
            Text("Verifique se há arquivos na pasta de vídeos do servidor.")
                .font(.caption)
                .foregroundColor(.gray)
            Spacer()
        }
    }
    
    // MARK: - Server Configuration Sheet
    
    private var serverConfigSheet: some View {
        NavigationView {
            Form {
                Section(header: Text("Endereço do Servidor Node.js")) {
                    TextField("http://192.168.1.50:8080", text: $serverInputText)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .keyboardType(.URL)
                    
                    Text("Dica: Use o IP do seu computador na mesma rede Wi-Fi (ex.: http://192.168.1.100:8080) ou http://vrplayer.local:8080 via mDNS Bonjour.")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                
                Section {
                    Button(action: {
                        viewModel.serverURL = serverInputText
                        viewModel.showServerConfig = false
                        viewModel.reloadData()
                    }) {
                        HStack {
                            Spacer()
                            Text("Salvar e Conectar")
                                .fontWeight(.bold)
                                .foregroundColor(.cyan)
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Configurar Conexão")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") {
                        viewModel.showServerConfig = false
                    }
                }
            }
        }
    }
}

// MARK: - Video Card View

public struct VideoCard: View {
    public let video: VideoItem
    public let baseURL: String
    public let profile: VideoProfile?
    public let onTap: () -> Void
    
    public init(video: VideoItem, baseURL: String, profile: VideoProfile?, onTap: @escaping () -> Void) {
        self.video = video
        self.baseURL = baseURL
        self.profile = profile
        self.onTap = onTap
    }
    
    public var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                // Thumbnail Banner
                ZStack(alignment: .bottomTrailing) {
                    if let thumbURL = video.fullThumbURL(baseURL: baseURL) {
                        AsyncImage(url: thumbURL) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(16/9, contentMode: .fill)
                            case .failure(_), .empty:
                                thumbnailFallback
                            @unknown default:
                                thumbnailFallback
                            }
                        }
                        .frame(height: 160)
                        .clipped()
                    } else {
                        thumbnailFallback
                    }
                    
                    // Duration Badge
                    if let dur = video.durationFormatted, !dur.isEmpty {
                        Text(dur)
                            .font(.system(size: 11, weight: .bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color.black.opacity(0.8))
                            .foregroundColor(.white)
                            .cornerRadius(4)
                            .padding(8)
                    }
                    
                    // Resolution Badge
                    if let res = video.resolutionBadge, !res.isEmpty {
                        VStack {
                            HStack {
                                Text(res)
                                    .font(.system(size: 10, weight: .black))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(res == "8K" ? Color.purple : Color.blue)
                                    .foregroundColor(.white)
                                    .cornerRadius(4)
                                    .padding(8)
                                Spacer()
                            }
                            Spacer()
                        }
                    }
                    
                    // Resume Progress Bar
                    if let prof = profile, prof.currentTime > 5, prof.duration > 0, !prof.completed {
                        VStack {
                            Spacer()
                            ProgressView(value: prof.currentTime, total: prof.duration)
                                .accentColor(.cyan)
                                .progressViewStyle(LinearProgressViewStyle())
                        }
                    }
                }
                
                // Card Details
                VStack(alignment: .leading, spacing: 6) {
                    Text(video.name)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    
                    HStack(spacing: 6) {
                        Text(video.initialProjection.displayName)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.cyan)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.cyan.opacity(0.15))
                            .cornerRadius(4)
                        
                        Text(video.initialStereo.displayName)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.gray)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.white.opacity(0.08))
                            .cornerRadius(4)
                        
                        Spacer()
                        
                        if let size = video.size {
                            Text(size)
                                .font(.caption2)
                                .foregroundColor(.gray)
                        }
                    }
                }
                .padding(12)
            }
            .background(Color(red: 0.12, green: 0.13, blue: 0.18))
            .cornerRadius(12)
            .shadow(color: Color.black.opacity(0.3), radius: 6, x: 0, y: 3)
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    private var thumbnailFallback: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.15, green: 0.18, blue: 0.28), Color(red: 0.08, green: 0.09, blue: 0.15)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .frame(height: 160)
            
            VStack(spacing: 6) {
                Image(systemName: "eyeglasses")
                    .font(.system(size: 36))
                    .foregroundColor(.cyan.opacity(0.6))
                Text("VR Video")
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
        }
    }
}
