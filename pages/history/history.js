// 引入工具函数
const { getHistory, clearHistory } = require('../../utils/storage.js');
const { saveToAlbum } = require('../../utils/export.js');

Page({
  data: {
    items: [],
    groupedItems: []
  },
  onShow () {
    this.reload();
  },
  reload () {
    const items = getHistory();
    const groupedItems = this.getGroupedItems(items);
    this.setData({
      items,
      groupedItems
    });
  },
  getGroupedItems (items) {
    if (!items.length) return [];

    // 按日期分组
    const groups = {};
    items.forEach(item => {
      const date = this.formatDate(item.createdAt);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(item);
    });

    // 转换为数组并按日期降序排序
    return Object.entries(groups)
      .map(([date, items]) => ({ date, items }))
      .sort((a, b) => b.date.localeCompare(a.date));
  },
  goToolbox () {
    wx.switchTab({ url: '/pages/index/index' });
  },
  formatDate (ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  formatTime (ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  preview (e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },
  async save (e) {
    const path = e.currentTarget.dataset.path;
    if (!path) return;
    await saveToAlbum(path);
  },
  confirmClear () {
    wx.showModal({
      title: '清空历史记录？',
      content: '清空后不可恢复（不会删除相册里的图片）',
      confirmText: '清空',
      success: (res) => {
        if (!res.confirm) return;
        clearHistory();
        this.reload();
      }
    });
  }
});