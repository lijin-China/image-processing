const { runTask, getFileSizeKB } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    inputPath: '',
    inputSizeKB: 0,
    inputFormat: '',
    outputFormat: 'jpg',
    quality: 92,
    busy: false,
    result: null
  },

  async choose () {
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const inputPath = res.tempFilePaths[0];
        const inputSizeKB = await getFileSizeKB(inputPath);
        // 从文件路径推断格式
        const ext = inputPath.split('.').pop().toLowerCase();
        const formatMap = { 'jpg': 'jpg', 'jpeg': 'jpg', 'png': 'png', 'webp': 'webp' };
        const inputFormat = formatMap[ext] || 'jpg';

        this.setData({
          inputPath,
          inputSizeKB,
          inputFormat,
          result: null
        });
      }
    });
  },

  setFormat (e) {
    this.setData({ outputFormat: e.currentTarget.dataset.format });
  },

  onQualityChange (e) {
    this.setData({ quality: Number(e.detail.value) || 92 });
  },

  onQualityTouchStart (e) {
    this._qualityStartX = e.touches[0].clientX;
    this._qualityStartVal = this.data.quality;
  },

  onQualityTouchMove (e) {
    if (this._qualityStartX === undefined) return;
    const dx = e.touches[0].clientX - this._qualityStartX;
    const delta = Math.round(dx / 3);
    const v = Math.max(10, Math.min(100, this._qualityStartVal + delta));
    this.setData({ quality: v });
  },

  onQualityTouchEnd () {
    this._qualityStartX = undefined;
    this._qualityStartVal = undefined;
  },

  async convert () {
    if (!this.data.inputPath || this.data.busy) return;

    this.setData({ busy: true });
    wx.showLoading({ title: '转换中...' });

    try {
      const canvas = await this.getCanvas();
      const r = await runTask({
        type: 'convert',
        inputPath: this.data.inputPath,
        canvas,
        format: this.data.outputFormat,
        quality: this.data.quality
      });
      this.setData({ result: r });
      wx.hideLoading();
    } catch (e) {
      console.error('格式转换失败:', e);
      wx.hideLoading();
      wx.showToast({ title: e.message || '转换失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  getCanvas () {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select('#toolCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res && res[0] && res[0].node) {
            resolve(res[0].node);
          } else {
            reject(new Error('获取Canvas失败'));
          }
        });
    });
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
      title: '图像工具箱 - 格式转换',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  },

  onShareTimeline () {
    return {
      title: '图像工具箱 - 格式转换',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  }
});