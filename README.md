# VR Player para iPhone

PWA para assistir vídeos VR que já estão no iPhone: 360°, 360° 3D (cima/baixo), VR180 (lado a lado), olho de peixe e 3D plano. Funciona na tela (giroscópio ou arrastar o dedo) ou em óculos Cardboard / VR Box.

## Publicar no GitHub Pages (grátis, com HTTPS)

O HTTPS é obrigatório para o Safari liberar o giroscópio.

1. Crie um repositório no GitHub, por exemplo `vrplayer`.
2. Envie todos os arquivos desta pasta:
   ```powershell
   git init
   git add .
   git commit -m "VR Player"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/vrplayer.git
   git push -u origin main
   ```
3. No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** → Save.
4. Depois de cerca de 1 minuto, abra `https://SEU_USUARIO.github.io/vrplayer/` no Safari do iPhone.
5. Toque em **Compartilhar → Adicionar à Tela de Início** para usar em tela cheia.

> Ao publicar mudanças, aumente `CACHE` em `sw.js` (ex.: `vrplayer-v2`).

## Servidor no PC (Fase 2 — Streaming sem ocupar espaço no iPhone)

Permite transmitir vídeos pesados direto do disco rígido do PC para o iPhone pela rede Wi-Fi, com suporte completo a HTTP Range Requests e giroscópio via HTTPS local.

### 1. Gerar certificados HTTPS (Apenas uma vez)
```powershell
npm run cert
```
O script instala o `mkcert` (se necessário), gera os certificados para o IP do seu computador e salva o certificado raiz para o iPhone.

### 2. Iniciar o servidor
```powershell
# Usa a pasta padrão ./videos
npm start

# Ou aponte para qualquer pasta de vídeos no seu computador:
node server.js "D:\Meus Videos VR"
```

### 3. Conectar pelo iPhone
1. No Safari do iPhone, instale o certificado acessando o link exibido no terminal (ex: `http://192.168.3.2:8080/install-cert`).
   - Vá em **Ajustes → Perfil Baixado → Instalar**.
   - Em **Ajustes → Geral → Sobre → Certificados Confiáveis**, ative a chavinha do certificado.
2. Abra o app (seja no GitHub Pages ou em `https://192.168.3.2:8443/`), digite o IP no campo **Vídeos do Computador** e toque em **Conectar**.
3. Toque em qualquer vídeo da lista para iniciar a transmissão imediata!

## Uso

| Ação | Tela | Óculos |
|---|---|---|
| Olhar em volta | Mexer o celular / arrastar | Mexer a cabeça |
| Zoom | Pinça | Ajustes → Campo de visão |
| Reproduzir/pausar | Botões | Toque |
| Menu | Toque | Toque duplo |
| Centralizar | Botão ◎ | Segurar o dedo |

## Detecção de formato

1. **Nome do arquivo:** `_360`, `_180`, `_sbs`, `_lr`, `_tb`, `_ou`, `fisheye`, `_3dh`, `_3dv`…
2. **Imagem:** compara as metades do quadro (estéreo) e procura cantos pretos (olho de peixe).
3. **Proporção:** 2:1 → 360°, 1:1 → 360° 3D cima/baixo, 16:9 → plano…

A escolha manual fica salva para cada arquivo (nome + tamanho).

## Limitações

- Codecs: H.264 e HEVC (MP4/MOV). 8K costuma não funcionar no iPhone; até ~5.7K vai bem.
- O volume é controlado pelos botões físicos (o iOS não permite volume via página).
- Olho de peixe considera 180° de campo de visão.

## Estrutura

```
index.html            interface
css/style.css         visual estilo iOS
js/app.js             estado, arquivos, controles
js/renderer.js        Three.js, estéreo, correção de lente
js/projections.js     shaders 360/180/olho de peixe/plano
js/controls.js        giroscópio, toques, recentralizar
js/detect.js          detecção automática
js/vendor/three.module.js
sw.js / manifest.webmanifest / icons/
```
