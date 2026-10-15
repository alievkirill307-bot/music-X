const NO_COVER = '/Music.svg';

function dedup(arr) {
  var seen = {};
  return arr.filter(function(t) {
    var key = (t.artist || '').toLowerCase().trim() + '|||' + (t.title || '').toLowerCase().trim();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

let tracks = [];
let currentTrackIndex = -1;
let currentTrackList = [];
let loopEnabled = false;
let trackLoopEnabled = false;
let currentPage = 'search';
let currentPlayingTrack = null;
let currentFavorites = [];
let currentFavArtists = [];
let navHistory = [];
let listenSent = false;
let currentViewMode = 'list';
let listenPlayStart = 0;
let currentContext = '';

let newPage = 1;
let newPagesCount = 1;
let genrePage = 1;
let genrePagesCount = 1;
let currentGenre = '';

window._sectionTracks = {};

const $ = id => document.getElementById(id);
const statusEl = $('status');
const searchResults = $('searchResults');
const artistResults = $('artistResults');
const homeSections = $('homeSections');
const playerBar = $('playerBar');
const player = $('player');
const playerCover = $('playerCover');
const playerTitle = $('playerTitle');
const playerArtist = $('playerArtist');
const btnPlayPause = $('btnPlayPause');
const iconPlay = $('iconPlay');
const iconPause = $('iconPause');
const btnPrev = $('btnPrev');
const btnNext = $('btnNext');
const progressBar = $('progressBar');
const progressFill = $('progressFill');
const progressBarMobile = $('progressBarMobile');
const progressFillMobile = $('progressFillMobile');
const playerTime = $('playerTime');
const playerDuration = $('playerDuration');
const btnLoop = $('btnLoop');
const btnTrackLoop = $('btnTrackLoop');
const btnCachePlayer = $('btnCachePlayer');

function showStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'var(--red)' : '';
}
function hideStatus() { statusEl.textContent = ''; }

function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function fmtDur(sec) {
  if (!sec) return '';
  var m = Math.floor(sec / 60);
  var s = String(Math.floor(sec % 60)).padStart(2, '0');
  return m + ':' + s;
}

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function makeDur(info) {
  var sec = 0;
  if (info.durationSec) {
    sec = Number(info.durationSec);
    if (sec > 3600) sec = Math.round(sec / 1000);
  } else if (info.duration) {
    var d = String(info.duration).trim();
    if (d.indexOf(':') !== -1) {
      var p = d.split(':').map(Number);
      sec = (p.length === 3 ? p[0] * 3600 : 0) + (p.length >= 2 ? p[1] * 60 : 0) + (p[2] || 0);
    } else {
      sec = parseInt(d) || 0;
      if (sec > 3600) sec = Math.round(sec / 1000);
    }
  }
  if (sec > 3600) sec = 0;
  return sec;
}

function trackId(t) { return t.id || (t.title + '_' + t.artist); }

function findPlayableTrack(list, start, dir) {
  var offline = !navigator.onLine;
  var len = list.length;
  if (len === 0) return -1;
  for (var tries = 0; tries < len; tries++) {
    start = (start + dir + len) % len;
    var t = list[start];
    if (offline && !t.localPath) continue;
    if (offline || t.localPath || t.mp3 || t.streamingHash) return start;
  }
  return -1;
}

function sectionIcon(icon) {
  var s = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">';
  if (icon === 'new') return s + '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
  if (icon === 'hit') return s + '<path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>';
  if (icon === 'rock') return s + '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  if (icon === 'rap') return s + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  if (icon === 'pop') return s + '<path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  if (icon === 'electro') return s + '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  if (icon === 'dance') return s + '<circle cx="12" cy="4" r="2"/><path d="M12 6v4l-3 5"/><path d="M12 10l3 5"/><path d="M9 21l3-5 3 5"/></svg>';
  return s + '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
}

function heartSvg(filled) {
  if (filled) return '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
}

function switchPage(page) {
  closeSidebar();
  if (currentPage !== page) navHistory.push(currentPage);
  if (navHistory.length > 20) navHistory.shift();
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.toggle('active', n.dataset.page === page); });
  document.querySelectorAll('.page').forEach(function(p) { p.classList.add('hidden'); });
  var el = $('page-' + page);
  if (el) el.classList.remove('hidden');

  var searchBar = $('searchBar');
  if (searchBar) searchBar.style.display = (page === 'search') ? '' : 'none';

  var backBtn = $('btnBack');
  if (backBtn) backBtn.classList.toggle('hidden', navHistory.length === 0);

  if (page === 'search') { renderHome(); }
  if (page === 'new') loadNew();
  if (page === 'genres') loadGenres();
  if (page === 'cache') loadCache();
  if (page === 'favorites') loadFavorites();
  if (page === 'fav-artists') loadFavArtists();
  if (page === 'playlists') loadPlaylists();
  if (page === 'recommended') loadRecommended();
  if (page === 'settings') loadSettings();
}

function goBack() {
  if (navHistory.length === 0) {
    var backBtn = $('btnBack');
    if (backBtn) backBtn.classList.add('hidden');
    renderHome();
    return;
  }
  var prev = navHistory.pop();
  currentPage = prev;
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.toggle('active', n.dataset.page === prev); });
  document.querySelectorAll('.page').forEach(function(p) { p.classList.add('hidden'); });
  var el = $('page-' + prev);
  if (el) el.classList.remove('hidden');
  var searchBar = $('searchBar');
  if (searchBar) searchBar.style.display = (prev === 'search') ? '' : 'none';
  var backBtn = $('btnBack');
  if (backBtn) backBtn.classList.toggle('hidden', navHistory.length === 0);
  if (prev === 'search') renderHome();
  if (prev === 'new') loadNew();
  if (prev === 'genres') loadGenres();
  if (prev === 'cache') loadCache();
  if (prev === 'favorites') loadFavorites();
  if (prev === 'fav-artists') loadFavArtists();
  if (prev === 'playlists') loadPlaylists();
  if (prev === 'recommended') loadRecommended();
  if (prev === 'settings') loadSettings();
}

function renderHome() {
  if (homeSections.children.length > 0) return;
  loadHome();
}

