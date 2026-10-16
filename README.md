# VR Player (Web, iOS & Desktop Windows)

Reprodutor imersivo de vídeos VR de alta performance: 360°, 360° 3D (cima/baixo), VR180 (lado a lado), olho de peixe e 3D plano em tela de cinema. Compatível com giroscópio de iPhone (Safari/PWA), controles Gamepad Bluetooth e aplicativo Desktop nativo para Windows (Electron) com aceleração gráfica de hardware por GPU.

---

## 🚀 Funcionalidades

- **Múltiplos Formatos Imersivos:**
  - 360° Equiretangular (Mono e 3D Over/Under)
  - VR180 (Lado a Lado / SBS)
  - Olho de peixe (Fisheye circular)
  - 3D Plano (Cinema virtual SBS e Over/Under)
- **Detecção Inteligente:**
  - Análise automática de formato pelo nome do arquivo (`_360`, `_180`, `_sbs`, `_tb`, etc.) e amostragem do primeiro quadro de vídeo.
- **Descoberta Automática de Servidor via mDNS (Zero-Config):**
  - Anuncia a presença do servidor na rede local como `vrplayer.local` via Bonjour / mDNS. Conecte seu iPhone ou Mac digitando apenas `https://vrplayer.local:8443` sem se preocupar em descobrir ou digitar endereços IP.
- **Galeria Netflix com Miniaturas (Posters) Automáticas:**
  - Extrai quadros representativos via FFmpeg aos 10% da duração e armazena em cache `.cache/thumbnails/`. Exibe uma galeria visual com posters 16:9, badges de resolução (8K, 4K, 1080p), formato imersivo e duração.
- **Ajustes de Imagem em Tempo Real via Shaders GLSL:**
  - Ajuste Exposição (-1.0 a +1.0 EV), Brilho, Contraste, Saturação cromática (Rec.709) e Gamma diretamente na GPU do iPhone em tempo real sem reprocessamento no PC.
- **Ambientes Virtuais Customizados (Modo Cinema 3D):**
  - Ambientes 3D procedurais e ultraleves para Three.js: *Sala de Cinema IMAX* (com poltronas em silhueta, luzes de piso e moldura retroiluminada), *Espaço Sideral / Cosmos* (1.400 estrelas cintilantes e nebulosa distante), *Cyber Grid* (grade espacial futurista neon) e *Vazio Escuro*.
- **Monitor de Telemetria e Diagnóstico na HUD:**
  - Diagnóstico em tempo real acessível pela barra superior ou tecla `D`: FPS do WebGL (60/120 FPS), saúde do buffer do Safari em segundos, contador de quadros descartados (*dropped frames*) e status de aceleração de GPU (NVENC/Direto), replicado para os dois olhos nos óculos VR.
- **Reprodução na Nuvem (Gofile & Torbox):**
  - **Modo Autônomo (iPhone sem PC):** Reproduza vídeos diretamente de links do Gofile, Torbox ou URLs da web no Safari pelo PWA ou GitHub Pages, sem necessidade de ligar o computador.
  - **Integração com Torbox:** Conecte sua API Key do Torbox para listar automaticamente seus torrents concluídos na nuvem e gerar links de stream instantâneos.
  - **Streaming Assistido por PC:** Se o computador estiver ativo, arquivos `.mkv` ou links sem suporte a CORS no Safari são transcodificados/remuxados em tempo real via FFmpeg pelo PC.
  - **Download Direto para o PC:** Botão "↓ PC" para baixar qualquer vídeo online diretamente para a sua pasta local de vídeos com um clique.
  - **Histórico Recente:** Histórico dos últimos vídeos da nuvem assistidos para retorno rápido com 1 toque.
- **Servidor de Streaming Local (PC para iPhone):**
  - Transmita gigabytes de vídeos em alta resolução do HD do PC para o iPhone via Wi-Fi sem ocupar o armazenamento do aparelho.
  - Suporte completo a HTTP Range Requests (busca e scrubbing instantâneos) e HTTPS local gerado automaticamente para liberar o giroscópio no Safari iOS.
  - **Transcodificação Dinâmica HLS & Seek Instantâneo:** Transcodifica vídeos 8K para 4K em tempo real com aceleração por GPU (NVENC/QSV) e reinicialização de sessão HLS instantânea via Fast Input Seek (`-ss`) para navegação e scrubbing fluidos.
