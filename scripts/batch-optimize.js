// Script CLI para otimização de vídeos em lote para VR Player (PC e iPhone)
// Converte contêineres e áudios incompatíveis (como MKV, AVI, áudio AC-3/DTS)
// em MP4 com áudio AAC e +faststart em alta velocidade usando FFmpeg.

import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { getBinaryPath, setupBinaryEnv } from './bin-paths.js';
import { formatBytes } from '../js/utils/format.js';

setupBinaryEnv();

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ts', '.m2ts', '.wmv', '.flv']);

export function probeMedia(filePath) {
  return new Promise((resolve) => {
    execFile(getBinaryPath('ffprobe'), [
      '-v', 'error',
      '-show_entries', 'stream=index,codec_name,codec_type,profile,width,height,channels',
      '-of', 'json',
      filePath,
    ], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ error: err.message, canProbe: false });
      try {
        const info = JSON.parse(stdout);
        const v = (info.streams || []).find((s) => s.codec_type === 'video');
        const a = (info.streams || []).find((s) => s.codec_type === 'audio');

        const vCodec = v?.codec_name ? v.codec_name.toLowerCase() : null;
        const aCodec = a?.codec_name ? a.codec_name.toLowerCase() : null;
        const ext = path.extname(filePath).toLowerCase();

        // O iPhone (Safari) aceita com máxima compatibilidade vídeos MP4/MOV em H.264 (AVC) com áudio AAC/MP3
        const isIosContainer = ext === '.mp4' || ext === '.mov' || ext === '.m4v';
        const isIosVideo = vCodec === 'h264';
        const isIosAudio = aCodec === 'aac' || aCodec === 'mp3';
        const isIosCompatible = isIosContainer && isIosVideo && isIosAudio;

        // Apenas se o vídeo já for H.264 podemos manter o fluxo de vídeo sem reencodagem
        const canStreamCopyVideo = vCodec === 'h264';
        const canStreamCopyAudio = aCodec === 'aac';

        let action = 'ready';
        let actionLabel = 'Já compatível';

        if (!isIosCompatible) {
          if (canStreamCopyVideo) {
            action = 'remux';
            actionLabel = ext === '.mkv' ? 'Remux MKV → MP4 (rápido)' : 'Converter áudio para AAC';
          } else {
            action = 'transcode';
            actionLabel = vCodec === 'hevc' ? 'Converter H.265 (HEVC) → H.264' : 'Converter vídeo para H.264';
          }
        }

        resolve({
          canProbe: true,
          videoCodec: vCodec,
          audioCodec: aCodec,
          width: v?.width || null,
          height: v?.height || null,
          channels: a?.channels || 2,
          isIosCompatible,
          canStreamCopyVideo,
          canStreamCopyAudio,
          action,
          actionLabel,
        });
      } catch (e) {
        resolve({ error: e.message, canProbe: false });
      }
    });
  });
}

export async function scanFolderForVideos(dir, recursive = false) {
  const list = [];
  if (!fs.existsSync(dir)) return list;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    // Ignora a pasta de saída 'otimizados' para evitar loop
    if (ent.isDirectory() && (ent.name.toLowerCase() === 'otimizados' || ent.name.toLowerCase() === 'optimized')) {
      continue;
    }

    if (ent.isDirectory() && recursive) {
      const sub = await scanFolderForVideos(full, recursive);
      list.push(...sub);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      // Não reprocessa arquivos que já possuem a tag de otimização
      if (ent.name.toLowerCase().includes('_otimizado')) {
        continue;
      }
      if (VIDEO_EXTS.has(ext)) {
        const stat = fs.statSync(full);
        if (stat.size === 0) continue; // ignora arquivos vazios (ex: downloads incompletos)
        const probe = await probeMedia(full);
        list.push({
          name: ent.name,
          relPath: ent.name,
          fullPath: full,
          sizeBytes: stat.size,
          size: formatBytes(stat.size),
          probe,
        });
      }
    }
  }
  return list;
}

let activeProcess = null;
let detectedEncoder = null;

export async function getBestH264Encoder() {
  if (detectedEncoder) return detectedEncoder;
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(getBinaryPath('ffmpeg'), ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=256x256', '-c:v', 'h264_nvenc', '-pix_fmt', 'yuv420p', '-f', 'null', '-']);
      p.on('close', (code) => (code === 0 ? resolve() : reject()));
      p.on('error', reject);
    });
    detectedEncoder = 'h264_nvenc';
  } catch {
    detectedEncoder = 'libx264';
  }
  return detectedEncoder;
}

export function cancelCurrentOptimization() {
  if (activeProcess) {
    try { activeProcess.kill(); } catch {}
    activeProcess = null;
    return true;
  }
  return false;
}

