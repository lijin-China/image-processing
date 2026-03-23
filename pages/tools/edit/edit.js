const { runTask, getFileSizeKB } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    inputPath: '',
    inputSizeKB: 0,
    outW: 1080,
    outH: 1920,
    fit: 'contain',
    fileType: 'jpg',
    quality: 92,
    busy: false,
    result: null
  },

  choose () {
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const inputPath = res.tempFilePaths[0];
        const inputSizeKB = await getFileSizeKB(inputPath);
        this.setData({ inputPath, inputSizeKB, result: null });
      }
    });
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

  onFileTypeChange (e) {
    this.setData({ fileType: e.currentTarget.dataset.type });
  },

  onQuality (e) {
    this.setData({ quality: Number(e.detail.value || 92) });
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

  async run () {
    if (!this.data.inputPath || this.data.busy) return;

    this.setData({ busy: true });
    wx.showLoading({ title: '处理中...' });

    try {
      const canvas = await this.getCanvasNode();
      const r = await runTask({
        type: 'edit',
        inputPath: this.data.inputPath,
        outW: this.data.outW,
        outH: this.data.outH,
        fit: this.data.fit,
        fileType: this.data.fileType,
        quality: this.data.quality,
        canvas
      });
      this.setData({ result: r });
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

  async save () {
    if (!this.data.result || !this.data.result.outputPath) return;
    await saveToAlbum(this.data.result.outputPath);
  },

  async share () {
    await showShareHint();
  },

  onShareAppMessage () {
    return {
      title: '图像工具箱 - 图片编辑',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  },

  onShareTimeline () {
    return {
      title: '图像工具箱 - 图片编辑',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  }
});