- **Otimizador em Lote (FFmpeg):**
  - Identifica vídeos incompatíveis com iPhone ou com áudio AC-3/DTS/incompatível.
  - Remux ultra-rápido (stream-copy de vídeo) gerando contêiner MP4 com áudio AAC estéreo e sinalizador `+faststart`.
- **Diagnóstico de Codecs & Aceleração GPU:**
  - Painel de inspeção de hardware, decodificação Direct3D, suporte HEVC (H.265) e ferramentas disponíveis.
- **Suporte a Controles Gamepad / Bluetooth / VR Box:**
  - Navegue, pause, avance/volte e centralize a visão usando controles de Xbox, PlayStation, Joy-Con ou mini controles VR Bluetooth.
- **Binários Estáticos Embutidos (Zero Dependências no PATH):**
  - O instalador e a versão portátil do Electron já vêm com versões estáticas do `ffmpeg.exe`, `ffprobe.exe` e `mkcert.exe` embutidas via `extraResources`, funcionando imediatamente em qualquer máquina sem precisar instalar nada no Windows.

---

## 🛠️ Comandos e Scripts

| Comando | Descrição |
|---|---|
| `npm start` / `npm run dev` | Inicia o servidor local de streaming e rede Wi-Fi (HTTP & HTTPS). |
| `npm run electron` | Abre o aplicativo Desktop nativo para Windows. |
| `npm run cert` | Cria certificados HTTPS locais confiáveis para o iPhone (via `mkcert`). |
| `npm run optimize` | Executa o utilitário CLI de otimização de vídeos em lote. |
| `npm run setup:bin` | Verifica ou copia os binários estáticos (`ffmpeg`, `ffprobe`, `mkcert`) para a pasta `bin/`. |
| `npm run check` | Valida sintaxe e integridade estática de todos os arquivos JS/CJS. |
| `npm run clean` | Remove resíduos de compilação (`dist/`, `build/`, `_site/`) e arquivos temporários. |
| `npm run clean:cache` | Limpa diretórios de cache (`.cache/`, miniaturas e sessões temporárias HLS no SO). |
| `npm run clean:git` | Poda referências remotas obsoletas (`git fetch --prune`) e otimiza o Git (`git gc`). |
| `npm run clean:all` | Limpeza abrangente de builds, caches e manutenção do repositório Git. |
| `npm run build` / `npm run dist` | Limpa temporários, valida binários e gera instalador e portátil Windows x64. |

---

## ⚙️ Variáveis de Ambiente e Configuração

O VR Player suporta padronização determinística via arquivo `.env` e `config.json`:

1. **Criar arquivo de ambiente local a partir do template:**
   ```powershell
   copy .env.example .env
   # No Linux/macOS: cp .env.example .env
   ```
2. **Parâmetros Principais:**
   - `HTTP_PORT` (padrão: `8080`) e `HTTPS_PORT` (padrão: `8443`): Portas de escuta.
   - `HOST` / `BIND_ADDRESS` (padrão: `0.0.0.0`): Interface de rede para o streaming.
   - `VIDEO_DIR` (padrão: `./videos`) e `VIDEO_DIRS`: Caminhos das bibliotecas de vídeo locais.
   - `TORBOX_API_KEY` e `GOFILE_TOKEN`: Credenciais seguras para streaming e download em nuvem.
   - `HARDWARE_ENCODER` (`auto`, `nvenc`, `qsv`, `cpu`): Seleção do acelerador de vídeo.
   - `FFMPEG_PATH`, `FFPROBE_PATH`, `MKCERT_PATH`: Caminhos customizados opcionais para binários.

Para builds determinísticos em esteiras CI/CD ou novas máquinas:
```powershell
npm ci
npm run build
```

---

## 💻 Como Usar

### 1. Aplicativo Desktop (Windows)
```powershell
npm run electron
```
Ou dê duplo clique em um vídeo `.mp4`, `.mkv`, `.webm` configurado com o VR Player.

### 2. Transmissão do PC para o iPhone (Wi-Fi)
1. **Configurar Certificado (apenas na 1ª vez):**
   ```powershell
   npm run cert
   ```
