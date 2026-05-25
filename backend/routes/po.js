const express = require('express');
const router = express.Router();
const db = require('../db');

// Create PO
router.post('/', (req, res) => {
    const { vendorId, itemName, quantity } = req.body;
    if (!vendorId || !itemName || !quantity) {
        return res.status(400).json({ error: 'vendorId, itemName, and quantity are required' });
    }

    db.run(`INSERT INTO purchase_orders (vendorId, itemName, quantity, status) VALUES (?, ?, ?, 'Pending')`, 
        [vendorId, itemName, quantity], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const poId = this.lastID;
        db.run(`INSERT INTO activities (description, type) VALUES (?, ?)`, 
          [`PO-${poId.toString().padStart(4, '0')} for ${itemName} created`, 'PO'], 
          () => {
             res.status(201).json({ id: poId, vendorId, itemName, quantity, status: 'Pending' });
          }
        );
    });
});

// List POs
router.get('/', (req, res) => {
    const query = `
        SELECT po.id, po.vendorId, po.itemName, po.quantity, po.status, v.name as vendorName 
        FROM purchase_orders po
        JOIN vendors v ON po.vendorId = v.id 
        ORDER BY po.id DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Approve PO
router.patch('/:id/approve', (req, res) => {
    db.run(`UPDATE purchase_orders SET status = 'Approved' WHERE id = ? AND status = 'Pending'`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'PO not found or cannot be approved' });
        
        db.run(`INSERT INTO activities (description, type) VALUES (?, ?)`, 
          [`PO-${req.params.id.padStart(4, '0')} approved`, 'PO'], 
          () => res.json({ message: 'PO Approved' })
        );
    });
});

// Dispatch PO
router.patch('/:id/dispatch', (req, res) => {
    db.run(`UPDATE purchase_orders SET status = 'Dispatched' WHERE id = ? AND status = 'Approved'`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'PO not found or not approved yet' });
        
        db.run(`INSERT INTO activities (description, type) VALUES (?, ?)`, 
          [`PO-${req.params.id.padStart(4, '0')} dispatched`, 'PO'], 
          () => res.json({ message: 'PO Dispatched' })
        );
    });
});

module.exports = router;
