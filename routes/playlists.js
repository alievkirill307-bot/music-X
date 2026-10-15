const express = require('express');
const router = express.Router();
const { prepare } = require('../db/database');

router.get('/', (req, res) => {
  try {
    const playlists = prepare('SELECT * FROM playlists ORDER BY created_at DESC').all();
    playlists.forEach(p => {
      p.track_count = prepare('SELECT COUNT(*) as cnt FROM playlist_tracks WHERE playlist_id = ?').get(p.id).cnt;
    });
    res.json({ playlists });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const r = prepare('INSERT INTO playlists (name) VALUES (?)').run(name.trim());
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const id = req.params.id;
    const pl = prepare('SELECT * FROM playlists WHERE id = ?').get(id);
    if (!pl) return res.status(404).json({ error: 'not found' });
    const tracks = prepare('SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY added_at').all(id);
    const mapped = tracks.map(t => ({
      trackId: t.track_id,
      title: t.title,
      artist: t.artist,
      cover: t.cover || null,
      duration: t.duration || '',
      durationSec: t.duration_sec || 0,
      streamingHash: t.streaming_hash || '',
      downloadHash: t.download_hash || '',
      mp3: t.mp3 || '',
      source: t.source || ''
    }));
    res.json({ playlist: pl, tracks: mapped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const id = req.params.id;
    prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id);
    prepare('DELETE FROM playlists WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/tracks', (req, res) => {
  try {
    const playlistId = req.params.id;
    const t = req.body;
    if (!t.trackId || !t.title || !t.artist) return res.status(400).json({ error: 'trackId, title, artist required' });
    const existing = prepare('SELECT id FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').get(playlistId, t.trackId);
    if (existing) return res.json({ success: true, already: true });
    const r = prepare(`INSERT INTO playlist_tracks (playlist_id, track_id, title, artist, cover, duration, duration_sec, source, streaming_hash, download_hash, mp3)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      playlistId, t.trackId, t.title, t.artist, t.cover || '',
      t.duration || '', t.durationSec || 0,
      t.source || '', t.streamingHash || '', t.downloadHash || '', t.mp3 || ''
    );
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/tracks', (req, res) => {
  try {
    const playlistId = req.params.id;
    const trackId = req.body.trackId || req.query.trackId;
    if (!trackId) return res.status(400).json({ error: 'trackId required' });
    prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, trackId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
