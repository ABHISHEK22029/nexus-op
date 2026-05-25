const db = require('../db');

exports.getProjects = (req, res) => {
    db.all("SELECT * FROM projects", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};

exports.createProject = (req, res) => {
    const { name, clientName, type, startDate, endDate, status } = req.body;
    db.run(
        `INSERT INTO projects (name, clientName, type, startDate, endDate, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, clientName, type, startDate, endDate, status || 'Active'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: 'Project Created Successfully' });
        }
    );
};
