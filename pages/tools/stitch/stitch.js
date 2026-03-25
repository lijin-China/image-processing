const { runTask, getFileSizeKB } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    images: [],
    direction: 'vertical',
    gap: 0,
    busy: false,
    result: null,
    resultSizeKB: 0
  },

  async chooseImages () {
    const remaining = 9 - this.data.images.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多选择9张图片', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: remaining,
      sizeType: ['original'],
      sourceType: ['album'],
      success: async (res) => {
        const newImages = [...this.data.images, ...res.tempFilePaths];
        this.setData({
          images: newImages,
          result: null
        });
      }
    });
  },

  removeImage (e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({ images, result: null });
  },

  clearImages () {
    this.setData({ images: [], result: null });
  },

  setDirection (e) {
    this.setData({ direction: e.currentTarget.dataset.direction, result: null });
  },

  onGapChange (e) {
    this.setData({ gap: Number(e.detail.value) || 0 });
  },

  async stitch () {
    if (this.data.images.length < 2 || this.data.busy) return;

    this.setData({ busy: true });
    wx.showLoading({ title: '拼接中...' });

    try {
      // 获取canvas
      const canvas = await this.getCanvas();

      const result = await runTask({
        type: 'stitch',
        canvas,
        images: this.data.images,
        direction: this.data.direction,
        gap: this.data.gap
      });

      this.setData({
        result: { outputPath: result.outputPath },
        resultSizeKB: result.outputSizeKB
      });
      wx.hideLoading();
    } catch (e) {
      console.error('拼接失败:', e);
      wx.hideLoading();
      wx.showToast({ title: e.message || '拼接失败', icon: 'none' });
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

  previewResult () {
    if (this.data.result?.outputPath) {
      wx.previewImage({ urls: [this.data.result.outputPath], current: this.data.result.outputPath });
    }
  },

  async save () {
    if (!this.data.result?.outputPath) return;
    await saveToAlbum(this.data.result.outputPath);
  },

  async share () {
    await showShareHint();
  },

  onShareAppMessage () {
    return {
      title: '图像工具箱 - 图片拼接',
      imageUrl: this.data.result?.outputPath
    };
  },

  onShareTimeline () {
    return {
      title: '图像工具箱 - 图片拼接',
      imageUrl: this.data.result?.outputPath
    };
  }
});