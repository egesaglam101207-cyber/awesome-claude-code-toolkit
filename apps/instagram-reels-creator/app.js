/*
 * Instagram Reels Video Creator — fully client-side, no uploads.
 * Every frame is procedurally drawn on a <canvas> (flat vector illustration
 * style, bold black outlines) from a fixed scene library. Claude plans which
 * scenes to use from a free-text prompt; MediaRecorder captures the result.
 */
(() => {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const TRANSITION_MS = 600;
  const DEFAULT_SCENE_DURATION = 4;
  const MIN_SCENE_DURATION = 2;
  const MAX_SCENE_DURATION = 10;

  const SCENE_LABELS = {
    'car-driver': { emoji: '🚗', label: 'Araçta İki Kişi' },
    'hand-sensor': { emoji: '🖐️', label: 'El + Parça' },
    'engine-warning': { emoji: '⚠️', label: 'Motor Uyarısı' },
    'wrench-tool': { emoji: '🔧', label: 'Anahtar/Tamir' },
    'dashboard-light': { emoji: '📟', label: 'Gösterge Paneli' },
    'checkmark-fixed': { emoji: '✅', label: 'Onay/Tamamlandı' },
    'chat-tip': { emoji: '💬', label: 'İpucu/Açıklama' },
    'growth-chart': { emoji: '📈', label: 'Büyüme/Sonuç' },
    'abstract-shapes': { emoji: '✨', label: 'Soyut Şekiller' },
  };
  const SCENE_IDS = Object.keys(SCENE_LABELS);

  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const sceneListEl = document.getElementById('sceneList');
  const scenesEmptyHint = document.getElementById('scenesEmptyHint');
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
  const qualitySelect = document.getElementById('qualitySelect');

  const aiPrompt = document.getElementById('aiPrompt');
  const aiGenerateBtn = document.getElementById('aiGenerateBtn');
  const regenerateBtn = document.getElementById('regenerateBtn');
  const demoBtn = document.getElementById('demoBtn');
  const aiStatus = document.getElementById('aiStatus');
  const brandSettingsBtn = document.getElementById('brandSettingsBtn');
  const brandDialog = document.getElementById('brandDialog');
  const brandForm = document.getElementById('brandForm');
  const brandCancelBtn = document.getElementById('brandCancelBtn');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const brandNameInput = document.getElementById('brandNameInput');
  const brandToneInput = document.getElementById('brandToneInput');
  const brandLanguageInput = document.getElementById('brandLanguageInput');
  const brandAccentInput = document.getElementById('brandAccentInput');
  const brandSecondaryInput = document.getElementById('brandSecondaryInput');
  const brandBannedInput = document.getElementById('brandBannedInput');

  const QUALITY_BITRATES = { draft: 4_000_000, standard: 10_000_000, high: 20_000_000 };

  /** @type {{id:number,title:string,subtitle:string,duration:number,composition:'split'|'full',sceneLeft:string,sceneRight:string}[]} */
  let scenes = [];
  let nextId = 1;
  let musicEl = null;
  let musicObjectUrl = null;

  let previewRAF = null;
  let previewStart = 0;
  let isExporting = false;

  const BRAND_STORAGE_KEY = 'reelsBrandRules';
  const defaultBrandRules = {
    apiKey: '',
    brandName: '',
    tone: '',
    language: 'Türkçe',
    accentColor: '#1f6f8b',
    secondaryColor: '#f5821f',
    bannedWords: '',
  };
  let brandRules = loadBrandRules();

  function loadBrandRules() {
    try {
      const raw = localStorage.getItem(BRAND_STORAGE_KEY);
      if (!raw) return { ...defaultBrandRules };
      return { ...defaultBrandRules, ...JSON.parse(raw) };
    } catch {
      return { ...defaultBrandRules };
    }
  }

  function saveBrandRules() {
    try {
      localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(brandRules));
    } catch {
      // localStorage unavailable (private mode, quota) — brand rules just won't persist
    }
  }

  /**
   * Single-hue tonal palette (matches the "monochrome environment" technique
   * in modern flat illustration): every scene shape is a shade of one base
   * color. `accent` is a small, deliberately different pop-color reserved for
   * highlights/status dots/people — not for bulk shape fills.
   */
  function palette() {
    const base = brandRules.accentColor || '#1f6f8b';
    return {
      base,
      deep: shade(base, -75),
      mid: shade(base, -25),
      soft: shade(base, 55),
      pale: shade(base, 105),
      accent: brandRules.secondaryColor || '#f5821f',
      ink: '#141414',
      paper: '#f6f1e4',
    };
  }

  // ---------- Scene plan management ----------

  function totalDuration() {
    return scenes.reduce((sum, s) => sum + s.duration, 0);
  }

  function updateDurationHint() {
    durationHint.textContent = `Toplam süre: ${totalDuration().toFixed(1)} sn`;
  }

  function updateActionState() {
    const hasScenes = scenes.length > 0;
    exportBtn.disabled = !hasScenes || isExporting;
    playBtn.disabled = !hasScenes || isExporting;
    scenesEmptyHint.hidden = hasScenes;
    phoneEmpty.classList.toggle('hidden', hasScenes);
    updateDurationHint();
  }

  function removeScene(id) {
    scenes = scenes.filter((s) => s.id !== id);
    renderSceneList();
    updateActionState();
    drawAtTime(0);
  }

  function moveScene(id, dir) {
    const idx = scenes.findIndex((s) => s.id === id);
    const newIdx = idx + dir;
    if (idx === -1 || newIdx < 0 || newIdx >= scenes.length) return;
    const [item] = scenes.splice(idx, 1);
    scenes.splice(newIdx, 0, item);
    renderSceneList();
    drawAtTime(0);
  }

  function sceneBadgeText(scene) {
    if (scene.composition === 'split') {
      return `${SCENE_LABELS[scene.sceneLeft]?.emoji || '✨'}${SCENE_LABELS[scene.sceneRight]?.emoji || ''}`;
    }
    return SCENE_LABELS[scene.sceneLeft]?.emoji || '✨';
  }

  function sceneDescription(scene) {
    if (scene.composition === 'split') {
      return `${SCENE_LABELS[scene.sceneLeft]?.label || '?'} / ${SCENE_LABELS[scene.sceneRight]?.label || '?'}`;
    }
    return SCENE_LABELS[scene.sceneLeft]?.label || '?';
  }

  function renderSceneList() {
    sceneListEl.innerHTML = '';
    scenes.forEach((scene, i) => {
      const li = document.createElement('li');
      li.className = 'scene-item';

      const badge = document.createElement('div');
      badge.className = 'scene-badge';
      badge.textContent = sceneBadgeText(scene);
      badge.title = sceneDescription(scene);

      const fields = document.createElement('div');
      fields.className = 'scene-fields';

      const desc = document.createElement('small');
      desc.className = 'hint';
      desc.style.margin = '0';
      desc.textContent = sceneDescription(scene);

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.placeholder = `Başlık (sahne ${i + 1})`;
      titleInput.value = scene.title;
      titleInput.addEventListener('input', () => { scene.title = titleInput.value; drawAtTime(0); });

      const subInput = document.createElement('input');
      subInput.type = 'text';
      subInput.placeholder = 'Alt yazı (opsiyonel)';
      subInput.value = scene.subtitle;
      subInput.addEventListener('input', () => { scene.subtitle = subInput.value; drawAtTime(0); });

      const meta = document.createElement('div');
      meta.className = 'scene-meta';
      const durLabel = document.createElement('span');
      durLabel.textContent = 'Süre:';
      const durInput = document.createElement('input');
      durInput.type = 'number';
      durInput.min = String(MIN_SCENE_DURATION);
      durInput.max = String(MAX_SCENE_DURATION);
      durInput.step = '0.5';
      durInput.value = scene.duration.toFixed(1);
      durInput.addEventListener('input', () => {
        const v = parseFloat(durInput.value);
        if (!Number.isNaN(v) && v > 0) {
          scene.duration = Math.min(Math.max(v, MIN_SCENE_DURATION), MAX_SCENE_DURATION);
          updateActionState();
        }
      });
      const durUnit = document.createElement('span');
      durUnit.textContent = 'sn';
      meta.append(durLabel, durInput, durUnit);

      fields.append(desc, titleInput, subInput, meta);

      const actions = document.createElement('div');
      actions.className = 'scene-actions';
      const upBtn = document.createElement('button');
      upBtn.className = 'icon-btn';
      upBtn.textContent = '↑';
      upBtn.type = 'button';
      upBtn.disabled = i === 0;
      upBtn.addEventListener('click', () => moveScene(scene.id, -1));

      const downBtn = document.createElement('button');
      downBtn.className = 'icon-btn';
      downBtn.textContent = '↓';
      downBtn.type = 'button';
      downBtn.disabled = i === scenes.length - 1;
      downBtn.addEventListener('click', () => moveScene(scene.id, 1));

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.textContent = '✕';
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => removeScene(scene.id));

      actions.append(upBtn, downBtn, delBtn);
      li.append(badge, fields, actions);
      sceneListEl.appendChild(li);
    });
    updateActionState();
  }

  // ---------- Music ----------

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

  // ---------- Drawing helpers ----------

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function strokeFill(c, fillColor, strokeColor, lineWidth) {
    if (fillColor) { c.fillStyle = fillColor; c.fill(); }
    if (strokeColor) { c.strokeStyle = strokeColor; c.lineWidth = lineWidth; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  }

  /** Flat (non-gradient) darker/lighter variant of a hex color — for two-tone color blocking. */
  function shade(hex, amt) {
    const num = parseInt(hex.replace('#', ''), 16);
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp((num >> 16) + amt);
    const g = clamp(((num >> 8) & 0xff) + amt);
    const b = clamp((num & 0xff) + amt);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /** Soft decorative backdrop (blob + dotted orbit ring + scattered accents) drawn behind a scene. */
  /** A single restrained tonal backdrop shape — no dotted rings or scattered accents. */
  function drawSceneBackdrop(c, region, pal, seed) {
    const { x, y, w, h } = region;
    const cx = x + w / 2;
    const cy = y + h * 0.52;
    const R = Math.min(w, h) * 0.66;

    c.save();
    c.globalAlpha = 0.08;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fillStyle = seed % 2 === 0 ? pal.mid : pal.soft;
    c.fill();
    c.restore();
  }

  // ---------- Scene library (flat vector illustrations) ----------

  const SCENE_LIBRARY = {
    'car-driver': drawCarDriverScene,
    'hand-sensor': drawHandSensorScene,
    'engine-warning': drawEngineWarningScene,
    'wrench-tool': drawWrenchToolScene,
    'dashboard-light': drawDashboardScene,
    'checkmark-fixed': drawCheckmarkScene,
    'chat-tip': drawChatTipScene,
    'growth-chart': drawGrowthChartScene,
    'abstract-shapes': drawAbstractScene,
  };

  function trapezoidPath(c, cx, cy, topY, bottomY, topHalfW, bottomHalfW) {
    c.beginPath();
    c.moveTo(cx - topHalfW, cy + topY);
    c.lineTo(cx + topHalfW, cy + topY);
    c.lineTo(cx + bottomHalfW, cy + bottomY);
    c.lineTo(cx - bottomHalfW, cy + bottomY);
    c.closePath();
  }

  /** Simple flat bust: headrest + shoulders + head + hair + smiling face. */
  /**
   * A proper (if simplified) human face: ears, eyebrows, eyes with pupils,
   * a nose, a composed closed-mouth expression, and layered hair —
   * deliberately not a stick-figure dot-eyes-and-arc face.
   */
  /** A real head/face silhouette — round crown, wide cheeks, tapered rounded chin. Not a circle. */
  function headOutlinePath(c, cx, cy, headR) {
    c.beginPath();
    c.moveTo(cx, cy - headR * 1.05);
    c.bezierCurveTo(
      cx + headR * 0.92, cy - headR * 1.0,
      cx + headR * 1.02, cy - headR * 0.25,
      cx + headR * 0.86, cy + headR * 0.35,
    );
    c.bezierCurveTo(
      cx + headR * 0.72, cy + headR * 0.92,
      cx + headR * 0.34, cy + headR * 1.16,
      cx, cy + headR * 1.2,
    );
    c.bezierCurveTo(
      cx - headR * 0.34, cy + headR * 1.16,
      cx - headR * 0.72, cy + headR * 0.92,
      cx - headR * 0.86, cy + headR * 0.35,
    );
    c.bezierCurveTo(
      cx - headR * 1.02, cy - headR * 0.25,
      cx - headR * 0.92, cy - headR * 1.0,
      cx, cy - headR * 1.05,
    );
    c.closePath();
  }

  function drawFace(c, cx, cy, headR, outline, lw, skinTone, hairColor, hairStyle) {
    // ears (drawn first so hair/jaw can overlap them naturally)
    [-1, 1].forEach((side) => {
      c.beginPath();
      c.ellipse(cx + side * headR * 0.88, cy + headR * 0.05, headR * 0.13, headR * 0.19, 0, 0, Math.PI * 2);
      strokeFill(c, skinTone, outline, lw * 0.4);
    });

    // head: a real face silhouette, not a circle
    headOutlinePath(c, cx, cy, headR);
    strokeFill(c, skinTone, outline, lw * 0.7);

    // eyebrows
    c.strokeStyle = outline;
    c.lineWidth = lw * 0.35;
    c.lineCap = 'round';
    [-1, 1].forEach((side) => {
      c.beginPath();
      c.moveTo(cx + side * headR * 0.46, cy - headR * 0.16);
      c.quadraticCurveTo(cx + side * headR * 0.28, cy - headR * 0.28, cx + side * headR * 0.12, cy - headR * 0.19);
      c.stroke();
    });

    // eyes: white sclera + dark pupil (reads far more human than a bare dot)
    [-1, 1].forEach((side) => {
      const ex = cx + side * headR * 0.3;
      const ey = cy - headR * 0.01;
      c.beginPath();
      c.ellipse(ex, ey, headR * 0.14, headR * 0.1, 0, 0, Math.PI * 2);
      strokeFill(c, '#ffffff', outline, lw * 0.28);
      c.beginPath();
      c.arc(ex + side * headR * 0.02, ey + headR * 0.015, headR * 0.06, 0, Math.PI * 2);
      c.fillStyle = outline;
      c.fill();
    });

    // simple nose
    c.beginPath();
    c.moveTo(cx, cy + headR * 0.04);
    c.quadraticCurveTo(cx + headR * 0.09, cy + headR * 0.17, cx, cy + headR * 0.22);
    c.strokeStyle = shade(skinTone, -45);
    c.lineWidth = lw * 0.28;
    c.stroke();

    // warm, open smile with visible teeth — friendly and confident, matching
    // the reference (this is a standard technique in trust-building
    // "happy customer" illustrations, not a meme grin)
    c.beginPath();
    c.moveTo(cx - headR * 0.26, cy + headR * 0.32);
    c.quadraticCurveTo(cx, cy + headR * 0.58, cx + headR * 0.26, cy + headR * 0.32);
    c.quadraticCurveTo(cx, cy + headR * 0.4, cx - headR * 0.26, cy + headR * 0.32);
    c.closePath();
    strokeFill(c, '#ffffff', outline, lw * 0.3);

    // hair
    if (hairStyle === 'curly') {
      drawCurlyHair(c, cx, cy, headR, hairColor, outline, lw);
    } else {
      c.beginPath();
      c.arc(cx, cy - headR * 0.18, headR * 1.05, Math.PI * 1.02, Math.PI * 1.98);
      c.lineTo(cx + headR * 0.96, cy - headR * 0.02);
      c.quadraticCurveTo(cx + headR * 0.2, cy - headR * 0.42, cx - headR * 0.96, cy - headR * 0.02);
      c.closePath();
      strokeFill(c, hairColor, outline, lw * 0.4);
      c.strokeStyle = shade(hairColor, hairColor === '#1c1c1c' ? 35 : -35);
      c.lineWidth = lw * 0.18;
      [-0.45, -0.05, 0.35].forEach((f) => {
        c.beginPath();
        c.moveTo(cx + headR * f, cy - headR * 0.88);
        c.quadraticCurveTo(cx + headR * f * 1.15, cy - headR * 0.55, cx + headR * f * 1.05, cy - headR * 0.25);
        c.stroke();
      });
    }
  }

  /** Cluster of overlapping circles around the head crown — reads as curly hair. */
  function drawCurlyHair(c, cx, cy, headR, hairColor, outline, lw) {
    const curls = [
      { dx: -0.78, dy: -0.5, r: 0.34 }, { dx: -0.4, dy: -0.82, r: 0.37 },
      { dx: 0.02, dy: -0.92, r: 0.38 }, { dx: 0.44, dy: -0.8, r: 0.36 },
      { dx: 0.82, dy: -0.46, r: 0.32 }, { dx: -0.98, dy: -0.1, r: 0.28 },
      { dx: 0.98, dy: -0.08, r: 0.27 }, { dx: -0.88, dy: 0.2, r: 0.22 },
      { dx: 0.88, dy: 0.22, r: 0.21 },
    ];
    curls.forEach((k) => {
      c.beginPath();
      c.arc(cx + k.dx * headR, cy + k.dy * headR, k.r * headR, 0, Math.PI * 2);
      strokeFill(c, hairColor, outline, lw * 0.35);
    });
  }

  function drawPersonBust(c, cx, baseY, scale, pal, outline, lw, topColor, bob, skinTone, hairColor, hairStyle) {
    const headR = scale * 0.17;
    const shoulderW = scale * 0.52;
    const shoulderH = scale * 0.36;
    const cy = baseY + bob;

    // headrest peeking out behind the shoulders
    roundRectPath(c, cx - shoulderW * 0.62, cy - shoulderH * 1.5, shoulderW * 1.24, shoulderH, shoulderW * 0.28);
    strokeFill(c, pal.soft, outline, lw * 0.55);

    // shoulders / torso
    c.beginPath();
    c.moveTo(cx - shoulderW / 2, cy);
    c.quadraticCurveTo(cx - shoulderW / 2, cy - shoulderH, cx, cy - shoulderH * 1.08);
    c.quadraticCurveTo(cx + shoulderW / 2, cy - shoulderH, cx + shoulderW / 2, cy);
    c.closePath();
    strokeFill(c, topColor, outline, lw * 0.8);

    const headCY = cy - shoulderH * 1.08 - headR * 0.7;
    drawFace(c, cx, headCY, headR, outline, lw, skinTone, hairColor, hairStyle);

    return { headCY, headR, cy, shoulderW, shoulderH };
  }

  function drawCarDriverScene(c, region, t, pal) {
    const { x, y, w, h } = region;
    const outline = pal.ink;
    const lw = Math.max(6, w * 0.016);

    c.save();
    c.translate(x + w / 2, y + h * 0.52);

    const cardW = w * 0.96;
    const cardH = h * 0.92;

    // environment card — solid tonal "car paint" background, like the reference
    roundRectPath(c, -cardW / 2, -cardH / 2, cardW, cardH, cardW * 0.07);
    strokeFill(c, pal.deep, outline, lw);

    c.save();
    roundRectPath(c, -cardW / 2, -cardH / 2, cardW, cardH, cardW * 0.07);
    c.clip();

    // windshield frame + glass (trapezoid: narrower roofline, wider at the hood)
    const frameTop = -cardH * 0.34;
    const frameBottom = cardH * 0.28;
    trapezoidPath(c, 0, 0, frameTop, frameBottom, cardW * 0.3, cardW * 0.46);
    strokeFill(c, pal.soft, outline, lw);
    const glassInset = cardW * 0.035;
    trapezoidPath(c, 0, 0, frameTop + glassInset, frameBottom - glassInset, cardW * 0.3 - glassInset, cardW * 0.46 - glassInset);
    strokeFill(c, pal.pale, outline, lw * 0.5);

    // diagonal glass glare
    c.save();
    trapezoidPath(c, 0, 0, frameTop + glassInset, frameBottom - glassInset, cardW * 0.3 - glassInset, cardW * 0.46 - glassInset);
    c.clip();
    c.globalAlpha = 0.4;
    c.beginPath();
    c.moveTo(-cardW * 0.1, frameTop);
    c.lineTo(cardW * 0.02, frameTop);
    c.lineTo(-cardW * 0.28, frameBottom);
    c.lineTo(-cardW * 0.4, frameBottom);
    c.closePath();
    c.fillStyle = '#ffffff';
    c.fill();
    c.restore();

    // hood sliver below the windshield
    roundRectPath(c, -cardW * 0.46, frameBottom - cardH * 0.02, cardW * 0.92, cardH * 0.14, cardW * 0.03);
    strokeFill(c, pal.mid, outline, lw * 0.7);

    // rearview mirror
    c.beginPath();
    c.moveTo(0, frameTop + glassInset);
    c.lineTo(0, frameTop + cardH * 0.09);
    c.strokeStyle = outline;
    c.lineWidth = lw * 0.4;
    c.stroke();
    roundRectPath(c, -cardW * 0.06, frameTop + cardH * 0.07, cardW * 0.12, cardH * 0.045, cardH * 0.02);
    strokeFill(c, pal.mid, outline, lw * 0.4);

    // two people, sitting side by side inside the glass
    const seatY = frameBottom - glassInset - cardH * 0.02;
    const bob = Math.sin(t * 1.4) * cardH * 0.006;
    drawPersonBust(c, -cardW * 0.16, seatY, cardH * 0.62, pal, outline, lw, pal.accent, bob, '#e8a26e', '#1c1c1c', 'curly');
    const driver = drawPersonBust(c, cardW * 0.17, seatY, cardH * 0.62, pal, outline, lw, '#f7f4ee', -bob, '#e0a370', '#b0552a', 'short');

    // steering wheel in front of the driver
    c.save();
    const wheelR = driver.shoulderW * 0.42;
    const wheelCX = cardW * 0.17;
    const wheelCY = driver.cy - driver.shoulderH * 0.35;
    const wobble = Math.sin(t * 0.9) * 0.05;
    c.translate(wheelCX, wheelCY);
    c.rotate(wobble);
    c.beginPath();
    c.arc(0, 0, wheelR, 0, Math.PI * 2);
    c.strokeStyle = outline;
    c.lineWidth = lw * 0.55;
    c.stroke();
    [0, 2.1, 4.2].forEach((ang) => {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(ang) * wheelR, Math.sin(ang) * wheelR);
      c.strokeStyle = outline;
      c.lineWidth = lw * 0.4;
      c.stroke();
    });
    c.beginPath();
    c.arc(0, 0, wheelR * 0.22, 0, Math.PI * 2);
    strokeFill(c, pal.soft, outline, lw * 0.35);
    c.restore();

    c.restore();

    // side mirrors — drawn outside the card clip so they clearly stick out
    // past the car body, like the reference's protruding mirror "ears"
    [-1, 1].forEach((side) => {
      c.save();
      c.translate(side * cardW * 0.49, frameTop + cardH * 0.24);
      c.beginPath();
      c.moveTo(0, -cardH * 0.045);
      c.quadraticCurveTo(side * cardW * 0.09, -cardH * 0.01, side * cardW * 0.08, cardH * 0.02);
      c.quadraticCurveTo(side * cardW * 0.06, cardH * 0.045, 0, cardH * 0.045);
      c.quadraticCurveTo(side * -cardW * 0.015, 0, 0, -cardH * 0.045);
      c.closePath();
      strokeFill(c, pal.soft, outline, lw * 0.55);
      c.restore();
    });

    c.restore();
  }

  function drawHandSensorScene(c, region, t, pal) {
    const { x, y, w, h } = region;
    const outline = pal.ink;
    const lw = Math.max(6, w * 0.018);
    const bob = Math.sin(t * 1.6) * h * 0.012;

    c.save();
    c.translate(x + w / 2, y + h * 0.66 + bob);

    // hand (palm + thumb + four rounded finger bumps)
    const palmW = w * 0.62;
    const palmH = h * 0.26;

    // wrist cuff (color block, sleeve hint) — sits just below the palm
    roundRectPath(c, -palmW * 0.42, palmH * 0.88, palmW * 0.84, palmH * 0.5, palmH * 0.12);
    strokeFill(c, pal.accent, outline, lw * 0.8);
    c.beginPath();
    c.moveTo(-palmW * 0.42, palmH * 1.08);
    c.lineTo(palmW * 0.42, palmH * 1.08);
    c.strokeStyle = shade(pal.accent, -50);
    c.lineWidth = lw * 0.3;
    c.stroke();

    roundRectPath(c, -palmW / 2, 0, palmW, palmH, palmH * 0.35);
    strokeFill(c, pal.paper, outline, lw);

    // fingers (+ crease lines for definition)
    for (let i = 0; i < 4; i += 1) {
      const fx = -palmW * 0.34 + i * (palmW * 0.23);
      roundRectPath(c, fx, -palmH * 0.55, palmW * 0.17, palmH * 0.65, palmW * 0.08);
      strokeFill(c, pal.paper, outline, lw * 0.8);
      c.beginPath();
      c.moveTo(fx + palmW * 0.02, palmH * 0.02);
      c.lineTo(fx + palmW * 0.15, palmH * 0.02);
      c.strokeStyle = shade('#f6f1e4', -25);
      c.lineWidth = lw * 0.25;
      c.stroke();
    }

    // thumb
    c.save();
    c.translate(-palmW * 0.5, palmH * 0.55);
    c.rotate(-0.6);
    roundRectPath(c, -palmW * 0.09, -palmH * 0.35, palmW * 0.18, palmH * 0.6, palmW * 0.09);
    strokeFill(c, pal.paper, outline, lw * 0.8);
    c.restore();

    // sensor part floating just above palm
    const sensorBob = Math.sin(t * 2.2) * h * 0.006;
    const sy = -palmH * 1.15 + sensorBob;
    roundRectPath(c, -palmW * 0.16, sy - palmH * 0.22, palmW * 0.32, palmH * 0.4, palmH * 0.12);
    strokeFill(c, pal.mid, outline, lw * 0.9);

    // two-tone bottom half + corner screws for a "manufactured part" feel
    c.save();
    roundRectPath(c, -palmW * 0.16, sy - palmH * 0.22, palmW * 0.32, palmH * 0.4, palmH * 0.12);
    c.clip();
    c.fillStyle = shade(pal.mid, -35);
    c.fillRect(-palmW * 0.16, sy + palmH * 0.02, palmW * 0.32, palmH * 0.2);
    c.restore();
    [[-palmW * 0.12, sy - palmH * 0.16], [palmW * 0.1, sy - palmH * 0.16]].forEach(([sx, syy]) => {
      c.beginPath();
      c.arc(sx, syy, palmH * 0.025, 0, Math.PI * 2);
      c.fillStyle = outline;
      c.fill();
    });

    roundRectPath(c, -palmW * 0.08, sy - palmH * 0.36, palmW * 0.16, palmH * 0.16, palmH * 0.05);
    strokeFill(c, pal.accent, outline, lw * 0.6);

    [-palmW * 0.09, palmW * 0.01].forEach((px) => {
      c.beginPath();
      c.rect(px, sy + palmH * 0.16, palmW * 0.04, palmH * 0.14);
      strokeFill(c, outline, null, 0);
    });

    // blinking status dot
    const blink = 0.4 + 0.6 * Math.max(0, Math.sin(t * 6));
    c.globalAlpha = blink;
    c.beginPath();
    c.arc(0, sy - palmH * 0.02, palmH * 0.06, 0, Math.PI * 2);
    c.fillStyle = pal.accent;
    c.fill();
    c.globalAlpha = 1;

    // soft inspection dashes radiating from sensor
    const pulse = clamp01(Math.sin(t * 2) * 0.5 + 0.5);
    c.globalAlpha = 0.25 + 0.35 * pulse;
    c.strokeStyle = pal.accent;
    c.lineWidth = lw * 0.4;
    for (let a = 0; a < 6; a += 1) {
      const ang = (a / 6) * Math.PI * 2;
      const r1 = palmW * (0.28 + pulse * 0.04);
      const r2 = r1 + palmW * 0.06;
      c.beginPath();
      c.moveTo(Math.cos(ang) * r1, sy + Math.sin(ang) * r1 * 0.6);
      c.lineTo(Math.cos(ang) * r2, sy + Math.sin(ang) * r2 * 0.6);
      c.stroke();
    }
    c.globalAlpha = 1;

    c.restore();
  }

  function drawEngineWarningScene(c, region, t, pal) {
    const { x, y, w, h } = region;
    const outline = pal.ink;
    const lw = Math.max(6, w * 0.018);
    const pulse = 1 + 0.05 * Math.sin(t * 4);

    c.save();
    c.translate(x + w / 2, y + h * 0.6);

    const blockW = w * 0.66;
    const blockH = h * 0.34;
    roundRectPath(c, -blockW / 2, -blockH * 0.1, blockW, blockH, blockW * 0.08);
    strokeFill(c, pal.mid, outline, lw);

    // two-tone side shadow block + vent ridges for texture
    c.save();
    roundRectPath(c, -blockW / 2, -blockH * 0.1, blockW, blockH, blockW * 0.08);
    c.clip();
    c.fillStyle = shade(pal.mid, -35);
    c.fillRect(blockW * 0.22, -blockH * 0.1, blockW * 0.28, blockH);
    c.strokeStyle = shade(pal.mid, -55);
    c.lineWidth = lw * 0.25;
    for (let v = 0; v < 3; v += 1) {
      c.beginPath();
      c.moveTo(-blockW * 0.15 + v * blockW * 0.1, -blockH * 0.05);
      c.lineTo(-blockW * 0.15 + v * blockW * 0.1, blockH * 0.55);
      c.stroke();
    }
    c.restore();

    roundRectPath(c, -blockW * 0.32, -blockH * 0.5, blockW * 0.64, blockH * 0.45, blockW * 0.06);
    strokeFill(c, pal.mid, outline, lw * 0.8);

    // hose curving to a small reservoir
    c.beginPath();
    c.moveTo(blockW * 0.3, -blockH * 0.3);
    c.quadraticCurveTo(blockW * 0.55, -blockH * 0.25, blockW * 0.56, blockH * 0.05);
    c.strokeStyle = outline;
    c.lineWidth = lw * 0.45;
    c.stroke();
    roundRectPath(c, blockW * 0.46, blockH * 0.02, blockW * 0.2, blockH * 0.22, blockW * 0.05);
    strokeFill(c, pal.soft, outline, lw * 0.5);

    // bolts with cross-hatch (read as screws)
    [[-blockW * 0.3, blockH * 0.1], [blockW * 0.3, blockH * 0.1], [-blockW * 0.3, blockH * 0.65], [blockW * 0.3, blockH * 0.65]]
      .forEach(([bx, by]) => {
        c.beginPath();
        c.arc(bx, by, blockW * 0.035, 0, Math.PI * 2);
        strokeFill(c, pal.soft, outline, lw * 0.4);
        c.beginPath();
        c.moveTo(bx - blockW * 0.02, by);
        c.lineTo(bx + blockW * 0.02, by);
        c.moveTo(bx, by - blockW * 0.02);
        c.lineTo(bx, by + blockW * 0.02);
        c.strokeStyle = outline;
        c.lineWidth = lw * 0.22;
        c.stroke();
      });

    // warning triangle above, pulsing
    c.save();
    c.translate(0, -blockH * 0.95);
    c.scale(pulse, pulse);
    const triR = blockW * 0.26;
    c.beginPath();
    c.moveTo(0, -triR);
    c.lineTo(triR * 0.9, triR * 0.7);
    c.lineTo(-triR * 0.9, triR * 0.7);
    c.closePath();
    strokeFill(c, pal.accent, outline, lw);

    c.beginPath();
    c.rect(-lw * 0.4, -triR * 0.35, lw * 0.8, triR * 0.55);
    c.fillStyle = outline;
    c.fill();
    c.beginPath();
    c.arc(0, triR * 0.42, lw * 0.5, 0, Math.PI * 2);
    c.fillStyle = outline;
    c.fill();
    c.restore();

    c.restore();
  }

  function drawWrenchToolScene(c, region, t, pal) {
    const { x, y, w, h } = region;
    const outline = pal.ink;
    const lw = Math.max(6, w * 0.018);
    const rot = Math.sin(t * 1.4) * 0.12;

    c.save();
    c.translate(x + w / 2, y + h * 0.58);

    // small screwdriver crossing behind, for a "toolkit" feel
    c.save();
    c.rotate(0.9);
    const sdLen = w * 0.4;
    roundRectPath(c, -sdLen / 2, -h * 0.014, sdLen * 0.7, h * 0.028, h * 0.012);
    c.globalAlpha = 0.85;
    strokeFill(c, shade(pal.soft, 30), outline, lw * 0.5);
    roundRectPath(c, sdLen * 0.2, -h * 0.022, sdLen * 0.3, h * 0.044, h * 0.01);
    strokeFill(c, pal.ink, outline, lw * 0.5);
    c.globalAlpha = 1;
    c.restore();

    // bolt/nut (hexagon)
    c.save();
    c.translate(w * 0.14, h * 0.1);
    c.rotate(t * 0.3);
    const hexR = w * 0.13;
    c.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const ang = (i / 6) * Math.PI * 2;
      const px = Math.cos(ang) * hexR;
      const py = Math.sin(ang) * hexR;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    strokeFill(c, pal.soft, outline, lw * 0.8);
    c.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const ang = (i / 6) * Math.PI * 2;
      const px = Math.cos(ang) * hexR * 0.62;
      const py = Math.sin(ang) * hexR * 0.62;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.strokeStyle = shade(pal.soft, -50);
    c.lineWidth = lw * 0.25;
    c.stroke();
    c.beginPath();
    c.arc(0, 0, hexR * 0.4, 0, Math.PI * 2);
    strokeFill(c, pal.paper, outline, lw * 0.5);
    c.restore();

    // wrench
    c.save();
    c.rotate(rot - 0.35);
    const shaftLen = w * 0.5;
    const shaftW = h * 0.045;
    roundRectPath(c, -shaftLen / 2, -shaftW / 2, shaftLen, shaftW, shaftW / 2);
    strokeFill(c, pal.mid, outline, lw * 0.8);
    c.beginPath();
    c.moveTo(-shaftLen * 0.3, 0);
    c.lineTo(shaftLen * 0.3, 0);
    c.strokeStyle = shade(pal.mid, -45);
    c.lineWidth = shaftW * 0.18;
    c.stroke();

    [-1, 1].forEach((side) => {
      c.save();
      c.translate(side * shaftLen / 2, 0);
      c.beginPath();
      c.arc(0, 0, shaftW * 1.6, Math.PI * 0.15, Math.PI * 1.85);
      c.lineWidth = shaftW * 0.9;
      c.strokeStyle = pal.mid;
      c.lineCap = 'round';
      c.stroke();
      c.strokeStyle = outline;
      c.lineWidth = lw * 0.7;
      c.stroke();
      c.restore();
    });
    c.restore();

    c.restore();
  }

  function drawDashboardScene(c, region, t, pal) {
    const { x, y, w, h } = region;
    const outline = pal.ink;
    const lw = Math.max(6, w * 0.018);

    c.save();
    c.translate(x + w / 2, y + h * 0.55);

    const panelW = w * 0.78;
    const panelH = h * 0.32;

    // steering wheel hint behind the panel — a full ring so the panel
    // naturally occludes the top portion; only the rim peeks out below.
    const wheelCY = panelH * 0.7;
    const wheelR = panelH * 0.85;
    c.save();
    c.globalAlpha = 0.5;
    c.beginPath();
    c.arc(0, wheelCY, wheelR, 0, Math.PI * 2);
    c.strokeStyle = pal.ink;
    c.lineWidth = lw * 0.6;
    c.stroke();
    [0.35, Math.PI - 0.35, Math.PI / 2].forEach((ang) => {
      c.beginPath();
      c.moveTo(0, wheelCY);
      c.lineTo(Math.cos(ang) * wheelR, wheelCY + Math.sin(ang) * wheelR);
      c.stroke();
    });
    c.restore();

    roundRectPath(c, -panelW / 2, -panelH / 2, panelW, panelH, panelW * 0.08);
    strokeFill(c, pal.mid, outline, lw);

    // darker header strip (two-tone)
    c.save();
    roundRectPath(c, -panelW / 2, -panelH / 2, panelW, panelH, panelW * 0.08);
    c.clip();
    c.fillStyle = shade(pal.mid, -35);
    c.fillRect(-panelW / 2, -panelH / 2, panelW, panelH * 0.26);
    c.restore();

    // two gauges (with tick marks)
    [-panelW * 0.24, panelW * 0.24].forEach((gx) => {
      const gr = panelW * 0.16;
      c.beginPath();
      c.arc(gx, panelH * 0.05, gr, Math.PI, Math.PI * 2);
      c.strokeStyle = pal.paper;
      c.lineWidth = gr * 0.35;
      c.stroke();
      for (let tk = 0; tk <= 4; tk += 1) {
        const ang = Math.PI + (tk / 4) * Math.PI;
        const r1 = gr * 1.22;
        const r2 = gr * 1.34;
        c.beginPath();
        c.moveTo(gx + Math.cos(ang) * r1, panelH * 0.05 + Math.sin(ang) * r1);
        c.lineTo(gx + Math.cos(ang) * r2, panelH * 0.05 + Math.sin(ang) * r2);
        c.strokeStyle = shade(pal.mid, -55);
        c.lineWidth = lw * 0.22;
        c.stroke();
      }
      const needleAngle = Math.PI + Math.PI * (0.3 + 0.15 * Math.sin(t * 2 + gx));
      c.beginPath();
      c.moveTo(gx, panelH * 0.05);
      c.lineTo(gx + Math.cos(needleAngle) * gr * 0.8, panelH * 0.05 + Math.sin(needleAngle) * gr * 0.8);
      c.strokeStyle = pal.accent;
      c.lineWidth = lw * 0.5;
      c.stroke();
      c.beginPath();
      c.arc(gx, panelH * 0.05, gr * 0.08, 0, Math.PI * 2);
      c.fillStyle = outline;
      c.fill();
    });

    // blinking check-engine icon, centered
    const blink = 0.35 + 0.65 * Math.max(0, Math.sin(t * 5));
    c.save();
    c.globalAlpha = blink;
    c.translate(0, -panelH * 0.28);
    c.beginPath();
    c.arc(0, 0, panelW * 0.07, 0, Math.PI * 2);
    strokeFill(c, pal.accent, outline, lw * 0.5);
    c.beginPath();
    roundRectPath(c, -panelW * 0.03, -panelW * 0.02, panelW * 0.06, panelW * 0.045, panelW * 0.01);
    strokeFill(c, outline, null, 0);
    c.restore();

    c.restore();
  }

  function drawCheckmarkScene(c, region, t, pal, sceneDuration) {
    const { x, y, w, h } = region;
    const outline = pal.ink;
    const lw = Math.max(8, w * 0.024);
    const drawIn = clamp01(t / 0.6);
    const eased = easeOutCubic(drawIn);
    const scale = lerp(0.7, 1, eased);

    c.save();
    c.translate(x + w / 2, y + h * 0.55);
    c.scale(scale, scale);

    const r = Math.min(w, h) * 0.24;

    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    strokeFill(c, pal.mid, outline, lw);

    // inner darker ring for depth (flat, no gradient)
    c.beginPath();
    c.arc(0, 0, r * 0.86, 0, Math.PI * 2);
    c.strokeStyle = shade(pal.mid, -35);
    c.lineWidth = lw * 0.3;
    c.stroke();

    const checkLen = r * 2.6;
    c.beginPath();
    c.moveTo(-r * 0.45, r * 0.05);
    c.lineTo(-r * 0.12, r * 0.35);
    c.lineTo(r * 0.5, -r * 0.32);
    c.strokeStyle = pal.accent;
    c.lineWidth = lw * 0.9;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.setLineDash([checkLen]);
    c.lineDashOffset = checkLen * (1 - eased);
    c.stroke();
    c.setLineDash([]);

    c.restore();
  }

  function drawChatTipScene(c, region, t, pal) {
    const { x, y, w, h } = region;
    const outline = pal.ink;
    const lw = Math.max(6, w * 0.018);
    const bob = Math.sin(t * 1.8) * h * 0.01;

    c.save();
    c.translate(x + w / 2, y + h * 0.55 + bob);

    // avatar
    const avR = Math.min(w, h) * 0.16;
    c.save();
    c.translate(-w * 0.22, h * 0.08);

    // shoulders/body so it reads as a person, not a floating head
    c.beginPath();
    c.arc(0, avR * 1.55, avR * 1.15, Math.PI, Math.PI * 2);
    strokeFill(c, pal.accent, outline, lw * 0.85);
    c.beginPath();
    c.moveTo(-avR * 0.55, avR * 1.55);
    c.lineTo(avR * 0.55, avR * 1.55);
    c.strokeStyle = shade(pal.accent, -45);
    c.lineWidth = lw * 0.3;
    c.stroke();

    drawFace(c, 0, 0, avR, outline, lw, '#e8a26e', '#3a2a1c');
    c.restore();

    // speech bubble
    const bw = w * 0.5;
    const bh = h * 0.24;
    const bx = w * 0.02;
    const by = -h * 0.12;
    roundRectPath(c, bx, by, bw, bh, bh * 0.3);
    strokeFill(c, pal.paper, outline, lw * 0.9);
    c.beginPath();
    c.moveTo(bx + bw * 0.06, by + bh * 0.92);
    c.lineTo(bx - bw * 0.08, by + bh * 1.25);
    c.lineTo(bx + bw * 0.22, by + bh * 0.92);
    c.closePath();
    strokeFill(c, pal.paper, outline, lw * 0.7);

    // three status dots — a subtle, restrained pulse rather than a bounce
    for (let i = 0; i < 3; i += 1) {
      const dotX = bx + bw * (0.28 + i * 0.22);
      const dotY = by + bh * 0.5;
      const s = 1 + 0.08 * Math.max(0, Math.sin(t * 3 - i * 0.6));
      c.save();
      c.translate(dotX, dotY);
      c.scale(s, s);
      c.beginPath();
      c.arc(0, 0, bh * 0.08, 0, Math.PI * 2);
      c.fillStyle = pal.accent;
      c.fill();
      c.restore();
    }

    c.restore();
  }

  function drawGrowthChartScene(c, region, t, pal) {
    const { x, y, w, h } = region;
    const outline = pal.ink;
    const lw = Math.max(6, w * 0.018);
    const eased = easeOutCubic(clamp01(t / 0.7));

    c.save();
    c.translate(x + w / 2, y + h * 0.62);

    const bars = [0.35, 0.55, 0.8, 1];
    const colors = [pal.mid, pal.soft, pal.mid, pal.soft];
    const barW = w * 0.13;
    const gap = w * 0.05;
    const maxH = h * 0.34;
    const totalW = bars.length * barW + (bars.length - 1) * gap;
    const startX = -totalW / 2;

    // subtle horizontal gridlines behind the bars
    c.save();
    c.globalAlpha = 0.18;
    c.setLineDash([2, 12]);
    c.strokeStyle = pal.ink;
    c.lineWidth = lw * 0.3;
    for (let gRow = 1; gRow <= 3; gRow += 1) {
      c.beginPath();
      c.moveTo(startX - w * 0.02, -maxH * (gRow / 3));
      c.lineTo(startX + totalW + w * 0.02, -maxH * (gRow / 3));
      c.stroke();
    }
    c.restore();

    bars.forEach((frac, i) => {
      const barH = maxH * frac * eased;
      const bx = startX + i * (barW + gap);
      roundRectPath(c, bx, -barH, barW, barH, barW * 0.18);
      strokeFill(c, colors[i], outline, lw * 0.8);
      // lighter cap band (two-tone) on top of each bar
      if (barH > barW * 0.3) {
        c.save();
        roundRectPath(c, bx, -barH, barW, barH, barW * 0.18);
        c.clip();
        c.fillStyle = shade(colors[i], 40);
        c.fillRect(bx, -barH, barW, barW * 0.22);
        c.restore();
      }
    });

    c.beginPath();
    c.moveTo(startX - w * 0.02, 0);
    c.lineTo(startX + totalW + w * 0.02, 0);
    c.strokeStyle = outline;
    c.lineWidth = lw * 0.5;
    c.stroke();

    if (eased > 0.4) {
      c.save();
      c.globalAlpha = clamp01((eased - 0.4) / 0.6);
      const startPx = startX + barW / 2;
      const startPy = -maxH * bars[0] * eased - h * 0.03;
      const endPx = startX + totalW - barW / 2;
      const endPy = -maxH * bars[bars.length - 1] * eased - h * 0.05;
      const midX = (startPx + endPx) / 2;
      const midY = Math.min(startPy, endPy) - h * 0.05;

      c.beginPath();
      c.moveTo(startPx, startPy);
      c.quadraticCurveTo(midX, midY, endPx, endPy);
      c.strokeStyle = pal.accent;
      c.lineWidth = lw * 0.7;
      c.lineCap = 'round';
      c.stroke();

      const ang = Math.atan2(endPy - midY, endPx - midX);
      c.save();
      c.translate(endPx, endPy);
      c.rotate(ang);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-lw * 1.6, -lw * 0.9);
      c.moveTo(0, 0);
      c.lineTo(-lw * 1.6, lw * 0.9);
      c.strokeStyle = pal.accent;
      c.lineWidth = lw * 0.7;
      c.stroke();
      c.restore();

      // small badge pill at the arrow tip with an up-triangle icon
      c.save();
      c.translate(endPx, endPy - h * 0.05);
      roundRectPath(c, -barW * 0.32, -barW * 0.22, barW * 0.64, barW * 0.44, barW * 0.22);
      strokeFill(c, pal.ink, null, 0);
      c.beginPath();
      c.moveTo(0, -barW * 0.1);
      c.lineTo(barW * 0.08, barW * 0.06);
      c.lineTo(-barW * 0.08, barW * 0.06);
      c.closePath();
      c.fillStyle = pal.paper;
      c.fill();
      c.restore();

      c.restore();
    }

    c.restore();
  }

  function drawAbstractScene(c, region, t, pal) {
    const { x, y, w, h } = region;
    const outline = pal.ink;
    const lw = Math.max(6, w * 0.016);
    const cx = x + w / 2;
    const cy = y + h * 0.55;

    const blobs = [
      { r: w * 0.22, dx: -0.18, dy: -0.05, color: pal.mid, speed: 0.7 },
      { r: w * 0.16, dx: 0.16, dy: 0.08, color: pal.soft, speed: 0.9 },
      { r: w * 0.11, dx: 0.02, dy: -0.22, color: pal.paper, speed: 1.1 },
    ];
    const positions = blobs.map((b) => ({
      x: cx + b.dx * w + Math.sin(t * b.speed) * w * 0.02,
      y: cy + b.dy * h + Math.cos(t * b.speed * 0.8) * h * 0.015,
    }));

    blobs.forEach((b, i) => {
      const { x: bx, y: by } = positions[i];
      c.beginPath();
      c.arc(bx, by, b.r, 0, Math.PI * 2);
      strokeFill(c, b.color, outline, lw);
      // two-tone crescent for depth
      c.save();
      c.beginPath();
      c.arc(bx, by, b.r, 0, Math.PI * 2);
      c.clip();
      c.globalAlpha = 0.35;
      c.beginPath();
      c.arc(bx + b.r * 0.4, by + b.r * 0.35, b.r * 0.75, 0, Math.PI * 2);
      c.fillStyle = b.color === pal.paper ? shade(pal.ink, 200) : shade(b.color, -35);
      c.fill();
      c.restore();
    });
  }

  // ---------- Text overlay ----------

  function wrapText(text, maxWidth, fontSize) {
    ctx.font = `700 ${fontSize}px -apple-system, Helvetica, Arial, sans-serif`;
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

  function drawTextOverlay(scene, localT, pal) {
    if (!scene.title && !scene.subtitle) return;
    const enter = clamp01(localT / 0.4);
    const eased = easeOutCubic(enter);
    const slideUp = (1 - eased) * 30;
    const alpha = eased;

    const maxWidth = CANVAS_W - 140;
    const lines = scene.title ? wrapText(scene.title, maxWidth, 60) : [];
    const subLines = scene.subtitle ? wrapText(scene.subtitle, maxWidth, 36) : [];

    const lineHeight = 70;
    const subLineHeight = 44;
    const blockHeight = lines.length * lineHeight + (subLines.length ? subLines.length * subLineHeight + 14 : 0);
    const bottomPad = 200;
    let y = CANVAS_H - bottomPad - blockHeight + slideUp;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (lines.length) {
      ctx.fillStyle = pal.accent;
      const tagWidth = 60;
      ctx.fillRect(CANVAS_W / 2 - tagWidth / 2, y - 26, tagWidth, 7);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = pal.ink;
    ctx.font = '700 60px -apple-system, Helvetica, Arial, sans-serif';
    lines.forEach((line) => {
      ctx.fillText(line, CANVAS_W / 2, y + 46);
      y += lineHeight;
    });

    if (subLines.length) {
      y += 8;
      ctx.font = '500 36px -apple-system, Helvetica, Arial, sans-serif';
      ctx.fillStyle = 'rgba(22,22,22,0.75)';
      subLines.forEach((line) => {
        ctx.fillText(line, CANVAS_W / 2, y + 28);
        y += subLineHeight;
      });
    }
    ctx.restore();
  }

  // ---------- Composition ----------

  function drawSceneFrame(scene, localT) {
    const pal = palette();
    ctx.fillStyle = pal.paper;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const PAD = 60;
    if (scene.composition === 'split') {
      const halfW = CANVAS_W / 2;
      const region = { x: PAD, y: CANVAS_H * 0.26, w: halfW - PAD * 1.4, h: CANVAS_H * 0.42 };
      const regionR = { x: halfW + PAD * 0.4, y: CANVAS_H * 0.26, w: halfW - PAD * 1.4, h: CANVAS_H * 0.42 };
      ctx.save();
      ctx.strokeStyle = 'rgba(22,22,22,0.15)';
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 14]);
      ctx.beginPath();
      ctx.moveTo(halfW, CANVAS_H * 0.22);
      ctx.lineTo(halfW, CANVAS_H * 0.72);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawSceneBackdrop(ctx, region, pal, 0);
      drawSceneBackdrop(ctx, regionR, pal, 1);
      (SCENE_LIBRARY[scene.sceneLeft] || drawAbstractScene)(ctx, region, localT, pal, scene.duration);
      (SCENE_LIBRARY[scene.sceneRight] || drawAbstractScene)(ctx, regionR, localT, pal, scene.duration);
    } else {
      const region = { x: PAD, y: CANVAS_H * 0.2, w: CANVAS_W - PAD * 2, h: CANVAS_H * 0.5 };
      drawSceneBackdrop(ctx, region, pal, 0);
      (SCENE_LIBRARY[scene.sceneLeft] || drawAbstractScene)(ctx, region, localT, pal, scene.duration);
    }

    drawTextOverlay(scene, localT, pal);
  }

  /**
   * Draws the composited frame for a global time `tMs` (ms since sequence start).
   */
  function drawAtTime(tMs) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const pal = palette();
    ctx.fillStyle = pal.paper;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (!scenes.length) return;

    let cursor = 0;
    let idx = 0;
    const tSec = tMs / 1000;
    while (idx < scenes.length - 1 && tSec >= cursor + scenes[idx].duration) {
      cursor += scenes[idx].duration;
      idx += 1;
    }
    const scene = scenes[idx];
    const localT = Math.max(0, tSec - cursor);
    const next = scenes[idx + 1];
    const timeToEnd = scene.duration - localT;
    const transitioning = next && timeToEnd <= TRANSITION_MS / 1000;
    const transitionProgress = transitioning ? 1 - timeToEnd / (TRANSITION_MS / 1000) : 0;

    drawSceneFrame(scene, localT);
    if (transitioning) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(transitionProgress);
      drawSceneFrame(next, 0);
      ctx.restore();
    }

    drawProgressBar(idx, localT, scene.duration);
  }

  function drawProgressBar(activeIdx, localT, activeDuration) {
    if (scenes.length < 2) return;
    const pal = palette();
    ctx.save();
    ctx.globalAlpha = 1;
    const pad = 36;
    const gap = 10;
    const top = 44;
    const segH = 7;
    const totalW = CANVAS_W - pad * 2;
    const segW = (totalW - gap * (scenes.length - 1)) / scenes.length;

    scenes.forEach((_, i) => {
      const segX = pad + i * (segW + gap);
      roundRectPath(ctx, segX, top, segW, segH, segH / 2);
      ctx.fillStyle = 'rgba(22,22,22,0.18)';
      ctx.fill();

      let fillFrac = 0;
      if (i < activeIdx) fillFrac = 1;
      else if (i === activeIdx) fillFrac = clamp01(localT / activeDuration);
      if (fillFrac > 0) {
        roundRectPath(ctx, segX, top, Math.max(segH, segW * fillFrac), segH, segH / 2);
        ctx.fillStyle = pal.ink;
        ctx.fill();
      }
    });
    ctx.restore();
  }

  // ---------- Preview playback ----------

  function stopPreview() {
    if (previewRAF) cancelAnimationFrame(previewRAF);
    previewRAF = null;
    playBtn.textContent = '▶ Önizlemeyi Oynat';
    playBtn.disabled = scenes.length === 0;
    stopBtn.disabled = true;
  }

  function startPreview() {
    if (!scenes.length) return;
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
      previewRAF = requestAnimationFrame(loop);
    };
    previewRAF = requestAnimationFrame(loop);
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
    if (!scenes.length || isExporting) return;
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
    const bitrate = QUALITY_BITRATES[qualitySelect.value] || QUALITY_BITRATES.standard;
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
    const recorder = new MediaRecorder(combined, mimeType ? { mimeType, videoBitsPerSecond: bitrate } : undefined);
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
      progressBar.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
      statusText.textContent = `Kaydediliyor… ${(elapsed / 1000).toFixed(1)} / ${(total / 1000).toFixed(1)} sn`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  exportBtn.addEventListener('click', startExport);

  // ---------- Brand rules ----------

  function fillBrandForm() {
    apiKeyInput.value = brandRules.apiKey;
    brandNameInput.value = brandRules.brandName;
    brandToneInput.value = brandRules.tone;
    brandLanguageInput.value = brandRules.language;
    brandAccentInput.value = brandRules.accentColor;
    brandSecondaryInput.value = brandRules.secondaryColor;
    brandBannedInput.value = brandRules.bannedWords;
  }

  brandSettingsBtn.addEventListener('click', () => {
    fillBrandForm();
    brandDialog.showModal();
  });

  brandCancelBtn.addEventListener('click', () => brandDialog.close());

  brandForm.addEventListener('submit', () => {
    brandRules = {
      apiKey: apiKeyInput.value.trim(),
      brandName: brandNameInput.value.trim(),
      tone: brandToneInput.value.trim(),
      language: brandLanguageInput.value,
      accentColor: brandAccentInput.value,
      secondaryColor: brandSecondaryInput.value,
      bannedWords: brandBannedInput.value.trim(),
    };
    saveBrandRules();
    drawAtTime(0);
  });

  // ---------- AI-driven scene planning (Claude) ----------

  function buildBrandSystemPrompt(rules) {
    const sceneDocs = SCENE_IDS.map((id) => `  - "${id}": ${SCENE_DESCRIPTIONS[id]}`).join('\n');
    const lines = [
      'Sen bir Instagram Reels video oluşturucu için sahne planlama asistanısın.',
      'Video tamamen sabit bir flat vector illüstrasyon kütüphanesinden çizilir — fotoğraf/video yoktur.',
      'Kesinlikle sadece şu sahne kimliklerinden birini kullanabilirsin (başka bir şey uydurma):',
      sceneDocs,
      '',
      'İstek otomotiv/araç/tamir ile ilgiliyse [Otomotiv] etiketli sahneleri tercih et. Başka bir konuysa [Genel amaçlı] etiketli sahneleri (chat-tip, growth-chart, checkmark-fixed) kullan; abstract-shapes sadece hiçbiri gerçekten uymuyorsa son çare olmalı.',
      '',
      'Görsel stil (kod tarafında sabit, senin ayarlaman gerekmiyor): flat vector, kalın siyah kontur, teal ve turuncu düz renkler, gölgesiz, sade arka plan.',
      '',
      'Kullanıcının isteğinden 1 ile 4 arası sahneden oluşan bir video planı oluştur:',
      '- Her sahne "composition" alanında "split" (iki çizim yan yana) veya "full" (tek çizim ortada) olmalı.',
      '- "split" seçersen sceneLeft ve sceneRight FARKLI iki sahne kimliği olmalı.',
      '- "full" seçersen sceneLeft kullanılacak sahnedir; sceneRight yine geçerli bir kimlik olmalı ama görselde kullanılmaz (sceneLeft ile aynısını yazabilirsin).',
      '- "checkmark-fixed" genelde son sahne olarak iyi çalışır (çözüm/tamamlanma hissi verir).',
      '- title: en fazla 7 kelime, dikkat çekici, ünlem/emoji kullanma.',
      '- subtitle: en fazla 12 kelime, tamamlayıcı bilgi; gerekmiyorsa boş bırakabilirsin.',
      '- duration: 2 ile 8 saniye arası (saniye, sayı).',
    ];
    if (rules.brandName) lines.push(`- Marka adı: ${rules.brandName}. Metinlerde doğal şekilde geçebilir ama zorunlu değil.`);
    if (rules.tone) lines.push(`- Ton: ${rules.tone} olmalı.`);
    lines.push(`- Dil: ${rules.language || 'Türkçe'} kullan.`);
    if (rules.bannedWords) lines.push(`- Şu kelimeleri kesinlikle kullanma: ${rules.bannedWords}.`);
    return lines.join('\n');
  }

  const SCENE_DESCRIPTIONS = {
    'car-driver': '[Otomotiv] Ön camdan görünen, içinde gülümseyen sürücü ve yolcunun olduğu bir araç çizimi — sürüş, yolculuk, test sürüşü, araçtaki insanlar anlatımı için.',
    'hand-sensor': '[Otomotiv] Küçük bir motor parçasını/sensörü tutan bir el çizimi — parça inceleme, değiştirme veya elde tutma anlatımı için.',
    'engine-warning': '[Otomotiv] Üzerinde nabız gibi atan bir uyarı üçgeni olan motor bloğu çizimi — arıza/uyarı anlatımı için.',
    'wrench-tool': '[Otomotiv] Dönen bir cıvata/somun ve anahtar çizimi — tamir, bakım, montaj anlatımı için.',
    'dashboard-light': '[Otomotiv] Yanıp sönen bir arıza ikonu olan gösterge paneli çizimi — uyarı ışığı, teşhis anlatımı için.',
    'checkmark-fixed': '[Genel amaçlı] Büyük, çizilerek beliren bir onay işareti — sorunun çözüldüğünü/tamamlandığını/başarıyı anlatmak için, genelde kapanış sahnesi.',
    'chat-tip': '[Genel amaçlı] Konuşma balonu ve basit bir maskot/avatar — ipucu, bilgi, açıklama, duyuru anlatımı için; otomotiv dışı her konuda kullanılabilir.',
    'growth-chart': '[Genel amaçlı] Yükselen çubuk grafik ve büyüme oku — sonuç, artış, verimlilik, başarı anlatımı için; otomotiv dışı her konuda kullanılabilir.',
    'abstract-shapes': '[Genel amaçlı, son çare] Hiçbir sahne konuya uymuyorsa kullanılacak, yumuşak hareket eden nötr şekiller.',
  };

  function applyScenePlan(plan) {
    scenes = plan.scenes.map((s) => ({
      id: nextId++,
      title: s.title || '',
      subtitle: s.subtitle || '',
      duration: Math.min(Math.max(s.duration || DEFAULT_SCENE_DURATION, MIN_SCENE_DURATION), MAX_SCENE_DURATION),
      composition: s.composition,
      sceneLeft: SCENE_IDS.includes(s.sceneLeft) ? s.sceneLeft : 'abstract-shapes',
      sceneRight: SCENE_IDS.includes(s.sceneRight) ? s.sceneRight : 'abstract-shapes',
    }));
    renderSceneList();
    updateActionState();
    drawAtTime(0);
  }

  function setAiStatus(message, kind) {
    aiStatus.textContent = message;
    aiStatus.className = `status${kind ? ` ${kind}` : ''}`;
  }

  let lastPromptText = '';

  const DEMO_PLAN = {
    scenes: [
      { title: 'Yolculuğa hazır', subtitle: 'Doğru parçayla güvenli sürüş', duration: 3, composition: 'split', sceneLeft: 'car-driver', sceneRight: 'hand-sensor' },
      { title: 'Teşhis kondu', subtitle: 'Gösterge paneli uyardı', duration: 2.5, composition: 'split', sceneLeft: 'dashboard-light', sceneRight: 'engine-warning' },
      { title: 'Sonuç: %30 daha verimli', subtitle: 'Doğru parçayla', duration: 3, composition: 'full', sceneLeft: 'growth-chart', sceneRight: 'growth-chart' },
      { title: 'Tamamlandı', subtitle: 'Sorunsuz yol', duration: 2, composition: 'full', sceneLeft: 'checkmark-fixed', sceneRight: 'checkmark-fixed' },
    ],
  };

  demoBtn.addEventListener('click', () => {
    applyScenePlan(DEMO_PLAN);
    regenerateBtn.disabled = true;
    setAiStatus('Örnek plan yüklendi — bu bir demo, AI çağrısı yapılmadı.', 'success');
  });

  async function runAIPlanning(promptText, { isRegenerate = false } = {}) {
    if (!promptText) {
      setAiStatus('Önce ne tür bir video istediğini yaz.', 'error');
      return;
    }
    if (!brandRules.apiKey) {
      setAiStatus('Önce Marka Kuralları içinden bir Anthropic API anahtarı gir.', 'error');
      fillBrandForm();
      brandDialog.showModal();
      return;
    }

    aiGenerateBtn.disabled = true;
    regenerateBtn.disabled = true;
    setAiStatus(isRegenerate ? 'Claude farklı bir versiyon deniyor…' : 'Claude video planlıyor…');

    try {
      const [{ default: Anthropic }, { z }, { zodOutputFormat }] = await Promise.all([
        import('https://esm.sh/@anthropic-ai/sdk'),
        import('https://esm.sh/zod'),
        import('https://esm.sh/@anthropic-ai/sdk/helpers/zod'),
      ]);

      const client = new Anthropic({ apiKey: brandRules.apiKey, dangerouslyAllowBrowser: true });

      const SceneSchema = z.object({
        title: z.string(),
        subtitle: z.string(),
        duration: z.number(),
        composition: z.enum(['split', 'full']),
        sceneLeft: z.enum(SCENE_IDS),
        sceneRight: z.enum(SCENE_IDS),
      });
      const VideoPlanSchema = z.object({ scenes: z.array(SceneSchema).min(1).max(4) });

      const response = await client.messages.parse({
        model: 'claude-opus-5',
        max_tokens: 4096,
        system: buildBrandSystemPrompt(brandRules),
        output_config: {
          format: zodOutputFormat(VideoPlanSchema),
          effort: 'medium',
        },
        messages: [{
          role: 'user',
          content: isRegenerate
            ? `${promptText}\n\n(Not: Bu bir "farklı versiyon dene" isteği — önceki plandan belirgin şekilde farklı bir sahne kombinasyonu ve kompozisyon dene.)`
            : promptText,
        }],
      });

      if (!response.parsed_output) {
        throw new Error('Claude yanıtı beklenen formatta ayrıştırılamadı.');
      }

      lastPromptText = promptText;
      applyScenePlan(response.parsed_output);
      regenerateBtn.disabled = false;
      setAiStatus(`Plan hazır — ${response.parsed_output.scenes.length} sahne. Dilersen düzenleyip videoyu oluşturabilirsin.`, 'success');
    } catch (err) {
      console.error(err);
      let message = 'Bilinmeyen bir hata oluştu.';
      if (/dynamically imported module|Failed to fetch/i.test(err?.message || '')) {
        message = 'Claude SDK yüklenemedi — internet bağlantını veya CDN erişimini kontrol et.';
      } else if (err?.name === 'AuthenticationError' || err?.status === 401) {
        message = 'API anahtarı geçersiz görünüyor. Marka Kuralları\'ndan kontrol et.';
      } else if (err?.name === 'RateLimitError' || err?.status === 429) {
        message = 'İstek sınırına takıldı, biraz sonra tekrar dene.';
      } else if (err?.name === 'BadRequestError' || err?.status === 400) {
        message = `İstek reddedildi: ${err.message || ''}`;
      } else if (err?.status) {
        message = `Claude API hatası (${err.status}): ${err.message || ''}`;
      } else if (err?.message) {
        message = err.message;
      }
      setAiStatus(message, 'error');
    } finally {
      aiGenerateBtn.disabled = false;
      regenerateBtn.disabled = !lastPromptText;
    }
  }

  aiGenerateBtn.addEventListener('click', () => runAIPlanning(aiPrompt.value.trim()));
  regenerateBtn.addEventListener('click', () => runAIPlanning(lastPromptText || aiPrompt.value.trim(), { isRegenerate: true }));

  // ---------- Initial paint ----------
  updateActionState();
  drawAtTime(0);

  // Small debug hook — harmless, useful for troubleshooting from the console.
  window.__reelsDebug = { applyScenePlan, drawAtTime, getScenes: () => scenes, SCENE_IDS };
})();
