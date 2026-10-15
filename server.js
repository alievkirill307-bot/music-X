const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
} catch(e) {
  console.error('Config not found or invalid, using defaults');
}

const app = express();
const PORT = config.port || 3000;
const CACHE_DIR = path.resolve(__dirname, config.cacheDir || './cache/music');
const LOGS_DIR = path.resolve(__dirname, config.logsDir || './logs');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

let logsEnabled = config.logsEnabled === true;

const SEARCH_LIMIT = config.maxSearchResults || 35;
const RECOMMENDED_LIMIT = config.maxRecommendedTracks || 150;
const REQ_TIMEOUT = config.requestTimeout || 15000;
const PROXY_TIMEOUT = config.proxyTimeout || 120000;
const SOURCES = config.sources || { zaycev: true, hitmo: true, muzofond: true };
const logStream = fs.createWriteStream(path.join(LOGS_DIR, 'server.log'), { flags: 'a' });
function log(msg) {
  const line = new Date().toISOString() + ' ' + msg;
  console.log(line);
  if (logsEnabled) logStream.write(line + '\n');
}
function setLogsEnabled(v) { logsEnabled = v; }

app.use(express.static(path.join(__dirname, 'public')));
app.use('/cache', express.static(path.join(__dirname, 'cache')));
app.use(express.json());

app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/favorite-artists', require('./routes/favorite_artists'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/history', require('./routes/history'));

// === Headers ===
const Z_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  'Referer': 'https://zaycev.net/',
};

const H_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9',
};

const M_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9',
};

