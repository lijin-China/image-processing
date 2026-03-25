const { runTask, getFileSizeKB } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    inputPath: '',
    inputSizeKB: 0,
    blockSize: 20,
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
        this.setData({
          inputPath,
          inputSizeKB,
          result: null
        });
      }
    });
  },

  onBlockSizeChange (e) {
    this.setData({ blockSize: Number(e.detail.value) });
  },

  onBlockSizeTouchStart (e) {
    this._blockStartX = e.touches[0].clientX;
    this._blockStartVal = this.data.blockSize;
  },

  onBlockSizeTouchMove (e) {
    if (this._blockStartX === undefined) return;
    const dx = e.touches[0].clientX - this._blockStartX;
    const delta = Math.round(dx / 3);
    const v = Math.max(5, Math.min(50, this._blockStartVal + delta));
    this.setData({ blockSize: v });
  },

  onBlockSizeTouchEnd () {
    this._blockStartX = undefined;
    this._blockStartVal = undefined;
  },

  async apply () {
    if (!this.data.inputPath || this.data.busy) return;

    this.setData({ busy: true });
    wx.showLoading({ title: '处理中...' });

    try {
      const canvas = await this.getCanvas();
      const r = await runTask({
        type: 'mosaic',
        inputPath: this.data.inputPath,
        canvas,
        blockSize: this.data.blockSize
      });
      this.setData({ result: r });
      wx.hideLoading();
    } catch (e) {
      console.error('马赛克处理失败:', e);
      wx.hideLoading();
      wx.showToast({ title: e.message || '处理失败', icon: 'none' });
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
      title: '图像工具箱 - 马赛克',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  },

  onShareTimeline () {
    return {
      title: '图像工具箱 - 马赛克',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  }
});