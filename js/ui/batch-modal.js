// Modal de Otimização de Vídeos em Lote (Batch Optimizer)
// Permite escanear diretórios locais ou remotos e converter/remuxar em lote com FFmpeg

export class BatchOptimizerModal {
  constructor(options = {}) {
    this.els = options.els || {};
    this.store = options.store || { get: () => '', set: () => {} };
    this.isElectron = !!options.isElectron;
    this.openSheet = options.openSheet || (() => {});
    this.toast = options.toast || (() => {});

    this.scannedFiles = [];
    this.isRunning = false;
    this.serverPollInterval = null;

    this.initEvents();
  }

  initEvents() {
    const { els, isElectron } = this;

    els.btnBatchBrowse?.addEventListener('click', async () => {
      if (isElectron && window.electronAPI?.batchSelectFolder) {
        const folder = await window.electronAPI.batchSelectFolder();
        if (folder) {
          els.batchFolderInput.value = folder;
          this.store.set('batch_folder', folder);
          this.scan(folder);
        }
      } else {
        this.toast('No navegador/Safari, a pasta é gerenciada no servidor PC.');
      }
    });

    els.btnBatchScan?.addEventListener('click', () => {
      this.scan(els.batchFolderInput.value);
    });

    els.btnBatchSelectAll?.addEventListener('click', () => {
      els.batchList?.querySelectorAll('.batch-checkbox').forEach((cb) => { cb.checked = true; });
      this.updateStartButton();
    });

    els.btnBatchSelectNeeded?.addEventListener('click', () => {
      els.batchList?.querySelectorAll('.batch-checkbox').forEach((cb) => {
        const v = this.scannedFiles[Number(cb.dataset.index)];
        const isReady = v?.probe?.isIosCompatible ?? v?.isIosCompatible;
        cb.checked = !isReady;
      });
      this.updateStartButton();
    });

    els.btnBatchSelectNone?.addEventListener('click', () => {
      els.batchList?.querySelectorAll('.batch-checkbox').forEach((cb) => { cb.checked = false; });
      this.updateStartButton();
    });

    els.btnBatchStart?.addEventListener('click', () => this.start());

    els.btnBatchCancel?.addEventListener('click', () => this.cancel());

    if (isElectron && window.electronAPI?.onBatchProgress) {
      window.electronAPI.onBatchProgress((data) => {
        if (data.status === 'processing') {
          if (els.batchProgressTitle) els.batchProgressTitle.textContent = `[${data.currentIndex}/${data.total}] ${data.currentFile}`;
          if (els.batchProgressPercent) els.batchProgressPercent.textContent = `${data.percent}%`;
          if (els.batchProgressFill) els.batchProgressFill.style.width = `${data.percent}%`;
          if (els.batchProgressSub) els.batchProgressSub.textContent = data.speed ? `Velocidade: ${data.speed}` : 'Convertendo...';
        }
      });
    }
  }

  async open() {
    const { els, isElectron, store } = this;
    this.openSheet(els.sheetBatch);

    if (!els.batchFolderInput.value) {
      if (isElectron && window.electronAPI?.batchGetDefaultFolder) {
        const def = await window.electronAPI.batchGetDefaultFolder();
        if (def) els.batchFolderInput.value = def;
      } else {
        const saved = store.get('batch_folder', '');
        if (saved) els.batchFolderInput.value = saved;
      }
    }

    if (els.batchFolderInput.value) {
      if (!this.scannedFiles.length) {
        this.scan(els.batchFolderInput.value);
      }
    } else {
      if (!isElectron) {
        this.scan('');
      } else {
        if (els.batchSummary) {
          els.batchSummary.hidden = false;
          els.batchSummary.textContent = 'Clique em "Escolher" para selecionar a pasta contendo seus vídeos.';
        }
      }
    }
  }

