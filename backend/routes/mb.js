const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.all("SELECT measurement_book.*, boq_items.itemCode, boq_items.description FROM measurement_book LEFT JOIN boq_items ON measurement_book.boqId = boq_items.id", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/', (req, res) => {
    const { boqId, chainage, length, width, depth, measuredQuantity } = req.body;
    db.run(`INSERT INTO measurement_book (boqId, chainage, length, width, depth, measuredQuantity) VALUES (?, ?, ?, ?, ?, ?)`, 
    [boqId, chainage, length, width, depth, measuredQuantity], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

module.exports = router;
