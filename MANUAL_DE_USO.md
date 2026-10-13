# 📖 VR Player — Manual de Uso e Configuração

Guia completo de funcionalidades, configuração de pastas de vídeos e operação do **VR Player** (Desktop Windows, Web/PWA no iOS, Android e Óculos VR).

---

## 📑 Índice
1. [Visão Geral do Projeto](#-visão-geral-do-projeto)
2. [Como Configurar as Pastas de Vídeos](#-como-configurar-as-pastas-de-vídeos)
   - [Configurando uma Única Pasta](#1-configurando-uma-única-pasta)
   - [Configurando Múltiplas Pastas (Vários Discos/HDs)](#2-configurando-múltiplas-pastas-vários-discoshds)
   - [Subpastas e Organização](#3-subpastas-e-organização)
   - [Configurando via Terminal / Linha de Comando](#4-configurando-via-terminal--linha-de-comando)
   - [Portas de Rede (HTTP e HTTPS)](#5-portas-de-rede-http-e-https)
3. [Guia de Funcionalidades](#-guia-de-funcionalidades)
   - [Galeria Visual estilo Netflix](#galeria-visual-estilo-netflix)
   - [Formatos Imersivos Suportados](#formatos-imersivos-suportados)
   - [Detecção Automática Inteligente](#detecção-automática-inteligente)
   - [Streaming Local e Transcodificação por GPU](#streaming-local-e-transcodificação-por-gpu)
   - [Ajustes de Imagem em Tempo Real (Shaders GPU)](#ajustes-de-imagem-em-tempo-real-shaders-gpu)
   - [Ambientes Virtuais 3D (Modo Cinema)](#ambientes-virtuais-3d-modo-cinema)
   - [Telemetria e Diagnóstico de Performance](#telemetria-e-diagnóstico-de-performance)
   - [Modo Óculos VR Integrado (Tela Inicial & Player)](#-modo-óculos-vr-integrado-tela-inicial--player)
   - [Suporte a Controles Gamepad / Bluetooth](#suporte-a-controles-gamepad--bluetooth)
   - [Otimizador de Vídeos em Lote](#otimizador-de-vídeos-em-lote)
4. [Como Usar no Dia a Dia](#-como-usar-no-dia-a-dia)
   - [Modo 1: Aplicativo Desktop (Windows)](#modo-1-aplicativo-desktop-windows)
   - [Modo 2: Streaming do PC para Celular / Óculos (Wi-Fi)](#modo-2-streaming-do-pc-para-celular--óculos-wi-fi)

---

## 🌟 Visão Geral do Projeto

O **VR Player** é uma solução completa para reprodução de vídeos imersivos de alta performance:
- **No PC:** Funciona como um player nativo ultrarrápido com aceleração de hardware (Electron + Direct3D).
- **Na Rede:** Funciona como um servidor de streaming local inteligente que transmite vídeos de altíssima definição (4K, 6K, 8K) do PC para iPhones, celulares e óculos VR sem precisar passar arquivos pesados por cabo.

Diferente de soluções como o DeoVR ou Skybox, ele é **100% focado no seu acervo local**, sem assinaturas, sem logins, com transcodificação por placa de vídeo (NVIDIA NVENC / Intel QSV) e galeria visual automática.

---

## ⚙️ Como Configurar as Pastas de Vídeos

A configuração é feita no arquivo `config.json` localizado na pasta raiz do projeto.  
*(Se o arquivo não existir, crie-o ou renomeie o `config.example.json` para `config.json`).*

> [!TIP]
> **Atenção à sintaxe no Windows:**  
> No JSON, barras invertidas do Windows precisam ser escapadas com barra dupla (`\\`) ou substituídas por barras normais (`/`).  
> Exemplo válido: `"E:\\MeusVR"` ou `"E:/MeusVR"`.

---

### 1. Configurando uma Única Pasta

Para apontar para uma pasta específica onde ficam os seus vídeos (por exemplo, no disco `E:`):

```json
{
  "videoDir": "E:\\MeusVR",
  "httpsPort": 8443,
  "httpPort": 8080
}
```

---

### 2. Configurando Múltiplas Pastas (Vários Discos/HDs)

Se você tem vídeos espalhados em mais de um disco ou diretório (ex: um SSD no `C:`, um HD externo no `D:` e outro no `E:`), utilize o parâmetro **`videoDirs`** com uma lista de pastas:

```json
{
  "videoDirs": [
    "E:\\MeusVR",
    "D:\\FilmesVR",
    "C:\\Users\\SeuUsuario\\Videos\\VR"
  ],
  "httpsPort": 8443,
  "httpPort": 8080
}
```

*O app irá varrer todas as pastas listadas e juntar todo o catálogo em uma única galeria unificada!*

---

### 3. Subpastas e Organização

Você **não precisa** listar cada subpasta separadamente. O servidor faz uma varredura recursiva automática em todas as subpastas dentro das pastas configuradas.

Por exemplo, com esta estrutura:
```text
E:\MeusVR\
├── 180\
│   └── montanha_russa_180_sbs.mp4
├── 360\
│   └── safari_360.mp4
└── Documentarios\
    └── espaco_8k.mkv
```
Todos os vídeos serão encontrados e catalogados automaticamente.

---

### 4. Configurando via Terminal / Linha de Comando

Você também pode especificar a pasta temporariamente ao iniciar o servidor, sem precisar editar o `config.json`:

#### Uma pasta:
```powershell
node server.js "D:\Videos"
```

#### Múltiplas pastas simultâneas:
```powershell
node server.js "E:\MeusVR" "D:\FilmesVR"
```

---

### 5. Portas de Rede (HTTP e HTTPS)

No `config.json`, você pode alterar as portas caso tenha conflito com outro programa:
* `"httpsPort": 8443` — Porta segura com SSL (necessária para giroscópio no iOS/Safari).
* `"httpPort": 8080` — Porta padrão para download rápido do certificado e redirecionamento.

---

## 🎛️ Guia de Funcionalidades

### 🎬 Galeria Visual estilo Netflix
* **Miniaturas Automáticas (Thumbnails):** O servidor extrai automaticamente um quadro representativo aos 10% da duração do vídeo usando o FFmpeg e guarda em cache na pasta `.cache/thumbnails/`.
* **Badges de Resolução:** Identifica e exibe selos visuais em tempo real: `8K`, `4K`, `1080p` ou a resolução nativa.
* **Formato e Duração:** Exibe o tempo formatado (`HH:MM:SS`) e se o vídeo é 180°, 360° ou 3D.

---

### 🥽 Formatos Imersivos Suportados
O renderizador WebGL/Three.js suporta com precisão por pixel:
1. **360° Equiretangular:** Vídeos de esfera completa (mono e 3D Over/Under).
2. **VR180 (Hemisfério frontal):** Formato padrão de câmeras VR modernas (Lado a Lado / SBS).
3. **Olho de Peixe (Fisheye circular):** Lentes circulares (como lentes Canon RF 5.2mm ou câmeras MKX200).
4. **3D Plano (Cinema Virtual):** Telas de cinema planas para filmes 3D Side-by-Side ou Top-Bottom tradicionais.

---

### 🤖 Detecção Automática Inteligente
O app possui um motor duplo que evita você ter que adivinhar e selecionar projeções manualmente:
1. **Pelo Nome do Arquivo:** Reconhece tags como `_180`, `_360`, `_sbs`, `_tb`, `_ou`, `_lr`, `fisheye`, etc.
2. **Por Análise do 1º Frame:** Se o arquivo não tiver tag, ele amostra os pixels do vídeo e compara as duas metades (para identificar estéreo SBS ou Over/Under) ou verifica bordas circulares escuras (para olho de peixe).

---

### ⚡ Streaming Local e Transcodificação por GPU
* **HTTP Range Requests:** Permite você clicar em qualquer ponto da barra de tempo (*scrubbing*) e o vídeo responde instantaneamente sem precisar baixar o arquivo inteiro.
* **Aceleração por Hardware (NVENC / Intel QSV):** Quando o vídeo é em 8K ou possui formatos de áudio que navegadores não aceitam (ex: AC-3, DTS), o servidor no PC faz *transcodificação em tempo real* com downscale suave para 4K, entregando via streaming HLS dinâmico.
* **Fast Input Seek:** Ao pular o tempo em vídeos transcodificados, o FFmpeg reinicia a sessão no ponto exato usando `-ss` imediato.

---

### 🎨 Ajustes de Imagem em Tempo Real (Shaders GPU)
Ajuste a imagem diretamente na GPU sem reprocessar o vídeo no computador:
* **Exposição (EV):** -1.0 a +1.0 EV para recuperar sombras ou controlar estouros de luz.
* **Brilho e Contraste:** Calibração fina para telas OLED e LCD.
* **Saturação Cromática:** Ajuste de intensidade de cor no padrão Rec.709.
* **Gamma:** Correção de gama de luminância.

---

### 🏛️ Ambientes Virtuais 3D (Modo Cinema)
Para vídeos em formato plano e filmes 3D, você pode escolher cenários virtuais imersivos:
* **Sala de Cinema IMAX:** Tela flutuante com silhuetas de poltronas, iluminação indireta de piso e moldura retroiluminada suave.
* **Espaço Sideral / Cosmos:** Fundo com mais de 1.400 estrelas cintilantes procedurais e nebulosa distante.
* **Cyber Grid:** Grade holográfica espacial estilo ficção científica neon.
* **Vazio Escuro:** Fundo preto absoluto para foco total e economia de bateria em telas OLED.

---

### 📊 Telemetria e Diagnóstico de Performance
Pressione a tecla **`D`** no teclado ou clique no botão de diagnóstico na barra superior para ver em tempo real:
* **FPS do WebGL:** Taxa de quadros real (60 / 90 / 120 Hz).
* **Buffer do Navegador:** Quantos segundos de vídeo já estão carregados na memória.
* **Dropped Frames:** Contador de quadros perdidos por segundo.
* **Status do Decoder:** Mostra se o vídeo está em reprodução direta ou transcodificado via NVENC.
*(No modo óculos VR, o painel de telemetria é espelhado para ambos os olhos).*

---

### 🥽 Modo Óculos VR Integrado (Tela Inicial & Player)
* **Tela Inicial em Duas Telas (Dual Screen / SBS):** O botão **🥽 Modo Óculos** no cabeçalho da galeria (ou botão **X** / Select no controle) divide toda a tela inicial em duas metades estéreo perfeitamente sincronizadas (olho esquerdo e direito). Isso permite navegar pelas pastas, rolar o catálogo e escolher vídeos com o celular já inserido nos óculos VR Box sem precisar retirá-lo.
* **Persistência de Estado:** Ativar o modo óculos na tela inicial mantém o modo ativo ao abrir os vídeos e ao retornar para a galeria.
* **Menu de Formato em Duas Telas:** Durante o modo óculos, o menu de seleção de formato de vídeo (360°, VR180, Fisheye, 3D SBS, 3D TB) também se divide em visão estéreo sincronizada para troca rápida de projeção dentro do headset.

---

### 🎮 Suporte a Controles Gamepad / Bluetooth
Conecte controles de Xbox, PlayStation, Joy-Cons ou mini controles Bluetooth para VR Box:

| Ação | Botão no Controle / Gamepad | Toque na Tela / Modo Óculos |
|---|---|---|
| **Reproduzir / Pausar** | **A** / Gatilho R2 / Start | Toque simples |
| **Centralizar Visão** | **B** / **Y** / Triângulo / Círculo | Toque longo / Botão ◎ |
| **Avançar / Voltar 10s** | **D-Pad (Esquerda / Direita)** ou L1 / R1 | Barra de progresso |
| **Alternar Modo Óculos (Galeria e Player)** | **X** / Select | Botão 🥽 (Cabeçalho da Galeria ou Player) |
| **Menu de Opções / Formatos** | Botão Menu / Options | Toque duplo |
| **Mover Visão (360/180)** | Analógico Direito | Arrastar o dedo / Mover cabeça |

#### 🎛️ HUD Compacto de Calibração em Tempo Real (Single-Slider Pill)
Ao abrir os Ajustes durante a reprodução, o player exibe uma **Pílula Flutuante Translúcida** sem obstruir a visão do vídeo:
* **Elevação para Óculos VR:** No modo óculos, a pílula sobe automaticamente 20% da tela (`bottom: 20%`) para evitar que as bordas da armação ou as lentes do headset cortem os controles. No modo 2D normal, permanece a 30px da borda inferior.
* **Ciclo de Ajustes (Anterior / Próximo):** **L1 / R1** ou **D-Pad (Cima / Baixo)** no controle, teclas `[` / `]` ou botões ◀ ▶ na interface.
* **Ajuste Fino do Valor:** **D-Pad (Esquerda / Direita)** no controle, arrastar a barra deslizante ou teclas de seta ← → no teclado.
* **Restaurar Padrão do Parâmetro Ativo:** Botão **Y** / Triângulo no controle, clique duplo no valor ou botão ↺.
* **Fechar Ajustes:** Botão **B** / Círculo no controle, tecla `Esc`, botão ✕ ou toque fora do HUD.
* **Modo Óculos VR:** O HUD é automaticamente duplicado em visão estéreo (olho esquerdo e direito) para permitir calibração de lentes e cores com o smartphone encaixado nos óculos.

---

### 🧹 Otimizador de Vídeos em Lote
O projeto traz um utilitário FFmpeg embutido que detecta arquivos com contêineres ou codecs incompatíveis com navegadores móveis (ex: áudio DTS, AC3, contêiner MKV):
* **Remux ultra-rápido:** Mantém o vídeo intacto (sem perda de qualidade) e apenas converte o áudio para AAC estéreo e injeta o sinalizador `+faststart`.
* Execute via terminal:
  ```powershell
  npm run optimize
  ```
* Ou utilize o botão de otimização diretamente na barra superior da interface web ou na tela inicial.

---

### 🧽 Limpeza e Manutenção do Repositório
Para manter o projeto leve e organizado, utilize os comandos de limpeza automática:
* **Limpar resíduos de compilação (dist/ e temporários):**
  ```powershell
  npm run clean
  ```
* **Limpar cache de miniaturas geradas (.cache/thumbnails):**
  ```powershell
  npm run clean:cache
  ```
* **Limpeza completa (libera mais de 1,2 GB de instaladores antigos e caches):**
  ```powershell
  npm run clean:all
  ```
* **Verificação de sintaxe de todos os scripts:**
  ```powershell
  npm run check
  ```

---

## 🚀 Como Usar no Dia a Dia

### Modo 1: Aplicativo Desktop (Windows)
Para assistir diretamente no PC ou através de espelhamento:
```powershell
npm run electron
```
Você também pode associar arquivos de vídeo (`.mp4`, `.mkv`, etc.) para abrir diretamente com o VR Player.

---

### Modo 2: Streaming do PC para Celular / Óculos (Wi-Fi)

#### 1. Gerar Certificados Locais (Apenas na 1ª vez):
```powershell
npm run cert
```

#### 2. Iniciar o Servidor no PC:
```powershell
npm start
```

#### 3. No iPhone / Celular:
1. Certifique-se de que o aparelho está conectado na **mesma rede Wi-Fi** do PC.
2. Abra o Safari e acesse:
   ```text
   http://vrplayer.local:8080/install-cert
   ```
   *(Ou use o IP exibido no terminal, ex: `http://192.168.1.50:8080/install-cert`)*.
3. Baixe o perfil de certificado e instale no iOS em:  
   **Ajustes → Perfil Baixado → Instalar**.
4. Habilite a confiança total do certificado em:  
   **Ajustes → Geral → Sobre → Certificados Confiáveis → Ativar VR Player CA**.
5. Abra no Safari:
   ```text
   https://vrplayer.local:8443/
   ```
6. Clique no botão de compartilhar do Safari e escolha **"Adicionar à Tela de Início"** para ter o app em tela cheia (PWA) sem barras do navegador!
7. Escolha qualquer vídeo na galeria, coloque o celular nos óculos VR e aproveite!

---

## 🥽 Calibração Óptica Avançada & Presets de Headsets

O VR Player conta com um motor gráfico de pós-processamento WebGL em passada única que elimina distorções, aberrações cromáticas e desfoques característicos das lentes de óculos VR (como VR Box, Cardboard e VRG Pro).

### 1. Seletor de Presets na Pílula HUD

Na pílula flutuante inferior de ajustes (acessada com toque duplo na tela, atalho `M` no teclado ou botão `Start`/`Options` no controle Bluetooth):
* **No topo da pílula**, há o seletor rápido: `[ Preset: VR Box 2.0 ▾ ]`.
* Ao tocar ou clicar no seletor, você pode alternar instantaneamente entre os perfis calibrados:
  * **VR Box 2.0:** FOV 82°, K1 0.22, K2 0.04, Aberração 0.05, Nitidez 35%.
  * **Google Cardboard:** FOV 80°, K1 0.35, K2 0.10, Aberração 0.02, Nitidez 20%.
  * **VRG Pro (Full Screen):** FOV 115°, K1 0.18, K2 0.08, Aberração 0.01, IPD -0.02, Nitidez 10%.
  * **Desktop / Flat Screen:** FOV 75°, sem distorções nem aberrações.
* **Ciclar com Atalhos:** Pressione **P** no teclado ou **X / Quadrado** no controle Bluetooth para ciclar os presets sem precisar abrir o menu suspenso.
* **Lógica Dinâmica "Personalizado":** Caso você ajuste manualmente qualquer slider associado (FOV, K1, K2, Aberração ou Nitidez), o seletor muda automaticamente para **`[ Personalizado ]`**. Se você restaurar ou recolocar os sliders no valor exato do preset, o seletor volta a exibir o nome do preset correspondente!

### 2. Parâmetros de Ajuste Óptico Disponíveis

| Parâmetro | Descrição | Faixa |
| :--- | :--- | :--- |
| **Campo de Visão (FOV)** | Abertura angular da visão dentro dos óculos ou no monitor. | 60° a 120° (VR) / 30° a 120° (PC) |
| **Distorção K1 (2ª ordem)** | Correção de barril não-linear principal $r \cdot (1 + K_1 r^2)$. | 0.00 a 0.60 |
| **Distorção K2 (4ª ordem)** | Correção fina nas bordas periféricas da lente $+ K_2 r^4$. | 0.000 a 0.300 |
| **Aberração Cromática (R/B)** | Deslocamento radial independente para canais R e B eliminando franjas coloridas. | 0.0% a 15.0% |
| **Nitidez (Filtro CAS)** | Realce adaptativo de contraste (Contrast Adaptive Sharpening) que elimina o embaçamento das lentes acrílicas. | 0% a 100% |
| **Distância dos Olhos (IPD)** | Deslocamento interpupilar horizontal dos centros das lentes. | -15 a +15 |
| **Centro Óptico Esq./Dir. (X/Y)** | Ajuste fino independente do centro de projeção de cada lente. | -10.0% a +10.0% |
| **Alinhamento Vertical 3D** | Compensação de desalinhamento de altura entre olho esquerdo e direito. | -5.0% a +5.0% |
| **Rotação do Horizonte (Roll)** | Inclinação / tilt estéreo para nivelar perfeitamente o horizonte sem bordas pretas. | -5.0° a +5.0° |

