const db = require('./db');

const vendorTypes = ['Material Supply', 'Logistics', 'Software', 'Consulting'];
const itemNames = ['Steel Beams', 'Gravel Tons', 'Cement Bags', 'Server Licenses'];
const poStatuses = ['Pending', 'Approved', 'Dispatched', 'Delivered'];
const billStatuses = ['Draft', 'Under Review', 'Approved', 'Paid'];

// Default projectId for stress-test data (assumes seeded project 1 exists)
const DEFAULT_PROJECT_ID = 1;

console.log("Starting massive data seed...");

db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // First, create a work order to bind POs and Bills to
    db.run(
        `INSERT INTO work_orders (projectId, vendorId, name, startDate, endDate, contractValue, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [DEFAULT_PROJECT_ID, 1, 'WO-STRESS: Bulk Stress Test Order', '2025-01-01', '2026-12-31', 999999999, 'In Progress'],
        function (err) {
            if (err) return console.error("Failed to create stress WO:", err);
            const stressWorkOrderId = this.lastID;
            console.log(`Created stress Work Order ID: ${stressWorkOrderId}`);

            // Generate 100 Vendors bound to projectId
            for (let i = 1; i <= 100; i++) {
                const type = vendorTypes[Math.floor(Math.random() * vendorTypes.length)];
                const vendorName = `Mega Vendor ${i} Corp`;
                const pan = 'STRSS' + String(i).padStart(4, '0') + 'F';
                const gstin = '36STRSS' + String(i).padStart(4, '0') + 'F1Z5';
                const rating = Math.floor(Math.random() * 30) + 70; // 70-100

                db.run(
                    `INSERT INTO vendors (projectId, name, type, pan, gstin, class, capability_tags, rating, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [DEFAULT_PROJECT_ID, vendorName, type, pan, gstin, 'General', type, rating, 'Active'],
                    function (err) {
                        if (err) return console.error(err);
                        const vendorId = this.lastID;

                        // Generate 2 POs per Vendor bound to project + work order
                        for (let j = 1; j <= 2; j++) {
                            const item = itemNames[Math.floor(Math.random() * itemNames.length)];
                            const quantity = Math.floor(Math.random() * 500) + 10;
                            const poStatus = poStatuses[Math.floor(Math.random() * poStatuses.length)];

                            db.run(
                                `INSERT INTO purchase_orders (projectId, workOrderId, vendorId, itemName, quantity, status) VALUES (?, ?, ?, ?, ?, ?)`,
                                [DEFAULT_PROJECT_ID, stressWorkOrderId, vendorId, item, quantity, poStatus],
                                function (err) {
                                    if (err) return console.error(err);

                                    // Generate 1 Bill per PO bound to project + work order
                                    const gross = quantity * (Math.random() * 100 + 50);
                                    const tds = gross * 0.02;
                                    const retention = gross * 0.05;
                                    const net = gross - tds - retention;
                                    const bStatus = billStatuses[Math.floor(Math.random() * billStatuses.length)];

                                    db.run(
                                        `INSERT INTO bills (projectId, workOrderId, grossAmount, tds, retention, netAmount, billedQuantity, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                        [DEFAULT_PROJECT_ID, stressWorkOrderId, gross, tds, retention, net, quantity, bStatus]
                                    );
                                }
                            );
                        }
                    }
                );
            }

            db.run("COMMIT", () => {
                console.log("Massive data seeded successfully (100 vendors, 200 POs, 200 bills).");
            });
        }
    );
});
