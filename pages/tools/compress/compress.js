const { getSettings } = require('../../../utils/storage.js');
const { runTask, getFileSizeKB } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    inputPath: '',
    inputSizeKB: 0,
    mode: 'quality',
    quality: 80,
    targetKB: 200,
    busy: false,
    result: null,
    savedPercent: 0
  },

  onLoad () {
    const s = getSettings();
    this.setData({
      mode: (s.compressModeIndex || 0) === 1 ? 'targetSize' : 'quality',
      quality: Number(s.quality || 80),
      targetKB: Number(s.targetKB || 200)
    });
  },

  async choose () {
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const inputPath = res.tempFilePaths[0];
        const inputSizeKB = await getFileSizeKB(inputPath);
        this.setData({
          inputPath,
          inputSizeKB,
          result: null,
          savedPercent: 0
        });
      }
    });
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

  async run () {
    if (!this.data.inputPath || this.data.busy) return;

    this.setData({ busy: true });
    wx.showLoading({ title: '处理中...' });

    try {
      const r = await runTask({
        type: 'compress',
        inputPath: this.data.inputPath,
        mode: this.data.mode,
        quality: this.data.quality,
        targetKB: this.data.targetKB
      });
      const savedPercent = this.calculateSavedPercent(r);
      this.setData({ result: r, savedPercent });
      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '处理失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  calculateSavedPercent (result) {
    if (!result || !result.inputSizeKB) return 0;
    const p = Math.round((1 - (result.outputSizeKB || 0) / result.inputSizeKB) * 100);
    return Math.max(0, Math.min(99, p));
  },

  preview (e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },

  async save () {
    if (!this.data.result || !this.data.result.outputPath) return;
    await saveToAlbum(this.data.result.outputPath);
  },

  async share () {
    await showShareHint();
  },

  onShareAppMessage () {
    return {
      title: '图像工具箱 - 图片压缩',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  },

  onShareTimeline () {
    return {
      title: '图像工具箱 - 图片压缩',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  }
});
