const { runTask, getFileSizeKB } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    inputPath: '',
    inputSizeKB: 0,
    ratio: 'free',
    preset: 'none',
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

  onRatioChange(e) {
    this.setData({ ratio: e.currentTarget.dataset.ratio });
  },

  onPresetChange(e) {
    this.setData({ preset: e.currentTarget.dataset.preset });
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
        type: 'crop',
        inputPath: this.data.inputPath,
        ratio: this.data.ratio,
        preset: this.data.preset,
        canvas
      });
      this.setData({ result: r });
      wx.hideLoading();
    } catch (e) {
      console.error('裁剪失败:', e);
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
      title: '图像工具箱 - 图片裁剪',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  },

  onShareTimeline() {
    return {
      title: '图像工具箱 - 图片裁剪',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  }
});
