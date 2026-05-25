const db = require('../db');

exports.generateRABill = (req, res) => {
    const { projectId, workOrderId, poId } = req.body;
    
    // Step 1: Find all MB cumulative quantity for this Work Order
    db.get('SELECT SUM(measuredQuantity) as cumQty, boqId FROM measurement_book WHERE workOrderId = ?', [workOrderId], (err, mbRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const cumQty = mbRow && mbRow.cumQty ? mbRow.cumQty : 0;
        const boqId = mbRow ? mbRow.boqId : null;
        
        if (cumQty === 0) return res.status(400).json({ error: "No MB records found for this Work Order to bill." });

        // Step 2: See how much was previously billed
        db.get('SELECT SUM(billedQuantity) as prevBilledQty FROM bills WHERE workOrderId = ?', [workOrderId], (err, billRow) => {
            if (err) return res.status(500).json({ error: err.message });
            const prevBilledQty = billRow && billRow.prevBilledQty ? billRow.prevBilledQty : 0;
            
            const currentPayableQty = cumQty - prevBilledQty;
            if (currentPayableQty <= 0) return res.status(400).json({ error: "No new quantities to bill." });

            // Step 3: Fetch BOQ rate
            db.get('SELECT rate FROM boq_items WHERE id = ?', [boqId], (err, boq) => {
                if (err) return res.status(500).json({ error: err.message });
                const rate = boq ? boq.rate : 500; // fallback if boqId missing somehow
                
                // MATH LOGIC
                const grossAmount = currentPayableQty * rate;
                const tds = grossAmount * 0.02; // 2%
                const retention = grossAmount * 0.05; // 5%
                const netAmount = grossAmount - tds - retention;

                db.run(`INSERT INTO bills (projectId, workOrderId, grossAmount, tds, retention, netAmount, billedQuantity, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft')`,
                [projectId, workOrderId, grossAmount, tds, retention, netAmount, currentPayableQty], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: "RA Bill Generated", billId: this.lastID, netAmount });
                });
            });
        });
    });
};

exports.getBills = (req, res) => {
    const { projectId } = req.query;
    let query = "SELECT * FROM bills";
    let params = [];
    if (projectId) {
        query += " WHERE projectId = ?";
        params.push(projectId);
    }
    db.all(query, params, (err, rows) => {
         if (err) return res.status(500).json({ error: err.message });
         res.json(rows);
    });
};
