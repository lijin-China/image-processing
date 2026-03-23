const { runTask, getFileSizeKB } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    inputPath: '',
    inputSizeKB: 0,
    brightness: 0,
    contrast: 0,
    saturation: 100,
    busy: false,
    result: null
  },

  choose() {
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

  onBrightnessTouchStart(e) {
    this._brightnessStartX = e.touches[0].clientX;
    this._brightnessStartVal = this.data.brightness;
  },

  onBrightnessTouchMove(e) {
    if (this._brightnessStartX === undefined) return;
    const dx = e.touches[0].clientX - this._brightnessStartX;
    const delta = Math.round(dx / 3);
    const v = Math.max(-50, Math.min(50, this._brightnessStartVal + delta));
    this.setData({ brightness: v });
  },

  onBrightnessTouchEnd() {
    this._brightnessStartX = undefined;
    this._brightnessStartVal = undefined;
  },

  onContrastTouchStart(e) {
    this._contrastStartX = e.touches[0].clientX;
    this._contrastStartVal = this.data.contrast;
  },

  onContrastTouchMove(e) {
    if (this._contrastStartX === undefined) return;
    const dx = e.touches[0].clientX - this._contrastStartX;
    const delta = Math.round(dx / 3);
    const v = Math.max(-50, Math.min(50, this._contrastStartVal + delta));
    this.setData({ contrast: v });
  },

  onContrastTouchEnd() {
    this._contrastStartX = undefined;
    this._contrastStartVal = undefined;
  },

  onSaturationTouchStart(e) {
    this._saturationStartX = e.touches[0].clientX;
    this._saturationStartVal = this.data.saturation;
  },

  onSaturationTouchMove(e) {
    if (this._saturationStartX === undefined) return;
    const dx = e.touches[0].clientX - this._saturationStartX;
    const delta = Math.round(dx / 3);
    const v = Math.max(0, Math.min(200, this._saturationStartVal + delta));
    this.setData({ saturation: v });
  },

  onSaturationTouchEnd() {
    this._saturationStartX = undefined;
    this._saturationStartVal = undefined;
  },

  getCanvasNode() {
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

  async run() {
    if (!this.data.inputPath || this.data.busy) return;

    this.setData({ busy: true });
    wx.showLoading({ title: '处理中...' });

    try {
      const canvas = await this.getCanvasNode();
      const r = await runTask({
        type: 'adjust',
        inputPath: this.data.inputPath,
        brightness: this.data.brightness,
        contrast: this.data.contrast,
        saturation: this.data.saturation,
        canvas
      });
      this.setData({ result: r });
      wx.hideLoading();
    } catch (e) {
      console.error('调色失败:', e);
      wx.hideLoading();
      wx.showToast({ title: '处理失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  preview(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },

  async save() {
    if (!this.data.result || !this.data.result.outputPath) return;
    await saveToAlbum(this.data.result.outputPath);
  },

  async share() {
    await showShareHint();
  },

  onShareAppMessage() {
    return {
      title: '图像工具箱 - 图片调色',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  },

  onShareTimeline() {
    return {
      title: '图像工具箱 - 图片调色',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  }
});
