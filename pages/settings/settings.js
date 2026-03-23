const { getSettings, setSettings, DEFAULT_SETTINGS } = require('../../utils/storage.js');

Page({
  data: {
    settings: {
      compress: { quality: 80, targetKB: 200 },
      watermark: { alpha: 35, position: 'br' },
      idphoto: { spec: '1', bg: 'white' }
    }
  },

  onLoad () {
    this.loadSettings();
  },

  loadSettings () {
    const raw = getSettings();
    const settings = {
      compress: {
        quality: raw.quality || DEFAULT_SETTINGS.quality,
        targetKB: raw.targetKB || DEFAULT_SETTINGS.targetKB
      },
      watermark: {
        alpha: raw.watermarkAlpha || DEFAULT_SETTINGS.watermarkAlpha,
        position: raw.watermarkPosition || 'br'
      },
      idphoto: {
        spec: raw.idSpecIndex === 1 ? '2' : '1',
        bg: ['white', 'blue', 'red'][raw.idBgIndex || 0]
      }
    };
    this.setData({ settings });
  },

  saveToStorage () {
    const { settings } = this.data;
    const raw = {
      quality: settings.compress.quality,
      targetKB: settings.compress.targetKB,
      watermarkAlpha: settings.watermark.alpha,
      watermarkPosition: settings.watermark.position,
      idSpecIndex: settings.idphoto.spec === '2' ? 1 : 0,
      idBgIndex: { white: 0, blue: 1, red: 2 }[settings.idphoto.bg] || 0
    };
    setSettings(raw);
  },

  onQualityTouchStart (e) {
    this._qualityStartX = e.touches[0].clientX;
    this._qualityStartVal = this.data.settings.compress.quality;
  },

  onQualityTouchMove (e) {
    if (this._qualityStartX === undefined) return;
    const dx = e.touches[0].clientX - this._qualityStartX;
    const delta = Math.round(dx / 5);
    const v = Math.max(10, Math.min(95, this._qualityStartVal + delta));
    this.setData({ 'settings.compress.quality': v });
  },

  onQualityTouchEnd () {
    this.saveToStorage();
    this._qualityStartX = undefined;
    this._qualityStartVal = undefined;
  },

  onTargetKBTouchStart (e) {
    this._targetKBStartX = e.touches[0].clientX;
    this._targetKBStartVal = this.data.settings.compress.targetKB;
  },

  onTargetKBTouchMove (e) {
    if (this._targetKBStartX === undefined) return;
    const dx = e.touches[0].clientX - this._targetKBStartX;
    const delta = Math.round(dx / 2) * 10;
    const v = Math.max(10, Math.min(1000, this._targetKBStartVal + delta));
    this.setData({ 'settings.compress.targetKB': v });
  },

  onTargetKBTouchEnd () {
    this.saveToStorage();
    this._targetKBStartX = undefined;
    this._targetKBStartVal = undefined;
  },

  onAlphaTouchStart (e) {
    this._alphaStartX = e.touches[0].clientX;
    this._alphaStartVal = this.data.settings.watermark.alpha;
  },

  onAlphaTouchMove (e) {
    if (this._alphaStartX === undefined) return;
    const dx = e.touches[0].clientX - this._alphaStartX;
    const delta = Math.round(dx / 5);
    const v = Math.max(5, Math.min(80, this._alphaStartVal + delta));
    this.setData({ 'settings.watermark.alpha': v });
  },

  onAlphaTouchEnd () {
    this.saveToStorage();
    this._alphaStartX = undefined;
    this._alphaStartVal = undefined;
  },

  onPositionChange (e) {
    this.setData({ 'settings.watermark.position': e.currentTarget.dataset.position });
    this.saveToStorage();
  },

  onSpecChange (e) {
    this.setData({ 'settings.idphoto.spec': e.currentTarget.dataset.spec });
    this.saveToStorage();
  },

  onBgChange (e) {
    this.setData({ 'settings.idphoto.bg': e.currentTarget.dataset.bg });
    this.saveToStorage();
  }
});
