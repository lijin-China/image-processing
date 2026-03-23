const { pushHistory } = require('./storage.js');

function uid () {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function getFileSizeKB (filePath) {
  try {
    const fs = wx.getFileSystemManager();
    const info = await new Promise((resolve, reject) => {
      fs.getFileInfo({
        filePath,
        success: resolve,
        fail: reject
      });
    });
    return Math.round((info.size || 0) / 1024);
  } catch (e) {
    return 0;
  }
}

async function compressByQuality ({ src, quality }) {
  const q = Math.max(10, Math.min(95, Number(quality || 80)));
  const res = await wx.compressImage({ src, quality: q });
  return res.tempFilePath;
}

async function compressToTargetKB ({ src, targetKB, maxIters = 8 }) {
  const target = Math.max(10, Number(targetKB || 200));
  let lo = 10, hi = 95;
  let bestPath = '', bestDiff = Infinity;

  for (let i = 0; i < maxIters; i++) {
    const mid = Math.round((lo + hi) / 2);
    const outPath = await compressByQuality({ src, quality: mid });
    const kb = await getFileSizeKB(outPath);
    const diff = Math.abs(kb - target);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestPath = outPath;
    }

    if (kb > target) hi = mid - 1;
    else lo = mid + 1;

    if (lo > hi) break;
  }
  return bestPath;
}

async function loadImage (canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function centerCropRect (srcW, srcH, ratioW, ratioH) {
  const targetRatio = ratioW / ratioH;
  const srcRatio = srcW / srcH;

  let cropW = srcW, cropH = srcH;
  if (srcRatio > targetRatio) {
    cropW = Math.round(srcH * targetRatio);
  } else {
    cropH = Math.round(srcW / targetRatio);
  }

  return {
    x: Math.round((srcW - cropW) / 2),
    y: Math.round((srcH - cropH) / 2),
    w: cropW,
    h: cropH
  };
}

async function drawToCanvasAndExport ({ canvas, src, draw, destWidth, destHeight, fileType = 'jpg', quality = 0.92 }) {
  if (!canvas) throw new Error('canvas required');

  const info = await wx.getImageInfo({ src });
  const w = destWidth || info.width;
  const h = destHeight || info.height;

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const img = await loadImage(canvas, src);
  await draw(ctx, { img, src, srcInfo: info, width: w, height: h, canvas });

  const out = await wx.canvasToTempFilePath({ canvas, fileType, quality });
  return out.tempFilePath;
}

async function applyWatermark ({ canvas, src, watermarkType = 'text', text, watermarkImage, alphaPercent, position = 'br' }) {
  return drawToCanvasAndExport({
    canvas,
    src,
    fileType: 'jpg',
    quality: 0.92,
    draw: async (ctx, { img, width, height, canvas }) => {
      ctx.drawImage(img, 0, 0, width, height);

      const alpha = Math.max(5, Math.min(80, Number(alphaPercent || 35))) / 100;
      ctx.globalAlpha = alpha;

      const pad = Math.round(Math.min(width, height) * 0.04);

      if (watermarkType === 'text') {
        const watermarkText = String(text || '').trim();
        if (!watermarkText) return;

        ctx.fillStyle = '#FFFFFF';
        const fontSize = Math.max(18, Math.round(Math.min(width, height) * 0.05));
        ctx.font = `${fontSize}px sans-serif`;

        const metrics = ctx.measureText(watermarkText);
        const textWidth = metrics.width || watermarkText.length * fontSize;

        let x = pad, y = pad + fontSize;
        if (position === 'br') {
          x = Math.max(pad, width - pad - textWidth);
          y = height - pad;
        } else if (position === 'tr') {
          x = Math.max(pad, width - pad - textWidth);
        } else if (position === 'bl') {
          y = height - pad;
        }

        ctx.fillText(watermarkText, x, y);
      } else if (watermarkType === 'image' && watermarkImage) {
        const wmImg = await loadImage(canvas, watermarkImage);
        const watermarkWidth = Math.round(Math.min(width, height) * 0.15);
        const watermarkHeight = Math.round(watermarkWidth * (wmImg.height / wmImg.width));

        let x = pad, y = pad;
        if (position === 'br') {
          x = width - pad - watermarkWidth;
          y = height - pad - watermarkHeight;
        } else if (position === 'tr') {
          x = width - pad - watermarkWidth;
        } else if (position === 'bl') {
          y = height - pad - watermarkHeight;
        }

        ctx.drawImage(wmImg, x, y, watermarkWidth, watermarkHeight);
      }
      ctx.globalAlpha = 1;
    }
  });
}

async function resizeCropFormat ({ canvas, src, outW, outH, mode, fileType, quality }) {
  const bgColor = '#FFFFFF';
  return drawToCanvasAndExport({
    canvas,
    src,
    destWidth: outW,
    destHeight: outH,
    fileType,
    quality,
    draw: async (ctx, { img, srcInfo, width, height }) => {
      const sw = srcInfo.width, sh = srcInfo.height;

      if (mode === 'cover') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
        const rect = centerCropRect(sw, sh, width, height);
        ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, width, height);
        return;
      }

      const scale = Math.min(width / sw, height / sh);
      const dw = Math.round(sw * scale);
      const dh = Math.round(sh * scale);
      const dx = Math.round((width - dw) / 2);
      const dy = Math.round((height - dh) / 2);

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, dx, dy, dw, dh);
    }
  });
}

