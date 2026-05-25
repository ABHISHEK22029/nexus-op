const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all BOQ items
router.get('/', (req, res) => {
    db.all("SELECT * FROM boq_items", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Add a new BOQ item
router.post('/', (req, res) => {
    const { itemCode, description, unit, estimatedQuantity, rate } = req.body;
    db.run(`INSERT INTO boq_items (itemCode, description, unit, estimatedQuantity, rate) VALUES (?, ?, ?, ?, ?)`, 
    [itemCode, description, unit, estimatedQuantity, rate], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, itemCode, description, unit, estimatedQuantity, rate });
    });
});

module.exports = router;
