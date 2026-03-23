const KEY_HISTORY = 'img_toolbox_history_v1';
const KEY_SETTINGS = 'img_toolbox_settings_v1';

const DEFAULT_SETTINGS = {
  compressModeIndex: 0,
  quality: 80,
  targetKB: 200,
  watermarkText: '© 图像工具箱',
  watermarkAlpha: 35,
  idSpecIndex: 0,
  idBgIndex: 0
};

function getSettings () {
  try {
    const settings = wx.getStorageSync(KEY_SETTINGS) || {};
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function setSettings (settings) {
  try {
    wx.setStorageSync(KEY_SETTINGS, settings || {});
  } catch (e) { }
}

function getHistory () {
  try {
    const list = wx.getStorageSync(KEY_HISTORY) || [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function pushHistory (entry) {
  const list = getHistory();
  list.unshift(entry);
  const trimmed = list.slice(0, 100);
  try {
    wx.setStorageSync(KEY_HISTORY, trimmed);
  } catch (e) { }
  return trimmed;
}

function clearHistory () {
  try {
    wx.removeStorageSync(KEY_HISTORY);
  } catch (e) { }
}

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  setSettings,
  getHistory,
  pushHistory,
  clearHistory
};
