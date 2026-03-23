const { runBatch } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    inputPaths: [],
    type: 'compress',
    mode: 'quality',
    quality: 80,
    targetKB: 200,
    text: '© 图像工具箱',
    alpha: 35,
    position: 'br',
    outW: 1080,
    outH: 1920,
    fit: 'contain',
    busy: false,
    progress: 0,
    processed: 0,
    total: 0,
    results: []
  },

  choose () {
    const currentCount = this.data.inputPaths.length;
    const maxSelect = 9 - currentCount;
    wx.chooseImage({
      count: maxSelect,
      sizeType: ['original'],
      sourceType: ['album'],
      success: (res) => {
        const newPaths = [...this.data.inputPaths, ...res.tempFilePaths].slice(0, 9);
        this.setData({ inputPaths: newPaths, results: [] });
      }
    });
  },

  removeImage (e) {
    const index = e.currentTarget.dataset.index;
    const inputPaths = [...this.data.inputPaths];
    inputPaths.splice(index, 1);
    this.setData({ inputPaths });
  },

  onTypeChange (e) {
    this.setData({ type: e.currentTarget.dataset.type });
  },

  setMode (e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onQuality (e) {
    this.setData({ quality: Number(e.detail.value || 80) });
  },

  onQualityTouchStart (e) {
    this._qualityStartX = e.touches[0].clientX;
    this._qualityStartVal = this.data.quality;
  },

  onQualityTouchMove (e) {
    if (this._qualityStartX === undefined) return;
    const dx = e.touches[0].clientX - this._qualityStartX;
    const delta = Math.round(dx / 5);
    const v = Math.max(10, Math.min(95, this._qualityStartVal + delta));
    this.setData({ quality: v });
  },

  onQualityTouchEnd () {
    this._qualityStartX = undefined;
    this._qualityStartVal = undefined;
  },

  onTargetKB (e) {
    this.setData({ targetKB: Number(e.detail.value || 200) });
  },

  onTextChange (e) {
    this.setData({ text: e.detail.value });
  },

  onAlphaChange (e) {
    this.setData({ alpha: Number(e.detail.value || 35) });
  },

  onAlphaTouchStart (e) {
    this._alphaStartX = e.touches[0].clientX;
    this._alphaStartVal = this.data.alpha;
  },

  onAlphaTouchMove (e) {
    if (this._alphaStartX === undefined) return;
    const dx = e.touches[0].clientX - this._alphaStartX;
    const delta = Math.round(dx / 5);
    const v = Math.max(5, Math.min(80, this._alphaStartVal + delta));
    this.setData({ alpha: v });
  },

  onAlphaTouchEnd () {
    this._alphaStartX = undefined;
    this._alphaStartVal = undefined;
  },

  onPositionChange (e) {
    this.setData({ position: e.currentTarget.dataset.position });
  },

  onOutW (e) {
    this.setData({ outW: Number(e.detail.value || 1080) });
  },

  onOutH (e) {
    this.setData({ outH: Number(e.detail.value || 1920) });
  },

  onFitChange (e) {
    this.setData({ fit: e.currentTarget.dataset.fit });
  },

  getCanvasNode () {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select('#toolCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res && res[0] && res[0].node) {
            resolve(res[0].node);
          } else {
            reject(new Error('Canvas node not found'));
          }
        });
    });
  },

  buildTask (path, canvas) {
    const { type, mode, quality, targetKB, text, alpha, position, outW, outH, fit } = this.data;

    switch (type) {
      case 'compress':
        return { type: 'compress', inputPath: path, mode, quality, targetKB };
      case 'watermark':
        return { type: 'watermark', inputPath: path, canvas, watermarkType: 'text', text, alpha, position };
      case 'edit':
        return { type: 'edit', inputPath: path, canvas, outW, outH, fit };
      default:
        return null;
    }
  },

  async run () {
    if (!this.data.inputPaths.length || this.data.busy) return;

    this.setData({
      busy: true,
      progress: 0,
      processed: 0,
      total: this.data.inputPaths.length,
      results: []
    });
    wx.showLoading({ title: '批量处理中...' });

    try {
      const needCanvas = this.data.type !== 'compress';
      let canvas = null;
      if (needCanvas) {
        canvas = await this.getCanvasNode();
      }
      const tasks = this.data.inputPaths.map(path => this.buildTask(path, canvas)).filter(Boolean);
      const results = await runBatch(tasks, (progress) => {
        this.setData({
          progress: Math.round((progress.index + 1) / progress.total * 100),
          processed: progress.index + 1,
          results: progress.results
        });
      });
      this.setData({ results, progress: 100 });
      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '处理失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  preview (e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },

  async save (e) {
    const path = e.currentTarget.dataset.path;
    if (!path) return;
    await saveToAlbum(path);
  },

  async saveAll () {
    const successfulResults = this.data.results.filter(r => r.ok && r.result?.outputPath);
    if (!successfulResults.length) return;

    wx.showLoading({ title: '保存中...' });
    try {
      for (const result of successfulResults) {
        await saveToAlbum(result.result.outputPath);
      }
      wx.showToast({ title: '全部保存成功', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async shareAll () {
    await showShareHint();
  }
});
