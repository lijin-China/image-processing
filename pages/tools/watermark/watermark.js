const { getSettings } = require('../../../utils/storage.js');
const { runTask, getFileSizeKB } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    inputPath: '',
    inputSizeKB: 0,
    watermarkType: 'text',
    text: '© 图像工具箱',
    watermarkImage: '',
    alpha: 35,
    position: 'br',
    busy: false,
    result: null
  },

  onLoad () {
    const s = getSettings();
    this.setData({
      text: s.watermarkText || '© 图像工具箱',
      alpha: Number(s.watermarkAlpha || 35)
    });
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

  chooseWatermarkImage () {
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album'],
      success: (res) => {
        this.setData({ watermarkImage: res.tempFilePaths[0] });
      }
    });
  },

  onWatermarkTypeChange (e) {
    this.setData({ watermarkType: e.currentTarget.dataset.type });
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
        type: 'watermark',
        inputPath: this.data.inputPath,
        canvas,
        watermarkType: this.data.watermarkType,
        text: this.data.text,
        watermarkImage: this.data.watermarkImage,
        alpha: this.data.alpha,
        position: this.data.position
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
      title: '图像工具箱 - 添加水印',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  },

  onShareTimeline () {
    return {
      title: '图像工具箱 - 添加水印',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  }
});