const BG_COLORS = {
  white: '#FFFFFF',
  blue: '#4169E1',
  red: '#CD5C5C'
};

async function removeBackground (src) {
  if (typeof wx.removeBackground !== 'function') {
    console.warn('wx.removeBackground 不可用，当前基础库版本可能过低');
    return { path: src, removed: false, error: 'API不可用' };
  }
  try {
    console.log('开始调用 wx.removeBackground...');
    const res = await wx.removeBackground({ src });
    console.log('wx.removeBackground 成功:', res);
    return { path: res.tempFilePath, removed: true };
  } catch (e) {
    console.error('背景移除失败:', e);
    return { path: src, removed: false, error: e.errMsg || e.message || '未知错误' };
  }
}

async function generateIdPhoto ({ canvas, src, outW, outH, bgColor = 'white' }) {
  const bg = BG_COLORS[bgColor] || BG_COLORS.white;

  const { path: processedSrc, removed: bgRemoved, error: bgRemoveError } = await removeBackground(src);

  const outputPath = await drawToCanvasAndExport({
    canvas,
    src: processedSrc,
    destWidth: outW,
    destHeight: outH,
    fileType: 'jpg',
    quality: 0.95,
    draw: async (ctx, { img, srcInfo, width, height }) => {
      const sw = srcInfo.width, sh = srcInfo.height;

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const scale = Math.min(width / sw, height / sh);
      const dw = Math.round(sw * scale);
      const dh = Math.round(sh * scale);
      const dx = Math.round((width - dw) / 2);
      const dy = Math.round((height - dh) / 2);

      ctx.drawImage(img, dx, dy, dw, dh);
    }
  });

  return { outputPath, bgRemoved, bgRemoveError };
}

async function cropImage ({ canvas, src, ratio = 'free', preset = 'none' }) {
  return drawToCanvasAndExport({
    canvas,
    src,
    fileType: 'jpg',
    quality: 0.95,
    draw: async (ctx, { img, srcInfo, width, height }) => {
      const sw = srcInfo.width, sh = srcInfo.height;
      
      let targetW = width, targetH = height;
      
      if (ratio === '1:1') {
        targetW = Math.min(width, height);
        targetH = targetW;
      } else if (ratio === '4:3') {
        const r = 4 / 3;
        if (width / height > r) {
          targetH = height;
          targetW = Math.round(height * r);
        } else {
          targetW = width;
          targetH = Math.round(width / r);
        }
      } else if (ratio === '16:9') {
        const r = 16 / 9;
        if (width / height > r) {
          targetH = height;
          targetW = Math.round(height * r);
        } else {
          targetW = width;
          targetH = Math.round(width / r);
        }
      }
      
      if (preset === 'square') {
        targetW = Math.min(width, height);
        targetH = targetW;
      } else if (preset === 'cover') {
        targetW = width;
        targetH = height;
      }
      
      const rect = centerCropRect(sw, sh, targetW, targetH);
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, targetW, targetH);
    }
  });
}

