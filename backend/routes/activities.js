const express = require('express');
const router = express.Router();
const db = require('../db');

// List Activities
router.get('/', (req, res) => {
    db.all(`SELECT * FROM activities ORDER BY timestamp DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

module.exports = router;