  async scan(folderPath) {
    const { els, isElectron, store } = this;

    if (isElectron && !folderPath) {
      if (window.electronAPI?.batchSelectFolder) {
        const folder = await window.electronAPI.batchSelectFolder();
        if (folder) {
          folderPath = folder;
          els.batchFolderInput.value = folder;
          store.set('batch_folder', folder);
        } else {
          return;
        }
      } else {
        this.toast('Selecione uma pasta de vídeos');
        return;
      }
    }

    if (els.batchSummary) {
      els.batchSummary.hidden = false;
      els.batchSummary.textContent = 'Escaneando pasta e analisando codecs com FFmpeg/ffprobe...';
    }
    if (els.batchToolbar) els.batchToolbar.hidden = true;
    if (els.batchList) els.batchList.hidden = true;
    if (els.btnBatchStart) els.btnBatchStart.disabled = true;

    try {
      let videos = [];
      if (isElectron && window.electronAPI?.batchScan) {
        videos = await window.electronAPI.batchScan(folderPath);
      } else {
        const base = els.serverUrlInput?.value || location.origin;
        const url = folderPath ? `${base}/api/optimize/scan?folder=${encodeURIComponent(folderPath)}` : `${base}/api/optimize/scan`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Servidor retornou erro ' + res.status);
        const data = await res.json();
        videos = data.videos || [];
        if (data.folder && !els.batchFolderInput.value) {
          els.batchFolderInput.value = data.folder;
          folderPath = data.folder;
        }
      }

      this.scannedFiles = videos;
      this.renderList(videos, folderPath || els.batchFolderInput.value);
    } catch (err) {
      if (els.batchSummary) els.batchSummary.textContent = 'Erro ao escanear pasta: ' + err.message;
      if (els.batchToolbar) els.batchToolbar.hidden = true;
    }
  }

