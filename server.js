// --- DEPENDENSI ---
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

// --- INISIALISASI ---
const app = express();
// PORT tidak lagi didefinisikan di sini, Vercel akan menanganinya

// --- KONEKSI DATABASE ---
// (Kode koneksi database Anda tetap sama persis)
const db = new sqlite3.Database('./gadai.db', (err) => {
    if (err) {
        console.error("Error saat membuka database", err.message);
    } else {
        console.log("Terhubung ke database SQLite.");
        // ... (Semua kode db.serialize Anda tetap di sini) ...
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user'
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER,
                itemName TEXT NOT NULL,
                description TEXT,
                photoUrl TEXT,
                status TEXT DEFAULT 'Diajukan',
                appraisedValue REAL DEFAULT 0,
                submissionDate TEXT,
                FOREIGN KEY(userId) REFERENCES users(id)
            )`);
            const adminEmail = 'admin@gadai.com';
            const adminPassword = 'admin123';
            db.get(`SELECT * FROM users WHERE email = ?`, [adminEmail], (err, row) => {
                if (!row) {
                    bcrypt.hash(adminPassword, 10, (err, hash) => {
                        db.run(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`, 
                            ['Admin Gadai', adminEmail, hash, 'admin'],
                            (err) => {
                                if(err) console.error("Gagal membuat user admin:", err.message)
                                else console.log(`User admin default berhasil dibuat.`);
                            }
                        );
                    });
                }
            });
        });
    }
});


// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage: storage });

// =================================================================
// PENAMBAHAN BARU: MENYAJIKAN FILE HTML SECARA EKSPLISIT
// =================================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});


// --- SEMUA API ROUTES ANDA DI SINI ---
// (Semua kode API Anda dari sini ke bawah tetap sama persis)
// ... (API Registrasi, Login, Admin Login, Submissions, dll.) ...
// --- API REGISTRASI ---
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: "Semua field harus diisi" });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
        db.run(sql, [name, email, hashedPassword], function (err) {
            if (err) {
                return res.status(500).json({ message: "Email mungkin sudah terdaftar." });
            }
            res.status(201).json({ message: "Registrasi berhasil!", userId: this.lastID });
        });
    } catch (error) {
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// --- API LOGIN ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (!user) return res.status(401).json({ message: "Email atau password salah" });
        try {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                res.json({
                    message: "Login berhasil",
                    user: { id: user.id, name: user.name, email: user.email, role: user.role }
                });
            } else {
                res.status(401).json({ message: "Email atau password salah" });
            }
        } catch (error) {
            res.status(500).json({ message: "Server error saat verifikasi password" });
        }
    });
});

// --- API ADMIN LOGIN ---
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const sql = `SELECT * FROM users WHERE email = ?`;
        db.get(sql, [email], async (err, user) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (!user) return res.status(401).json({ message: "Kredensial tidak valid" });
            if (user.role !== 'admin') {
                return res.status(403).json({ message: "Akses ditolak. Bukan admin." });
            }
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                res.json({
                    message: "Login admin berhasil",
                    user: { id: user.id, name: user.name, role: user.role }
                });
            } else {
                res.status(401).json({ message: "Kredensial tidak valid" });
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Terjadi kesalahan internal pada server." });
    }
});

// --- API PENGAJUAN GADAI ---
app.post('/api/submissions', upload.single('photo'), (req, res) => {
    const { userId, itemName, description } = req.body;
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const submissionDate = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    const sql = `INSERT INTO submissions (userId, itemName, description, photoUrl, submissionDate) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [userId, itemName, description, photoUrl, submissionDate], function(err) {
        if (err) {
            return res.status(500).json({ message: "Gagal menyimpan pengajuan" });
        }
        res.status(201).json({ message: "Pengajuan berhasil dikirim!", submissionId: this.lastID });
    });
});

app.get('/api/submissions/:userId', (req, res) => {
    const { userId } = req.params;
    const sql = `SELECT * FROM submissions WHERE userId = ? ORDER BY id DESC`;
    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ message: "Gagal mengambil data pengajuan" });
        res.json(rows);
    });
});

// --- API ENDPOINTS UNTUK ADMIN ---
app.get('/api/admin/submissions', (req, res) => {
    const sql = `
        SELECT s.*, u.name as userName, u.email as userEmail 
        FROM submissions s 
        JOIN users u ON s.userId = u.id 
        ORDER BY s.id DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ message: "Database error" });
        res.json(rows);
    });
});

app.put('/api/admin/submissions/:id', (req, res) => {
    const { id } = req.params;
    const { status, appraisedValue } = req.body;
    const sql = `UPDATE submissions SET status = ?, appraisedValue = ? WHERE id = ?`;
    db.run(sql, [status, appraisedValue, id], function(err) {
        if (err) return res.status(500).json({ message: "Gagal memperbarui pengajuan" });
        if (this.changes === 0) return res.status(404).json({ message: "Pengajuan tidak ditemukan" });
        res.json({ message: "Pengajuan berhasil diperbarui" });
    });
});

