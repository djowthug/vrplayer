# 📋 Matriz de Testes e Estratégia de QA — VR Player

Documentação mantida pela equipe de Qualidade de Software (QA) para validação contínua, regressão zero e introdução de testes automatizados E2E.

---

## 1. 🛡️ Validação Estática e Sintática (`npm run check`)

O comando `npm run check` valida a integridade da árvore sintática (AST) de todos os arquivos de código JavaScript (`.js`) e CommonJS (`.cjs`) do projeto via `node --check`:
- **Execução:** `npm run check`
- **Total de Arquivos:** 31 módulos (Frontend, Backend, Electron Desktop, Scripts de Manutenção e Testes)
- **Status:** ✅ **Aprovado (Exit code: 0, 0 erros sintáticos)**

---

## 2. 📊 Matriz de Testes Funcionais & Critérios de Aceitação

| ID | Módulo | Cenário de Teste | Pré-condição / Entrada | Critério de Aceitação Esperado | Teste Automatizado |
|:---|:---|:---|:---|:---|:---:|
| **TC-01** | **Range Requests** | Probing Safari iOS (Metadados) | `Range: bytes=0-1` | Resposta `206 Partial Content`, `Content-Range: bytes 0-1/{tamanho}`, `Content-Length: 2`. | `tests/range.test.js` |
| **TC-02** | **Range Requests** | Scrubbing instantâneo | `Range: bytes=10485760-20971520` | Resposta `206 Partial Content`, chunk enviado na posição correta, headers CORS expostos. | `tests/range.test.js` |
| **TC-03** | **Range Requests** | Range aberto até o EOF | `Range: bytes=5242880-` | Resposta `206 Partial Content`, `end = tamanho - 1`, chunk calculado com precisão. | `tests/range.test.js` |
| **TC-04** | **Range Requests** | Range além do arquivo | `Range: bytes=999999999-` | Resposta `416 Range Not Satisfiable`, `Content-Range: bytes */{tamanho}`. | `tests/range.test.js` |
| **TC-05** | **Range Requests** | Proteção Path Traversal | `/stream/../server.js` | `404 Not Found` (resolução impede travessia de diretório). | `tests/range.test.js` |
| **TC-06** | **HLS Streaming** | Safari Direct (Compatível) | MP4 H.264/AAC <= 3840px | `streamType: 'direct'`, `needsDownscale: false`. Stream direto sem custo de GPU. | `tests/hls.test.js` |
| **TC-07** | **HLS Streaming** | Downscale 8K sob demanda | Vídeo com largura > 3840px | `needsDownscale: true`, downscale ativo para 3840px (`scale=min(3840\,iw):-2`). | `tests/hls.test.js` |
| **TC-08** | **HLS Streaming** | Contêiner / Codec Incompatível | Arquivo `.mkv` ou áudio DTS/AC3 | Transcodificação HLS em tempo real, áudio AAC 256k estéreo, gera playlist e `.ts`. | `tests/hls.test.js` |
| **TC-09** | **HLS Streaming** | Detecção GPU com Fallback | NVENC -> QSV -> libx264 | Prioriza GPU dedicada; faz fallback seguro para CPU sem interrupção. | `tests/hls.test.js` |
| **TC-10** | **HLS Fast-Seek** | Salto instantâneo (-ss) | `/api/hls/seek?path=...&ss=45` | Finaliza processo anterior, inicia nova sessão com `-ss 45.00` antes de `-i`. | `tests/hls.test.js` |
| **TC-11** | **HLS Fast-Seek** | Clamping de tempo de seek | `ss < 0` ou `ss > duracao` | Normaliza tempo para `0.0` ou `duracao - 1.0` evitando falha no FFmpeg. | `tests/hls.test.js` |
| **TC-12** | **WebGL Projeções** | Modos 360, 180, Fisheye, Flat | `PROJECTION_MODE` (0, 1, 2, 3) | Shaders projetam imagem corretamente na esfera/plano sem costuras UV. | `tests/projections.test.js` |
| **TC-13** | **WebGL Projeções** | Alternância SBS e Eye-Swap | Layout `sbs` com e sem inversão | Olho esquerdo mapeia UV [0.0..0.5], direito [0.5..1.0]; swap inverte metades. | `tests/projections.test.js` |
| **TC-14** | **WebGL Projeções** | Alternância Top-Bottom (OU) | Layout `tb` | Olho esquerdo mapeia UV [0.5..1.0] (topo), direito [0.0..0.5] (base). | `tests/projections.test.js` |
| **TC-15** | **WebGL Calibração** | Pós-processamento e Nitidez CAS | Lentes VR (K1, K2, IPD, CAS) | Passada única de pós-processamento corrige distorção e aberração cromática. | `tests/projections.test.js` |
| **TC-16** | **Nuvem Torbox** | Proxy de Listagem sem CORS | `/api/torbox/list` | Busca paralela de torrents e web downloads, eliminando bloqueio CORS. | `tests/cloud.test.js` |
| **TC-17** | **Nuvem Torbox** | Obtenção de URL de Streaming | `/api/torbox/streamurl` | Recupera link direto com CDN Torbox. | `tests/cloud.test.js` |
| **TC-18** | **Nuvem Gofile** | Resolução de Links e Pastas | Links `/d/id` ou `/contents/id` | `parseGofileContentId` extrai ID, obtém guest token e lista arquivos de vídeo. | `tests/cloud.test.js` |
| **TC-19** | **Nuvem Streaming** | Proxy com suporte a Range | `/api/cloud/stream?url=...` | Repassa headers `Range` e entrega `206 Partial Content` ao navegador. | `tests/cloud.test.js` |
| **TC-20** | **Nuvem Download** | Download em Segundo Plano | `/api/cloud/download` | Baixa arquivo para disco local com acompanhamento de velocidade e status. | `tests/cloud.test.js` |
| **TC-21** | **Layout dos HUDs** | Perfil, Margem e Olho Dominante | `hud_layout:*`, `visibility:hidden` | Margem segura de 8% no óculos, centralização 50/50, sem corte de lente ou salto de centro. | `tests/hud-layout.test.js` |

---

## 3. 🧪 Suíte de Testes Automatizados Unitários (`npm test`)

O projeto dispõe de testes unitários executados pelo motor nativo `node:test` do Node.js:
```bash
npm test
```
Resultados atuais: **41 testes executados com 100% de aprovação (0 falhas)**.

---

## 4. 🎭 Estrutura de Automação E2E (Roadmap Playwright)

### 4.1 Navegadores Alvo
- **Mobile Safari (iOS WebKit):** Emulação de iPhone 15 Pro, touch gestures (arrastar para olhar em volta), simulação de giroscópio (`DeviceOrientationEvent`) e validação de `Range: bytes=0-1`.
- **Desktop Chromium:** Controles via mouse/teclado, renderização WebGL e abertura de modais.
- **Electron:** Empacotamento desktop e integração nativa com sistema operacional.

### 4.2 Arquitetura de Testes E2E Proposta
- Diretório: `e2e/`
- Arquivo de configuração: `playwright.config.js`
- Servidor embutido nos testes: `webServer` apontando para `node server.js`
- Fixtures leves gerados sob demanda via FFmpeg (`testsrc2`) garantindo execução veloz em CI sem downloads externos.
