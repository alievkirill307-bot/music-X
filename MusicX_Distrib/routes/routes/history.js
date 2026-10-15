const express = require('express');
const router = express.Router();
const { prepare } = require('../db/database');

router.post('/listen', (req, res) => {
  try {
    const { title, artist } = req.body;
    prepare('INSERT INTO listening_history (track_id, title, artist) VALUES (?, ?, ?)').run(
      (artist || '') + '_' + (title || ''), title || '', artist || ''
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', (req, res) => {
  try {
    const rows = prepare('SELECT * FROM listening_history ORDER BY listened_at DESC LIMIT 100').all();
    res.json({ history: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/taste', (req, res) => {
  try {
    const favArtists = prepare(`
      SELECT artist, COUNT(*) as count FROM favorites
      WHERE artist != '' GROUP BY artist
    `).all();

    const playlistArtists = prepare(`
      SELECT pt.artist, COUNT(*) as count FROM playlist_tracks pt
      JOIN playlists p ON p.id = pt.playlist_id
      WHERE pt.artist != '' GROUP BY pt.artist
    `).all();

    const listenArtists = prepare(`
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

    favArtists.forEach(function(a) {
      if (!artistScores[a.artist]) artistScores[a.artist] = { artist: a.artist, score: 0, sources: [] };
      artistScores[a.artist].score += a.count * 10;
      artistScores[a.artist].sources.push('favorite');
    });

    playlistArtists.forEach(function(a) {
      if (!artistScores[a.artist]) artistScores[a.artist] = { artist: a.artist, score: 0, sources: [] };
      artistScores[a.artist].score += a.count * 5;
      artistScores[a.artist].sources.push('playlist');
    });

    listenArtists.forEach(function(a) {
      if (!artistScores[a.artist]) artistScores[a.artist] = { artist: a.artist, score: 0, sources: [] };
      artistScores[a.artist].score += a.weight;
      if (artistScores[a.artist].sources.indexOf('listen') === -1) artistScores[a.artist].sources.push('listen');
    });

    const topArtists = Object.values(artistScores)
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, 15);

    const totalListens = prepare('SELECT COUNT(*) as cnt FROM listening_history').get().cnt;
    const totalFavorites = prepare('SELECT COUNT(*) as cnt FROM favorites').get().cnt;
    const totalPlaylistTracks = prepare('SELECT COUNT(*) as cnt FROM playlist_tracks').get().cnt;

    res.json({
      topArtists: topArtists,
      stats: {
        totalListens: totalListens,
        favoriteArtists: favArtists.length,
        playlistArtists: playlistArtists.length,
        totalPlaylistTracks: totalPlaylistTracks
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
