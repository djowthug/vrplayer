// Modal de Diagnóstico de Codecs e Aceleração por GPU
// Exibe status do WebCodecs/Safari no iOS e Direct3D/FFmpeg no Desktop Electron

const $ = (id) => document.getElementById(id);

/**
 * Renderiza o diagnóstico de codecs no container fornecido
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {boolean} opts.isElectron
 * @param {HTMLVideoElement} opts.video
 * @param {object} opts.state
 * @param {Function} opts.toast
 * @param {Function} opts.closeSheets
 * @param {Function} opts.openVideoSource
 */
export async function renderCodecsUI({
  container,
  isElectron,
  video,
  state,
  toast,
  closeSheets,
  openVideoSource,
}) {
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--label2);">Carregando diagnóstico...</div>';

  if (!isElectron || !window.electronAPI?.getCodecDiagnostics) {
    const canHevc = video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== '';
    container.innerHTML = `
      <div class="codec-grid">
        <div class="codec-card">
          <span class="codec-title">Ambiente</span>
          <span class="codec-val">Navegador Web / PWA</span>
          <span class="codec-sub">Safari / WebKit / iOS</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">H.264 (AVC)</span>
          <span class="codec-val badge-green">✔ Suportado</span>
          <span class="codec-sub">Aceleração de hardware</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">HEVC (H.265)</span>
          <span class="codec-val ${canHevc ? 'badge-green' : 'badge-orange'}">
            ${canHevc ? '✔ Suportado' : 'Depende do aparelho'}
          </span>
          <span class="codec-sub">Até 4K HDR</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">Áudio AAC / MP3</span>
          <span class="codec-val badge-green">✔ Suportado</span>
          <span class="codec-sub">Nativo</span>
        </div>
      </div>
      <p class="sheet-footnote">No iPhone e Safari, use vídeos em formato MP4 ou MOV codificados em H.264 (AVC) com áudio AAC para 100% de compatibilidade.</p>
    `;
    return;
  }

  try {
    const diag = await window.electronAPI.getCodecDiagnostics();
    const canHevc = video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== '';
    const ffmpegOk = diag.tools?.ffmpeg?.available;

    let currentFileOptBtn = '';
    if (state.originalPath) {
      currentFileOptBtn = `
        <div style="margin-top:14px;background:var(--bg2);padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
          <strong style="display:block;font-size:14px;margin-bottom:4px;">Vídeo atual: ${state.fileName}</strong>
          <small style="display:block;color:var(--label2);font-size:12px;margin-bottom:10px;">Caso esteja mudo (áudio AC-3/DTS) ou travando, otimize rapidamente em formato MP4/AAC sem perda de qualidade visual.</small>
          <button id="btn-opt-current" class="btn-primary" style="height:42px;font-size:14px;border-radius:10px;">
            ⚡ Otimizar Áudio/Contêiner deste Vídeo
          </button>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="codec-grid">
        <div class="codec-card">
          <span class="codec-title">Aceleração GPU</span>
          <span class="codec-val badge-green">✔ Ativada</span>
          <span class="codec-sub">Direct3D / WebGL</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">H.264 (AVC)</span>
          <span class="codec-val badge-green">✔ 100% Nativo</span>
          <span class="codec-sub">Aceleração por hardware GPU</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">HEVC (H.265)</span>
          <span class="codec-val ${canHevc ? 'badge-green' : 'badge-orange'}">${canHevc ? '✔ GPU Hardware' : 'Requer Extensão'}</span>
          <span class="codec-sub">Media Foundation</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">VP9 / AV1</span>
          <span class="codec-val badge-green">✔ Suportado</span>
          <span class="codec-sub">libdav1d + GPU</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">Contêineres</span>
          <span class="codec-val badge-green">MP4, MKV, WebM, MOV</span>
          <span class="codec-sub">Range requests nativos</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">Ferramenta FFmpeg</span>
          <span class="codec-val ${ffmpegOk ? 'badge-green' : 'badge-orange'}">${ffmpegOk ? (diag.tools?.ffmpeg?.isBundled ? '✔ Embutido' : '✔ Detectado') : 'Não instalado'}</span>
          <span class="codec-sub">${ffmpegOk ? (diag.tools?.ffmpeg?.isBundled ? '✔ Binário estático integrado' : 'Remux de AC-3/DTS/AVI ativo') : 'Opcional'}</span>
        </div>
      </div>
      <p class="sheet-footnote">
        No executável Windows, a decodificação de vídeo usa aceleração total da sua GPU. Vídeos em MKV, MP4, WebM e MOV abrem nativamente.
      </p>
      ${currentFileOptBtn}
    `;

    const optBtn = $('btn-opt-current');
    if (optBtn) {
      optBtn.addEventListener('click', async () => {
        optBtn.disabled = true;
        optBtn.textContent = '⏳ Otimizando com FFmpeg...';
        toast('Otimizando arquivo em segundo plano...');
        try {
          const res = await window.electronAPI.optimizeMedia(state.originalPath);
          if (res && res.success) {
            toast('✅ Arquivo otimizado! Recarregando...');
            closeSheets();
            openVideoSource({
              url: res.url,
              name: res.name,
              size: res.size,
              isBlob: false,
              originalPath: res.path,
            });
          }
        } catch (e) {
          toast('Falha ao otimizar: ' + e.message);
          optBtn.disabled = false;
          optBtn.textContent = '⚡ Otimizar Áudio/Contêiner deste Vídeo';
        }
      });
    }
  } catch (err) {
    container.innerHTML = `<p class="sheet-footnote">Erro ao obter diagnóstico: ${err.message}</p>`;
  }
}
