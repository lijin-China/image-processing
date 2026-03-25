const { runTask, getFileSizeKB, FILTER_PRESETS } = require('../../../utils/imagePipeline.js');
const { saveToAlbum, showShareHint } = require('../../../utils/export.js');

Page({
  data: {
    inputPath: '',
    inputSizeKB: 0,
    currentFilter: 'none',
    filters: [
      { key: 'none', name: '原图' },
      { key: 'vintage', name: '复古' },
      { key: 'blackwhite', name: '黑白' },
      { key: 'cold', name: '冷色' },
      { key: 'warm', name: '暖色' },
      { key: 'drama', name: '戏剧' },
      { key: 'fade', name: '褪色' },
      { key: 'vivid', name: '鲜艳' },
      { key: 'mono', name: '单色' },
      { key: 'noir', name: '黑色电影' }
    ],
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
          result: null,
          currentFilter: 'none'
        });
      }
    });
  },

  selectFilter (e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ currentFilter: filter });
  },

  async applyFilter () {
    if (!this.data.inputPath || this.data.busy) return;

    this.setData({ busy: true });
    wx.showLoading({ title: '应用滤镜...' });

    try {
      const canvas = await this.getCanvas();
      const r = await runTask({
        type: 'filter',
        inputPath: this.data.inputPath,
        canvas,
        filter: this.data.currentFilter
      });
      this.setData({ result: r });
      wx.hideLoading();
    } catch (e) {
      console.error('滤镜处理失败:', e);
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
      title: '图像工具箱 - 图片滤镜',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  },

  onShareTimeline () {
    return {
      title: '图像工具箱 - 图片滤镜',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  }
});