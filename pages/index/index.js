Page({
  data: {
  },

  onLoad () {

  },

  navigateToTool (e) {
    const tool = e.currentTarget.dataset.tool;
    const toolMap = {
      'compress': '/pages/tools/compress/compress',
      'edit': '/pages/tools/edit/edit',
      'watermark': '/pages/tools/watermark/watermark',
      'idphoto': '/pages/tools/idphoto/idphoto',
      'batch': '/pages/tools/batch/batch',
      'crop': '/pages/tools/crop/crop',
      'rotate': '/pages/tools/rotate/rotate',
      'adjust': '/pages/tools/adjust/adjust',
      'filter': '/pages/tools/filter/filter',
      'mosaic': '/pages/tools/mosaic/mosaic',
      'stitch': '/pages/tools/stitch/stitch',
      'convert': '/pages/tools/convert/convert'
    };

    const url = toolMap[tool];
    if (url) {
      wx.navigateTo({
        url: url
      });
    }
  },

  onShareAppMessage () {
    return {
      title: '图像工具箱',
      imageUrl: '/static/logo.png'
    }
  },

  onShareTimeline () {
    return {
      title: '图像工具箱',
      imageUrl: '/static/logo.png'
    }
  }
})
