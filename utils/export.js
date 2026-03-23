function showToast (title, icon = 'none') {
  wx.showToast({ title, icon });
}

async function saveToAlbum (filePath) {
  if (!filePath) {
    showToast('文件路径为空');
    return false;
  }

  try {
    await wx.authorize({ scope: 'scope.writePhotosAlbum' });
  } catch (e) {
    // 用户可能已拒绝授权，继续尝试保存
  }

  try {
    await wx.saveImageToPhotosAlbum({ filePath });
    showToast('已保存到相册', 'success');
    return true;
  } catch (e) {
    const errMsg = String(e.errMsg || '');
    if (errMsg.includes('authorize') || errMsg.includes('auth deny')) {
      wx.showModal({
        title: '需要相册权限',
        content: '请在设置中开启"保存到相册"权限后重试',
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({});
          }
        }
      });
    } else {
      showToast('保存失败');
    }
    return false;
  }
}

async function showShareHint () {
  try {
    await wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
    showToast('请点击右上角分享');
  } catch (e) {
    showToast('分享失败');
  }
}

module.exports = {
  showToast,
  saveToAlbum,
  showShareHint
};
