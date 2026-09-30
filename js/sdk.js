// CrazyGames SDK v3 wrapper. Every call is guarded so the game also runs
// standalone (local file, other portals) without the SDK.
'use strict';

const SDK = {
  ready: false,
  env: 'none',
  inAd: false,
  onAdStart: null,
  onAdEnd: null,

  get api() { return (window.CrazyGames && window.CrazyGames.SDK) || null; },

  async init() {
    const api = this.api;
    if (!api) return;
    try {
      await Promise.race([api.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
      this.ready = true;
      this.env = api.environment || 'unknown';
    } catch (e) {
      console.warn('CrazyGames SDK init failed', e);
    }
  },

  _game(fn) {
    if (!this.ready) return;
    try { this.api.game[fn](); } catch (e) { /* ignore */ }
  },
  loadingStart() { this._game('loadingStart'); },
  loadingStop() { this._game('loadingStop'); },
  gameplayStart() { if (!this._playing) { this._playing = true; this._game('gameplayStart'); } },
  gameplayStop() { if (this._playing) { this._playing = false; this._game('gameplayStop'); } },
  happytime() { this._game('happytime'); },

  // Rewarded ad. cb(true) when the reward should be granted.
  rewarded(cb) {
    if (!this.ready || this.env === 'disabled') { cb(true); return; }
    this._ad('rewarded', cb);
  },

  midgame() {
    if (!this.ready || this.env === 'disabled') return;
    this._ad('midgame', () => {});
  },

  _ad(type, cb) {
    if (this.inAd) return;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      this.inAd = false;
      if (this.onAdEnd) this.onAdEnd();
      cb(ok);
    };
    try {
      this.api.ad.requestAd(type, {
        adStarted: () => { this.inAd = true; if (this.onAdStart) this.onAdStart(); },
        adFinished: () => finish(true),
        adError: (err) => { console.warn('ad error', err); finish(false); },
      });
    } catch (e) {
      finish(false);
    }
  },

  // Persistent storage: CrazyGames data module when available (cloud-synced
  // for logged-in players), otherwise localStorage.
  save(key, value) {
    try {
      if (this.ready && this.api.data) { this.api.data.setItem(key, value); return; }
    } catch (e) { /* fall through */ }
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  },
  load(key) {
    try {
      if (this.ready && this.api.data) {
        const v = this.api.data.getItem(key);
        if (v != null) return v;
      }
    } catch (e) { /* fall through */ }
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  remove(key) {
    try { if (this.ready && this.api.data) this.api.data.removeItem(key); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  },
};
