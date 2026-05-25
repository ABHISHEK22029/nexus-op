const express = require('express');
const router = express.Router();
const db = require('../db');

// Get Dashboard Stats
router.get('/', (req, res) => {
    const stats = {
        distribution: [],
        insights: []
    };

    // Helper for async queries
    const runQuery = (sql) => new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => err ? reject(err) : resolve(rows));
    });

    Promise.all([
        runQuery(`SELECT COUNT(*) as count FROM vendors`),
        runQuery(`SELECT COUNT(*) as count FROM purchase_orders`),
        runQuery(`SELECT COUNT(*) as count FROM purchase_orders WHERE status = 'Delivered'`),
        runQuery(`SELECT COUNT(*) as count FROM inventory`),
        runQuery(`SELECT status, COUNT(*) as value FROM purchase_orders GROUP BY status`),
        runQuery(`SELECT COUNT(*) as count FROM inventory WHERE quantity < 50`),
        runQuery(`SELECT COUNT(*) as count FROM purchase_orders WHERE status = 'Pending'`)
    ])
    .then(([vendors, pos, delivered, inv, dist, lowStock, pending]) => {
        stats.totalVendors = vendors[0].count;
        stats.totalPOs = pos[0].count;
        stats.deliveredPOs = delivered[0].count;
        stats.inventoryCount = inv[0].count;
        stats.distribution = dist;

        if (lowStock[0].count > 0) {
            stats.insights.push(`⚠️ ${lowStock[0].count} inventory item(s) are running low (< 50 units).`);
        }
        if (pending[0].count > 0) {
            stats.insights.push(`🕒 ${pending[0].count} purchase order(s) are stuck in Pending status.`);
        }
        if (stats.insights.length === 0) {
           stats.insights.push('✅ System is running smoothly. No warnings.');
        }

        res.json(stats);
    })
    .catch(err => res.status(500).json({ error: err.message }));
});

module.exports = router;
