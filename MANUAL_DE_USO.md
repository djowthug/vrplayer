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
   - [Editor Interativo de Layout dos HUDs (Posicionamento e Escala)](#-editor-interativo-de-layout-dos-huds-posicionamento-escala-e-margem-segura)
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
* **Controles Flutuantes do Player em Duas Telas (SBS):** No player, os controles flutuantes (barra superior com ações, botão central de play e barra inferior de transporte e tempo) dividem-se em dois painéis simétricos compactos centralizados no ponto focal (*sweet spot*) de cada lente. Você pode interagir em qualquer um dos olhos e as duas barras mantêm sincronia total em tempo real com auto-ocultação após 3s.
* **Olho Dominante sem Deslocamento ao Centro:** Permite direcionar a interface do player para o seu olho dominante (**Olho Direito**, **Olho Esquerdo** ou **Ambos**). Ao selecionar o olho dominante, a interface permanece rigorosamente centralizada em frente à lente escolhida (25% ou 75% da largura da tela), eliminando o salto indesejado para o meio da tela (divisória física do headset). O outro olho fica 100% desobstruído para imersão completa. Alterne no Menu de Formato, no seletor de Ajustes ou pressionando a tecla **`E`** (Eye).
* **Barra Superior Compacta em 2 Linhas (5x2):** No modo óculos, a barra superior de ferramentas é automaticamente reorganizada em uma grade compacta de 2 linhas com 5 ícones cada (`max-width: 236px`), evitando botões esticados ou cortados pelas bordas curvas das lentes VR.
* **Notificações Toast em Estéreo para Ambos os Olhos:** Alertas como *"Olho: Direito"*, *"Layout Salvo"* ou *"Modo Óculos"* agora são exibidos simultaneamente em ambos os olhos (ou respeitando o olho dominante escolhido), prevenindo desconforto de convergência ocular.
* **Alternar Modo Tela Cheia / Janela:** Botão dedicado presente no topo de ambos os olhos (`⛶`) e teclas de atalho `F` ou `F11`, compatível tanto no navegador Web quanto no aplicativo Desktop Electron, com aviso HUD imediato (*"Tela Cheia"* / *"Modo Janela"*).
* **Cursor Virtual Estéreo para Gamepad:** Ao usar controles Bluetooth no modo óculos, o cursor virtual é automaticamente espelhado nos dois olhos, garantindo mira tridimensional precisa e sem desconforto visual.
* **Persistência de Estado:** Ativar o modo óculos na tela inicial mantém o modo ativo ao abrir os vídeos e ao retornar para a galeria.
* **Menu de Formato em Duas Telas:** Durante o modo óculos, o menu de seleção de formato de vídeo (360°, VR180, Fisheye, 3D SBS, 3D TB) também se divide em visão estéreo sincronizada para troca rápida de projeção dentro do headset.

---

### 📐 Editor Interativo de Layout dos HUDs (Posicionamento, Escala e Margem Segura)

Diferentes modelos de óculos VR (VR Box, Cardboard, Shinecon, VRG Pro) possuem distâncias focais, aberturas de lentes e áreas de corte de borda distintas. O **VR Player** oferece um editor visual completo para reposicionar e dimensionar qualquer elemento da interface em tempo real:

1. **Como Abrir o Editor:**
   - **No Teclado:** Pressione a tecla **`G`** (Grid / Layout).
   - **No Gamepad:** Segure o botão **`Y`** (Triângulo) por 1,2 segundos.
   - **Na Interface:** Clique no ícone de esquadro **📐** na barra superior ou na opção *"Ajustar Posição dos Menus (Layout)"* no Menu de Formato.

2. **Elementos Reposicionáveis:**
   - **Barra Superior (`topBar`):** Botões de funções, modo óculos, marcadores e presets.
   - **Barra Inferior (`bottomBar`):** Controles de play/pause, progresso do vídeo e volume.
   - **Pílula de Ajustes (`settingsPill`):** Menu flutuante de calibração de imagem e lentes.
   - **Menu de Formato (`formatSheet`):** Painel de seleção de projeção e modo 3D.

3. **Recursos de Ajuste:**
   - **Deslocamento X e Y (Offset):** Mova o elemento selecionado horizontal e verticalmente em porcentagem de -40% a +40%.
   - **Escala (Scale):** Ajuste o tamanho do menu de 60% (compacto para lentes pequenas) até 140%.
   - **Margem Segura (Safe Margin):** Define um recuo de borda de 0% a 25% (padrão de 8% no modo óculos) para impedir que os cantos da armação cortem botões.
   - **Seguir Centro Óptico da Lente (`followLens`):** Quando ativado, os HUDs acompanham dinamicamente as regulagens de IPD e centro óptico calibrados nos shaders.
   - **Tempo de Auto-Ocultação:** Escolha quando os controles somem automaticamente (2s, 3.5s, 5s, 8s ou *Nunca*).
   - **Perfis Separados:** Suas preferências no **Modo Óculos** e no **Modo Tela/PC** são salvas independentemente no armazenamento local (`localStorage`).

4. **Controles Durante a Edição:**
   - **Setas / D-Pad:** Move o elemento ativo em passos de 1% (segure `Shift` no teclado para passos de 5%).
   - **Analógico Esquerdo (Gamepad):** Movimentação contínua e suave do elemento.
   - **Teclas `+` / `-` ou Gatilhos L2 / R2:** Aumenta ou diminui a escala do elemento.
   - **Teclas `[` e `]`:** Alterna entre os elementos editáveis.
   - **Tecla `R`:** Restaura a posição e escala apenas do elemento ativo.
   - **Tecla `C`:** Restaura todo o layout aos valores padrão de fábrica.
   - **Tecla `Enter` / `Esc` / Botão "Pronto":** Salva instantaneamente as configurações e fecha o editor.

---

### 🎮 Suporte a Controles Gamepad / Bluetooth
Conecte controles de Xbox, PlayStation, Joy-Cons ou mini controles Bluetooth para VR Box:

| Ação | Botão no Controle / Gamepad | Teclado / Gestos | Toque na Tela / Modo Óculos |
|---|---|---|---|
| **Reproduzir / Pausar** | **A** / Start | Espaço / Enter | Toque simples |
| **Próximo Vídeo** | Segurar **L1** + apertar **R1** | Tecla **N** / Shift+N | Botão ⏭ no player |
| **Vídeo Anterior** | Segurar **R1** + apertar **L1** | Shift + **P** | Botão ⏮ no player |
| **Avançar / Voltar 10s** | **D-Pad (Esquerda / Direita)** ou L1 / R1 | Setas ← →, J / L | Barra de progresso |
| **Aumentar / Diminuir Zoom** | **Gatilhos L2 (menos) / R2 (mais)** | Teclas `+` / `-`, `Z` / `X` | Pinça na tela (Pinch), Scroll do mouse ou botões 🔍 +/- |
| **Volume & Boost (até 300%)** | D-Pad Cima / Baixo (passa de 100% para boost) | Setas ↑ ↓ (continua subindo até 300% ⚡) | Slider de Volume / HUD |
| **Reclinar / Assistir Deitado** | Analógico Vertical (Pitch) ou HUD | **Alt + Seta ↑ ↓** | Parâmetro "Reclinar (Pitch)" no HUD |
| **Marcadores de Cena (Bookmarks)**| Botão no Menu / HUD | Tecla **B** (Salvar) / **Shift+B** (Lista) | Botão 🔖 no topo do player |
| **Centralizar Visão** | Toque curto em **Y** / **B** / Triângulo | Tecla **R** / **C** | Toque longo / Botão ◎ |
| **Editar Layout dos HUDs** | **Segurar Y (1,2s)** no Gamepad | Tecla **G** | Botão 📐 no player ou menu Formato |
| **Ciclar Presets de Calibração** | Botão **X** / Quadrado (no HUD) | Tecla **P** | Menu de Presets no HUD Flutuante |
| **Alternar Modo Óculos** | **Select** / Botão 2 no controle | Teclas **V** / **H** | Botão 🥽 (Cabeçalho da Galeria ou Player) |
| **Alternar Olho Dominante** | Seletor no Menu | Tecla **E** | Seletor no Menu de Formato (Esq/Dir/Ambos) |
| **Menu de Opções / Formatos** | Botão Menu / Options | Tecla **O** ou Toque duplo | Toque duplo no visor |
| **Mover Visão (360/180)** | Analógico Direito | Mouse arrastar | Arrastar o dedo / Mover cabeça |

#### 🔍 Opção de Zoom & Enquadramento Fluido
* **Gesto Pinça (Pinch-to-zoom):** Em smartphones ou telas sensíveis ao toque, aproxime ou afaste dois dedos na tela para aumentar ou diminuir o zoom suavemente em tempo real.
* **Scroll do Mouse (PC):** Gire a roda do mouse sobre o player para ajustar o zoom (funciona tanto no modo desktop quanto no modo óculos estéreo).
* **Controles Gamepad:** Use os gatilhos analógicos **L2** (afastar/zoom out) e **R2** (aproximar/zoom in).
* **Botões Dedicados:** Botões de zoom in (`+`) e zoom out (`-`) no topo do player e parâmetro dedicado no HUD Flutuante com indicador percentual claro (ex: `100% (75°)`).

#### ⏭️ Troca Rápida de Vídeo (Próximo / Anterior)
* **Navegação Contínua:** Mude para o próximo vídeo ou vídeo anterior diretamente dentro do player através dos botões dedicados `⏮` e `⏭` na barra de transporte estéreo.
* **Atalhos no Controle:** Segure **L1** e pressione **R1** para ir ao próximo vídeo; segure **R1** e pressione **L1** para voltar ao vídeo anterior.
* **Respeita Filtros e Ordem:** A reprodução segue a pasta filtrada atualmente e a ordem de classificação definida na galeria (por data, nome ou tamanho).

#### 🔊 Amplificador de Som (Audio Gain Booster até 300%)
* **Potência Sonora via Web Audio API:** Não sofra com vídeos gravados com volume muito baixo. Ao atingir 100% do volume, continue pressionando a seta para cima ↑ ou use o parâmetro no HUD para ativar o **Audio Boost** de 100% até 300% ⚡.
* **Compressor Dinâmico Inteligente:** Inclui limitador suave contra clipping e distorção para manter o som nítido e encorpado mesmo em volumes elevados em fones simples.

#### 🛏️ Modo "Assistir Deitado" / Reclinar Tela (Pitch & Recline Offset)
* **Conforto Total:** Assista a vídeos deitado na cama ou recostado no sofá olhando para o teto sem precisar forçar o pescoço para baixo.
* **Como Ajustar:** Utilize o parâmetro **Reclinar / Deitado (Pitch)** no HUD Flutuante (de -60° até +80°), o atalho **Alt + Seta Cima / Baixo** no teclado, ou incline o analógico vertical do controle.

#### 🎬 Modo Cinema Curvado e Distância da Tela (IMAX 3D)
* **Curvatura IMAX Envolvente:** Para vídeos 2D e 3D SBS/OU em tela plana, ative a **Curvatura da Tela** no HUD para curvar suavemente as bordas em direção ao espectador, reduzindo a fadiga visual periférica.
* **Distância e Escala Virtual:** Configure a distância virtual da tela (de 2.5m até 14m) e ajuste a escala da tela para uma sensação real de estar na melhor fileira de uma sala de cinema.

#### 👁️ Seleção por Olhar sem as Mãos (Gaze Dwell Selection)
* **Operação Hands-Free no Headset VR:** Para quando o smartphone já estiver encaixado nos óculos e você não tiver um controle Bluetooth à mão.
* **Como Funciona:** Uma mira central estéreo acompanha a direção da sua cabeça. Ao fixar o olhar em qualquer botão interativo (play, avançar, trocar formato, escolher vídeo) por 1,4 segundo, um anel circular animado se completa e dispara o clique automaticamente com vibração tátil!
* **Ativação:** Pode ser ativado ou desativado a qualquer momento no HUD Flutuante ou menu de ajustes.

#### 🔖 Marcadores de Cenas Favoritas (Bookmarks)
* **Salvar Momentos:** Pressione a tecla **B** no teclado ou clique no ícone de marcador 🔖 na barra superior para registrar o segundo exato da cena.
* **Painel de Marcadores:** Abra a lista de marcadores salvos para pular instantaneamente para qualquer momento com um único clique. Todos os marcadores são salvos por vídeo de forma persistente.

#### ⏱️ Retomada Automática & Perfil por Vídeo (Persistência Híbrida)
* **Persistência Híbrida (LocalStorage + `video-profiles.json`):** Progresso e calibração óptica são gravados instantaneamente no cache local do navegador/PWA (resposta offline sem delays) e sincronizados de forma assíncrona com o arquivo leve `video-profiles.json` no computador via servidor local ou Electron.
* **Sincronização entre Dispositivos da Rede:** Você pode começar a assistir e calibrar um vídeo no computador (definindo, por exemplo, Olho de Peixe 190° SBS, Brilho +10% e Inclinação de 15° para assistir deitado), e ao abrir o mesmo vídeo no Safari do iPhone no óculos VR (ou no Meta Quest via Wi-Fi), o progresso e a calibração acompanham o vídeo perfeitamente!
* **Chave Normalizada Resiliente:** Cada vídeo é identificado por uma chave única baseada em seu nome e tamanho em bytes (`vid_nome_tamanho`). Se você mover ou reorganizar o vídeo entre pastas no computador, ele preserva intactos seu progresso e perfil calibrado.
* **Calibração Completa Salva por Arquivo:** Salva automaticamente projeção (360°, VR180, Fisheye, Plano), layout 3D (SBS, Top-Bottom, Mono, Swap), abertura e escala Fisheye, curvatura e distância da tela Cinema, shaders de imagem (exposição, contraste, saturação, brilho, gamma), inclinação de pitch e modo de áudio espacial.
* **Barras de Progresso e Badges na Galeria:** Os cards de vídeo na tela inicial exibem uma barra de progresso colorida no rodapé indicando visualmente quanto já foi assistido, badge verde **✓ Assistido** (ao ultrapassar 92% do vídeo) e carimbo de tempo decorrido sincronizados entre todos os aparelhos.
* **Retomada Instantânea:** Ao abrir um vídeo já iniciado, o player retoma a reprodução exatamente do segundo onde parou com feedback visual transparente no HUD. Se você já assistiu ao vídeo até o final, ele reinicia do início sem travamentos.

#### 🎛️ HUD Compacto de Calibração e Gerenciador de Presets
Ao abrir os Ajustes durante a reprodução, o player exibe uma **Pílula Flutuante Translúcida** sem obstruir a visão do vídeo:
* **Salvar e Modificar Presets:**
  - **Botão Rápido "Salvar":** Na linha do preset dentro do HUD Flutuante, clique em **Salvar** para gravar seus ajustes atuais como novo preset ou atualizar o preset ativo sem sair do vídeo.
  - **Menu de Presets:** Permite alternar entre presets de fábrica (*Google Cardboard, VR Box 2.0, VRG Pro, Desktop*) e seus presets personalizados salvos.
  - **Gerenciador Completo:** Acesse "Gerenciar Presets" para criar, renomear, atualizar, excluir presets ou restaurar padrões de fábrica.
  - **Abrangência Completa:** Cada preset memoriza tanto a calibração de lentes (FOV/zoom, distorções K1/K2, aberração cromática, IPD e nitidez) quanto os ajustes de imagem (exposição, brilho, contraste, saturação e gamma).
* **Elevação para Óculos VR:** No modo óculos, a pílula sobe automaticamente 20% da tela (`bottom: 20%`) para evitar que as bordas da armação ou as lentes do headset cortem os controles. No modo 2D normal, permanece a 30px da borda inferior.
* **Ciclo de Ajustes (Anterior / Próximo):** **L1 / R1** ou **D-Pad (Cima / Baixo)** no controle, teclas `[` / `]` ou botões ◀ ▶ na interface.
* **Ajuste Fino do Valor:** **D-Pad (Esquerda / Direita)** no controle, arrastar a barra deslizante ou teclas de seta ← → no teclado.
* **Restaurar Padrão do Parâmetro Ativo:** Botão **Y** / Triângulo no controle, clique duplo no valor ou botão ↺.
* **Fechar Ajustes:** Botão **B** / Círculo no controle, tecla `Esc`, botão ✕ ou toque fora do HUD.

#### 📐 Editor Interativo de Layout dos HUDs (Posição, Escala e Margem Segura)
Ajuste fino visual para posicionar e dimensionar qualquer elemento flutuante da interface (barra superior, controles inferiores, pílula de ajustes e mensagens de status):
* **Como Abrir o Editor:**
  - Pressione a tecla **G** no teclado.
  - Ou segure o botão **Y / Triângulo** por **1,2 segundos** no controle Gamepad.
  - Ou clique no botão **📐** na barra superior ou na opção *"📐 Ajustar Posição dos Menus & HUDs"* na folha de Formato.
* **Controles no Editor:**
  - **Trocar Elemento:** Teclas `[` / `]` (ou Tab), botões **L1 / R1** no controle, ou clique direto no elemento desejado.
  - **Mover Elemento:** Setas direcionais do teclado (Shift = 5×), **D-Pad** ou **analógico esquerdo** do controle, ou arraste com mouse/toque.
  - **Escala do Elemento:** Teclas `−` / `+`, gatilhos **L2 / R2** no controle ou botões `−` / `+` no painel.
  - **Margem Segura:** No Modo Óculos, vem pré-configurada com **8% de margem** para puxar todos os menus para longe das bordas cortadas pelas lentes. No Modo Tela, o padrão é 0%.
  - **Seguir Centro Óptico:** Ao ativar esta opção (tecla **C** ou botão **X** no controle), os HUDs acompanham o IPD e os deslocamentos de lente (Lens Center X/Y) ajustados na calibração do headset.
  - **Perfis Independentes:** Suas preferências para o **Modo Óculos** e o **Modo Tela** são salvas separadamente no armazenamento local (`localStorage`) e persistem automaticamente.
  - **Salvar e Sair:** Pressione **Enter**, **Esc**, **G**, o botão **B / Start / Select** no controle, ou clique em **✓ Concluir**.

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

### 🧽 Limpeza e Manutenção Operacional (DevOps)
Para manter o projeto leve, determinístico e organizado, utilize a suíte de scripts de manutenção:
* **Limpar resíduos de compilação (`dist/`, `build/`, `_site/` e arquivos temporários):**
  ```powershell
  npm run clean
  ```
* **Limpar cache de miniaturas e sessões de streaming HLS do SO:**
  ```powershell
  npm run clean:cache
  ```
* **Podar referências remotas obsoletas e otimizar Git (`git gc`):**
  ```powershell
  npm run clean:git
  ```
* **Limpeza profunda combinada (builds, todos os caches e histórico redundante):**
  ```powershell
  npm run clean:all
  ```
* **Garantir instalação reprodutível e determinística:**
  ```powershell
  npm ci
  ```
* **Compilação determinística do instalador e portátil Windows x64:**
  ```powershell
  npm run build
  ```
* **Verificação estática de sintaxe e integridade dos módulos:**
  ```powershell
  npm run check
  ```

---

### ⚙️ Padronização de Ambiente com `.env`
O projeto oferece o template seguro [.env.example](file:///c:/Users/djowt/Downloads/vrplayer/.env.example) para configuração rápida do ambiente:
1. Copie o template para `.env`:
   ```powershell
   copy .env.example .env
   ```
2. Defina portas (`HTTP_PORT`, `HTTPS_PORT`), diretórios locais (`VIDEO_DIR`, `VIDEO_DIRS`), aceleração de hardware (`HARDWARE_ENCODER`) ou credenciais da nuvem (`TORBOX_API_KEY`, `GOFILE_TOKEN`).
3. O servidor carrega nativamente as variáveis na inicialização sem expor segredos no controle de versão.

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