export async function optimizeSingleFile(item, outDirOrOnProgress = () => {}, maybeProgress = () => {}) {
  const onProgress = typeof outDirOrOnProgress === 'function' ? outDirOrOnProgress : (maybeProgress || (() => {}));
  const encoder = await getBestH264Encoder();

  return new Promise((resolve, reject) => {
    // Salva exatamente na mesma pasta do arquivo original com o sufixo _otimizado.mp4
    const fileDir = path.dirname(item.fullPath);
    const baseName = path.basename(item.name, path.extname(item.name));
    const outPath = path.join(fileDir, `${baseName}_otimizado.mp4`);

    const canCopyV = item.probe?.canStreamCopyVideo && item.probe?.videoCodec === 'h264';
    const canCopyA = item.probe?.canStreamCopyAudio || item.probe?.audioCodec === 'aac';

    const args = ['-y', '-i', item.fullPath];
    if (canCopyV) {
      args.push('-c:v', 'copy');
    } else {
      if (encoder === 'h264_nvenc') {
        args.push(
          '-vf', 'scale=min(3840\\,iw):-2',
          '-c:v', 'h264_nvenc',
          '-rc:v', 'vbr',
          '-cq:v', '22',
          '-pix_fmt', 'yuv420p'
        );
      } else {
        args.push(
          '-vf', 'scale=min(3840\\,iw):-2',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '22',
          '-pix_fmt', 'yuv420p'
        );
      }
    }

    if (canCopyA) {
      args.push('-c:a', 'copy');
    } else {
      args.push('-c:a', 'aac', '-b:a', '256k');
    }

    args.push('-movflags', '+faststart', outPath);

    activeProcess = spawn(getBinaryPath('ffmpeg'), args);

    activeProcess.stderr.on('data', (chunk) => {
      const str = chunk.toString();
      const matchSpeed = str.match(/speed=\s*([\d\.]+x)/);
      const matchTime = str.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (matchSpeed || matchTime) {
        onProgress({
          speed: matchSpeed ? matchSpeed[1] : null,
          time: matchTime ? matchTime[1] : null,
        });
      }
    });

    activeProcess.on('close', (code) => {
      activeProcess = null;
      if (code === 0 && fs.existsSync(outPath)) {
        const stat = fs.statSync(outPath);
        resolve({
          success: true,
          outPath,
          sizeBytes: stat.size,
          size: formatBytes(stat.size),
        });
      } else {
        reject(new Error(`FFmpeg finalizou com código de erro ${code}`));
      }
    });

    activeProcess.on('error', (err) => {
      activeProcess = null;
      reject(err);
    });
  });
}

// Execução em linha de comando (CLI)
if (process.argv[1] && process.argv[1].endsWith('batch-optimize.js')) {
  let targetDir = process.argv[2];
  if (!targetDir && fs.existsSync('config.json')) {
    try {
      const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
      if (Array.isArray(cfg.videoDirs) && cfg.videoDirs.length > 0) {
        targetDir = cfg.videoDirs.find(d => fs.existsSync(d)) || cfg.videoDirs[0];
      } else if (cfg.videoDir) {
        targetDir = cfg.videoDir;
      }
    } catch {}
  }
  if (!targetDir) targetDir = './videos';

  const resolvedDir = path.resolve(targetDir);
  console.log('\n======================================================');
  console.log('   VR Player — Otimizador de Vídeos em Lote');
  console.log('======================================================');
  console.log(`📁 Pasta analisada: ${resolvedDir}`);
  console.log(`🏷️  Destino: Na mesma pasta de cada vídeo com sufixo "_otimizado.mp4"\n`);

  scanFolderForVideos(resolvedDir).then(async (videos) => {
    if (!videos.length) {
      console.log('Nenhum vídeo compatível encontrado na pasta.');
      return;
    }

    console.log(`Encontrados ${videos.length} vídeo(s):\n`);
    const queue = [];

    videos.forEach((v, i) => {
      const p = v.probe || {};
      const statusIcon = p.isIosCompatible ? '✅' : (p.action === 'remux' ? '⚡' : '🔄');
      console.log(` ${i + 1}. ${statusIcon} ${v.name} (${v.size})`);
      console.log(`    Vídeo: ${p.videoCodec || '?'} | Áudio: ${p.audioCodec || '?'} → [${p.actionLabel || 'Otimizar'}]`);
      if (!p.isIosCompatible) {
        queue.push(v);
      }
    });

    console.log(`\n------------------------------------------------------`);
    if (!queue.length) {
      console.log('🎉 Todos os vídeos já estão 100% compatíveis com iPhone e PC!');
      return;
    }

    console.log(`Iniciando otimização de ${queue.length} vídeo(s) para formato MP4/AAC...`);
    let count = 0;

    for (const item of queue) {
      count++;
      process.stdout.write(`\n[${count}/${queue.length}] Processando: ${item.name} ... `);
      const startT = Date.now();
      try {
        await optimizeSingleFile(item, (prog) => {
          if (prog.speed) {
            process.stdout.write(`\r[${count}/${queue.length}] ${item.name} (${prog.speed}) `);
          }
        });
        const elapsed = ((Date.now() - startT) / 1000).toFixed(1);
        const optName = `${path.basename(item.name, path.extname(item.name))}_otimizado.mp4`;
        console.log(`\r[${count}/${queue.length}] ✅ Concluído em ${elapsed}s: ${optName}`);
      } catch (err) {
        console.log(`\r[${count}/${queue.length}] ❌ Erro: ${err.message}`);
      }
    }

    console.log('\n======================================================');
    console.log(`🎉 Otimização concluída! Arquivos salvos na mesma pasta de origem:`);
    console.log(`🏷️  Identificados com a tag: "_otimizado.mp4"`);
    console.log('Agora você pode transmitir ou assistir diretamente no iPhone e PC!');
    console.log('======================================================\n');
  });
}