async function rotateImage ({ canvas, src, rotate = 0, flip = 'none' }) {
  return drawToCanvasAndExport({
    canvas,
    src,
    fileType: 'jpg',
    quality: 0.95,
    draw: async (ctx, { img, srcInfo, width, height }) => {
      let targetW = width, targetH = height;
      
      if (rotate === 90 || rotate === 270) {
        targetW = height;
        targetH = width;
      }
      
      ctx.save();
      
      const cx = targetW / 2;
      const cy = targetH / 2;
      ctx.translate(cx, cy);
      ctx.rotate(rotate * Math.PI / 180);
      
      if (flip === 'horizontal') {
        ctx.scale(-1, 1);
      } else if (flip === 'vertical') {
        ctx.scale(1, -1);
      }
      
      const dw = rotate === 90 || rotate === 270 ? targetH : targetW;
      const dh = rotate === 90 || rotate === 270 ? targetW : targetH;
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
      ctx.restore();
    }
  });
}

async function adjustImage ({ canvas, src, brightness = 0, contrast = 0, saturation = 100 }) {
  return drawToCanvasAndExport({
    canvas,
    src,
    fileType: 'jpg',
    quality: 0.95,
    draw: async (ctx, { img, width, height }) => {
      ctx.drawImage(img, 0, 0, width, height);
      
      const b = Math.max(-50, Math.min(50, Number(brightness || 0)));
      if (b !== 0) {
        ctx.globalAlpha = Math.abs(b) / 100;
        ctx.fillStyle = b > 0 ? '#FFFFFF' : '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
      
      const c = Math.max(-50, Math.min(50, Number(contrast || 0)));
      if (c !== 0) {
        const alpha = Math.abs(c) / 160;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = c > 0 ? '#000000' : '#FFFFFF';
        const pad = Math.round(Math.min(width, height) * 0.08);
        ctx.fillRect(0, 0, width, pad);
        ctx.fillRect(0, height - pad, width, pad);
        ctx.fillRect(0, 0, pad, height);
        ctx.fillRect(width - pad, 0, pad, height);
        ctx.globalAlpha = 1;
      }
    }
  });
}

async function simpleBeauty ({ canvas, src, brightness = 0, contrast = 0 }) {
  return drawToCanvasAndExport({
    canvas,
    src,
    fileType: 'jpg',
    quality: 0.92,
    draw: async (ctx, { img, width, height }) => {
      ctx.drawImage(img, 0, 0, width, height);

      const b = Math.max(-50, Math.min(50, Number(brightness || 0)));
      if (b !== 0) {
        ctx.globalAlpha = Math.abs(b) / 100;
        ctx.fillStyle = b > 0 ? '#FFFFFF' : '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }

      const c = Math.max(-50, Math.min(50, Number(contrast || 0)));
      if (c !== 0) {
        const alpha = Math.abs(c) / 160;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = c > 0 ? '#000000' : '#FFFFFF';
        const pad = Math.round(Math.min(width, height) * 0.08);
        ctx.fillRect(0, 0, width, pad);
        ctx.fillRect(0, height - pad, width, pad);
        ctx.fillRect(0, 0, pad, height);
        ctx.fillRect(width - pad, 0, pad, height);
        ctx.globalAlpha = 1;
      }
    }
  });
}

const TASK_HANDLERS = {
  compress: async (t) => {
    const title = t.mode === 'targetSize' ? `压缩到 ${t.targetKB}KB` : `压缩质量 ${t.quality}`;
    const outputPath = t.mode === 'targetSize'
      ? await compressToTargetKB({ src: t.inputPath, targetKB: t.targetKB })
      : await compressByQuality({ src: t.inputPath, quality: t.quality });
    return { title, outputPath };
  },
  watermark: async (t) => {
    const outputPath = await applyWatermark({
      canvas: t.canvas,
      src: t.inputPath,
      watermarkType: t.watermarkType || 'text',
      text: t.text,
      watermarkImage: t.watermarkImage,
      alphaPercent: t.alpha,
      position: t.position || 'br'
    });
    return { title: '添加水印', outputPath };
  },
  edit: async (t) => {
    const outputPath = await resizeCropFormat({
      canvas: t.canvas,
      src: t.inputPath,
      outW: t.outW,
      outH: t.outH,
      mode: t.fit || 'contain',
      fileType: t.fileType || 'jpg',
      quality: (Number(t.quality || 92) / 100) || 0.92
    });
    return { title: '图片编辑', outputPath };
  },
  beauty: async (t) => {
    const outputPath = await simpleBeauty({
      canvas: t.canvas,
      src: t.inputPath,
      brightness: t.brightness,
      contrast: t.contrast
    });
    return { title: '简单调色', outputPath };
  },
  idphoto: async (t) => {
    const { outputPath, bgRemoved, bgRemoveError } = await generateIdPhoto({
      canvas: t.canvas,
      src: t.inputPath,
      outW: t.outW,
      outH: t.outH,
      bgColor: t.bgColor || 'white'
    });
    return { title: '证件照', outputPath, bgRemoved, bgRemoveError };
  },
  crop: async (t) => {
    const outputPath = await cropImage({
      canvas: t.canvas,
      src: t.inputPath,
      ratio: t.ratio,
      preset: t.preset
    });
    return { title: '图片裁剪', outputPath };
  },
  rotate: async (t) => {
    const outputPath = await rotateImage({
      canvas: t.canvas,
      src: t.inputPath,
      rotate: t.rotate,
      flip: t.flip
    });
    return { title: '图片旋转', outputPath };
  },
  adjust: async (t) => {
    const outputPath = await adjustImage({
      canvas: t.canvas,
      src: t.inputPath,
      brightness: t.brightness,
      contrast: t.contrast,
      saturation: t.saturation
    });
    return { title: '图片调色', outputPath };
  }
};

async function runTask (task) {
  const t = task || {};
  const inputPath = t.inputPath;
  if (!inputPath) throw new Error('inputPath required');

  const handler = TASK_HANDLERS[t.type];
  if (!handler) throw new Error(`Unknown task type: ${t.type}`);

  const { title, outputPath, bgRemoved, bgRemoveError } = await handler(t);
  const [inKB, outKB] = await Promise.all([getFileSizeKB(inputPath), getFileSizeKB(outputPath)]);

  const entry = {
    id: uid(),
    type: t.type,
    title,
    inputPath,
    outputPath,
    inputSizeKB: inKB,
    outputSizeKB: outKB,
    createdAt: Date.now(),
    params: { ...t },
    bgRemoved,
    bgRemoveError
  };

  pushHistory(entry);
  return entry;
}

async function runBatch (tasks, onProgress) {
  const list = Array.isArray(tasks) ? tasks : [];
  const results = [];

  for (let i = 0; i < list.length; i++) {
    try {
      const r = await runTask(list[i]);
      results.push({ ok: true, result: r });
    } catch (e) {
      results.push({ ok: false, error: e });
    }
    if (typeof onProgress === 'function') {
      onProgress({ index: i, total: list.length, results });
    }
  }

  return results;
}

module.exports = {
  runTask,
  runBatch,
  getFileSizeKB
};