function sanitize(s) { return s.replace(/[<>:"/\\|?*\n\r]/g, '_').replace(/\s+/g, '_').substring(0, 80); }
function mkFile(title, artist) { return sanitize(`${artist}_${title}`) + '.mp3'; }

function dedup(tracks) {
  const seen = new Map();
  return tracks.filter(t => {
    const key = (t.artist + ' ' + t.title).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

function parseDur(d) {
  if (!d) return 0;
  if (typeof d === 'number') return d;
  if (typeof d === 'string' && d.includes(':')) {
    const p = d.split(':').map(Number);
    return (p.length === 3 ? p[0]*3600 : 0) + (p.length >= 2 ? p[1]*60 : 0) + (p[2]||0);
  }
  return parseInt(d) || 0;
}

// ========================================
// ZAYCEV helpers
// ========================================
async function getHashes(ids) {
  if (!ids.length) return {};
  try {
    const r = await axios.post('https://zaycev.net/api/external/track/filezmeta',
      { trackIds: ids.map(String), subscription: null },
      { headers: { ...Z_HEADERS, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    const map = {};
    (r.data?.tracks || []).forEach(t => { map[t.id] = { streaming: t.streaming, download: t.download }; });
    return map;
  } catch { return {}; }
}

function mapZTracks(trackIds, info, hashes) {
  return trackIds.map(id => {
    const t = info[id] || {};
    const h = hashes[id] || {};
    return {
      id: 'z_' + id,
      source: 'zaycev',
      title: t.track || '',
      artist: t.artistName || '',
      cover: t.imageJpg || '',
      duration: t.duration || '',
      durationSec: parseDur(t.durationTime || t.duration),
      bitrate: t.bitrate || 0,
      streamingHash: h.streaming || '',
      downloadHash: h.download || '',
    };
  }).filter(t => t.title && t.artist);
}

// ========================================
// HITMO helpers
// ========================================
function parseHitmoTracks(html) {
  const $ = cheerio.load(html);
  const tracks = [];

  $('li.tracks__item[data-musmeta]').each((_, el) => {
    try {
      const meta = JSON.parse($(el).attr('data-musmeta'));
      const fullTime = $(el).find('.track__fulltime').text().trim();
      const dlLink = $(el).find('a.track__download-btn[href*="/get/music/"]').attr('href') || '';

      tracks.push({
        id: 'h_' + meta.id,
        source: 'hitmo',
        title: meta.title || '',
        artist: meta.artist || '',
        cover: meta.img || '',
        duration: fullTime,
        durationSec: parseDur(fullTime),
        mp3: dlLink ? (dlLink.startsWith('//') ? 'https:' + dlLink : 'https://ru.hitmoz.org' + dlLink) : '',
        streamingUrl: meta.url || '',
      });
    } catch {}
  });

  return tracks;
}

function parseHitmoArtists(html) {
  const $ = cheerio.load(html);
  const artists = [];

  $('li.album-item').each((_, el) => {
    const link = $(el).find('a.album-link');
    const href = link.attr('href') || '';
    const name = link.find('.album-title').text().trim();
    const imgStyle = link.find('.album-image').attr('style') || '';
    const imgMatch = imgStyle.match(/url\(['"]?(.*?)['"]?\)/);
    const image = imgMatch ? (imgMatch[1].startsWith('//') ? 'https:' + imgMatch[1] : imgMatch[1]) : '';
    const idMatch = href.match(/\/artist\/(\d+)/);

    if (idMatch && name) {
      artists.push({ id: idMatch[1], name, image, trackCount: 0 });
    }
  });

  return artists;
}

// ========================================
// MUZOFOND helpers
// ========================================
function parseMuzofondTracks(html) {
  const $ = cheerio.load(html);
  const tracks = [];

  $('li.item[data-id][data-duration]').each((_, el) => {
    try {
      const $el = $(el);
      const trackId = $el.attr('data-id');
      const durationSec = parseInt($el.attr('data-duration')) || 0;
      const img = $el.attr('data-img') || '';
      const cover = img ? (img.startsWith('/') ? 'https://muzofond.fm' + img : img) : '';

      const artist = $el.find('span.artist').text().trim();
      const title = $el.find('span.track').text().trim();
      const durText = $el.find('div.duration').text().trim();
      const mp3 = $el.find('li.play').attr('data-url') || '';

      if (artist && title && mp3) {
        tracks.push({
          id: 'm_' + trackId,
          source: 'muzofond',
          title,
          artist,
          cover,
          duration: durText,
          durationSec,
          mp3,
        });
      }
    } catch {}
  });

  return tracks;
}

function filterMuzofondTracksByArtist(tracks, artistName) {
  if (!artistName) return tracks;
  const target = artistName.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
  const targetTranslit = translitRuEn(artistName).toLowerCase().trim();
  const targets = [target, targetTranslit].filter(Boolean);
  return tracks.filter(t => {
    if (!t.artist) return false;
    const parts = t.artist.split(',').map(s => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim());
    return parts.some(p => targets.some(tgt => p === tgt || tgt.includes(p) || p.includes(tgt)));
  });
}

// ========================================
// API: Подсказки при поиске
// ========================================
app.get('/api/search-suggest', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ suggestions: [] });

    const suggestions = [];

    if (SOURCES.zaycev) {
      try {
        const r = await axios.get('https://zaycev.net/api/external/pages/search/artists', {
          params: { q, page: 1, limit: 3 }, headers: Z_HEADERS, timeout: 5000,
        });
        const list = r.data?.list || [];
        const info = r.data?.listInfo || {};
        list.forEach(id => {
          const a = info[id];
          if (a && a.name) suggestions.push({ text: a.name, type: 'artist' });
        });
      } catch {}
    }

    if (SOURCES.zaycev) {
      try {
        const r = await axios.get('https://zaycev.net/api/external/pages/search/tracks', {
          params: { q, page: 1, limit: 3 }, headers: Z_HEADERS, timeout: 5000,
        });
        const tIds = r.data?.trackIds || [];
        const tInfo = r.data?.tracksInfo || {};
        tIds.forEach(id => {
          const t = tInfo[id];
          if (t && t.track && t.artistName) suggestions.push({ text: t.artistName + ' - ' + t.track, type: 'track' });
        });
      } catch {}
    }

    res.json({ suggestions: suggestions.slice(0, 6) });
  } catch (e) {
    res.json({ suggestions: [] });
  }
});

// ========================================
// API: Объединённый поиск
// ========================================
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'q required' });
    log(`[Search] "${q}"`);

    // Search all sources in parallel
    const [zaycevResult, hitmoResult, muzofondResult] = await Promise.all([
      // Zaycev
      (async () => {
        try {
          const [tracksResp, artistsResp] = await Promise.all([
            axios.get('https://zaycev.net/api/external/pages/search/tracks', { params: { q, page: 1, limit: SEARCH_LIMIT }, headers: Z_HEADERS, timeout: REQ_TIMEOUT }),
            axios.get('https://zaycev.net/api/external/pages/search/artists', { params: { q, page: 1, limit: Math.floor(SEARCH_LIMIT / 3) }, headers: Z_HEADERS, timeout: REQ_TIMEOUT }),
          ]);

          const tIds = tracksResp.data?.trackIds || [];
          const tInfo = tracksResp.data?.tracksInfo || {};
          const hashes = await getHashes(tIds);
          const tracks = mapZTracks(tIds, tInfo, hashes);

          const artists = (artistsResp.data?.list || []).map(id => {
            const a = artistsResp.data?.listInfo?.[id] || {};
            return { id: String(id), name: a.name || '', image: a.imageJpg || '', trackCount: a.trackCount || 0, source: 'zaycev' };
          });

          return { tracks, artists };
        } catch (e) { log('[Search] Zaycev error:', e.message); return { tracks: [], artists: [] }; }
      })(),

      // Hitmo
      (async () => {
        try {
          const r = await axios.get('https://ru.hitmoz.org/search', { params: { q }, headers: H_HEADERS, timeout: REQ_TIMEOUT });
          const tracks = parseHitmoTracks(r.data);
          const artists = parseHitmoArtists(r.data).map(a => ({ ...a, source: 'hitmo' }));
          return { tracks: tracks.slice(0, SEARCH_LIMIT), artists };
        } catch (e) { log('[Search] Hitmo error:', e.message); return { tracks: [], artists: [] }; }
      })(),

      // Muzofond
      (async () => {
        try {
          const slug = q.toLowerCase().replace(/[^a-z0-9а-яё\s]/g, '').trim();
          const slugTr = translitRuEn(q).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
          let tracks = [];
          const trySlugs = [slug];
          if (slugTr && slugTr !== slug) trySlugs.push(slugTr);
          for (const s of trySlugs) {
            try {
              const r = await axios.get('https://muzofond.fm/collections/artists/' + s, { headers: M_HEADERS, timeout: REQ_TIMEOUT });
              tracks = parseMuzofondTracks(r.data);
              if (tracks.length > 0) break;
            } catch(e) {}
          }
          if (tracks.length === 0) {
            log('[Search] Muzofond slug page failed, trying search...');
            try {
              const r2 = await axios.get('https://muzofond.fm/search/' + encodeURIComponent(q), { headers: M_HEADERS, timeout: REQ_TIMEOUT });
              tracks = parseMuzofondTracks(r2.data);
            } catch(e2) {}
          }
          tracks = filterMuzofondTracksByArtist(tracks, q);
          const artistMap = {};
          const qLower = q.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
          tracks.forEach(t => {
            if (t.artist) {
              const aNames = t.artist.split(',').map(s => s.trim()).filter(Boolean);
              aNames.forEach(aName => {
                const aNameClean = aName.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
                if (aNameClean.includes(qLower) || qLower.includes(aNameClean)) {
                  const slug = aName.replace(/\s*\(.*?\)\s*/g, ' ').toLowerCase().replace(/[^a-z0-9а-яё\s]/g, '').replace(/\s+/g, ' ').trim();
                  if (!artistMap[slug]) artistMap[slug] = { id: slug, name: aName, image: t.cover || '', trackCount: 0, source: 'muzofond' };
                }
              });
            }
          });
          return { tracks: tracks.slice(0, SEARCH_LIMIT), artists: Object.values(artistMap).slice(0, Math.floor(SEARCH_LIMIT / 3)) };
        } catch (e) { log('[Search] Muzofond error:', e.message); return { tracks: [], artists: [] }; }
      })(),
    ]);

    const allTracks = [...dedup([...zaycevResult.tracks, ...hitmoResult.tracks]), ...muzofondResult.tracks];
    const allArtists = [...zaycevResult.artists, ...hitmoResult.artists, ...muzofondResult.artists];

    log(`[Search] Zaycev: ${zaycevResult.tracks.length}t/${zaycevResult.artists.length}a, Hitmo: ${hitmoResult.tracks.length}t/${hitmoResult.artists.length}a, Muzofond: ${muzofondResult.tracks.length}t`);
    res.json({ tracks: allTracks, artists: allArtists, query: q });
  } catch (e) {
    console.error('[Search] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Треки артиста (Zaycev)
// ========================================
app.get('/api/artist', async (req, res) => {
  try {
    const { id, page = 1 } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    log(`[Artist] ID: ${id}, page: ${page}`);

    const [infoResp, tracksResp] = await Promise.all([
      axios.get('https://zaycev.net/api/external/pages/artist/' + id, { headers: Z_HEADERS, timeout: 10000 }).catch(() => ({ data: {} })),
      axios.get('https://zaycev.net/api/external/pages/artist/' + id + '/tracks', { params: { page, limit: 50 }, headers: Z_HEADERS, timeout: 15000 }).catch(() => ({ data: {} })),
    ]);

    const artistInfo = infoResp.data?.info?.[id] || {};
    const tIds = tracksResp.data?.list || [];
    const tInfo = tracksResp.data?.info || {};
    const pagesCount = tracksResp.data?.pagesCount || 1;
    const totalCount = tracksResp.data?.totalCount || 0;

    const hashes = await getHashes(tIds);
    const tracks = mapZTracks(tIds, tInfo, hashes);

    res.json({
      artist: { id: String(id), name: artistInfo.name || '', genres: artistInfo.genres || [] },
      tracks, pagesCount, totalCount, page: Number(page),
    });
  } catch (e) {
    console.error('[Artist] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Треки артиста (Hitmo)
// ========================================
app.get('/api/hitmo-artist', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    log(`[HitmoArtist] ID: ${id}`);

    const r = await axios.get('https://ru.hitmoz.org/artist/' + id, { headers: H_HEADERS, timeout: 15000 });
    const $ = cheerio.load(r.data);

    const name = $('h1.p-info-title, h1.p-track-title').first().text().trim() || '';
    const tracks = parseHitmoTracks(r.data);

    res.json({ artist: { id, name }, tracks });
  } catch (e) {
    console.error('[HitmoArtist] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Треки артиста (Muzofond)
// ========================================
function translitRuEn(s) {
  const map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
  return s.split('').map(c => {
    const low = c.toLowerCase();
    let r = map[low] || c;
    if (c === c.toUpperCase() && c !== c.toLowerCase()) r = r.charAt(0).toUpperCase() + r.slice(1);
    return r;
  }).join('');
}

app.get('/api/muzofond-artist', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name required' });
    log(`[MuzofondArtist] Name: ${name}`);

    const baseName = name.replace(/\s*\(.*?\)\s*/g, '').trim();
    const slugs = [
      baseName.toLowerCase().replace(/[^a-z0-9а-яё\s]/g, '').trim(),
      name.toLowerCase().replace(/[^a-z0-9а-яё\s]/g, '').replace(/\s+/g, ' ').trim(),
      translitRuEn(baseName).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim(),
      translitRuEn(name).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    ].filter((s, i, a) => s && a.indexOf(s) === i);

    for (const slug of slugs) {
      try {
        const r = await axios.get('https://muzofond.fm/collections/artists/' + slug, { headers: M_HEADERS, timeout: 15000 });
        const allTracks = parseMuzofondTracks(r.data);
        const tracks = filterMuzofondTracksByArtist(allTracks, name);
        if (tracks.length > 0) { res.json({ artist: { id: slug, name }, tracks }); return; }
      } catch(e) {}
    }

    log(`[MuzofondArtist] Slug failed for "${name}", trying search...`);
    try {
      const r2 = await axios.get('https://muzofond.fm/search/' + encodeURIComponent(baseName), { headers: M_HEADERS, timeout: 15000 });
      const allTracks = parseMuzofondTracks(r2.data);
      const tracks = filterMuzofondTracksByArtist(allTracks, name);
      if (tracks.length > 0) { res.json({ artist: { id: slugs[0] || '', name }, tracks }); return; }
    } catch(e) {}

    res.json({ artist: { id: slugs[0] || '', name }, tracks: [] });
  } catch (e) {
    console.error('[MuzofondArtist] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Жанры (Zaycev)
// ========================================
const GENRES_DATA = [
  { url: 'pop', name: 'Поп', image: 'https://cdnimg.zaycev.net/commonImage/genre/1/1694077059_square200.jpg' },
  { url: 'rock', name: 'Рок', image: 'https://cdnimg.zaycev.net/commonImage/genre/2/1694076836_square200.jpg' },
  { url: 'rap', name: 'Рэп', image: 'https://cdnimg.zaycev.net/commonImage/genre/3/1694072014_square200.jpg' },
  { url: 'electronic', name: 'Электроника', image: 'https://cdnimg.zaycev.net/commonImage/genre/5/1694081093_square200.jpg' },
  { url: 'shanson', name: 'Шансон', image: 'https://cdnimg.zaycev.net/commonImage/genre/6/1694071882_square200.jpg' },
  { url: 'metal', name: 'Метал', image: 'https://cdnimg.zaycev.net/commonImage/genre/8/1694071986_square200.jpg' },
  { url: 'classical', name: 'Классика', image: 'https://cdnimg.zaycev.net/commonImage/genre/9/1694077024_square200.jpg' },
  { url: 'dance', name: 'Танцевальная', image: 'https://cdnimg.zaycev.net/commonImage/genre/10/1694081150_square200.jpg' },
  { url: 'easy', name: 'Лёгкая', image: 'https://cdnimg.zaycev.net/commonImage/genre/11/1698207338_square200.jpg' },
  { url: 'rnb', name: "R'n'B", image: 'https://cdnimg.zaycev.net/commonImage/genre/12/1694081110_square200.jpg' },
  { url: 'jazz', name: 'Джаз', image: 'https://cdnimg.zaycev.net/commonImage/genre/13/1694081127_square200.jpg' },
  { url: 'reggae', name: 'Регги', image: 'https://cdnimg.zaycev.net/commonImage/genre/14/1694071942_square200.jpg' },
  { url: 'blues', name: 'Блюз', image: 'https://cdnimg.zaycev.net/commonImage/genre/37/1694071970_square200.jpg' },
  { url: 'folk', name: 'Фолк', image: 'https://cdnimg.zaycev.net/commonImage/genre/65/1694080829_square200.jpg' },
  { url: 'indie', name: 'Инди', image: 'https://cdnimg.zaycev.net/commonImage/genre/600/1694081165_square200.jpg' },
  { url: 'instrumental', name: 'Инструментальная', image: 'https://cdnimg.zaycev.net/commonImage/genre/158/1694081074_square200.jpg' },
  { url: 'world', name: 'Мировая', image: 'https://cdnimg.zaycev.net/commonImage/genre/260/1694076869_square200.jpg' },
  { url: 'children', name: 'Детская', image: 'https://cdnimg.zaycev.net/commonImage/genre/115/1694071915_square200.jpg' },
  { url: 'soundtrack', name: 'Саундтреки', image: 'https://cdnimg.zaycev.net/commonImage/genre/7/1698207256_square200.jpg' },
  { url: 'other', name: 'Другое', image: 'https://cdnimg.zaycev.net/commonImage/genre/15/1694081206_square200.jpg' },
];

app.get('/api/genres', (req, res) => res.json({ genres: GENRES_DATA }));

// ========================================
// API: Треки жанра
// ========================================
app.get('/api/genre-tracks', async (req, res) => {
  try {
    const { genre, page = 1 } = req.query;
    if (!genre) return res.status(400).json({ error: 'genre required' });
    log(`[Genre] ${genre}, page: ${page}`);

    const hitmoGenreMap = { pop:'pop-music', rock:'rock', rap:'rap', electronic:'electronic', shanson:'chanson', metal:'metal', classical:'classic', dance:'dance', easy:'relax', rnb:'rnb', jazz:'jazz', reggae:'reggae', blues:'blues', folk:'folk', indie:'indie', instrumental:'instrumental', world:'world', children:'children', soundtrack:'soundtrack', other:'other' };
    const muzofondGenreMap = { pop:'pop', rock:'rock', rap:'rap', electronic:'electronic', shanson:'chanson', metal:'metal', classical:'classic', dance:'dance', easy:'relax', rnb:'rnb', jazz:'jazz', reggae:'reggae', blues:'blues', folk:'folk', indie:'indie', instrumental:'instrumental', world:'world', children:'children', soundtrack:'soundtrack', other:'other' };

    const [zResult, hResult, mResult] = await Promise.all([
      (async () => {
        try {
          const r = await axios.get('https://zaycev.net/api/external/pages/genres/' + genre + '/tracks', {
            params: { page, limit: 30 }, headers: Z_HEADERS, timeout: 15000,
          });
          const tIds = r.data?.list || [];
          const tInfo = r.data?.info || {};
          const hashes = await getHashes(tIds);
          return { tracks: mapZTracks(tIds, tInfo, hashes), pagesCount: r.data?.pagesCount || 1, totalCount: r.data?.totalCount || 0 };
        } catch { return { tracks: [], pagesCount: 1, totalCount: 0 }; }
      })(),
      (async () => {
        try {
          const hGenre = hitmoGenreMap[genre] || genre;
          const r = await axios.get('https://ru.hitmoz.org/genre/' + hGenre, { headers: H_HEADERS, timeout: 15000 });
          return { tracks: parseHitmoTracks(r.data).slice(0, 20) };
        } catch { return { tracks: [] }; }
      })(),
      (async () => {
        try {
          const mGenre = muzofondGenreMap[genre] || genre;
          const r = await axios.get('https://muzofond.fm/popular/' + mGenre, { headers: M_HEADERS, timeout: 15000 });
          return { tracks: parseMuzofondTracks(r.data).slice(0, 20) };
        } catch { return { tracks: [] }; }
      })(),
    ]);

    res.json({
      tracks: [...dedup([...zResult.tracks, ...hResult.tracks]), ...mResult.tracks],
      pagesCount: zResult.pagesCount,
      totalCount: zResult.totalCount + hResult.tracks.length + mResult.tracks.length,
      page: Number(page), genre,
    });
  } catch (e) {
    console.error('[Genre] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Новые треки (Zaycev + Hitmo)
// ========================================
app.get('/api/new', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    log(`[New] page: ${page}`);

    const [zaycevResult, hitmoResult, muzofondResult] = await Promise.all([
      (async () => {
        try {
          const r = await axios.get('https://zaycev.net/api/external/pages/new', {
            params: { page, limit: 25 }, headers: Z_HEADERS, timeout: 15000,
          });
          const tIds = r.data?.trackIds || [];
          const tInfo = r.data?.tracksInfo || {};
          const hashes = await getHashes(tIds);
          return { tracks: mapZTracks(tIds, tInfo, hashes), pagesCount: r.data?.pagesCount || 1 };
        } catch { return { tracks: [], pagesCount: 1 }; }
      })(),
      (async () => {
        try {
          const r = await axios.get('https://ru.hitmoz.org/songs/new', { headers: H_HEADERS, timeout: 15000 });
          return { tracks: parseHitmoTracks(r.data).slice(0, 25) };
        } catch { return { tracks: [] }; }
      })(),
      (async () => {
        try {
          const r = await axios.get('https://muzofond.fm/popular/new', { headers: M_HEADERS, timeout: 15000 });
          return { tracks: parseMuzofondTracks(r.data).slice(0, 25) };
        } catch { return { tracks: [] }; }
      })(),
    ]);

    res.json({
      tracks: [...dedup([...zaycevResult.tracks, ...hitmoResult.tracks]), ...muzofondResult.tracks],
      pagesCount: zaycevResult.pagesCount,
      page: Number(page),
    });
  } catch (e) {
    console.error('[New] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Секции для главной страницы
// ========================================
async function fetchZaycevPage(page, limit) {
  try {
    const r = await axios.get('https://zaycev.net/api/external/pages/new', {
      params: { page, limit }, headers: Z_HEADERS, timeout: 15000,
    });
    const tIds = r.data?.trackIds || [];
    const tInfo = r.data?.tracksInfo || {};
    const hashes = await getHashes(tIds);
    return mapZTracks(tIds, tInfo, hashes);
  } catch { return []; }
}

async function fetchHitmo(url) {
  try {
    const r = await axios.get(url, { headers: H_HEADERS, timeout: 15000 });
    return parseHitmoTracks(r.data).slice(0, 20);
  } catch { return []; }
}

async function fetchMuzofond(slug) {
  try {
    const r = await axios.get('https://muzofond.fm/popular/' + slug, { headers: M_HEADERS, timeout: 15000 });
    return parseMuzofondTracks(r.data).slice(0, 20);
  } catch { return []; }
}

app.get('/api/sections', async (req, res) => {
  try {
    log('[Sections] Loading homepage sections...');

    const [freshZ, freshH, freshM, hitsZ, popularH, popularM, rockH, rockM, rapH, rapM, popH, popM, electroH, electroM, danceH, danceM] = await Promise.all([
      fetchZaycevPage(1, 12),
      fetchHitmo('https://ru.hitmoz.org/songs/new'),
      fetchMuzofond('new'),
      fetchZaycevPage(2, 12),
      fetchHitmo('https://ru.hitmoz.org/'),
      fetchMuzofond('pop'),
      fetchHitmo('https://ru.hitmoz.org/genre/rock'),
      fetchMuzofond('rock'),
      fetchHitmo('https://ru.hitmoz.org/genre/rap'),
      fetchMuzofond('rap'),
      fetchHitmo('https://ru.hitmoz.org/genre/pop-music'),
      fetchMuzofond('pop'),
      fetchHitmo('https://ru.hitmoz.org/genre/electronic'),
      fetchMuzofond('electronic'),
      fetchHitmo('https://ru.hitmoz.org/genre/dance'),
      fetchMuzofond('dance'),
    ]);

    const sections = [
      { id: 'fresh', title: 'Fresh Music', icon: 'new', tracks: dedup([...freshZ.slice(0, 6), ...freshH.slice(0, 6)]).concat(freshM.slice(0, 6)) },
      { id: 'hits', title: 'Hit of the Day', icon: 'hit', tracks: dedup([...hitsZ.slice(0, 6), ...popularH.slice(0, 6)]).concat(popularM.slice(0, 6)) },
      { id: 'pop', title: 'Pop', icon: 'pop', tracks: dedup([...popH.slice(0, 8), ...popM.slice(0, 8)]) },
      { id: 'rock', title: 'Rock', icon: 'rock', tracks: dedup([...rockH.slice(0, 8), ...rockM.slice(0, 8)]) },
      { id: 'rap', title: 'Rap & Hip-Hop', icon: 'rap', tracks: dedup([...rapH.slice(0, 8), ...rapM.slice(0, 8)]) },
      { id: 'electro', title: 'Electronic', icon: 'electro', tracks: dedup([...electroH.slice(0, 8), ...electroM.slice(0, 8)]) },
      { id: 'dance', title: 'Dance', icon: 'dance', tracks: dedup([...danceH.slice(0, 8), ...danceM.slice(0, 8)]) },
    ];

    log('[Sections] Loaded ' + sections.length + ' sections');
    res.json({ sections });
  } catch (e) {
    console.error('[Sections] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Stream URL (Zaycev hash)
// ========================================
app.get('/api/stream-url', async (req, res) => {
  try {
    const { hash } = req.query;
    if (!hash) return res.status(400).json({ error: 'hash required' });
    const r = await axios.get('https://zaycev.net/api/external/track/play/' + hash, { headers: Z_HEADERS, timeout: 10000 });
    if (r.data?.url) res.json({ url: r.data.url });
    else res.status(404).json({ error: 'URL not found' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Proxy MP3 (для CORS обхода)
// ========================================
app.get('/api/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });
    let referer = 'https://ru.hitmoz.org/';
    if (url.includes('muzofond.fm') || url.includes('mp3poisk.net')) referer = 'https://muzofond.fm/';
    else if (url.includes('zaycev.net') || url.includes('cdnimg.zaycev.net')) referer = 'https://zaycev.net/';
    const r = await axios({
      method: 'GET', url, responseType: 'stream', timeout: 120000,
      headers: { 'User-Agent': H_HEADERS['User-Agent'], Referer: referer },
    });
    if (r.headers['content-type']) res.setHeader('Content-Type', r.headers['content-type']);
    if (r.headers['content-length']) res.setHeader('Content-Length', r.headers['content-length']);
    res.setHeader('Accept-Ranges', 'bytes');
    r.data.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Download & cache
// ========================================
app.get('/api/download', async (req, res) => {
  try {
    let { url, title = 'unknown', artist = 'unknown', hash, source } = req.query;

    if (hash && !url) {
      const r = await axios.get('https://zaycev.net/api/external/track/download/' + hash, { headers: Z_HEADERS, timeout: 10000, responseType: 'text' });
      url = typeof r.data === 'string' ? r.data.trim() : r.data?.url;
      if (!url) return res.status(404).json({ error: 'MP3 URL not found' });
    }
    if (!url) return res.status(400).json({ error: 'url or hash required' });

    const fileName = mkFile(title, artist);
    const filePath = path.join(CACHE_DIR, fileName);
    const alreadyCached = fs.existsSync(filePath);

    if (!alreadyCached) {
      const referer = source === 'hitmo' ? 'https://ru.hitmoz.org/' : source === 'muzofond' ? 'https://muzofond.fm/' : 'https://zaycev.net/';
      const r = await axios({ method: 'GET', url, responseType: 'stream', timeout: 120000, headers: { 'User-Agent': H_HEADERS['User-Agent'], Referer: referer } });
      const w = fs.createWriteStream(filePath);
      r.data.pipe(w);
      await new Promise((ok, no) => { w.on('finish', ok); w.on('error', no); });
      log(`[Cache] Saved: ${fileName}`);
    }

    res.json({ localPath: '/cache/music/' + fileName, cached: alreadyCached });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Cache list
// ========================================
app.get('/api/cache-list', (req, res) => {
  try {
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.mp3')).map(f => {
      return {
        fileName: f, localPath: '/cache/music/' + f,
      };
    });
    res.json({ files, total: files.length });
  } catch { res.json({ files: [], total: 0 }); }
});

// ========================================
// API: Cache delete
// ========================================
app.delete('/api/cache-delete', (req, res) => {
  try {
    const f = req.query.file;
    if (!f) return res.status(400).json({ error: 'file required' });
    const p = path.join(CACHE_DIR, path.basename(f));
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
    fs.unlinkSync(p);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========================================
// API: You might like (taste-based)
// ========================================
app.get('/api/recommended', async (req, res) => {
  try {
    log('[Recommended] Loading taste-based recommendations...');
    const { prepare: dbPrepare } = require('./db/database');

    const favArtists = dbPrepare(`
      SELECT artist, COUNT(*) as count FROM favorites
      WHERE artist != '' GROUP BY artist
    `).all();

    const favArtistRows = dbPrepare(`
      SELECT name FROM favorite_artists WHERE name != ''
    `).all();

    const playlistArtists = dbPrepare(`
      SELECT pt.artist, COUNT(*) as count FROM playlist_tracks pt
      JOIN playlists p ON p.id = pt.playlist_id
      WHERE pt.artist != '' GROUP BY pt.artist
    `).all();

    const listenArtists = dbPrepare(`
      SELECT artist,
        SUM(
          CASE
            WHEN listened_at > datetime('now', '-1 day') THEN 5.0
            WHEN listened_at > datetime('now', '-7 days') THEN 3.0
            WHEN listened_at > datetime('now', '-30 days') THEN 2.0
            ELSE 1.0
          END
        ) as weight
      FROM listening_history
      WHERE artist != ''
      GROUP BY artist
    `).all();

    const artistScores = {};
    favArtistRows.forEach(a => {
      if (!artistScores[a.name]) artistScores[a.name] = { artist: a.name, score: 0 };
      artistScores[a.name].score += 20;
    });
    favArtists.forEach(a => {
      if (!artistScores[a.artist]) artistScores[a.artist] = { artist: a.artist, score: 0 };
      artistScores[a.artist].score += a.count * 10;
    });
    playlistArtists.forEach(a => {
      if (!artistScores[a.artist]) artistScores[a.artist] = { artist: a.artist, score: 0 };
      artistScores[a.artist].score += a.count * 5;
    });
    listenArtists.forEach(a => {
      if (!artistScores[a.artist]) artistScores[a.artist] = { artist: a.artist, score: 0 };
      artistScores[a.artist].score += a.weight;
    });

    const topArtists = Object.values(artistScores)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const topQueries = topArtists.slice(0, 10).map(a => a.artist);
    const results = [];

    if (topQueries.length > 0) {
      const zaycevResults = await Promise.all(topQueries.map(async (q) => {
        try {
          const r = await axios.get('https://zaycev.net/api/external/pages/search/tracks', {
            params: { q, page: 1, limit: 15 }, headers: Z_HEADERS, timeout: 10000,
          });
          const tIds = r.data?.trackIds || [];
          const tInfo = r.data?.tracksInfo || {};
          const hashes = await getHashes(tIds);
          return mapZTracks(tIds, tInfo, hashes);
        } catch { return []; }
      }));
      zaycevResults.forEach(t => results.push(...t));

      const hitmoResults = await Promise.all(topQueries.slice(0, 8).map(async (q) => {
        try {
          const r = await axios.get('https://ru.hitmoz.org/search', {
            params: { q }, headers: H_HEADERS, timeout: 10000,
          });
          return parseHitmoTracks(r.data).slice(0, 10);
        } catch { return []; }
      }));
      hitmoResults.forEach(t => results.push(...t));

      const muzofondResults = await Promise.all(topQueries.slice(0, 8).map(async (q) => {
        try {
          const slug = q.toLowerCase().replace(/[^a-z0-9а-яё\s]/g, '').trim();
          try {
            const r = await axios.get('https://muzofond.fm/collections/artists/' + slug, { headers: M_HEADERS, timeout: 10000 });
            return filterMuzofondTracksByArtist(parseMuzofondTracks(r.data), q).slice(0, 10);
          } catch(e) {
            const r2 = await axios.get('https://muzofond.fm/search/' + encodeURIComponent(q), { headers: M_HEADERS, timeout: 10000 });
            return filterMuzofondTracksByArtist(parseMuzofondTracks(r2.data), q).slice(0, 10);
          }
        } catch { return []; }
      }));
      muzofondResults.forEach(t => results.push(...t));
    }

    if (results.length < 50) {
      const extra = await fetchZaycevPage(3, 50 - results.length);
      results.push(...extra);
    }

    const hitmoNew = await fetchHitmo('https://ru.hitmoz.org/songs/new');
    results.push(...hitmoNew.slice(0, 20));

    const muzofondNew = await (async () => {
      try {
        const r = await axios.get('https://muzofond.fm/collections/artists/pop', { headers: M_HEADERS, timeout: 10000 });
        return parseMuzofondTracks(r.data).slice(0, 20);
      } catch { return []; }
    })();
    results.push(...muzofondNew);

    const allNonMuzofond = results.filter(t => t.source !== 'muzofond');
    const allMuzofond = results.filter(t => t.source === 'muzofond');

    res.json({
      tracks: [...dedup(allNonMuzofond), ...allMuzofond].slice(0, RECOMMENDED_LIMIT),
      basedOn: topArtists.slice(0, 5).map(a => a.artist),
      stats: {
        totalArtists: topArtists.length,
        topArtist: topArtists.length > 0 ? topArtists[0].artist : null
      }
    });
  } catch (e) {
    log('[Recommended] Error: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// API: Auto-cache toggle
// ========================================
app.post('/api/auto-cache-toggle', (req, res) => {
  try {
    const { prepare: dbPrepare } = require('./db/database');
    const enabled = String(req.body.enabled);
    dbPrepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_cache', ?)").run(enabled);
    res.json({ autoCache: enabled === 'true' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const { initDatabase } = require('./db/database');

initDatabase().then(() => {
  try {
    const { prepare } = require('./db/database');
    const row = prepare('SELECT value FROM settings WHERE key = ?').get('logsEnabled');
    if (row && row.value === 'false') { logsEnabled = false; }
  } catch(e) {}
  global.setLogsEnabled = function(v) { logsEnabled = v; };
  app.listen(PORT, () => {
    log(`Server running at http://localhost:${PORT}`);
  });
}).catch(e => {
  console.error('Database init failed:', e.message);
  process.exit(1);
});