2. **Iniciar o Servidor:**
   ```powershell
   npm start
   # Ou aponte para um diretório específico:
   node server.js "D:\Meus Videos VR"
   ```
3. **No iPhone:**
   - Acesse o link exibido no terminal para instalar o certificado raiz (ex: `http://192.168.x.x:8080/install-cert`).
   - Ative a confiança total em: **Ajustes → Geral → Sobre → Certificados Confiáveis**.
   - Abra o endereço HTTPS (ex: `https://192.168.x.x:8443/`) no Safari.
   - Conecte e assista com giroscópio e modo óculos ativados!

---

## 🎮 Mapeamento de Controles

| Ação | Tela Touch | Modo Óculos | Controle / Gamepad |
|---|---|---|---|
| Olhar em volta | Arrastar o dedo | Mover a cabeça | Analógico direito / Mover a cabeça |
| Centralizar visão | Botão ◎ | Toque longo | **Botão B / Y / △ / ○** |
| Reproduzir / Pausar | Botão Play | Toque simples | **Botão A / Gatilho / Start** |
| Voltar / Avançar 10s | Barra de tempo | — | **D-Pad (◀ ▶) / L1 / R1** |
| Alternar Modo Óculos | Botão 🥽 | — | **Botão X / Select** |
| Menu de Ajustes | Toque no botão | Toque duplo | Botão Menu |

---

## 📁 Estrutura do Projeto

```
vrplayer/
├── css/
│   └── style.css            # Folha de estilos modo escuro estilo iOS
├── electron/
│   ├── binaries.cjs         # Localizador de executáveis estáticos
│   ├── main.cjs             # Processo principal Desktop, aceleração GPU e IPC
│   └── preload.cjs          # Ponte segura IPC para a interface
├── icons/                   # Ícones da aplicação e PWA
├── js/
│   ├── app.js               # Orquestrador do player e ciclo de vida
│   ├── cloud.js             # Cliente de nuvem Torbox e Gofile
│   ├── controls.js          # Giroscópio, toques e orientação
│   ├── cursor.js            # Cursor virtual para Gamepad
│   ├── detect.js            # Heurística e análise de projeção de vídeo
│   ├── environments.js      # Ambientes procedurais 3D (Cinema, Vazio)
│   ├── gamepad.js           # Gerenciador de controles Bluetooth / Gamepad
│   ├── projections.js       # Shaders WebGL para 360, 180, fisheye e 3D
│   ├── renderer.js          # Pipeline Three.js estéreo e correção de lente
│   ├── ui/
│   │   ├── batch-modal.js   # Interface de otimização em lote com FFmpeg
│   │   └── codecs-modal.js  # Painel de diagnóstico de codecs e GPU
│   ├── utils/
│   │   └── format.js        # Utilitários de bytes, duração e matemática (DRY)
│   └── vendor/
│       └── three.module.js  # Biblioteca Three.js empacotada
├── scripts/
│   ├── batch-optimize.js    # Motor de otimização de vídeos em lote FFmpeg
│   ├── bin-paths.js         # Wrapper ESM para localização de binários
│   ├── clean.js             # Limpeza de pastas de build e temporários
│   ├── cloud-service.js     # Serviço de streaming/download Torbox e Gofile
│   ├── hls-streamer.js      # Transcoder dinâmico HLS com FFmpeg
│   ├── net-utils.js         # Utilitários de rede e IPs locais
│   ├── setup-binaries.js    # Validador de binários estáticos
│   ├── setup-cert.js        # Configuração de certificados SSL locais
│   └── thumbnailer.js       # Extrator de miniaturas para o catálogo
├── videos/                  # Diretório padrão para vídeos de streaming (.gitkeep)
├── config.example.json      # Modelo de configuração de pastas e portas
├── .env.example             # Template seguro padronizado de variáveis de ambiente
├── index.html               # Interface principal (PWA & Desktop)
├── manifest.webmanifest     # Manifesto PWA para tela cheia no iPhone
├── package.json             # Dependências, scripts e configuração do builder
├── server.js                # Servidor HTTP/HTTPS com Range Requests e CORS
└── sw.js                    # Service Worker com cache offline v15
```
