const db = require('./db');
const fs = require('fs');

const vendorTypes = ['Material Supply', 'Logistics', 'Software', 'Consulting', 'Civil', 'Electrical'];
const itemNames = ['Steel Beams', 'Gravel Tons', 'Cement Bags', 'Bitumen', 'Server Licenses', 'Pipes', 'Cables'];
const poStatuses = ['Pending', 'Approved', 'Dispatched', 'Delivered'];
const billStatuses = ['Draft', 'Under Review', 'Approved', 'Paid'];
const projectStatuses = ['Active', 'Completed', 'On Hold', 'Delayed'];
const woStatuses = ['Pending', 'In Progress', 'Delayed', 'Completed', 'Cancelled'];

console.log("Starting Edge-case data seed...");

db.serialize(() => {
    // 1. Wipe existing data for a clean slate
    db.run("BEGIN TRANSACTION");
    const tables = [
        'bills', 'grn', 'measurement_book', 'indents', 'boq_items', 
        'activities', 'purchase_orders', 'inventory', 'milestones', 
        'work_orders', 'vendors', 'projects'
    ];
    tables.forEach(table => {
        db.run(`DELETE FROM ${table}`);
    });
    db.run("DELETE FROM sqlite_sequence");

    // 2. Generate 15 Projects
    let projectCount = 15;
    for (let p = 1; p <= projectCount; p++) {
        const pStatus = projectStatuses[Math.floor(Math.random() * projectStatuses.length)];
        db.run(
            `INSERT INTO projects (name, clientName, type, startDate, endDate, status) VALUES (?, ?, ?, ?, ?, ?)`,
            [`Edge Project ${p} `, `Client ${p} Corp`, p % 2 === 0 ? 'construction' : 'IT', '2023-01-01', '2026-12-31', pStatus],
            function (err) {
                if (err) return console.error(err);
                const projectId = this.lastID;

                // 3. Generate Vendors for Project (Mixed states, Extreme ratings)
                for (let v = 1; v <= 10; v++) {
                    const type = vendorTypes[Math.floor(Math.random() * vendorTypes.length)];
                    const status = v % 5 === 0 ? 'Suspended' : v % 9 === 0 ? 'Blacklisted' : 'Active';
                    const rating = status === 'Suspended' ? Math.floor(Math.random() * 40) + 10 : Math.floor(Math.random() * 30) + 70; 
                    db.run(
                        `INSERT INTO vendors (projectId, name, type, pan, gstin, class, capability_tags, rating, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [projectId, `Vendor ${projectId}-${v} `, type, `PAN00${v}X`, `GST00${v}Y`, 'General', type, rating, status],
                        function (err) {
                            if (err) return console.error(err);
                            const vendorId = this.lastID;

                            // 4. Generate Work Orders per Project + Vendor
                            if (v % 2 === 0) { // Some vendors have WOs
                                // Create huge value or small value WOs
                                const contractValue = p % 3 === 0 ? 999999999.99 : 50000;
                                const woStatus = woStatuses[Math.floor(Math.random() * woStatuses.length)];
                                db.run(
                                    `INSERT INTO work_orders (projectId, vendorId, name, startDate, endDate, contractValue, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [projectId, vendorId, `WO ${projectId}-${v}`, '2024-01-01', '2025-01-01', contractValue, woStatus],
                                    function (err) {
                                        if (err) return console.error(err);
                                        const woId = this.lastID;

                                        // 5. Generate BOQ Items for the Project
                                        db.run(
                                            `INSERT INTO boq_items (projectId, itemCode, description, unit, estimatedQuantity, rate) VALUES (?, ?, ?, ?, ?, ?)`,
                                            [projectId, `BOQ-${projectId}-${v}`, `Item ${v}`, 'Nos', 1000, contractValue / 1000],
                                            function(err) {
                                                if (err) return console.error(err);
                                                const boqId = this.lastID;

                                                // 6. Generate Edge-Case POs
                                                const itemName = itemNames[Math.floor(Math.random() * itemNames.length)];
                                                // 10% POs are extremely large quantity
                                                const poQty = Math.floor(Math.random() * 10) === 0 ? 1000000 : 500;
                                                const poStatusStr = poStatuses[Math.floor(Math.random() * poStatuses.length)];
                                                
                                                db.run(
                                                    `INSERT INTO purchase_orders (projectId, workOrderId, vendorId, itemName, quantity, status) VALUES (?, ?, ?, ?, ?, ?)`,
                                                    [projectId, woId, vendorId, itemName, poQty, poStatusStr],
                                                    function(err){
                                                        if (err) return console.error(err);
                                                        const poId = this.lastID;

                                                        // Edge Case: Partial GRN
                                                        // Received is randomly less than PO quantity to show shortage
                                                        const receivedQty = poStatusStr === 'Delivered' ? poQty : Math.floor(poQty * (Math.random() * 0.8));
                                                        db.run(`INSERT INTO grn (projectId, workOrderId, poId, receivedQuantity) VALUES (?, ?, ?, ?)`,
                                                            [projectId, woId, poId, receivedQty]
                                                        );

                                                        // 7. Generate MBs (Some Overbilled)
                                                        const measuredQuantity = p % 4 === 0 ? 1100 : 900; // If BOQ is 1000, 1100 is an edge case (over execution)
                                                        db.run(`INSERT INTO measurement_book (projectId, workOrderId, boqId, measuredQuantity) VALUES (?, ?, ?, ?)`,
                                                            [projectId, woId, boqId, measuredQuantity]
                                                        );

                                                        // 8. Generate Bills (Draft, Pending, Paid)
                                                        const billedQuantity = p % 4 === 0 ? 1200 : measuredQuantity; // Billing more than MB is another edge case!
                                                        db.run(
                                                            `INSERT INTO bills (projectId, workOrderId, grossAmount, tds, retention, netAmount, billedQuantity, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                                            [projectId, woId, contractValue, contractValue * 0.05, contractValue * 0.05, contractValue * 0.9, billedQuantity, billStatuses[Math.floor(Math.random() * billStatuses.length)]]
                                                        );

                                                        // 9. Generate Activities
                                                        db.run(
                                                            `INSERT INTO activities (projectId, description, type) VALUES (?, ?, ?)`,
                                                            [projectId, `System generated random activity for ${itemName} under project ${projectId}`, 'SYSTEM_LOG']
                                                        );

                                                        // 10. Generate Inventory
                                                        db.run(
                                                            `INSERT INTO inventory (projectId, itemName, quantity) VALUES (?, ?, ?)`,
                                                            [projectId, itemName, receivedQty]
                                                        );

                                                        // 11. Generate Indents
                                                        const indentQty = Math.floor(poQty * 1.1); // Indent slightly more than PO
                                                        db.run(
                                                            `INSERT INTO indents (projectId, workOrderId, boqId, requestedQuantity, requiredDate, chainage, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                                            [projectId, woId, boqId, indentQty, '2025-06-01', 'CH 0+000 to CH 1+000', 'Approved']
                                                        );

                                                        // 12. Generate Milestones
                                                        db.run(
                                                            `INSERT INTO milestones (workOrderId, name, plannedPercent, actualPercent, status) VALUES (?, ?, ?, ?, ?)`,
                                                            [woId, `Milestone for ${itemName}`, 100, Math.floor(Math.random() * 90), 'In Progress']
                                                        );
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );
                            }
                        }
                    );
                }
            }
        );
    }
    
    db.run("COMMIT", () => {
        console.log("Edge case data seeded successfully. Projects: 15, Vendors: ~150, Complex hierarchies inserted.");
    });
});
