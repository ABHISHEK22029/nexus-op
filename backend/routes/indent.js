const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all indents
router.get('/', (req, res) => {
    db.all("SELECT indents.*, boq_items.itemCode, boq_items.description FROM indents LEFT JOIN boq_items ON indents.boqId = boq_items.id", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/', (req, res) => {
    const { boqId, requestedQuantity, requiredDate, chainage } = req.body;
    db.run(`INSERT INTO indents (boqId, requestedQuantity, requiredDate, chainage, status) VALUES (?, ?, ?, ?, 'Pending')`, 
    [boqId, requestedQuantity, requiredDate, chainage], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

router.put('/:id/status', (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE indents SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
