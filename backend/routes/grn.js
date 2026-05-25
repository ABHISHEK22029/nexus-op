const express = require('express');
const router = express.Router();
const db = require('../db');

// List GRN records filtered by projectId
router.get('/', (req, res) => {
    let query = "SELECT * FROM grn";
    let params = [];
    if (req.query.projectId) {
        query += " WHERE projectId = ?";
        params.push(req.query.projectId);
    }
    query += " ORDER BY date DESC";
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create GRN: Record inward material, mark PO delivered, update inventory
router.post('/', (req, res) => {
    const { projectId, workOrderId, poId, vehicleNumber, batchNumber, chainage, receivedQuantity } = req.body;

    if (!poId || receivedQuantity === undefined) {
        return res.status(400).json({ error: 'poId and receivedQuantity are required' });
    }

    // Step 1: Find PO
    db.get(`SELECT * FROM purchase_orders WHERE id = ?`, [poId], (err, po) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!po) return res.status(404).json({ error: 'PO not found' });
        if (po.status === 'Delivered') return res.status(400).json({ error: 'PO is already delivered' });
        if (po.status !== 'Dispatched') return res.status(400).json({ error: 'PO must be Dispatched before receiving GRN' });

        // Resolve projectId and workOrderId from PO if not provided
        const resolvedProjectId = projectId || po.projectId;
        const resolvedWorkOrderId = workOrderId || po.workOrderId;

        // Step 2: Insert GRN record
        db.run(
            `INSERT INTO grn (projectId, workOrderId, poId, vehicleNumber, batchNumber, chainage, receivedQuantity) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [resolvedProjectId, resolvedWorkOrderId, poId, vehicleNumber || null, batchNumber || null, chainage || null, receivedQuantity],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                const grnId = this.lastID;

                // Step 3: Mark PO as Delivered
                db.run(`UPDATE purchase_orders SET status = 'Delivered' WHERE id = ?`, [poId], (err) => {
                    if (err) return res.status(500).json({ error: err.message });

                    // Step 4: Add to Inventory (Upsert — match by itemName + projectId)
                    db.get(`SELECT * FROM inventory WHERE itemName = ? AND projectId = ?`, [po.itemName, resolvedProjectId], (err, item) => {
                        if (err) return res.status(500).json({ error: err.message });

                        const logActivityAndRespond = () => {
                            db.run(
                                `INSERT INTO activities (projectId, description, type) VALUES (?, ?, ?)`,
                                [resolvedProjectId, `GRN-${grnId.toString().padStart(5, '0')} received for PO-${poId.toString().padStart(4, '0')} (${receivedQuantity} units of ${po.itemName})`, 'GRN'],
                                () => res.json({ message: 'GRN completed successfully', grnId, poId })
                            );
                        };

                        if (item) {
                            db.run(`UPDATE inventory SET quantity = quantity + ? WHERE id = ?`, [receivedQuantity, item.id], (err) => {
                                if (err) return res.status(500).json({ error: err.message });
                                logActivityAndRespond();
                            });
                        } else {
                            db.run(`INSERT INTO inventory (projectId, itemName, quantity) VALUES (?, ?, ?)`, [resolvedProjectId, po.itemName, receivedQuantity], (err) => {
                                if (err) return res.status(500).json({ error: err.message });
                                logActivityAndRespond();
                            });
                        }
                    });
                });
            }
        );
    });
});

module.exports = router;
