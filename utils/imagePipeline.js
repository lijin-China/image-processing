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

/**
 * 移除图片背景（AI抠图）
 * 优先使用 wx.removeBackground，不可用时调用云函数
 */
async function removeBackground(src) {
  // 方案1: 尝试使用微信原生 API
  if (typeof wx.removeBackground === 'function') {
    try {
      console.log('尝试使用 wx.removeBackground...');
      const res = await new Promise((resolve, reject) => {
        wx.removeBackground({
          src: src,
          success: resolve,
          fail: reject
        });
      });
      if (res.tempFilePath) {
        console.log('wx.removeBackground 成功');
        return { path: res.tempFilePath, removed: true };
      }
    } catch (e) {
      console.warn('wx.removeBackground 失败:', e);
    }
  }

  // 方案2: 调用云函数
  try {
    console.log('尝试使用云函数抠图...');
    return await removeBackgroundWithCloud(src);
  } catch (e) {
    console.error('云函数抠图失败:', e);
    return {
      path: src,
      removed: false,
      error: e.message || 'AI抠图服务暂不可用'
    };
  }
}

/**
 * 使用云函数抠图
 */
async function removeBackgroundWithCloud(src) {
  // 1. 上传图片到云存储
  wx.showLoading({ title: '上传图片...', mask: true });

  const cloudPath = `temp/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  const uploadRes = await wx.cloud.uploadFile({
    cloudPath: cloudPath,
    filePath: src
  });

  if (!uploadRes.fileID) {
    throw new Error('上传图片失败');
  }

  // 2. 调用云函数
  wx.showLoading({ title: 'AI抠图中...', mask: true });

  const cloudRes = await wx.cloud.callFunction({
    name: 'removeBg',
    data: {
      fileID: uploadRes.fileID
    }
  });

  if (!cloudRes.result || !cloudRes.result.success) {
    throw new Error(cloudRes.result?.error || '抠图失败');
  }

  // 3. 下载结果图片
  wx.showLoading({ title: '下载结果...', mask: true });

  const downloadRes = await wx.cloud.downloadFile({
    fileID: cloudRes.result.fileID
  });

  if (!downloadRes.tempFilePath) {
    throw new Error('下载结果失败');
  }

  // 4. 清理临时文件
  wx.cloud.deleteFile({
    fileList: [uploadRes.fileID, cloudRes.result.fileID]
  }).catch(() => {});

  wx.hideLoading();

  return {
    path: downloadRes.tempFilePath,
    removed: true
  };
}

async function generateIdPhoto ({ canvas, src, outW, outH, bgColor = 'white', skipRemoveBg = false }) {
  const bg = BG_COLORS[bgColor] || BG_COLORS.white;

  // 如果跳过抠图或 API 不可用，直接使用原图
  let processedSrc = src;
  let bgRemoved = false;
  let bgRemoveError = null;

  if (!skipRemoveBg) {
    const result = await removeBackground(src);
    processedSrc = result.path;
    bgRemoved = result.removed;
    bgRemoveError = result.error;
  }

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

// 滤镜预设配置
const FILTER_PRESETS = {
  none: { brightness: 0, contrast: 0, saturation: 100, sepia: 0, hueRotate: 0 },
  vintage: { brightness: 5, contrast: 10, saturation: 70, sepia: 30, hueRotate: 0 },
  blackwhite: { brightness: 0, contrast: 20, saturation: 0, sepia: 0, hueRotate: 0 },
  cold: { brightness: 0, contrast: 5, saturation: 90, sepia: 0, hueRotate: -15 },
  warm: { brightness: 5, contrast: 0, saturation: 110, sepia: 15, hueRotate: 0 },
  drama: { brightness: -5, contrast: 30, saturation: 120, sepia: 0, hueRotate: 0 },
  fade: { brightness: 10, contrast: -15, saturation: 80, sepia: 10, hueRotate: 0 },
  vivid: { brightness: 5, contrast: 15, saturation: 140, sepia: 0, hueRotate: 0 },
  mono: { brightness: 0, contrast: 10, saturation: 0, sepia: 0, hueRotate: 0 },
  noir: { brightness: -5, contrast: 25, saturation: 0, sepia: 0, hueRotate: 0 }
};

async function applyFilter ({ canvas, src, filter = 'none' }) {
  const preset = FILTER_PRESETS[filter] || FILTER_PRESETS.none;

  return drawToCanvasAndExport({
    canvas,
    src,
    fileType: 'jpg',
    quality: 0.95,
    draw: async (ctx, { img, width, height }) => {
      ctx.drawImage(img, 0, 0, width, height);

      // 获取图像数据进行像素级处理
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      const brightness = preset.brightness || 0;
      const contrast = (preset.contrast || 0) / 100 + 1;
      const saturation = (preset.saturation || 100) / 100;
      const sepia = (preset.sepia || 0) / 100;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // 亮度
        if (brightness !== 0) {
          const bright = brightness * 2.55;
          r += bright;
          g += bright;
          b += bright;
        }

        // 对比度
        if (contrast !== 1) {
          r = (r - 128) * contrast + 128;
          g = (g - 128) * contrast + 128;
          b = (b - 128) * contrast + 128;
        }

        // 饱和度
        if (saturation !== 1) {
          const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
          r = gray + saturation * (r - gray);
          g = gray + saturation * (g - gray);
          b = gray + saturation * (b - gray);
        }

        // 怀旧色调
        if (sepia > 0) {
          const tr = 0.393 * r + 0.769 * g + 0.189 * b;
          const tg = 0.349 * r + 0.686 * g + 0.168 * b;
          const tb = 0.272 * r + 0.534 * g + 0.131 * b;
          r = r + sepia * (tr - r);
          g = g + sepia * (tg - g);
          b = b + sepia * (tb - b);
        }

        // 限制范围
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
      }

      ctx.putImageData(imageData, 0, 0);
    }
  });
}

// 马赛克效果
async function applyMosaic ({ canvas, src, blockSize = 20, regions = [] }) {
  return drawToCanvasAndExport({
    canvas,
    src,
    fileType: 'jpg',
    quality: 0.95,
    draw: async (ctx, { img, width, height }) => {
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // 如果没有指定区域，对整个图片应用马赛克
      if (regions.length === 0) {
        regions = [{ x: 0, y: 0, w: width, h: height }];
      }

      for (const region of regions) {
        const { x: rx, y: ry, w: rw, h: rh } = region;
        const size = Math.max(5, Math.min(blockSize, 50));

        for (let y = ry; y < ry + rh; y += size) {
          for (let x = rx; x < rx + rw; x += size) {
            // 计算块的平均颜色
            let r = 0, g = 0, b = 0, count = 0;

            for (let dy = 0; dy < size && y + dy < height; dy++) {
              for (let dx = 0; dx < size && x + dx < width; dx++) {
                const px = Math.floor(x + dx);
                const py = Math.floor(y + dy);
                if (px >= 0 && px < width && py >= 0 && py < height) {
                  const idx = (py * width + px) * 4;
                  r += data[idx];
                  g += data[idx + 1];
                  b += data[idx + 2];
                  count++;
                }
              }
            }

            if (count > 0) {
              r = Math.round(r / count);
              g = Math.round(g / count);
              b = Math.round(b / count);

              // 填充块
              for (let dy = 0; dy < size && y + dy < height; dy++) {
                for (let dx = 0; dx < size && x + dx < width; dx++) {
                  const px = Math.floor(x + dx);
                  const py = Math.floor(y + dy);
                  if (px >= 0 && px < width && py >= 0 && py < height) {
                    const idx = (py * width + px) * 4;
                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                  }
                }
              }
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }
  });
}

// 图片拼接
async function stitchImages ({ canvas, images, direction = 'vertical', gap = 0 }) {
  if (!images || images.length === 0) {
    throw new Error('至少需要一张图片');
  }

  // 加载所有图片
  const imgInfos = [];
  let totalWidth = 0, totalHeight = 0;
  let maxWidth = 0, maxHeight = 0;

  for (const src of images) {
    const info = await wx.getImageInfo({ src });
    imgInfos.push({ src, ...info });
    maxWidth = Math.max(maxWidth, info.width);
    maxHeight = Math.max(maxHeight, info.height);
  }

  if (direction === 'vertical') {
    totalWidth = maxWidth;
    totalHeight = imgInfos.reduce((sum, info) => sum + info.height, 0) + gap * (images.length - 1);
  } else {
    totalWidth = imgInfos.reduce((sum, info) => sum + info.width, 0) + gap * (images.length - 1);
    totalHeight = maxHeight;
  }

  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');

  // 填充白色背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  let currentPos = 0;
  for (let i = 0; i < imgInfos.length; i++) {
    const info = imgInfos[i];
    const img = await loadImage(canvas, info.src);

    if (direction === 'vertical') {
      const x = Math.round((totalWidth - info.width) / 2);
      ctx.drawImage(img, x, currentPos, info.width, info.height);
      currentPos += info.height + gap;
    } else {
      const y = Math.round((totalHeight - info.height) / 2);
      ctx.drawImage(img, currentPos, y, info.width, info.height);
      currentPos += info.width + gap;
    }
  }

  const out = await wx.canvasToTempFilePath({ canvas, fileType: 'jpg', quality: 0.95 });
  return out.tempFilePath;
}

// 格式转换
async function convertFormat ({ canvas, src, format = 'jpg', quality = 92 }) {
  return drawToCanvasAndExport({
    canvas,
    src,
    fileType: format,
    quality: quality / 100,
    draw: async (ctx, { img, width, height }) => {
      // PNG转JPG需要填充白色背景
      if (format === 'jpg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);
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
      bgColor: t.bgColor || 'white',
      skipRemoveBg: t.skipRemoveBg || false
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
  },
  filter: async (t) => {
    const outputPath = await applyFilter({
      canvas: t.canvas,
      src: t.inputPath,
      filter: t.filter || 'none'
    });
    return { title: '图片滤镜', outputPath };
  },
  mosaic: async (t) => {
    const outputPath = await applyMosaic({
      canvas: t.canvas,
      src: t.inputPath,
      blockSize: t.blockSize || 20,
      regions: t.regions || []
    });
    return { title: '马赛克', outputPath };
  },
  stitch: async (t) => {
    const outputPath = await stitchImages({
      canvas: t.canvas,
      images: t.images,
      direction: t.direction || 'vertical',
      gap: t.gap || 0
    });
    return { title: '图片拼接', outputPath };
  },
  convert: async (t) => {
    const outputPath = await convertFormat({
      canvas: t.canvas,
      src: t.inputPath,
      format: t.format || 'jpg',
      quality: t.quality || 92
    });
    return { title: '格式转换', outputPath };
  }
};

async function runTask (task) {
  const t = task || {};
  const handler = TASK_HANDLERS[t.type];
  if (!handler) throw new Error(`Unknown task type: ${t.type}`);

  // stitch 任务使用 images 数组，不需要 inputPath
  if (t.type !== 'stitch') {
    if (!t.inputPath) throw new Error('inputPath required');
  }

  const { title, outputPath, bgRemoved, bgRemoveError } = await handler(t);

  // 获取文件大小
  let inKB = 0, outKB = 0;
  if (t.type === 'stitch') {
    outKB = await getFileSizeKB(outputPath);
  } else {
    [inKB, outKB] = await Promise.all([getFileSizeKB(t.inputPath), getFileSizeKB(outputPath)]);
  }

  const entry = {
    id: uid(),
    type: t.type,
    title,
    inputPath: t.inputPath || '',
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
  getFileSizeKB,
  FILTER_PRESETS
};