  renderList(videos, folderPath) {
    const { els } = this;
    if (!els.batchList) return;
    els.batchList.innerHTML = '';

    if (!videos.length) {
      if (els.batchSummary) els.batchSummary.textContent = `Nenhum arquivo de vídeo encontrado em ${folderPath || 'esta pasta'}.`;
      if (els.batchToolbar) els.batchToolbar.hidden = true;
      els.batchList.hidden = true;
      if (els.btnBatchStart) els.btnBatchStart.disabled = true;
      return;
    }

    const needsOpt = videos.filter((v) => {
      const isReady = v.probe?.isIosCompatible ?? v.isIosCompatible;
      return !isReady;
    });

    if (els.batchSummary) {
      els.batchSummary.textContent = `${videos.length} vídeo(s) encontrado(s): ${needsOpt.length} precisam de otimização para iPhone/PC.`;
    }
    if (els.batchToolbar) els.batchToolbar.hidden = false;
    els.batchList.hidden = false;

    videos.forEach((v, index) => {
      const item = document.createElement('div');
      item.className = 'batch-item clickable';

      const p = v.probe || {};
      const isReady = p.isIosCompatible ?? v.isIosCompatible;
      const action = p.action ?? v.action ?? (isReady ? 'ready' : 'transcode');
      const badgeClass = isReady ? 'badge-ready' : (action === 'remux' ? 'badge-remux' : 'badge-transcode');
      const badgeText = isReady ? '✅ Compatível' : (action === 'remux' ? '⚡ Remux Rápido' : '🔄 Transcode');

      item.innerHTML = `
        <input type="checkbox" class="batch-checkbox" data-index="${index}" ${!isReady ? 'checked' : ''}>
        <div class="batch-item-info">
          <span class="batch-item-name">${v.name}</span>
          <span class="batch-item-meta">${v.size || ''} • Vídeo: ${p.videoCodec || '?'} | Áudio: ${p.audioCodec || '?'}</span>
        </div>
        <span class="badge-action ${badgeClass}">${badgeText}</span>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('batch-checkbox')) return;
        const cb = item.querySelector('.batch-checkbox');
        if (cb) {
          cb.checked = !cb.checked;
          this.updateStartButton();
        }
      });

      els.batchList.appendChild(item);
    });

    this.updateStartButton();

    els.batchList.querySelectorAll('.batch-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => this.updateStartButton());
    });
  }

  updateStartButton() {
    const { els } = this;
    if (!els.batchList || !els.btnBatchStart) return;
    const checked = els.batchList.querySelectorAll('.batch-checkbox:checked');
    els.btnBatchStart.disabled = checked.length === 0 || this.isRunning;
    els.btnBatchStart.textContent = `Iniciar Otimização (${checked.length} vídeo${checked.length === 1 ? '' : 's'})`;
  }

  async start() {
    const { els, isElectron } = this;
    const checkedCheckboxes = [...(els.batchList?.querySelectorAll('.batch-checkbox:checked') || [])];
    const selectedFiles = checkedCheckboxes.map((cb) => this.scannedFiles[Number(cb.dataset.index)]).filter(Boolean);

    if (!selectedFiles.length) {
      this.toast('Selecione pelo menos um vídeo para otimizar.');
      return;
    }

    this.isRunning = true;
    if (els.btnBatchStart) {
      els.btnBatchStart.disabled = true;
      els.btnBatchStart.style.display = 'none';
    }
    if (els.btnBatchCancel) els.btnBatchCancel.style.display = 'block';
    if (els.batchProgressBox) els.batchProgressBox.hidden = false;
    if (els.batchProgressPercent) els.batchProgressPercent.textContent = '0%';
    if (els.batchProgressFill) els.batchProgressFill.style.width = '0%';
    if (els.batchProgressSub) els.batchProgressSub.textContent = `Preparando fila de ${selectedFiles.length} vídeo(s)...`;

    const folderPath = els.batchFolderInput?.value;

    if (isElectron && window.electronAPI?.batchStart) {
      try {
        await window.electronAPI.batchStart({
          folderPath,
          files: selectedFiles,
        });

        this.isRunning = false;
        if (els.btnBatchCancel) els.btnBatchCancel.style.display = 'none';
        if (els.btnBatchStart) {
          els.btnBatchStart.style.display = 'block';
          els.btnBatchStart.disabled = false;
          els.btnBatchStart.textContent = 'Otimização Concluída!';
        }
        if (els.batchProgressTitle) els.batchProgressTitle.textContent = '🎉 Todos os vídeos foram otimizados!';
        if (els.batchProgressSub) els.batchProgressSub.textContent = 'Salvos na mesma pasta de origem com a tag "_otimizado.mp4"';
        this.toast('🎉 Vídeos otimizados salvos na mesma pasta com a tag "_otimizado.mp4"');
        this.scan(folderPath);
      } catch (err) {
        this.isRunning = false;
        if (els.btnBatchCancel) els.btnBatchCancel.style.display = 'none';
        if (els.btnBatchStart) {
          els.btnBatchStart.style.display = 'block';
          els.btnBatchStart.disabled = false;
        }
        this.toast('Erro na otimização: ' + err.message);
      }
    } else {
      try {
        const base = els.serverUrlInput?.value || location.origin;
        await fetch(`${base}/api/optimize/start`, { method: 'POST' });
        this.toast('Otimização iniciada no computador!');
        this.pollServerStatus();
      } catch (err) {
        this.isRunning = false;
        if (els.btnBatchCancel) els.btnBatchCancel.style.display = 'none';
        if (els.btnBatchStart) els.btnBatchStart.style.display = 'block';
        this.toast('Erro ao iniciar no servidor: ' + err.message);
      }
    }
  }

  pollServerStatus() {
    const { els } = this;
    if (this.serverPollInterval) clearInterval(this.serverPollInterval);
    const base = els.serverUrlInput?.value || location.origin;

    this.serverPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${base}/api/optimize/status`);
        const st = await res.json();
        if (st.running) {
          if (els.batchProgressTitle) els.batchProgressTitle.textContent = `Otimizando [${st.current}/${st.total}]: ${st.currentFile}`;
          if (els.batchProgressPercent) els.batchProgressPercent.textContent = `${st.percent}%`;
          if (els.batchProgressFill) els.batchProgressFill.style.width = `${st.percent}%`;
          if (els.batchProgressSub) els.batchProgressSub.textContent = st.speed ? `Velocidade: ${st.speed}` : 'Processando...';
        } else if (st.percent === 100) {
          clearInterval(this.serverPollInterval);
          this.serverPollInterval = null;
          this.isRunning = false;
          if (els.btnBatchCancel) els.btnBatchCancel.style.display = 'none';
          if (els.btnBatchStart) {
            els.btnBatchStart.style.display = 'block';
            els.btnBatchStart.disabled = false;
          }
          if (els.batchProgressTitle) els.batchProgressTitle.textContent = '🎉 Otimização concluída!';
          if (els.batchProgressSub) els.batchProgressSub.textContent = 'Salvos na mesma pasta com "_otimizado.mp4" prontos para iPhone e PC!';
          this.toast('🎉 Vídeos otimizados salvos com a tag "_otimizado.mp4"!');
        }
      } catch {
        clearInterval(this.serverPollInterval);
        this.serverPollInterval = null;
      }
    }, 1000);
  }

  cancel() {
    const { els, isElectron } = this;
    if (this.serverPollInterval) {
      clearInterval(this.serverPollInterval);
      this.serverPollInterval = null;
    }
    if (isElectron && window.electronAPI?.batchCancel) {
      window.electronAPI.batchCancel();
    } else {
      const base = els.serverUrlInput?.value || location.origin;
      fetch(`${base}/api/optimize/cancel`, { method: 'POST' }).catch(() => {});
    }
    this.isRunning = false;
    if (els.btnBatchCancel) els.btnBatchCancel.style.display = 'none';
    if (els.btnBatchStart) {
      els.btnBatchStart.style.display = 'block';
      els.btnBatchStart.disabled = false;
    }
    if (els.batchProgressTitle) els.batchProgressTitle.textContent = 'Otimização cancelada.';
    this.toast('Otimização interrompida');
  }
}
