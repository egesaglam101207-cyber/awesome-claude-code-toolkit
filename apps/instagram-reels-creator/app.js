/*
 * Instagram Reels Video Creator — fully client-side.
 * No uploads leave the browser: files are read as object URLs and
 * composited onto a <canvas>, then captured with MediaRecorder.
 */
(() => {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const TRANSITION_MS = 500;
  const DEFAULT_IMAGE_DURATION = 3;
  const MAX_CLIP_DURATION = 12;

  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const slideListEl = document.getElementById('slideList');
  const templateGrid = document.getElementById('templateGrid');
  const musicInput = document.getElementById('musicInput');
  const musicDropzone = document.getElementById('musicDropzone');
  const musicLabel = document.getElementById('musicLabel');
  const musicVolumeRow = document.getElementById('musicVolumeRow');
  const musicVolume = document.getElementById('musicVolume');
  const removeMusicBtn = document.getElementById('removeMusic');
  const exportBtn = document.getElementById('exportBtn');
  const playBtn = document.getElementById('playBtn');
  const stopBtn = document.getElementById('stopBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const statusText = document.getElementById('statusText');
  const downloadLink = document.getElementById('downloadLink');
  const durationHint = document.getElementById('durationHint');
  const phoneEmpty = document.getElementById('phoneEmpty');
  const fpsSelect = document.getElementById('fpsSelect');

  /** @type {{id:number,type:'image'|'video',url:string,el:HTMLImageElement|HTMLVideoElement,duration:number,title:string,subtitle:string}[]} */
  let slides = [];
  let nextId = 1;
  let template = 'kenburns';
  let musicEl = null;
  let musicObjectUrl = null;

  let previewRAF = null;
  let previewStart = 0;
  let isExporting = false;

  // ---------- Slide management ----------

  function addFiles(fileList) {
    [...fileList].forEach((file) => {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) return;

      const url = URL.createObjectURL(file);
      const slide = {
        id: nextId++,
        type: isVideo ? 'video' : 'image',
        url,
        el: null,
        duration: DEFAULT_IMAGE_DURATION,
        title: '',
        subtitle: '',
      };

      if (isImage) {
        const img = new Image();
        img.src = url;
        slide.el = img;
        slides.push(slide);
        renderSlideList();
        updateActionState();
      } else {
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.addEventListener('loadedmetadata', () => {
          slide.duration = Math.min(video.duration || DEFAULT_IMAGE_DURATION, MAX_CLIP_DURATION);
          renderSlideList();
          updateActionState();
        }, { once: true });
        slide.el = video;
        slides.push(slide);
        renderSlideList();
        updateActionState();
      }
    });
  }

  function removeSlide(id) {
    const idx = slides.findIndex((s) => s.id === id);
    if (idx === -1) return;
    URL.revokeObjectURL(slides[idx].url);
    slides.splice(idx, 1);
    renderSlideList();
    updateActionState();
  }

  function moveSlide(id, dir) {
    const idx = slides.findIndex((s) => s.id === id);
    const newIdx = idx + dir;
    if (idx === -1 || newIdx < 0 || newIdx >= slides.length) return;
    const [item] = slides.splice(idx, 1);
    slides.splice(newIdx, 0, item);
    renderSlideList();
  }

  function renderSlideList() {
    slideListEl.innerHTML = '';
    slides.forEach((slide, i) => {
      const li = document.createElement('li');
      li.className = 'slide-item';

      const thumb = document.createElement(slide.type === 'video' ? 'video' : 'img');
      thumb.className = 'slide-thumb';
      thumb.src = slide.url;
      if (slide.type === 'video') { thumb.muted = true; thumb.playsInline = true; }

      const fields = document.createElement('div');
      fields.className = 'slide-fields';

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.placeholder = `Başlık (slayt ${i + 1})`;
      titleInput.value = slide.title;
      titleInput.addEventListener('input', () => { slide.title = titleInput.value; });

      const subInput = document.createElement('input');
      subInput.type = 'text';
      subInput.placeholder = 'Alt yazı (opsiyonel)';
      subInput.value = slide.subtitle;
      subInput.addEventListener('input', () => { slide.subtitle = subInput.value; });

      const meta = document.createElement('div');
      meta.className = 'slide-meta';
      const durLabel = document.createElement('span');
      durLabel.textContent = slide.type === 'video' ? 'Klip:' : 'Süre:';
      const durInput = document.createElement('input');
      durInput.type = 'number';
      durInput.min = '0.5';
      durInput.max = String(MAX_CLIP_DURATION);
      durInput.step = '0.5';
      durInput.value = slide.duration.toFixed(1);
      durInput.addEventListener('input', () => {
        const v = parseFloat(durInput.value);
        if (!Number.isNaN(v) && v > 0) {
          slide.duration = Math.min(v, MAX_CLIP_DURATION);
          updateActionState();
        }
      });
      const durUnit = document.createElement('span');
      durUnit.textContent = 'sn';
      meta.append(durLabel, durInput, durUnit);

      fields.append(titleInput, subInput, meta);

      const actions = document.createElement('div');
      actions.className = 'slide-actions';
      const upBtn = document.createElement('button');
      upBtn.className = 'icon-btn';
      upBtn.textContent = '↑';
      upBtn.type = 'button';
      upBtn.disabled = i === 0;
      upBtn.addEventListener('click', () => moveSlide(slide.id, -1));

      const downBtn = document.createElement('button');
      downBtn.className = 'icon-btn';
      downBtn.textContent = '↓';
      downBtn.type = 'button';
      downBtn.disabled = i === slides.length - 1;
      downBtn.addEventListener('click', () => moveSlide(slide.id, 1));

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.textContent = '✕';
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => removeSlide(slide.id));

      actions.append(upBtn, downBtn, delBtn);
      li.append(thumb, fields, actions);
      slideListEl.appendChild(li);
    });

    phoneEmpty.classList.toggle('hidden', slides.length > 0);
    updateDurationHint();
  }

  function totalDuration() {
    return slides.reduce((sum, s) => sum + s.duration, 0);
  }

  function updateDurationHint() {
    const total = totalDuration();
    durationHint.textContent = `Toplam süre: ${total.toFixed(1)} sn`;
  }

  function updateActionState() {
    const hasSlides = slides.length > 0;
    exportBtn.disabled = !hasSlides || isExporting;
    playBtn.disabled = !hasSlides || isExporting;
    updateDurationHint();
  }

  // ---------- Uploads ----------

  fileInput.addEventListener('change', (e) => addFiles(e.target.files));
  ['dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
  dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  musicInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (musicObjectUrl) URL.revokeObjectURL(musicObjectUrl);
    musicObjectUrl = URL.createObjectURL(file);
    musicEl = new Audio(musicObjectUrl);
    musicEl.loop = true;
    musicEl.volume = parseFloat(musicVolume.value);
    musicLabel.textContent = file.name;
    musicVolumeRow.hidden = false;
  });

  removeMusicBtn.addEventListener('click', () => {
    if (musicObjectUrl) URL.revokeObjectURL(musicObjectUrl);
    musicEl = null;
    musicObjectUrl = null;
    musicInput.value = '';
    musicLabel.textContent = 'Ses dosyası seç (opsiyonel)';
    musicVolumeRow.hidden = true;
  });

  musicVolume.addEventListener('input', () => {
    if (musicEl) musicEl.volume = parseFloat(musicVolume.value);
  });

  // ---------- Templates ----------

  templateGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.template-option');
    if (!btn) return;
    template = btn.dataset.template;
    [...templateGrid.children].forEach((c) => c.classList.toggle('active', c === btn));
  });

  // ---------- Drawing ----------

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }

  function drawCover(el, w, h, extraScale = 1, offsetX = 0, offsetY = 0) {
    const naturalW = el.videoWidth || el.naturalWidth || w;
    const naturalH = el.videoHeight || el.naturalHeight || h;
    if (!naturalW || !naturalH) return;
    const scale = Math.max(w / naturalW, h / naturalH) * extraScale;
    const drawW = naturalW * scale;
    const drawH = naturalH * scale;
    const dx = (w - drawW) / 2 + offsetX;
    const dy = (h - drawH) / 2 + offsetY;
    ctx.drawImage(el, dx, dy, drawW, drawH);
  }

  function wrapText(text, maxWidth, fontSize) {
    ctx.font = `600 ${fontSize}px -apple-system, Helvetica, Arial, sans-serif`;
    const words = text.split(' ');
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawTextOverlay(slide, localT) {
    if (!slide.title && !slide.subtitle) return;
    const enter = clamp01(localT / 0.4);
    const eased = easeOutCubic(enter);
    const slideUp = (1 - eased) * 40;
    const alpha = eased;

    const maxWidth = CANVAS_W - 140;
    const lines = slide.title ? wrapText(slide.title, maxWidth, 64) : [];
    const subLines = slide.subtitle ? wrapText(slide.subtitle, maxWidth, 38) : [];

    const lineHeight = 74;
    const subLineHeight = 46;
    const blockHeight = lines.length * lineHeight + (subLines.length ? subLines.length * subLineHeight + 16 : 0);
    const bottomPad = 220;
    let y = CANVAS_H - bottomPad - blockHeight + slideUp;

    ctx.save();
    ctx.globalAlpha = alpha;
    const boxTop = y - 24;
    const boxHeight = blockHeight + 48;
    const gradient = ctx.createLinearGradient(0, boxTop, 0, boxTop + boxHeight + 100);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, boxTop, CANVAS_W, boxHeight + 100);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    ctx.font = '700 64px -apple-system, Helvetica, Arial, sans-serif';
    lines.forEach((line) => {
      ctx.fillText(line, CANVAS_W / 2, y + 50);
      y += lineHeight;
    });

    if (subLines.length) {
      y += 10;
      ctx.font = '500 38px -apple-system, Helvetica, Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      subLines.forEach((line) => {
        ctx.fillText(line, CANVAS_W / 2, y + 30);
        y += subLineHeight;
      });
    }
    ctx.restore();
  }

  function idleTransform(t, duration) {
    const progress = clamp01(t / duration);
    if (template === 'kenburns') {
      const scale = 1 + progress * 0.12;
      const offsetX = -progress * 30;
      const offsetY = -progress * 20;
      return { scale, offsetX, offsetY };
    }
    if (template === 'slide') {
      return { scale: 1.02, offsetX: 0, offsetY: 0 };
    }
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }

  /**
   * Draws the composited frame for a global time `tMs` (ms since sequence start).
   */
  function drawAtTime(tMs) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (!slides.length) return;

    let cursor = 0;
    let idx = 0;
    const tSec = tMs / 1000;
    while (idx < slides.length - 1 && tSec >= cursor + slides[idx].duration) {
      cursor += slides[idx].duration;
      idx += 1;
    }
    const slide = slides[idx];
    const localT = Math.max(0, tSec - cursor);
    const next = slides[idx + 1];
    const timeToEnd = slide.duration - localT;
    const transitioning = template !== 'snap' && next && timeToEnd <= TRANSITION_MS / 1000;
    const transitionProgress = transitioning ? 1 - timeToEnd / (TRANSITION_MS / 1000) : 0;

    drawSlideContent(slide, localT);
    if (transitioning) {
      ctx.save();
      if (template === 'slide') {
        ctx.globalAlpha = 1;
        const offset = easeOutCubic(transitionProgress) * CANVAS_W;
        ctx.save();
        ctx.translate(-offset, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(offset, 0, CANVAS_W, CANVAS_H);
        drawSlideContentAt(next, 0, CANVAS_W, 0);
        ctx.restore();
      } else {
        ctx.globalAlpha = easeOutCubic(transitionProgress);
        drawSlideContent(next, 0);
      }
      ctx.restore();
    }

    if (!transitioning || template !== 'slide') {
      drawTextOverlay(slide, localT);
    }
  }

  function drawSlideContent(slide, localT) {
    drawSlideContentAt(slide, localT, 0, 0);
  }

  function drawSlideContentAt(slide, localT, translateX, translateY) {
    if (!slide || !slide.el) return;
    const ready = slide.type === 'image'
      ? slide.el.complete && slide.el.naturalWidth
      : slide.el.readyState >= 2;
    ctx.save();
    ctx.translate(translateX, translateY);
    if (!ready) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
      return;
    }
    const { scale, offsetX, offsetY } = idleTransform(localT, slide.duration);
    drawCover(slide.el, CANVAS_W, CANVAS_H, scale, offsetX, offsetY);
    ctx.restore();
  }

  // ---------- Preview playback ----------

  function stopPreview() {
    if (previewRAF) cancelAnimationFrame(previewRAF);
    previewRAF = null;
    slides.forEach((s) => { if (s.type === 'video') s.el.pause(); });
    playBtn.textContent = '▶ Önizlemeyi Oynat';
    playBtn.disabled = slides.length === 0;
    stopBtn.disabled = true;
  }

  function startPreview() {
    if (!slides.length) return;
    previewStart = performance.now();
    playBtn.textContent = '⏸ Oynatılıyor…';
    stopBtn.disabled = false;
    const total = totalDuration() * 1000;

    const loop = (now) => {
      const elapsed = now - previewStart;
      if (elapsed >= total) {
        previewStart = now;
        drawAtTime(0);
        previewRAF = requestAnimationFrame(loop);
        return;
      }
      drawAtTime(elapsed);
      syncActiveVideo(elapsed);
      previewRAF = requestAnimationFrame(loop);
    };
    previewRAF = requestAnimationFrame(loop);
  }

  function syncActiveVideo(tMs) {
    let cursor = 0;
    const tSec = tMs / 1000;
    for (const slide of slides) {
      const within = tSec >= cursor && tSec < cursor + slide.duration;
      if (slide.type === 'video') {
        if (within) {
          if (slide.el.paused) slide.el.play().catch(() => {});
        } else if (!slide.el.paused) {
          slide.el.pause();
        }
      }
      cursor += slide.duration;
    }
  }

  playBtn.addEventListener('click', () => {
    if (previewRAF) { stopPreview(); return; }
    startPreview();
  });
  stopBtn.addEventListener('click', () => { stopPreview(); drawAtTime(0); });

  // ---------- Export ----------

  function pickMimeType() {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
  }

  async function startExport() {
    if (!slides.length || isExporting) return;
    if (!window.MediaRecorder) {
      statusText.textContent = 'Bu tarayıcı video kaydını desteklemiyor. Güncel bir Chrome/Edge deneyin.';
      return;
    }

    isExporting = true;
    updateActionState();
    stopPreview();
    downloadLink.hidden = true;
    progressWrap.hidden = false;
    progressBar.style.width = '0%';
    statusText.textContent = 'Hazırlanıyor…';

    const fps = parseInt(fpsSelect.value, 10);
    const total = totalDuration() * 1000;
    const videoStream = canvas.captureStream(fps);
    const tracks = [...videoStream.getVideoTracks()];

    let audioCtx = null;
    if (musicEl) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(musicEl);
      const dest = audioCtx.createMediaStreamDestination();
      const gain = audioCtx.createGain();
      gain.gain.value = parseFloat(musicVolume.value);
      source.connect(gain).connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
      musicEl.currentTime = 0;
      await musicEl.play().catch(() => {});
    }

    const mimeType = pickMimeType();
    const combined = new MediaStream(tracks);
    const recorder = new MediaRecorder(combined, mimeType ? { mimeType, videoBitsPerSecond: 10_000_000 } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const ext = (mimeType || '').includes('mp4') ? 'mp4' : 'webm';
      downloadLink.href = url;
      downloadLink.download = `reels-video.${ext}`;
      downloadLink.hidden = false;
      statusText.textContent = `Hazır! (${ext.toUpperCase()}, ${(blob.size / (1024 * 1024)).toFixed(1)} MB)`;
      progressWrap.hidden = true;
      if (musicEl) musicEl.pause();
      if (audioCtx) audioCtx.close();
      isExporting = false;
      updateActionState();
    };

    recorder.start(200);
    const exportStart = performance.now();

    const tick = (now) => {
      const elapsed = now - exportStart;
      if (elapsed >= total) {
        drawAtTime(total);
        recorder.stop();
        return;
      }
      drawAtTime(elapsed);
      syncActiveVideo(elapsed);
      progressBar.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
      statusText.textContent = `Kaydediliyor… ${(elapsed / 1000).toFixed(1)} / ${(total / 1000).toFixed(1)} sn`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  exportBtn.addEventListener('click', startExport);

  // ---------- Initial paint ----------
  drawAtTime(0);
})();
