const express = require('express');
const router = express.Router();
const db = require('../db');

// List Inventory with Intelligence
router.get('/', (req, res) => {
    db.all(`SELECT * FROM inventory ORDER BY itemName`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const intelRows = rows.map(item => {
            const reorderLevel = 100;
            const status = item.totalQuantity < reorderLevel ? 'Near threshold' : 'Healthy';
            return { ...item, reorderLevel, status };
        });
        res.json(intelRows);
    });
});

module.exports = router;
