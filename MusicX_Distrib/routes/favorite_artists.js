const express = require('express');
const router = express.Router();
const { prepare } = require('../db/database');

router.get('/', (req, res) => {
  try {
    const rows = prepare('SELECT * FROM favorite_artists ORDER BY added_at DESC').all();
    const artists = rows.map(r => ({
      artistId: r.artist_id,
      name: r.name,
      image: r.image || '',
      source: r.source || '',
      id: r.id
    }));
    res.json({ artists });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const { artistId, name, image, source } = req.body;
    if (!artistId || !name) return res.status(400).json({ error: 'artistId and name required' });
    const existing = prepare('SELECT id FROM favorite_artists WHERE artist_id = ?').get(artistId);
    if (existing) return res.json({ success: true, id: existing.id, already: true });
    const r = prepare('INSERT INTO favorite_artists (artist_id, name, image, source) VALUES (?, ?, ?, ?)').run(
      artistId, name, image || '', source || ''
    );
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/', (req, res) => {
  try {
    const artistId = req.body.artistId || req.query.artistId;
    if (!artistId) return res.status(400).json({ error: 'artistId required' });
    prepare('DELETE FROM favorite_artists WHERE artist_id = ?').run(artistId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
