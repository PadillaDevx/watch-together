'use strict';

window.PlayerManager = {
  _player: null,
  _ready: false,
  _queue: [],
  _isSyncing: false,
  _lastTime: 0,
  _seekPollInterval: null,
  _containerId: null,

  // Callbacks set by room.js
  onPlay: null,
  onPause: null,
  onSeek: null,

  init: function(containerId) {
    this._containerId = containerId;
    if (!document.getElementById('yt-api-script')) {
      const script = document.createElement('script');
      script.id = 'yt-api-script';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
    window.onYouTubeIframeAPIReady = () => PlayerManager._createPlayer();
  },

  _createPlayer: function() {
    PlayerManager._player = new YT.Player(PlayerManager._containerId, {
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 0, rel: 0, modestbranding: 1, enablejsapi: 1 },
      events: {
        onReady: (e) => PlayerManager._onReady(e),
        onStateChange: (e) => PlayerManager._onStateChange(e)
      }
    });
  },

  _onReady: function(event) {
    this._ready = true;
    this._queue.forEach(fn => fn());
    this._queue = [];
    this._seekPollInterval = setInterval(() => PlayerManager._checkSeek(), 500);
    console.log('[WJ] YouTube player ready');
  },

  _enqueue: function(fn) {
    if (this._ready) {
      fn();
    } else {
      this._queue.push(fn);
    }
  },

  _onStateChange: function(event) {
    if (event.data === YT.PlayerState.PLAYING && !this._isSyncing) {
      if (this.onPlay) this.onPlay(event.target.getCurrentTime());
    } else if (event.data === YT.PlayerState.PAUSED && !this._isSyncing) {
      if (this.onPause) this.onPause(event.target.getCurrentTime());
    }
  },

  _checkSeek: function() {
    if (!this._ready || !this._player) return;
    try {
      const current = this._player.getCurrentTime();
      if (Math.abs(current - this._lastTime) > 1.5 &&
          !this._isSyncing &&
          this._player.getPlayerState() === YT.PlayerState.PAUSED &&
          this.onSeek) {
        this.onSeek(current);
      }
      this._lastTime = current;
    } catch (e) {
      // Player not ready yet
    }
  },

  loadVideo: function(videoId) {
    this._lastTime = 0;
    this._enqueue(() => {
      PlayerManager._player.loadVideoById({ videoId: videoId, startSeconds: 0 });
    });
  },

  play: function(time) {
    this._isSyncing = true;
    this._enqueue(() => {
      PlayerManager._player.seekTo(time, true);
      PlayerManager._player.playVideo();
    });
    setTimeout(() => { PlayerManager._isSyncing = false; }, 400);
  },

  pause: function(time) {
    this._isSyncing = true;
    this._enqueue(() => {
      PlayerManager._player.seekTo(time, true);
      PlayerManager._player.pauseVideo();
    });
    setTimeout(() => { PlayerManager._isSyncing = false; }, 400);
  },

  seekTo: function(time) {
    this._isSyncing = true;
    this._enqueue(() => {
      PlayerManager._player.seekTo(time, true);
    });
    setTimeout(() => { PlayerManager._isSyncing = false; }, 400);
  },

  getCurrentTime: function() {
    if (!this._ready || !this._player) return 0;
    try { return this._player.getCurrentTime(); } catch (e) { return 0; }
  },

  getState: function() {
    if (!this._ready || !this._player) return -1;
    try { return this._player.getPlayerState(); } catch (e) { return -1; }
  },

  extractVideoId: function(input) {
    if (!input || typeof input !== 'string') return null;
    input = input.trim();
    // Try extracting from URL
    const urlMatch = input.match(/(?:youtu\.be\/|[?&]v=)([a-zA-Z0-9_-]{11})/);
    if (urlMatch) return urlMatch[1];
    // Try raw video ID (exactly 11 chars)
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
    return null;
  }
};