async function loadHome() {
  showStatus('Loading...');
  try {
    var r = await fetch('/api/sections');
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }
    hideStatus();
    homeSections.innerHTML = '';
    var sections = data.sections || [];
    sections.forEach(function(section) {
      var tracks = (section.tracks || []).filter(function(t) { return t.streamingHash || t.mp3; });
      if (tracks.length === 0) return;
      window._sectionTracks[section.id] = tracks;

      var sec = document.createElement('div');
      sec.className = 'home-section';

      var icon = sectionIcon(section.icon);

      var header = document.createElement('div');
      header.className = 'section-header';
      header.innerHTML = '<span class="section-icon">' + icon + '</span><span class="section-title">' + esc(section.title) + '</span>';
      sec.appendChild(header);

      var scrollWrap = document.createElement('div');
      scrollWrap.className = 'section-scroll-wrap';

      var prevBtn = document.createElement('button');
      prevBtn.className = 'carousel-btn carousel-prev';
      prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>';
      scrollWrap.appendChild(prevBtn);

      var scroll = document.createElement('div');
      scroll.className = 'section-scroll';
      scrollWrap.appendChild(scroll);

      var nextBtn = document.createElement('button');
      nextBtn.className = 'carousel-btn carousel-next';
      nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><polyline points="9 18 15 12 9 6"/></svg>';
      scrollWrap.appendChild(nextBtn);

      prevBtn.onclick = function() { scroll.scrollBy({ left: -320, behavior: 'smooth' }); };
      nextBtn.onclick = function() { scroll.scrollBy({ left: 320, behavior: 'smooth' }); };

      function updateCarouselBtns() {
        prevBtn.style.display = scroll.scrollLeft <= 10 ? 'none' : '';
        nextBtn.style.display = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 10 ? 'none' : '';
      }
      scroll.addEventListener('scroll', updateCarouselBtns);
      setTimeout(updateCarouselBtns, 100);

      tracks.forEach(function(track, i) {
        scroll.appendChild(renderHTrack(track, i, section.id));
      });

      sec.appendChild(scrollWrap);
      homeSections.appendChild(sec);
    });
    if (sections.length === 0) showStatus('No content available');
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

function renderHTrack(track, index, sectionId) {
  var card = document.createElement('div');
  card.className = 'h-track';
  card.onclick = function() { listenSectionTrack(sectionId, index); };

  var cover = track.cover || NO_COVER;

  card.innerHTML =
    '<img class="h-track-cover" src="' + esc(cover) + '" alt="" onerror="this.onerror=null;this.src=\'' + NO_COVER + '\'">' +
    '<div class="h-track-title">' + esc(track.title) + '</div>' +
    '<div class="h-track-artist">' + esc(track.artist) + '</div>' +
    '<button class="h-track-play" onclick="event.stopPropagation();listenSectionTrack(\'' + sectionId + '\',' + index + ')">&#9654;</button>';

  return card;
}

async function listenSectionTrack(sectionId, index) {
  var list = window._sectionTracks[sectionId];
  if (!list || !list[index]) return;
  var track = list[index];
  currentTrackList = list;

  if (track.localPath) { playAudio(track.localPath, track, index); return; }
  if (track.mp3) { playAudio('/api/proxy?url=' + encodeURIComponent(track.mp3), track, index); return; }

  if (!track.streamingHash) { showStatus('No stream available for this track', true); return; }

  showStatus('Loading...');
  try {
    var r = await fetch('/api/stream-url?hash=' + encodeURIComponent(track.streamingHash));
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }
    playAudio(data.url, track, index);
    currentTrackIndex = index;
    hideStatus();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function searchTracks(query) {
  if (!query.trim()) {
    homeSections.classList.remove('hidden');
    searchResults.classList.add('hidden');
    artistResults.classList.add('hidden');
    artistResults.innerHTML = '';
    searchResults.innerHTML = '';
    renderHome();
    return;
  }
  showStatus('Searching...');
  searchResults.innerHTML = '';
  artistResults.innerHTML = '';
  artistResults.classList.add('hidden');
  searchResults.classList.remove('hidden');
  homeSections.classList.add('hidden');

  try {
    var r = await fetch('/api/search?q=' + encodeURIComponent(query));
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }

    var artists = data.artists || [];
    tracks = (data.tracks || []).filter(function(t) { return t.streamingHash || t.mp3; });

    if (artists.length === 0 && tracks.length === 0) { showStatus('Nothing found'); return; }
    hideStatus();

    if (artists.length > 0) {
      artistResults.classList.remove('hidden');
      artistResults.innerHTML = artists.map(function(a) {
        var img = a.image || NO_COVER;
        var isFav = currentFavArtists.indexOf(a.id) !== -1;
        var onclick = a.source === 'hitmo'
          ? "loadHitmoArtist('" + esc(a.id) + "', '" + esc(a.name).replace(/'/g, "\\'") + "', '" + esc(img).replace(/'/g, "\\'") + "')"
          : a.source === 'muzofond'
          ? "loadMuzofondArtist('" + esc(a.id) + "', '" + esc(a.name).replace(/'/g, "\\'") + "', '" + esc(img).replace(/'/g, "\\'") + "')"
          : "loadArtist('" + esc(a.id) + "', '" + esc(a.name).replace(/'/g, "\\'") + "', '" + esc(img).replace(/'/g, "\\'") + "')";
        return '<div class="artist-card" onclick="' + onclick + '" style="position:relative">' +
          '<img src="' + esc(img) + '" alt="" onerror="this.onerror=null;this.src=\'' + NO_COVER + '\'">' +
          '<div class="artist-name">' + esc(a.name) + '</div>' +
          '<button class="track-icon-btn artist-fav-btn" onclick="event.stopPropagation();toggleFavArtist(\'' + esc(a.id).replace(/'/g, "\\'") + '\',\'' + esc(a.name).replace(/'/g, "\\'") + '\',\'' + esc(img).replace(/'/g, "\\'") + '\',\'' + esc(a.source || '') + '\')" title="Favorite artist">' + heartSvg(isFav) + '</button></div>';
      }).join('');
    }

    if (tracks.length > 0) renderTracks(searchResults, tracks, 'search');
  } catch (e) { showStatus('Network error: ' + e.message, true); }
}

function artistFavBtnHtml(id, name, image, source) {
  var isFav = currentFavArtists.indexOf(id) !== -1;
  return '<button class="track-icon-btn artist-fav-btn" onclick="event.stopPropagation();toggleFavArtist(\'' + esc(id).replace(/'/g, "\\'") + '\',\'' + esc(name).replace(/'/g, "\\'") + '\',\'' + esc(image || '').replace(/'/g, "\\'") + '\',\'' + esc(source) + '\')" title="' + (isFav ? 'Remove from favorites' : 'Add to favorites') + '">' + heartSvg(isFav) + '</button>';
}

function closeArtistPage() {
  var backBtn = $('btnBack');
  if (backBtn) backBtn.classList.add('hidden');
  artistResults.classList.add('hidden');
  searchResults.classList.remove('hidden');
  renderHome();
}

function showArtistClose() {
  var backBtn = $('btnBack');
  if (backBtn) backBtn.classList.remove('hidden');
}

async function loadArtist(id, name, image) {
  showStatus('Loading...');
  searchResults.innerHTML = '';
  artistResults.innerHTML = '';
  artistResults.classList.add('hidden');
  searchResults.classList.remove('hidden');
  try {
    var r = await fetch('/api/artist?id=' + id);
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }
    tracks = (data.tracks || []).filter(function(t) { return t.streamingHash; });
    if (tracks.length === 0) { showStatus('No tracks found'); return; }
    hideStatus();
    var header = '<div class="artist-page-header"><button class="artist-close-btn" onclick="closeArtistPage()" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><h2 class="page-heading">' + esc(name) + '</h2>' + artistFavBtnHtml(id, name, image || NO_COVER, 'zaycev') + '</div>';
    searchResults.innerHTML = header;
    renderTracks(searchResults, tracks, 'search');
    showArtistClose();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function loadHitmoArtist(id, name, image) {
  showStatus('Loading...');
  searchResults.innerHTML = '';
  artistResults.innerHTML = '';
  artistResults.classList.add('hidden');
  searchResults.classList.remove('hidden');
  try {
    var r = await fetch('/api/hitmo-artist?id=' + id);
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }
    tracks = (data.tracks || []).filter(function(t) { return t.mp3; });
    if (tracks.length === 0) { showStatus('No tracks found'); return; }
    hideStatus();
    var header = '<div class="artist-page-header"><button class="artist-close-btn" onclick="closeArtistPage()" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><h2 class="page-heading">' + esc(name) + '</h2>' + artistFavBtnHtml(id, name, image || NO_COVER, 'hitmo') + '</div>';
    searchResults.innerHTML = header;
    renderTracks(searchResults, tracks, 'search');
    showArtistClose();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function loadMuzofondArtist(id, name, image) {
  showStatus('Loading...');
  searchResults.innerHTML = '';
  artistResults.innerHTML = '';
  artistResults.classList.add('hidden');
  searchResults.classList.remove('hidden');
  try {
    var url = '/api/muzofond-artist?name=' + encodeURIComponent(name);
    var r = await fetch(url);
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }
    var allTracks = data.tracks || [];
    tracks = allTracks.filter(function(t) { return t.mp3 || t.streamingHash; });
    if (tracks.length === 0) { showStatus((localStorage.getItem('lang') || 'en') === 'ru' ? 'Треки не найдены' : 'No tracks found'); return; }
    hideStatus();
    var header = '<div class="artist-page-header"><button class="artist-close-btn" onclick="closeArtistPage()" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><h2 class="page-heading">' + esc(name) + ' <span style="font-size:14px;color:var(--text-muted)">' + tracks.length + ' ' + ((localStorage.getItem('lang') || 'en') === 'ru' ? 'треков' : 'tracks') + '</span></h2>' + artistFavBtnHtml(id, name, image || NO_COVER, 'muzofond') + '</div>';
    searchResults.innerHTML = header;
    renderTracks(searchResults, tracks, 'search');
    showArtistClose();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

function renderTracks(container, list, context) {
  container.innerHTML = '';
  var isTiles = currentViewMode === 'tiles';
  var isCache = context === 'cache';
  list.forEach(function(track, i) {
    var card = document.createElement('div');
    var playing = currentPlayingTrack && trackId(track) === trackId(currentPlayingTrack);
    card.className = (isTiles ? 'track-tile' : 'track-card') + (playing ? ' playing' : '');
    var cover = track.cover || NO_COVER;
    var favId = trackId(track);
    var isFav = currentFavorites.indexOf(favId) !== -1;

    var deleteSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    var downloadSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    var plusSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

    if (isTiles) {
      card.innerHTML =
        '<div class="track-tile-cover">' +
          '<img src="' + esc(cover) + '" alt="" onerror="this.onerror=null;this.src=\'' + NO_COVER + '\'">' +
          '<button class="track-tile-play" onclick="event.stopPropagation();listenTrack(' + i + ',\'' + context + '\')">&#9654;</button>' +
        '</div>' +
        '<div class="track-tile-info">' +
          '<div class="track-tile-title">' + esc(track.title) + '</div>' +
          '<div class="track-tile-artist">' + esc(track.artist) + '</div>' +
        '</div>' +
        '<div class="track-tile-actions">' +
          '<button class="track-icon-btn fav-btn" onclick="event.stopPropagation();toggleFavorite(\'' + esc(track.title).replace(/'/g, "\\'") + '\',\'' + esc(track.artist).replace(/'/g, "\\'") + '\',\'' + context + '\',' + i + ')" title="Favorite">' + heartSvg(isFav) + '</button>' +
          '<button class="track-icon-btn" onclick="event.stopPropagation();showAddToPlaylistForTrack(' + i + ',\'' + context + '\')" title="Add to playlist">' + plusSvg + '</button>' +
          (isCache
            ? '<button class="track-icon-btn" onclick="event.stopPropagation();deleteCache(' + i + ')" title="Delete">' + deleteSvg + '</button>'
            : '<button class="track-icon-btn" onclick="event.stopPropagation();downloadTrack(' + i + ',\'' + context + '\')" title="Download">' + downloadSvg + '</button>') +
        '</div>';
    } else {
      card.innerHTML =
        '<img class="track-cover" src="' + esc(cover) + '" alt="" onerror="this.onerror=null;this.src=\'' + NO_COVER + '\'">' +
        '<div class="track-info">' +
          '<div class="track-title">' + esc(track.title) + '</div>' +
          '<div class="track-artist">' + esc(track.artist) + '</div>' +
          (track.localPath ? '<span class="track-badge">Downloaded</span>' : '') +
        '</div>' +
        '<div class="track-actions">' +
          '<button class="track-icon-btn fav-btn" onclick="event.stopPropagation();toggleFavorite(\'' + esc(track.title).replace(/'/g, "\\'") + '\',\'' + esc(track.artist).replace(/'/g, "\\'") + '\',\'' + context + '\',' + i + ')" title="Favorite">' + heartSvg(isFav) + '</button>' +
          '<button class="track-icon-btn" onclick="event.stopPropagation();showAddToPlaylistForTrack(' + i + ',\'' + context + '\')" title="Add to playlist">' + plusSvg + '</button>' +
          (isCache
            ? '<button class="track-icon-btn" onclick="event.stopPropagation();deleteCache(' + i + ')" title="Delete">' + deleteSvg + '</button>'
            : '<button class="track-icon-btn" onclick="event.stopPropagation();downloadTrack(' + i + ',\'' + context + '\')" title="Download">' + downloadSvg + '</button>') +
        '</div>';
    }

    card.style.cursor = 'pointer';
    card.onclick = function(e) {
      if (e.target.closest('.track-actions') || e.target.closest('.track-tile-actions') || e.target.closest('.track-tile-play')) return;
      listenTrack(i, context);
    };
    container.appendChild(card);
  });
}

function getTrackList(context) {
  if (context === 'search') return tracks;
  if (context === 'new') return window._newTracks || [];
  if (context === 'genre') return window._genreTracks || [];
  if (context === 'cache') return window._cacheTracks || [];
  if (context === 'favorites') return window._favTracks || [];
  if (context === 'recommended') return window._recTracks || [];
  if (context === 'playlist') return window._playlistTracks || [];
  if (context === 'fav-artist') return window._favArtistTracks || [];
  if (context && context.indexOf('section_') === 0) return window._sectionTracks[context] || [];
  return tracks;
}

function findContext(list) {
  if (list === tracks) return 'search';
  if (list === (window._newTracks || [])) return 'new';
  if (list === (window._genreTracks || [])) return 'genre';
  if (list === (window._favTracks || [])) return 'favorites';
  if (list === (window._recTracks || [])) return 'recommended';
  if (list === (window._playlistTracks || [])) return 'playlist';
  if (list === window._favArtistTracks) return 'fav-artist';
  var sectionKeys = Object.keys(window._sectionTracks);
  for (var i = 0; i < sectionKeys.length; i++) {
    if (list === window._sectionTracks[sectionKeys[i]]) return 'section_' + sectionKeys[i];
  }
  return 'search';
}

async function listenTrack(index, context) {
  var list = getTrackList(context);
  var track = list[index];
  if (!track) return;
  currentTrackList = list;
  currentContext = context;

  if (track.localPath) { playAudio(track.localPath, track, index); return; }
  if (!navigator.onLine) { showStatus('No cached version — connect to internet', true); return; }
  if (track.mp3) { playAudio('/api/proxy?url=' + encodeURIComponent(track.mp3), track, index); return; }

  if (!track.streamingHash) { showStatus('No stream available for this track', true); return; }

  showStatus('Loading...');
  try {
    var r = await fetch('/api/stream-url?hash=' + encodeURIComponent(track.streamingHash));
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }
    playAudio(data.url, track, index);
    currentTrackIndex = index;
    hideStatus();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

function playAudio(src, track, index) {
  player.src = src;
  player.play().catch(function(e) { console.error('Playback error:', e.message); });
  playerCover.src = track.cover || NO_COVER;
  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist;
  playerBar.classList.remove('hidden');
  currentTrackIndex = index;
  currentPlayingTrack = track;
  iconPlay.classList.add('hidden');
  iconPause.classList.remove('hidden');
  highlightPlaying();
  updatePlayerFavBtn();
  syncMobilePlayer(track);
  listenSent = false;
  listenPlayStart = Date.now();
  progressFill.style.width = '0%';
  progressFillMobile.style.width = '0%';
  playerTime.textContent = '0:00';
  playerDuration.textContent = '0:00';
  try { localStorage.setItem('lastTrack', JSON.stringify({ title: track.title, artist: track.artist, cover: track.cover || '', source: track.source || currentContext, context: currentContext })); } catch(e) {}
}

function highlightPlaying() {
  document.querySelectorAll('.track-card').forEach(function(c) { c.classList.remove('playing'); });
  document.querySelectorAll('.h-track').forEach(function(c) { c.classList.remove('playing'); });
  if (!currentPlayingTrack) return;
  document.querySelectorAll('.track-list').forEach(function(container) {
    container.querySelectorAll('.track-card').forEach(function(card) {
      var title = card.querySelector('.track-title');
      var artist = card.querySelector('.track-artist');
      if (title && artist && title.textContent === currentPlayingTrack.title && artist.textContent === currentPlayingTrack.artist) {
        card.classList.add('playing');
      }
    });
  });
  document.querySelectorAll('.section-scroll').forEach(function(scroll) {
    scroll.querySelectorAll('.h-track').forEach(function(card) {
      var title = card.querySelector('.h-track-title');
      var artist = card.querySelector('.h-track-artist');
      if (title && artist && title.textContent === currentPlayingTrack.title && artist.textContent === currentPlayingTrack.artist) {
        card.classList.add('playing');
      }
    });
  });
}

btnPlayPause.addEventListener('click', function() {
  if (!player.src) return;
  player.paused ? player.play() : player.pause();
});
player.addEventListener('play', function() {
  iconPlay.classList.add('hidden');
  iconPause.classList.remove('hidden');
  syncMobilePlayPause(true);
});
player.addEventListener('pause', function() {
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  syncMobilePlayPause(false);
});

function updateProgress() {
  if (player.duration && isFinite(player.duration)) {
    var pct = (player.currentTime / player.duration * 100);
    progressFill.style.width = pct + '%';
    progressFillMobile.style.width = pct + '%';
    playerTime.textContent = fmtTime(player.currentTime);
    playerDuration.textContent = fmtTime(player.duration);
    syncMobileProgress(pct, player.currentTime, player.duration);
    if (!listenSent && currentPlayingTrack && player.currentTime >= 30) {
      listenSent = true;
      fetch('/api/history/listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: currentPlayingTrack.title, artist: currentPlayingTrack.artist })
      }).catch(function() {});
    }
  }
  requestAnimationFrame(updateProgress);
}
requestAnimationFrame(updateProgress);

function seekTo(e, bar) {
  if (!player.duration) return;
  var pct = Math.max(0, Math.min(1, (e.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth));
  player.currentTime = pct * player.duration;
}

progressBar.addEventListener('click', function(e) { seekTo(e, progressBar); });
var isDrag = false;
progressBar.addEventListener('mousedown', function(e) { isDrag = true; seekTo(e, progressBar); });
document.addEventListener('mousemove', function(e) { if (isDrag) seekTo(e, progressBar); });
document.addEventListener('mouseup', function() { isDrag = false; });

btnPrev.addEventListener('click', function() {
  if (currentTrackList.length === 0 || currentTrackIndex < 0) return;
  var prev = findPlayableTrack(currentTrackList, currentTrackIndex, -1);
  if (prev !== -1) listenTrack(prev, currentContext);
});
btnNext.addEventListener('click', function() {
  if (currentTrackList.length === 0 || currentTrackIndex < 0) return;
  var next = findPlayableTrack(currentTrackList, currentTrackIndex, 1);
  if (next !== -1) listenTrack(next, currentContext);
});
const volumeBar = $('volumeBar');
const volumeFill = $('volumeFill');
const volumeThumb = $('volumeThumb');
let savedVolume = 0.8;
let isMuted = false;

function setVolumeUI(vol) {
  var pct = Math.round(vol * 100);
  volumeFill.style.width = pct + '%';
  volumeThumb.style.left = pct + '%';
  if (vol === 0) {
    iconVol.classList.add('hidden'); iconMute.classList.remove('hidden');
  } else {
    iconVol.classList.remove('hidden'); iconMute.classList.add('hidden');
  }
}

function applyVolume(vol) {
  player.volume = vol;
  setVolumeUI(vol);
  isMuted = vol === 0;
  try { localStorage.setItem('volume', vol); } catch(e) {}
}

function toggleMute() {
  if (isMuted) { applyVolume(savedVolume || 0.8); isMuted = false; }
  else { savedVolume = player.volume; applyVolume(0); isMuted = true; }
}

function setVolumeFromBar(e) {
  var rect = volumeBar.getBoundingClientRect();
  var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  applyVolume(pct);
  if (pct > 0) savedVolume = pct;
}

volumeBar.addEventListener('click', function(e) { setVolumeFromBar(e); });
var isVolDrag = false;
volumeBar.addEventListener('mousedown', function(e) { isVolDrag = true; setVolumeFromBar(e); });
document.addEventListener('mousemove', function(e) { if (isVolDrag) setVolumeFromBar(e); });
document.addEventListener('mouseup', function() { isVolDrag = false; });

applyVolume(0.8);

btnLoop.addEventListener('click', function() {
  loopEnabled = !loopEnabled;
  btnLoop.classList.toggle('loop-active', loopEnabled);
  $('mpfLoop').classList.toggle('loop-active', loopEnabled);
});

btnTrackLoop.addEventListener('click', function() {
  trackLoopEnabled = !trackLoopEnabled;
  btnTrackLoop.classList.toggle('loop-active', trackLoopEnabled);
  $('mpfTrackLoop').classList.toggle('loop-active', trackLoopEnabled);
});

player.addEventListener('ended', function() {
  if (currentTrackList.length === 0 || currentTrackIndex < 0) return;
  if (trackLoopEnabled) { listenTrack(currentTrackIndex, currentContext); return; }
  var next = findPlayableTrack(currentTrackList, currentTrackIndex, 1);
  if (next !== -1) {
    listenTrack(next, currentContext);
  } else if (loopEnabled) {
    var first = findPlayableTrack(currentTrackList, -1, 1);
    if (first !== -1) listenTrack(first, currentContext);
  }
});

btnCachePlayer.addEventListener('click', async function() {
  if (!currentPlayingTrack) return;
  var t = currentPlayingTrack;
  if (t.localPath) { showStatus('Already downloaded'); return; }
  showStatus('Downloading...');

  var downloadUrl = '';
  if (t.mp3) downloadUrl = t.mp3;
  else if (t.downloadHash) {
    try { var r = await fetch('/api/stream-url?hash=' + encodeURIComponent(t.downloadHash)); var d = await r.json(); downloadUrl = d.url || ''; } catch(e) {}
  }
  if (!downloadUrl && t.streamingHash) {
    try { var r2 = await fetch('/api/stream-url?hash=' + encodeURIComponent(t.streamingHash)); var d2 = await r2.json(); downloadUrl = d2.url || ''; } catch(e) {}
  }
  if (!downloadUrl) { showStatus('Cannot download this track', true); return; }

  try {
    var params = new URLSearchParams({ url: downloadUrl, title: t.title, artist: t.artist, source: t.source || '' });
    var r3 = await fetch('/api/download?' + params);
    var d3 = await r3.json();
    if (d3.error) { showStatus('Error: ' + d3.error, true); return; }
    t.localPath = d3.localPath;
    showStatus(d3.cached ? 'Already downloaded' : 'Downloaded: ' + t.artist + ' - ' + t.title);
  } catch (e) { showStatus('Error: ' + e.message, true); }
});

async function downloadTrack(index, context) {
  var list = getTrackList(context);
  var track = list[index];
  if (!track) return;

  if (track.localPath) {
    var a = document.createElement('a');
    a.href = track.localPath;
    a.download = (track.artist + ' - ' + track.title) + '.mp3';
    a.click();
    return;
  }

  showStatus('Downloading: ' + track.artist + ' - ' + track.title + '...');

  var downloadUrl = '';
  if (track.mp3) downloadUrl = track.mp3;
  else if (track.downloadHash) {
    try { var r = await fetch('/api/stream-url?hash=' + encodeURIComponent(track.downloadHash)); var d = await r.json(); downloadUrl = d.url || ''; } catch(e) {}
  }
  if (!downloadUrl && track.streamingHash) {
    try { var r2 = await fetch('/api/stream-url?hash=' + encodeURIComponent(track.streamingHash)); var d2 = await r2.json(); downloadUrl = d2.url || ''; } catch(e) {}
  }
  if (!downloadUrl) { showStatus('Cannot download this track', true); return; }

  try {
    var params = new URLSearchParams({ url: downloadUrl, title: track.title, artist: track.artist, source: track.source || '' });
    var r3 = await fetch('/api/download?' + params);
    var d3 = await r3.json();
    if (d3.error) { showStatus('Error: ' + d3.error, true); return; }
    track.localPath = d3.localPath;
    showStatus(d3.cached ? 'Already downloaded' : 'Downloaded');
    var active = document.querySelector('.content .track-list');
    if (active) renderTracks(active, list, context);
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function loadNew(page) {
  if (page !== undefined) newPage = page;
  showStatus('Loading...');
  try {
    var r = await fetch('/api/new?page=' + newPage);
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }
    window._newTracks = data.tracks.filter(function(t) { return t.streamingHash || t.mp3; });
    newPagesCount = data.pagesCount || 1;
    hideStatus();
    renderTracks($('newList'), window._newTracks, 'new');
    renderPager('new', newPage, newPagesCount);
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

var GENRES_DATA = [];
async function loadGenres() {
  if (GENRES_DATA.length === 0) {
    var r = await fetch('/api/genres');
    var data = await r.json();
    GENRES_DATA.push.apply(GENRES_DATA, data.genres || []);
  }
  $('genreGrid').classList.remove('hidden');
  $('genreTracks').classList.add('hidden');
  var grid = $('genreGrid');
  if (grid.children.length === 0) {
    grid.innerHTML = GENRES_DATA.map(function(g) {
      return '<div class="genre-card" onclick="loadGenreTracks(\'' + g.url + '\', \'' + esc(g.name) + '\')">' +
        '<img src="' + g.image + '" alt="" loading="lazy">' +
        '<div class="genre-name">' + esc(g.name) + '</div></div>';
    }).join('');
  }
}

async function loadGenreTracks(genre, name, page) {
  if (page !== undefined) genrePage = page; else genrePage = 1;
  currentGenre = genre;
  $('genreGrid').classList.add('hidden');
  $('genreTracks').classList.remove('hidden');
  $('genreTitle').textContent = name;
  showStatus('Loading...');
  try {
    var r = await fetch('/api/genre-tracks?genre=' + genre + '&page=' + genrePage);
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }
    window._genreTracks = data.tracks.filter(function(t) { return t.streamingHash || t.mp3; });
    genrePagesCount = data.pagesCount || 1;
    hideStatus();
    renderTracks($('genreTrackList'), window._genreTracks, 'genre');
    renderPager('genre', genrePage, genrePagesCount);
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

$('genreBack').addEventListener('click', function() {
  $('genreGrid').classList.remove('hidden');
  $('genreTracks').classList.add('hidden');
});

function renderPager(type, page, pages) {
  var pager = $(type === 'new' ? 'newPager' : 'genrePager');
  var info = $(type === 'new' ? 'newPageInfo' : 'genrePageInfo');
  var prev = $(type === 'new' ? 'newPrev' : 'genrePrev');
  var next = $(type === 'new' ? 'newNext' : 'genreNext');
  if (pages <= 1) { pager.classList.add('hidden'); return; }
  pager.classList.remove('hidden');
  info.textContent = page + ' / ' + pages;
  prev.disabled = page <= 1;
  next.disabled = page >= pages;
}

$('newPrev').addEventListener('click', function() { loadNew(newPage - 1); });
$('newNext').addEventListener('click', function() { loadNew(newPage + 1); });
$('genrePrev').addEventListener('click', function() { loadGenreTracks(currentGenre, $('genreTitle').textContent, genrePage - 1); });
$('genreNext').addEventListener('click', function() { loadGenreTracks(currentGenre, $('genreTitle').textContent, genrePage + 1); });

async function loadCache() {
  showStatus('Loading...');
  $('cacheList').innerHTML = '';
  try {
    var r = await fetch('/api/cache-list');
    var data = await r.json();
    var files = data.files || [];
    if (files.length === 0) { $('cacheEmpty').classList.remove('hidden'); $('cacheList').innerHTML = ''; hideStatus(); return; }
    $('cacheEmpty').classList.add('hidden');
    hideStatus();

    window._cacheTracks = files.map(function(f) {
      var name = f.fileName.replace('.mp3', '');
      var parts = name.split('_');
      var artist = parts.length > 1 ? parts[0] : 'Unknown';
      var title = parts.length > 1 ? parts.slice(1).join('_') : name;
      return { title: title.replace(/_/g, ' '), artist: artist.replace(/_/g, ' '), cover: null, localPath: f.localPath, _fileName: f.fileName };
    });

    renderTracks($('cacheList'), window._cacheTracks, 'cache');
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function deleteCache(index) {
  var track = (window._cacheTracks || [])[index];
  if (!track) return;
  try {
    var r = await fetch('/api/cache-delete?file=' + encodeURIComponent(track._fileName), { method: 'DELETE' });
    var data = await r.json();
    if (data.success) { showStatus('Deleted'); loadCache(); }
    else showStatus('Error', true);
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function loadFavorites() {
  try {
    var r = await fetch('/api/favorites');
    var data = await r.json();
    currentFavorites = (data.favorites || []).map(function(f) { return f.trackId; });
    window._favTracks = (data.favorites || []).map(function(f) {
      return { title: f.title, artist: f.artist, cover: f.cover || null, id: f.trackId,
        streamingHash: f.streamingHash || '', downloadHash: f.downloadHash || '', mp3: f.mp3 || '',
        source: f.source || '', duration: f.duration || '', durationSec: f.durationSec || 0 };
    });
    $('favoritesList').innerHTML = '';
    if (window._favTracks.length === 0) {
      $('favoritesEmpty').classList.remove('hidden');
      $('favoritesList').classList.add('hidden');
    } else {
      $('favoritesEmpty').classList.add('hidden');
      $('favoritesList').classList.remove('hidden');
      renderTracks($('favoritesList'), window._favTracks, 'favorites');
    }
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function toggleFavorite(title, artist, context, index) {
  var id = title + '_' + artist;
  var idx = currentFavorites.indexOf(id);
  try {
    if (idx !== -1) {
      await fetch('/api/favorites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: id }) });
      currentFavorites.splice(idx, 1);
    } else {
      var list = getTrackList(context);
      var track = list[index];
      var cover = track ? (track.cover || null) : null;
      await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        trackId: id, title: title, artist: artist, cover: cover,
        duration: track ? (track.duration || '') : '',
        durationSec: track ? makeDur(track) : 0,
        streamingHash: track ? (track.streamingHash || '') : '',
        downloadHash: track ? (track.downloadHash || '') : '',
        mp3: track ? (track.mp3 || '') : '',
        source: track ? (track.source || '') : ''
      }) });
      currentFavorites.push(id);
    }
    if (currentPage === 'favorites') loadFavorites();
    else refreshFavBtns();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

function refreshFavBtns() {
  document.querySelectorAll('.fav-btn').forEach(function(btn) {
    var trackTitle = btn.closest('.track-card').querySelector('.track-title').textContent;
    var trackArtist = btn.closest('.track-card').querySelector('.track-artist').textContent;
    var id = trackTitle + '_' + trackArtist;
    var isFav = currentFavorites.indexOf(id) !== -1;
    btn.innerHTML = heartSvg(isFav);
  });
}

async function toggleFavoriteCurrent() {
  if (!currentPlayingTrack) return;
  var t = currentPlayingTrack;
  var id = trackId(t);
  var idx = currentFavorites.indexOf(id);
  try {
    if (idx !== -1) {
      await fetch('/api/favorites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: id }) });
      currentFavorites.splice(idx, 1);
    } else {
      await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: id, title: t.title, artist: t.artist, cover: t.cover || null,
        duration: t.duration || '', durationSec: makeDur(t), streamingHash: t.streamingHash || '', downloadHash: t.downloadHash || '', mp3: t.mp3 || '', source: t.source || '' }) });
      currentFavorites.push(id);
    }
    updatePlayerFavBtn();
    if (currentPage === 'favorites') loadFavorites();
  } catch (e) {}
}

function updatePlayerFavBtn() {
  var iconFav = $('iconFav');
  if (!iconFav || !currentPlayingTrack) return;
  var id = trackId(currentPlayingTrack);
  var isFav = currentFavorites.indexOf(id) !== -1;
  if (isFav) {
    iconFav.setAttribute('fill', 'var(--red)');
    iconFav.setAttribute('stroke', 'var(--red)');
  } else {
    iconFav.setAttribute('fill', 'none');
    iconFav.setAttribute('stroke', 'currentColor');
  }
  syncMobilePlayerFav();
}

async function loadFavArtists() {
  try {
    var r = await fetch('/api/favorite-artists');
    var data = await r.json();
    currentFavArtists = (data.artists || []).map(function(a) { return a.artistId; });
    window._favArtistsData = data.artists || [];
    $('favArtistsGrid').innerHTML = '';
    $('favArtistsList').classList.add('hidden');
    $('favArtistsGrid').classList.remove('hidden');
    var playAllBtn = $('btnPlayAllMyArtists');
    if (playAllBtn) playAllBtn.style.display = window._favArtistsData.length > 0 ? '' : 'none';
    if (window._favArtistsData.length === 0) {
      $('favArtistsEmpty').classList.remove('hidden');
      $('favArtistsGrid').classList.add('hidden');
    } else {
      $('favArtistsEmpty').classList.add('hidden');
      window._favArtistsData.forEach(function(a) {
        var card = document.createElement('div');
        card.className = 'artist-card';
        card.style.position = 'relative';
        var img = a.image || NO_COVER;
        var onclick = a.source === 'hitmo'
          ? "openFavArtistPage('" + esc(a.artistId) + "', '" + esc(a.name) + "', 'hitmo')"
          : a.source === 'muzofond'
          ? "openFavArtistPage('" + esc(a.artistId) + "', '" + esc(a.name) + "', 'muzofond')"
          : "openFavArtistPage('" + esc(a.artistId) + "', '" + esc(a.name) + "', 'zaycev')";
        card.onclick = function(e) { if (!e.target.closest('.artist-fav-btn')) eval(onclick); };
        card.innerHTML =
          '<img src="' + esc(img) + '" alt="" onerror="this.onerror=null;this.src=\'' + NO_COVER + '\'">' +
          '<div class="artist-name">' + esc(a.name) + '</div>' +
          '<button class="track-icon-btn artist-fav-btn" onclick="event.stopPropagation();toggleFavArtist(\'' + esc(a.artistId).replace(/'/g, "\\'") + '\',\'' + esc(a.name).replace(/'/g, "\\'") + '\',\'' + esc(img).replace(/'/g, "\\'") + '\',\'' + esc(a.source) + '\')" title="Remove from favorites">' +
            heartSvg(true) +
          '</button>';
        $('favArtistsGrid').appendChild(card);
      });
    }
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function toggleFavArtist(artistId, name, image, source) {
  var idx = currentFavArtists.indexOf(artistId);
  try {
    if (idx !== -1) {
      await fetch('/api/favorite-artists', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artistId: artistId }) });
      currentFavArtists.splice(idx, 1);
    } else {
      await fetch('/api/favorite-artists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artistId: artistId, name: name, image: image || '', source: source || '' }) });
      currentFavArtists.push(artistId);
    }
    if (currentPage === 'fav-artists') loadFavArtists();
    refreshFavArtistBtns();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

function refreshFavArtistBtns() {
  document.querySelectorAll('.artist-fav-btn').forEach(function(btn) {
    var onclick = btn.getAttribute('onclick') || '';
    var match = onclick.match(/toggleFavArtist\('([^']+)'/);
    if (!match) return;
    var artistId = match[1];
    var isFav = currentFavArtists.indexOf(artistId) !== -1;
    btn.innerHTML = heartSvg(isFav);
    btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  });
}

async function openFavArtistPage(artistId, name, source) {
  $('favArtistsGrid').classList.add('hidden');
  $('favArtistsList').classList.remove('hidden');
  $('favArtistsEmpty').classList.add('hidden');

  $('favArtistsList').innerHTML = '<button class="back-btn" onclick="loadFavArtists()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg> Back</button><div class="artist-page-header"><h2 class="page-heading">' + esc(name) + '</h2>' + artistFavBtnHtml(artistId, name, '', source) + '</div><button class="play-all-btn" onclick="playFavArtistAll()">&#9654; Play All</button><div id="favArtistTracks" class="track-list"></div>';

  showStatus('Loading...');
  try {
    var endpoint = source === 'hitmo' ? '/api/hitmo-artist?id=' + artistId
      : source === 'muzofond' ? '/api/muzofond-artist?name=' + encodeURIComponent(name)
      : '/api/artist?id=' + artistId;
    var r = await fetch(endpoint);
    var data = await r.json();
    if (data.error) { showStatus('Error: ' + data.error, true); return; }
    var artistTracks = (data.tracks || []).filter(function(t) { return t.streamingHash || t.mp3; });
    if (artistTracks.length === 0) { showStatus((localStorage.getItem('lang') || 'en') === 'ru' ? 'Треки не найдены' : 'No tracks found'); return; }
    hideStatus();
    window._favArtistTracks = artistTracks;
    renderTracks($('favArtistTracks'), artistTracks, 'fav-artist');
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

function playFavArtistAll() {
  var list = window._favArtistTracks || [];
  if (list.length === 0) return;
  listenTrack(0, 'fav-artist');
}

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

async function playAllMyArtists() {
  var artists = window._favArtistsData || [];
  if (artists.length === 0) return;
  showStatus('Loading all artists...');
  try {
    var allTracks = [];
    var results = await Promise.all(artists.map(function(a) {
      var endpoint = a.source === 'hitmo' ? '/api/hitmo-artist?id=' + a.artistId
        : a.source === 'muzofond' ? '/api/muzofond-artist?name=' + encodeURIComponent(a.name)
        : '/api/artist?id=' + a.artistId;
      return fetch(endpoint).then(function(r) { return r.json(); }).catch(function() { return { tracks: [] }; });
    }));
    results.forEach(function(d) { if (d.tracks) allTracks = allTracks.concat(d.tracks); });
    allTracks = dedup(allTracks);
    allTracks = shuffle(allTracks);
    if (allTracks.length === 0) { showStatus('No tracks found', true); return; }
    hideStatus();
    window._favArtistTracks = allTracks;
    $('favArtistsGrid').classList.add('hidden');
    $('favArtistsList').classList.remove('hidden');
    $('favArtistsList').innerHTML = '<button class="back-btn" onclick="loadFavArtists()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg> Back</button><h2 class="page-heading">All My Artists (' + allTracks.length + ' tracks)</h2><button class="play-all-btn" onclick="playFavArtistAll()">&#9654; Play All</button><div id="favArtistTracks" class="track-list"></div>';
    renderTracks($('favArtistTracks'), allTracks, 'fav-artist');
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function loadPlaylists() {
  try {
    var r = await fetch('/api/playlists');
    var data = await r.json();
    window._playlists = data.playlists || [];
    $('playlistsGrid').innerHTML = '';
    $('playlistDetail').classList.add('hidden');
    $('playlistsGrid').classList.remove('hidden');
    if (window._playlists.length === 0) {
      $('playlistsEmpty').classList.remove('hidden');
      $('playlistsGrid').classList.add('hidden');
    } else {
      $('playlistsEmpty').classList.add('hidden');
      $('playlistsGrid').classList.remove('hidden');
      window._playlists.forEach(function(pl) {
        var card = document.createElement('div');
        card.className = 'playlist-card';
        card.onclick = function() { openPlaylist(pl.id, pl.name); };
        var count = pl.track_count || 0;
        card.innerHTML =
          '<div class="playlist-cover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>' +
          '<div class="playlist-name">' + esc(pl.name) + '</div>' +
          '<div class="playlist-count">' + count + ' track' + (count !== 1 ? 's' : '') + '</div>';
        $('playlistsGrid').appendChild(card);
      });
    }
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function openPlaylist(id, name) {
  $('playlistsGrid').classList.add('hidden');
  $('playlistDetail').classList.remove('hidden');
  $('playlistDetailTitle').textContent = name;
  window._currentPlaylistId = id;
  try {
    var r = await fetch('/api/playlists/' + id);
    var data = await r.json();
    window._playlistTracks = (data.tracks || []).map(function(t) {
      return { title: t.title, artist: t.artist, cover: t.cover || null, id: t.trackId,
        streamingHash: t.streamingHash || '', downloadHash: t.downloadHash || '', mp3: t.mp3 || '',
        source: t.source || '', duration: t.duration || '', durationSec: t.durationSec || 0 };
    });
    var trackCount = window._playlistTracks.length;
    var detailHeader = $('playlistDetail').querySelector('.playlist-detail-header');
    var existingActions = detailHeader.querySelector('.playlist-detail-actions');
    if (existingActions) existingActions.remove();
    if (trackCount > 0) {
      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'playlist-detail-actions';
      actionsDiv.innerHTML = '<button class="play-all-btn" onclick="playPlaylistAll()">&#9654; Play All <span class="play-all-count">(' + trackCount + ')</span></button>';
      detailHeader.appendChild(actionsDiv);
    }
    $('playlistTrackList').innerHTML = '';
    if (trackCount === 0) {
      $('playlistTrackList').innerHTML = '<div class="empty-state"><p>Playlist is empty</p></div>';
    } else {
      renderTracks($('playlistTrackList'), window._playlistTracks, 'playlist');
      document.querySelectorAll('#playlistTrackList .track-actions').forEach(function(actions, i) {
        var remBtn = document.createElement('button');
        remBtn.className = 'track-icon-btn';
        remBtn.title = 'Remove';
        remBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        remBtn.onclick = function() { removeFromPlaylist(i); };
        actions.appendChild(remBtn);
      });
    }
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

function playPlaylistAll() {
  if (!window._playlistTracks || window._playlistTracks.length === 0) return;
  listenTrack(0, 'playlist');
}

function showPlaylistsGrid() {
  loadPlaylists();
}

async function createPlaylist() {
  var name = prompt('Playlist name:');
  if (!name || !name.trim()) return;
  try {
    await fetch('/api/playlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
    loadPlaylists();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function removeFromPlaylist(index) {
  var track = (window._playlistTracks || [])[index];
  if (!track || !window._currentPlaylistId) return;
  try {
    await fetch('/api/playlists/' + window._currentPlaylistId + '/tracks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: trackId(track) }) });
    openPlaylist(window._currentPlaylistId, $('playlistDetailTitle').textContent);
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function deleteCurrentPlaylist() {
  if (!window._currentPlaylistId) return;
  if (!confirm('Delete this playlist?')) return;
  try {
    await fetch('/api/playlists/' + window._currentPlaylistId, { method: 'DELETE' });
    loadPlaylists();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

function showAddToPlaylist() {
  if (!currentPlayingTrack) return;
  var t = currentPlayingTrack;
  var id = trackId(t);
  showAddToPlaylistModal(t, id);
}

function showAddToPlaylistForTrack(index, context) {
  var list = getTrackList(context);
  var track = list[index];
  if (!track) return;
  var id = trackId(track);
  showAddToPlaylistModal(track, id);
}

async function showAddToPlaylistModal(track, trackIdVal) {
  var r = await fetch('/api/playlists');
  var data = await r.json();
  var playlists = data.playlists || [];
  var body = $('modalBody');
  $('modalTitle').textContent = 'Add to playlist';
  body.innerHTML = '';
  if (playlists.length === 0) {
    body.innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center;">No playlists. Create one first.</div>';
  } else {
    playlists.forEach(function(pl) {
      var item = document.createElement('div');
      item.className = 'modal-item';
      item.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg><span>' + esc(pl.name) + '</span>';
      item.onclick = function() { addToPlaylist(pl.id, pl.name, trackIdVal, track); };
      body.appendChild(item);
    });
  }
  $('modal').classList.remove('hidden');
}

async function addToPlaylist(playlistId, playlistName, trackIdVal, track) {
  try {
    await fetch('/api/playlists/' + playlistId + '/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      trackId: trackIdVal, title: track.title, artist: track.artist, cover: track.cover || null,
      duration: track.duration || '', durationSec: makeDur(track), streamingHash: track.streamingHash || '',
      downloadHash: track.downloadHash || '', mp3: track.mp3 || '', source: track.source || ''
    }) });
    closeModal();
    showStatus('Added to ' + playlistName);
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

function closeModal() { $('modal').classList.add('hidden'); }

async function loadRecommended() {
  showStatus('Loading...');
  try {
    var r = await fetch('/api/recommended');
    var data = await r.json();
    window._recTracks = (data.tracks || []).filter(function(t) { return t.streamingHash || t.mp3; });
    var basedOn = data.basedOn || [];
    $('recommendedList').innerHTML = '';
    if (window._recTracks.length === 0) {
      $('recommendedEmpty').classList.remove('hidden');
      $('recommendedList').classList.add('hidden');
    } else {
      $('recommendedEmpty').classList.add('hidden');
      $('recommendedList').classList.remove('hidden');
      if (basedOn.length > 0) {
        var hint = document.createElement('div');
        hint.className = 'rec-hint';
        hint.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>' + esc('Based on: ' + basedOn.join(', ')) + '</span>';
        $('recommendedList').appendChild(hint);
      }
      renderTracks($('recommendedList'), window._recTracks, 'recommended');
    }
    hideStatus();
  } catch (e) { showStatus('Error: ' + e.message, true); }
}

async function loadSettings() {
  try {
    var r = await fetch('/api/settings');
    var data = await r.json();
    var settings = data.settings || {};
    var theme = settings.theme || 'dark';
    var lang = settings.lang || 'en';
    var autoCache = settings.autoCache === 'true';
    var logs = settings.logsEnabled !== 'false';
    var viewMode = settings.viewMode || 'list';
    setThemeUI(theme);
    setLangUI(lang);
    $('autoCacheToggle').checked = autoCache;
    $('logsToggle').checked = logs;
    setViewModeUI(viewMode);
  } catch (e) {}
}

async function setTheme(theme) {
  setThemeUI(theme);
  try { await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'theme', value: theme }) }); } catch(e) {}
}

function setViewModeUI(mode) {
  currentViewMode = mode;
  $('viewList').classList.toggle('active', mode === 'list');
  $('viewTiles').classList.toggle('active', mode === 'tiles');
  document.body.classList.toggle('tiles-view', mode === 'tiles');
  localStorage.setItem('viewMode', mode);
}

async function setViewMode(mode) {
  setViewModeUI(mode);
  try { await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'viewMode', value: mode }) }); } catch(e) {}
}

function setThemeUI(theme) {
  document.body.classList.toggle('light', theme === 'light');
  $('themeDark').classList.toggle('active', theme === 'dark');
  $('themeLight').classList.toggle('active', theme === 'light');
  localStorage.setItem('theme', theme);
}

async function setLang(lang) {
  setLangUI(lang);
  applyI18n(lang);
  try { await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'lang', value: lang }) }); } catch(e) {}
}

function setLangUI(lang) {
  $('langEn').classList.toggle('active', lang === 'en');
  $('langRu').classList.toggle('active', lang === 'ru');
  localStorage.setItem('lang', lang);
}

async function toggleAutoCache() {
  var on = $('autoCacheToggle').checked;
  try { await fetch('/api/auto-cache-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on }) }); } catch(e) {}
}

async function toggleLogs() {
  var on = $('logsToggle').checked;
  try { await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'logsEnabled', value: on ? 'true' : 'false' }) }); } catch(e) {}
}

var I18N = {
  en: {
    nav_search: 'Search', nav_new: 'New Music', nav_genres: 'Genres', nav_recommended: 'For You',
    nav_library: 'Library',     nav_favorites: 'Favorites', nav_playlists: 'Playlists', nav_downloads: 'Downloads', nav_settings: 'Settings',
    nav_fav_artists: 'Artists',
    downloads: 'Downloads', favorites: 'Favorites', playlists: 'Playlists', recommended: 'You Might Like', settings: 'Settings',
    empty_downloads: 'No downloads yet', empty_favorites: 'No favorites yet', empty_favorites_hint: 'Tap the heart on any track',
    empty_fav_artists: 'No favorite artists yet', empty_fav_artists_hint: 'Tap the heart on any artist',
    empty_playlists: 'No playlists yet', empty_playlists_hint: 'Create your first playlist',
    empty_recommended: 'Listen to more music', empty_recommended_hint: 'We will suggest tracks based on your taste',
    new_playlist: 'New Playlist', back: 'Back', fav_artists: 'Favorite Artists', play_all_my_artists: 'Play All My Artists',
    settings_appearance: 'Appearance', settings_theme: 'Theme', theme_dark: 'Dark', theme_light: 'Light',
    settings_view: 'Track list view', view_list: 'List', view_tiles: 'Tiles',
    settings_language: 'Language', settings_lang: 'Interface language',
    settings_storage: 'Storage', settings_autocache: 'Auto-cache listened tracks',
    settings_advanced: 'Advanced', settings_logs: 'Write logs'
  },
  ru: {
    nav_search: 'Поиск', nav_new: 'Новая музыка', nav_genres: 'Жанры', nav_recommended: 'Для тебя',
    nav_library: 'Библиотека',     nav_favorites: 'Избранное', nav_playlists: 'Плейлисты', nav_downloads: 'Загрузки', nav_settings: 'Настройки',
    nav_fav_artists: 'Исполнители',
    downloads: 'Загрузки', favorites: 'Избранное', playlists: 'Плейлисты', recommended: 'Вам понравится', settings: 'Настройки',
    empty_downloads: 'Пока ничего не загружено', empty_favorites: 'Пока ничего нет', empty_favorites_hint: 'Нажмите сердечко на любом треке',
    empty_fav_artists: 'Пока нет любимых исполнителей', empty_fav_artists_hint: 'Нажмите сердечко на любом артисте',
    empty_playlists: 'Пока нет плейлистов', empty_playlists_hint: 'Создайте свой первый плейлист',
    empty_recommended: 'Слушайте больше музыки', empty_recommended_hint: 'Мы подберём треки по вашему вкусу',
    new_playlist: 'Новый плейлист', back: 'Назад', fav_artists: 'Любимые исполнители', play_all_my_artists: 'Вся музыка моих артистов',
    settings_appearance: 'Внешний вид', settings_theme: 'Тема', theme_dark: 'Тёмная', theme_light: 'Светлая',
    settings_view: 'Вид списка треков', view_list: 'Список', view_tiles: 'Плитки',
    settings_language: 'Язык', settings_lang: 'Язык интерфейса',
    settings_storage: 'Хранилище', settings_autocache: 'Автосохранение прослушанных треков',
    settings_advanced: 'Дополнительно', settings_logs: 'Запись логов'
  }
};

function applyI18n(lang) {
  var dict = I18N[lang] || I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
}

function doSearch() {
  var val = document.getElementById('searchInput').value.trim();
  if (val) searchTracks(val);
  switchPage('search');
}

document.querySelector('.topbar-search input').addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); hideSuggestions(); doSearch(); } if (e.key === 'Escape') { hideSuggestions(); } });
document.getElementById('searchInput').focus();

var _suggestTimer = null;
var searchInput = document.getElementById('searchInput');
var searchSuggestions = document.getElementById('searchSuggestions');

searchInput.addEventListener('input', function() {
  clearTimeout(_suggestTimer);
  var q = searchInput.value.trim();
  if (q.length < 2) { hideSuggestions(); return; }
  _suggestTimer = setTimeout(function() { fetchSuggestions(q); }, 300);
});

searchInput.addEventListener('focus', function() {
  var q = searchInput.value.trim();
  if (q.length >= 2 && searchSuggestions.children.length > 0) searchSuggestions.classList.remove('hidden');
});

document.addEventListener('click', function(e) {
  if (!e.target.closest('.topbar-search')) hideSuggestions();
});

function hideSuggestions() { searchSuggestions.classList.add('hidden'); }

async function fetchSuggestions(q) {
  try {
    var r = await fetch('/api/search-suggest?q=' + encodeURIComponent(q));
    var data = await r.json();
    var items = data.suggestions || [];
    if (items.length === 0) { hideSuggestions(); return; }
    searchSuggestions.innerHTML = items.map(function(s) {
      var icon = s.type === 'artist'
        ? '<svg class="search-suggestion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>'
        : '<svg class="search-suggestion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>';
      var _lang = localStorage.getItem('lang') || 'en';
      var typeLabel = s.type === 'artist'
        ? (_lang === 'ru' ? 'Артист' : 'Artist')
        : (_lang === 'ru' ? 'Трек' : 'Track');
      return '<div class="search-suggestion" onclick="selectSuggestion(\'' + esc(s.text).replace(/'/g, "\\'") + '\')">' + icon + '<span>' + esc(s.text) + '</span><span class="search-suggestion-type">' + typeLabel + '</span></div>';
    }).join('');
    searchSuggestions.classList.remove('hidden');
  } catch(e) {}
}

function selectSuggestion(text) {
  searchInput.value = text;
  hideSuggestions();
  doSearch();
}

function startVoiceSearch() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showStatus('Web Speech API not supported. Use Chrome or Edge.', true);
    return;
  }
  var recognition = new SR();
  var _rlang = localStorage.getItem('lang') || 'en';
  recognition.lang = _rlang === 'ru' ? 'ru-RU' : 'en-US';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = true;

  var btn = $('btnVoice');
  if (btn.classList.contains('listening')) {
    recognition.stop();
    btn.classList.remove('listening');
    hideStatus();
    return;
  }

  btn.classList.add('listening');
  showStatus(_rlang === 'ru' ? 'Говорите... Нажмите кнопку ещё раз для остановки' : 'Listening... Click button again to stop');

  recognition.onresult = function(event) {
    var text = '';
    for (var i = 0; i < event.results.length; i++) {
      text += event.results[i][0].transcript;
    }
    searchInput.value = text;
  };
  recognition.onerror = function(e) {
    btn.classList.remove('listening');
    if (e.error === 'not-allowed') {
      showStatus(_rlang === 'ru' ? 'Разрешите доступ к микрофону' : 'Allow microphone access', true);
    } else if (e.error !== 'aborted') {
      hideStatus();
    }
  };
  recognition.onend = function() {
    btn.classList.remove('listening');
    hideStatus();
  };
  recognition.start();
}

var savedTheme = localStorage.getItem('theme') || 'dark';
setThemeUI(savedTheme);
var savedLang = localStorage.getItem('lang') || 'en';
setLangUI(savedLang);
applyI18n(savedLang);
var savedView = localStorage.getItem('viewMode') || 'list';
setViewModeUI(savedView);
loadFavorites().then(function() { updatePlayerFavBtn(); });
loadFavArtists();
loadHome();
try {
  var lastVol = localStorage.getItem('volume');
  if (lastVol !== null) { var v = parseFloat(lastVol); if (!isNaN(v)) { applyVolume(v); } }
} catch(e) {}
try {
  var lastTrack = JSON.parse(localStorage.getItem('lastTrack'));
  if (lastTrack && lastTrack.title) {
    playerTitle.textContent = lastTrack.title;
    playerArtist.textContent = lastTrack.artist;
    playerCover.src = lastTrack.cover || NO_COVER;
    playerBar.classList.remove('hidden');
    currentPlayingTrack = { title: lastTrack.title, artist: lastTrack.artist, cover: lastTrack.cover, source: lastTrack.source, context: lastTrack.context };
    syncMobilePlayer(currentPlayingTrack);
  }
} catch(e) {}
console.log('MusicX loaded');

document.addEventListener('wheel', function(e) {
  var el = e.target;
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains('section-scroll')) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
      return;
    }
    el = el.parentElement;
  }
}, { passive: false, capture: true });

var debugVisible = false;
var debugPanel = document.getElementById('debugPanel');
var debugLog = document.getElementById('debugLog');

function toggleDebug() {
  debugVisible = !debugVisible;
  debugPanel.classList.toggle('hidden', !debugVisible);
}

function clearDebug() { debugLog.innerHTML = ''; }

function addDebugEntry(type, args) {
  var entry = document.createElement('div');
  entry.className = 'debug-entry ' + type;
  var time = new Date().toLocaleTimeString('en-US', { hour12: false });
  var text = Array.from(args).map(function(a) { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }).join(' ');
  entry.innerHTML = '<span class="debug-time">' + time + '</span>' + text;
  debugLog.appendChild(entry);
  debugLog.scrollTop = debugLog.scrollHeight;
}

(function() {
  var origLog = console.log;
  var origWarn = console.warn;
  var origError = console.error;
  console.log = function() { origLog.apply(console, arguments); addDebugEntry('log', arguments); };
  console.warn = function() { origWarn.apply(console, arguments); addDebugEntry('warn', arguments); };
  console.error = function() { origError.apply(console, arguments); addDebugEntry('error', arguments); };
  window.addEventListener('error', function(e) { addDebugEntry('error', [e.message + ' (' + e.filename + ':' + e.lineno + ')']); });
})();

document.addEventListener('keydown', function(e) {
  if (e.key === '`' && !e.ctrlKey && !e.altKey && !e.metaKey && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    toggleDebug();
  }
});

/* ===== MOBILE SIDEBAR ===== */
function toggleSidebar() {
  var sidebar = document.querySelector('.sidebar');
  var overlay = $('mobileOverlay');
  var isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeSidebar() {
  var sidebar = document.querySelector('.sidebar');
  var overlay = $('mobileOverlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

/* ===== MOBILE EXPANDED PLAYER ===== */
function openMobilePlayer() {
  var mpf = $('mobilePlayerFull');
  if (!mpf) return;
  syncMobilePlayerFull();
  mpf.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobilePlayer() {
  var mpf = $('mobilePlayerFull');
  if (!mpf) return;
  mpf.classList.remove('active');
  document.body.style.overflow = '';
}

/* Close expanded player by clicking backdrop */
$('mobilePlayerFull').addEventListener('click', function(e) {
  if (e.target === this) closeMobilePlayer();
});

/* Close expanded player by ESC */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var mpf = $('mobilePlayerFull');
    if (mpf && mpf.classList.contains('active')) {
      e.preventDefault();
      closeMobilePlayer();
      return;
    }
    closeSidebar();
  }
});

function syncMobilePlayer(track) {
  $('mpfCover').src = track.cover || NO_COVER;
  $('mpfTitle').textContent = track.title;
  $('mpfArtist').textContent = track.artist;
  syncMobilePlayerFav();
}

function syncMobilePlayPause(isPlaying) {
  $('mpfIconPlay').classList.toggle('hidden', isPlaying);
  $('mpfIconPause').classList.toggle('hidden', !isPlaying);
}

function syncMobileProgress(pct, cur, dur) {
  $('mpfProgressFill').style.width = pct + '%';
  $('mpfTime').textContent = fmtTime(cur);
  $('mpfDuration').textContent = fmtTime(dur);
}

function syncMobilePlayerFav() {
  if (!currentPlayingTrack) return;
  var isFav = currentFavorites.some(function(f) {
    return f.title === currentPlayingTrack.title && f.artist === currentPlayingTrack.artist;
  });
  $('mpfIconFav').setAttribute('fill', isFav ? 'currentColor' : 'none');
  $('mpfFav').classList.toggle('mpf-fav-active', isFav);
}

function syncMobilePlayerFull() {
  if (!currentPlayingTrack) return;
  syncMobilePlayer(currentPlayingTrack);
  var isPlaying = !player.paused;
  syncMobilePlayPause(isPlaying);
  if (player.duration && isFinite(player.duration)) {
    var pct = (player.currentTime / player.duration * 100);
    syncMobileProgress(pct, player.currentTime, player.duration);
  }
  $('mpfLoop').classList.toggle('loop-active', loopEnabled);
  $('mpfTrackLoop').classList.toggle('trackLoopEnabled', trackLoopEnabled);
}

function seekMobilePlayer(e) {
  if (!player.duration) return;
  var bar = $('mpfProgressBar');
  var pct = Math.max(0, Math.min(1, (e.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth));
  player.currentTime = pct * player.duration;
}

function togglePlay() {
  if (!player.src) return;
  player.paused ? player.play() : player.pause();
}

function playNext() {
  if (currentTrackList.length === 0 || currentTrackIndex < 0) return;
  var next = findPlayableTrack(currentTrackList, currentTrackIndex, 1);
  if (next !== -1) listenTrack(next, currentContext);
}

function playPrev() {
  if (currentTrackList.length === 0 || currentTrackIndex < 0) return;
  var prev = findPlayableTrack(currentTrackList, currentTrackIndex, -1);
  if (prev !== -1) listenTrack(prev, currentContext);
}

function toggleLoop() {
  loopEnabled = !loopEnabled;
  btnLoop.classList.toggle('loop-active', loopEnabled);
  $('mpfLoop').classList.toggle('loop-active', loopEnabled);
}

function toggleTrackLoop() {
  trackLoopEnabled = !trackLoopEnabled;
  btnTrackLoop.classList.toggle('loop-active', trackLoopEnabled);
  $('mpfTrackLoop').classList.toggle('loop-active', trackLoopEnabled);
}

/* Player click on mini player — opens expanded view */
var playerCoverEl = document.getElementById('playerCover');
var playerMetaEl = document.querySelector('.player-meta');
[playerCoverEl, playerMetaEl].forEach(function(el) {
  if (el) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      openMobilePlayer();
    });
  }
});
