const { getSettings } = require('../../../utils/storage.js');
const { runTask, getFileSizeKB } = require('../../../utils/imagePipeline.js');
const { saveToAlbum } = require('../../../utils/export.js');

const ID_PHOTO_SPECS = {
  '1': { width: 295, height: 413, name: '一寸' },
  '2': { width: 413, height: 579, name: '二寸' }
};

Page({
  data: {
    inputPath: '',
    inputSizeKB: 0,
    spec: '1',
    bg: 'white',
    busy: false,
    result: null
  },

  onLoad() {
    const s = getSettings();
    this.setData({
      spec: (s.idSpecIndex || 0) === 1 ? '2' : '1',
      bg: ['white', 'blue', 'red'][s.idBgIndex || 0]
    });
  },

  choose() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const inputPath = res.tempFiles[0].tempFilePath;
        const inputSizeKB = await getFileSizeKB(inputPath);
        this.setData({ inputPath, inputSizeKB, result: null });
      }
    });
  },

  onSpecChange(e) {
    this.setData({ spec: e.currentTarget.dataset.spec });
  },

  onBgChange(e) {
    this.setData({ bg: e.currentTarget.dataset.bg });
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
    wx.showLoading({ title: 'AI抠图中...', mask: true });

    try {
      const canvas = await this.getCanvasNode();
      const spec = ID_PHOTO_SPECS[this.data.spec];

      const r = await runTask({
        type: 'idphoto',
        inputPath: this.data.inputPath,
        outW: spec.width,
        outH: spec.height,
        bgColor: this.data.bg,
        canvas
      });

      wx.hideLoading();

      // 处理抠图结果
      if (r.bgRemoved === false) {
        wx.showModal({
          title: '提示',
          content: r.bgRemoveError || 'AI抠图失败，已生成普通证件照。建议选择背景简单的照片。',
          showCancel: false
        });
      } else {
        wx.showToast({ title: '生成成功', icon: 'success' });
      }

      this.setData({ result: r });
    } catch (e) {
      console.error('证件照生成失败:', e);
      wx.hideLoading();
      wx.showToast({
        title: '处理失败: ' + (e.message || '未知错误'),
        icon: 'none',
        duration: 2500
      });
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

  // 分享到朋友圈
  shareToTimeline() {
    if (!this.data.result || !this.data.result.outputPath) {
      wx.showToast({ title: '请先生成证件照', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList: ['保存图片后去朋友圈发布', '分享给好友'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          await saveToAlbum(this.data.result.outputPath);
          wx.showModal({
            title: '已保存到相册',
            content: '请在微信"发现 → 朋友圈"中选择这张图片发布',
            confirmText: '知道了',
            showCancel: false
          });
        } else if (res.tapIndex === 1) {
          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage']
          });
        }
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '图像工具箱 - 证件照',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  },

  onShareTimeline() {
    return {
      title: '图像工具箱 - 证件照',
      imageUrl: this.data.result?.outputPath || this.data.inputPath
    };
  }
});