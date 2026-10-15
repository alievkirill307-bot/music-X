const express = require('express');
const router = express.Router();
const { prepare } = require('../db/database');

router.get('/', (req, res) => {
  try {
    const rows = prepare('SELECT * FROM favorites ORDER BY added_at DESC').all();
    const favorites = rows.map(r => ({
      trackId: r.track_id,
      title: r.title,
      artist: r.artist,
      cover: r.cover || null,
      duration: r.duration || '',
      durationSec: r.duration_sec || 0,
      streamingHash: r.streaming_hash || '',
      downloadHash: r.download_hash || '',
      mp3: r.mp3 || '',
      source: r.source || '',
      id: r.id
    }));
    res.json({ favorites });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const t = req.body;
    if (!t.trackId || !t.title || !t.artist) return res.status(400).json({ error: 'trackId, title, artist required' });
    const existing = prepare('SELECT id FROM favorites WHERE track_id = ?').get(t.trackId);
    if (existing) return res.json({ success: true, id: existing.id, already: true });
    const r = prepare(`INSERT INTO favorites (track_id, title, artist, cover, duration, duration_sec, source, streaming_hash, download_hash, mp3)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      t.trackId, t.title, t.artist, t.cover || '',
      t.duration || '', t.durationSec || 0,
      t.source || '', t.streamingHash || '', t.downloadHash || '', t.mp3 || ''
    );
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/', (req, res) => {
  try {
    const trackId = req.body.trackId || req.query.trackId || req.query.track_id;
    if (!trackId) return res.status(400).json({ error: 'trackId required' });
    prepare('DELETE FROM favorites WHERE track_id = ?').run(trackId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
