const express = require('express');
const router = express.Router();
const { prepare } = require('../db/database');

router.get('/', (req, res) => {
  try {
    const rows = prepare('SELECT * FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ settings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
    if (key === 'logsEnabled' && typeof global.setLogsEnabled === 'function') {
      global.setLogsEnabled(String(value) !== 'false');
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
