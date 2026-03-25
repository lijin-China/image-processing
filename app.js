App({
  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-7glepz8130849f30', // 请替换为你的云开发环境ID
        traceUser: true
      });
    } else {
      console.warn('请使用 2.2.3 或以上的基础库以使用云能力');
    }
  },
  globalData: {}
});
