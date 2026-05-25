const express = require('express');
const router = express.Router();
const db = require('../db');

// List All Bills with PO details
router.get('/', (req, res) => {
    const query = `
        SELECT b.*, p.itemName, p.quantity, v.name as vendorName 
        FROM bills b 
        JOIN purchase_orders p ON b.poId = p.id
        JOIN vendors v ON p.vendorId = v.id
        ORDER BY b.id DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Generate RA Bill for a completed PO
router.post('/', (req, res) => {
    const { poId, grossAmount } = req.body;

    if (!poId || !grossAmount) return res.status(400).json({ error: 'Missing poId or grossAmount' });

    // Ensure PO is delivered
    db.get(`SELECT * FROM purchase_orders WHERE id = ?`, [poId], (err, po) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!po) return res.status(404).json({ error: 'PO not found' });
        if (po.status !== 'Delivered') return res.status(400).json({ error: 'Can only generate bill for Delivered POs' });

        const tds = grossAmount * 0.02; // 2% TDS
        const retention = grossAmount * 0.05; // 5% Retention
        const netAmount = grossAmount - tds - retention;

        const query = `INSERT INTO bills (poId, grossAmount, tds, retention, netAmount, status) VALUES (?, ?, ?, ?, ?, 'Draft')`;
        db.run(query, [poId, grossAmount, tds, retention, netAmount], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const billId = this.lastID;

            db.run(`INSERT INTO activities (description, type) VALUES (?, ?)`, 
                [`RA Bill generated for PO-${poId.toString().padStart(4, '0')} (Net: ${netAmount})`, 'Finance'], 
                () => res.status(201).json({ id: billId, poId, grossAmount, tds, retention, netAmount, status: 'Draft' })
            );
        });
    });
});

// Update Bill Status
router.patch('/:id/status', (req, res) => {
    const { newStatus } = req.body;
    const allowedStatuses = ['Under Review', 'Approved', 'Paid'];
    if (!allowedStatuses.includes(newStatus)) return res.status(400).json({ error: 'Invalid status transition' });

    db.run(`UPDATE bills SET status = ? WHERE id = ?`, [newStatus, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Bill not found' });

        db.run(`INSERT INTO activities (description, type) VALUES (?, ?)`, 
            [`Bill #000${req.params.id} advanced to ${newStatus}`, 'Finance'], 
            () => res.json({ message: `Bill updated to ${newStatus}` })
        );
    });
});

module.exports = router;
