const express = require('express');
const router = express.Router();
const db = require('../db');

// Add Vendor
router.post('/', (req, res) => {
    const { name, type } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });

    db.run(`INSERT INTO vendors (name, type) VALUES (?, ?)`, [name, type], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const vendorId = this.lastID;
        
        db.run(`INSERT INTO activities (description, type) VALUES (?, ?)`, 
          [`Vendor "${name}" created`, 'Vendor'], 
          () => {
             res.status(201).json({ id: vendorId, name, type });
          }
        );
    });
});

// List Vendors
router.get('/', (req, res) => {
    db.all(`SELECT id, name, type FROM vendors ORDER BY name DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

module.exports = router;
