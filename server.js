const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - Necesario para que las cookies funcionen en producción (Render.com, etc.)
// Esto permite que Express confíe en los headers X-Forwarded-* del proxy inverso
app.set('trust proxy', 1);

// Configuración de rutas para datos persistentes
// En Render, el disco se monta en /opt/render/project/data
// En desarrollo, usamos rutas relativas
// Prioridad: 1. Variable de entorno DATA_DIR, 2. Disco de Render (si existe), 3. Directorio actual
const RENDER_DATA_DIR = '/opt/render/project/data';
const DATA_DIR = process.env.DATA_DIR || 
    (fs.existsSync(RENDER_DATA_DIR) ? RENDER_DATA_DIR : __dirname);
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'sense-tech.db');

console.log('=== Configuración de Rutas ===');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('DATA_DIR:', DATA_DIR);
console.log('UPLOADS_DIR:', UPLOADS_DIR);
console.log('DB_PATH:', DB_PATH);
console.log('Usando disco persistente:', DATA_DIR === RENDER_DATA_DIR ? 'Sí' : 'No');

// Configuración de sesión
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
    secret: process.env.SESSION_SECRET || 'sense-tech-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    name: 'sense-tech.sid', // Nombre personalizado para la cookie de sesión
    cookie: {
        secure: isProduction, // true en producción (HTTPS requerido)
        httpOnly: true,
        sameSite: 'lax', // 'lax' funciona bien para mismo sitio en producción y desarrollo
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        path: '/' // Asegurar que la cookie esté disponible en toda la aplicación
    },
    // Guardar la sesión incluso si no se ha modificado (para producción)
    rolling: true
}));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// NO mover express.static aquí - debe ir después de las rutas de API

// Crear carpetas si no existen
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log('Carpeta uploads creada en:', UPLOADS_DIR);
}
const PROFILE_PICTURES_DIR = path.join(UPLOADS_DIR, 'profile-pictures');
if (!fs.existsSync(PROFILE_PICTURES_DIR)) {
    fs.mkdirSync(PROFILE_PICTURES_DIR, { recursive: true });
    console.log('Carpeta uploads/profile-pictures creada en:', PROFILE_PICTURES_DIR);
}

// Configuración de Multer para PDFs
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'pdf-' + uniqueSuffix + '.pdf');
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'));
        }
    }
});

// Configuración de Multer para imágenes de perfil
const profilePictureStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Asegurar que la carpeta existe
        if (!fs.existsSync(PROFILE_PICTURES_DIR)) {
            fs.mkdirSync(PROFILE_PICTURES_DIR, { recursive: true });
        }
        cb(null, PROFILE_PICTURES_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'profile-' + req.session.userId + '-' + uniqueSuffix + ext);
    }
});

const uploadProfilePicture = multer({
    storage: profilePictureStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'));
        }
    }
});

// Inicializar base de datos
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error al conectar con la base de datos:', err);
    } else {
        console.log('Conectado a la base de datos SQLite en:', DB_PATH);
        initializeDatabase();
    }
});

// Inicializar tablas
function initializeDatabase() {
    db.serialize(() => {
        // Tabla users
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            profile_picture TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            total_time_minutes INTEGER DEFAULT 0,
            last_activity DATETIME
        )`);

        // Tabla user_preferences
        db.run(`CREATE TABLE IF NOT EXISTS user_preferences (
            user_id INTEGER PRIMARY KEY,
            font_size REAL DEFAULT 1.0,
            high_contrast INTEGER DEFAULT 0,
            reading_speed REAL DEFAULT 1.0,
            letter_spacing REAL DEFAULT 0,
            line_height REAL DEFAULT 1.5,
            font_weight_bold INTEGER DEFAULT 0,
            larger_click_areas INTEGER DEFAULT 0,
            large_cursor INTEGER DEFAULT 0,
            disable_animations INTEGER DEFAULT 0,
            enhanced_focus INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        
        // Migración: Añadir nuevas columnas si no existen (ignora errores si ya existen)
        const newColumns = [
            { name: 'letter_spacing', type: 'REAL DEFAULT 0' },
            { name: 'line_height', type: 'REAL DEFAULT 1.5' },
            { name: 'font_weight_bold', type: 'INTEGER DEFAULT 0' },
            { name: 'larger_click_areas', type: 'INTEGER DEFAULT 0' },
            { name: 'large_cursor', type: 'INTEGER DEFAULT 0' },
            { name: 'disable_animations', type: 'INTEGER DEFAULT 0' },
            { name: 'enhanced_focus', type: 'INTEGER DEFAULT 0' },
            { name: 'voice_name', type: 'TEXT' },
            { name: 'voice_volume', type: 'REAL DEFAULT 1.0' },
            { name: 'voice_pitch', type: 'REAL DEFAULT 1.0' },
            { name: 'voice_pause', type: 'REAL DEFAULT 0.5' },
            { name: 'ui_density', type: 'TEXT DEFAULT "comfortable"' },
            { name: 'border_style', type: 'TEXT DEFAULT "rounded"' },
            { name: 'reduce_motion', type: 'INTEGER DEFAULT 0' },
            { name: 'transition_speed', type: 'TEXT DEFAULT "normal"' },
            { name: 'background_opacity', type: 'REAL DEFAULT 1.0' }
        ];
        
        newColumns.forEach(col => {
            db.run(`ALTER TABLE user_preferences ADD COLUMN ${col.name} ${col.type}`, (err) => {
                // Ignorar error si la columna ya existe
                if (err && !err.message.includes('duplicate column')) {
                    console.error(`Error al añadir columna ${col.name}:`, err);
                }
            });
        });

        // Tabla pdfs
        db.run(`CREATE TABLE IF NOT EXISTS pdfs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            user_id INTEGER,
            upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            views INTEGER DEFAULT 0,
            category TEXT DEFAULT 'Otros',
            cover_image TEXT,
            description TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // Tabla reading_progress
        db.run(`CREATE TABLE IF NOT EXISTS reading_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            pdf_id INTEGER NOT NULL,
            current_page INTEGER DEFAULT 1,
            total_pages INTEGER DEFAULT 1,
            last_read DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, pdf_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (pdf_id) REFERENCES pdfs(id)
        )`);

        // Tabla testimonials
        db.run(`CREATE TABLE IF NOT EXISTS testimonials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT NOT NULL,
            comment TEXT NOT NULL,
            rating INTEGER DEFAULT 5,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            approved INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // Tabla user_reading_time - Registro diario de tiempo de lectura
        db.run(`CREATE TABLE IF NOT EXISTS user_reading_time (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            minutes INTEGER DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // Crear usuario admin por defecto
        db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
            if (err) {
                console.error('Error al verificar admin:', err);
            } else if (!row) {
                bcrypt.hash('admin123', 10, (err, hash) => {
                    if (err) {
                        console.error('Error al hashear contraseña admin:', err);
                    } else {
                        db.run('INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)', 
                            ['admin', hash, 1], (err) => {
                                if (err) {
                                    console.error('Error al crear admin:', err);
                                } else {
                                    console.log('Usuario admin creado (username: admin, password: admin123)');
                                }
                            });
                    }
                });
            }
        });

        // Migraciones - agregar columnas si no existen (ignorar errores)
        db.run("ALTER TABLE users ADD COLUMN profile_picture TEXT", () => {});
        db.run("ALTER TABLE users ADD COLUMN last_login DATETIME", () => {});
        db.run("ALTER TABLE users ADD COLUMN total_time_minutes INTEGER DEFAULT 0", () => {});
        db.run("ALTER TABLE users ADD COLUMN last_activity DATETIME", () => {});
    });
}

// Middleware de autenticación
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ success: false, error: 'No autenticado' });
}

// Middleware de administrador
function requireAdmin(req, res, next) {
    console.log('requireAdmin - URL:', req.url, 'Method:', req.method);
    console.log('requireAdmin - Session:', req.session ? { userId: req.session.userId, isAdmin: req.session.isAdmin, username: req.session.username } : 'No session');
    
    if (!req.session || !req.session.userId) {
        console.log('requireAdmin - No autenticado');
        return res.status(401).json({ success: false, error: 'No autenticado. Por favor, inicia sesión.' });
    }
    
    if (!req.session.isAdmin) {
        console.log('requireAdmin - Usuario no es administrador:', req.session.username);
        return res.status(403).json({ success: false, error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    
    return next();
}

// ==================== ENDPOINTS DE AUTENTICACIÓN ====================

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
        }

        const hash = await bcrypt.hash(password, 10);
        
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', 
            [username, hash], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ success: false, error: 'El usuario ya existe' });
                    }
                    return res.status(500).json({ success: false, error: 'Error al crear usuario' });
                }
                
                res.json({ success: true, message: 'Usuario creado exitosamente' });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
        }

        db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error del servidor' });
            }
            
            if (!user) {
                return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
            }

            const match = await bcrypt.compare(password, user.password);
            
            if (!match) {
                return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
            }

            // Actualizar last_login y last_activity
            const now = new Date().toISOString();
            db.run('UPDATE users SET last_login = ?, last_activity = ? WHERE id = ?', 
                [now, now, user.id]);

            // Crear sesión
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.isAdmin = user.is_admin === 1;

            // Guardar la sesión explícitamente
            req.session.save((err) => {
                if (err) {
                    console.error('Error al guardar sesión:', err);
                    return res.status(500).json({ success: false, error: 'Error al iniciar sesión' });
                }
                
                console.log('Sesión creada para usuario:', user.username, 'isAdmin:', user.is_admin === 1);
                console.log('Session ID:', req.sessionID);
                
                res.json({ 
                    success: true, 
                    user: { 
                        username: user.username, 
                        isAdmin: user.is_admin === 1 
                    } 
                });
            });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error al cerrar sesión' });
        }
        res.json({ success: true });
    });
});

// Endpoint de debug para verificar el estado de la sesión (solo en desarrollo)
app.get('/api/debug/session', (req, res) => {
    res.json({
        sessionId: req.sessionID,
        session: req.session ? {
            userId: req.session.userId,
            username: req.session.username,
            isAdmin: req.session.isAdmin
        } : null,
        cookies: req.cookies,
        headers: {
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'host': req.headers['host']
        }
    });
});

app.get('/api/user', requireAuth, (req, res) => {
    db.get('SELECT id, username, is_admin, profile_picture FROM users WHERE id = ?', 
        [req.session.userId], (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error del servidor' });
            }
            res.json({ 
                user: { 
                    id: user.id,
                    username: user.username, 
                    isAdmin: user.is_admin === 1,
                    profilePicture: user.profile_picture || null
                } 
            });
        });
});

// ==================== ENDPOINTS DE PREFERENCIAS ====================

app.get('/api/user/preferences', requireAuth, (req, res) => {
    db.get('SELECT * FROM user_preferences WHERE user_id = ?', [req.session.userId], (err, prefs) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error del servidor' });
        }
        
        if (!prefs) {
            // Crear preferencias por defecto
            db.run('INSERT INTO user_preferences (user_id) VALUES (?)', [req.session.userId], function(err) {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error al crear preferencias' });
                }
                res.json({ 
                    font_size: 1.0, 
                    high_contrast: 0, 
                    reading_speed: 1.0,
                    letter_spacing: 0,
                    line_height: 1.5,
                    font_weight_bold: 0,
                    larger_click_areas: 0,
                    large_cursor: 0,
                    disable_animations: 0,
                    enhanced_focus: 0
                });
            });
        } else {
            res.json({ 
                font_size: prefs.font_size || 1.0, 
                high_contrast: prefs.high_contrast || 0, 
                reading_speed: prefs.reading_speed || 1.0,
                letter_spacing: prefs.letter_spacing || 0,
                line_height: prefs.line_height || 1.5,
                font_weight_bold: prefs.font_weight_bold || 0,
                larger_click_areas: prefs.larger_click_areas || 0,
                large_cursor: prefs.large_cursor || 0,
                disable_animations: prefs.disable_animations || 0,
                enhanced_focus: prefs.enhanced_focus || 0
            });
        }
    });
});

app.post('/api/user/preferences', requireAuth, (req, res) => {
    const { 
        font_size, 
        high_contrast, 
        reading_speed, 
        letter_spacing,
        line_height,
        font_weight_bold,
        larger_click_areas,
        large_cursor,
        disable_animations,
        enhanced_focus,
        profile_picture,
        voice_name,
        voice_volume,
        voice_pitch,
        voice_pause,
        ui_density,
        border_style,
        reduce_motion,
        transition_speed,
        background_opacity
    } = req.body;
    
    db.run(`UPDATE user_preferences SET 
        font_size = COALESCE(?, font_size),
        high_contrast = COALESCE(?, high_contrast),
        reading_speed = COALESCE(?, reading_speed),
        letter_spacing = COALESCE(?, letter_spacing),
        line_height = COALESCE(?, line_height),
        font_weight_bold = COALESCE(?, font_weight_bold),
        larger_click_areas = COALESCE(?, larger_click_areas),
        large_cursor = COALESCE(?, large_cursor),
        disable_animations = COALESCE(?, disable_animations),
        enhanced_focus = COALESCE(?, enhanced_focus),
        voice_name = COALESCE(?, voice_name),
        voice_volume = COALESCE(?, voice_volume),
        voice_pitch = COALESCE(?, voice_pitch),
        voice_pause = COALESCE(?, voice_pause),
        ui_density = COALESCE(?, ui_density),
        border_style = COALESCE(?, border_style),
        reduce_motion = COALESCE(?, reduce_motion),
        transition_speed = COALESCE(?, transition_speed),
        background_opacity = COALESCE(?, background_opacity)
        WHERE user_id = ?`, 
        [
            font_size, 
            high_contrast, 
            reading_speed,
            letter_spacing,
            line_height,
            font_weight_bold,
            larger_click_areas,
            large_cursor,
            disable_animations,
            enhanced_focus,
            voice_name,
            voice_volume,
            voice_pitch,
            voice_pause,
            ui_density,
            border_style,
            reduce_motion,
            transition_speed,
            background_opacity,
            req.session.userId
        ], function(err) {
            if (err) {
                if (err.message.includes('no such table') || this.changes === 0) {
                    // Crear si no existe
                    db.run(`INSERT INTO user_preferences 
                        (user_id, font_size, high_contrast, reading_speed, letter_spacing, line_height, 
                         font_weight_bold, larger_click_areas, large_cursor, disable_animations, enhanced_focus,
                         voice_volume, voice_pitch, voice_pause, ui_density, border_style, reduce_motion, 
                         transition_speed, background_opacity) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            req.session.userId, 
                            font_size || 1.0, 
                            high_contrast || 0, 
                            reading_speed || 1.0,
                            letter_spacing || 0,
                            line_height || 1.5,
                            font_weight_bold || 0,
                            larger_click_areas || 0,
                            large_cursor || 0,
                            disable_animations || 0,
                            enhanced_focus || 0,
                            voice_volume || 1.0,
                            voice_pitch || 1.0,
                            voice_pause || 0.5,
                            ui_density || 'comfortable',
                            border_style || 'rounded',
                            reduce_motion || 0,
                            transition_speed || 'normal',
                            background_opacity || 1.0
                        ]);
                } else {
                    return res.status(500).json({ success: false, error: 'Error al actualizar preferencias' });
                }
            }
        });

    // Actualizar profile_picture si se proporciona
    if (profile_picture !== undefined) {
        db.run('UPDATE users SET profile_picture = ? WHERE id = ?', 
            [profile_picture, req.session.userId]);
    }

    res.json({ success: true, message: 'Preferencias actualizadas' });
});

// Endpoint para subir foto de perfil
app.post('/api/user/profile-picture', requireAuth, (req, res, next) => {
    console.log('=== POST /api/user/profile-picture recibido ===');
    console.log('Usuario:', req.session.userId);
    console.log('Headers:', req.headers['content-type']);
    
    uploadProfilePicture.single('profilePicture')(req, res, (err) => {
        if (err) {
            console.error('Error de Multer:', err);
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ success: false, error: 'El archivo es demasiado grande. Máximo 5MB.' });
                }
                return res.status(400).json({ success: false, error: 'Error al procesar el archivo: ' + err.message });
            }
            return res.status(400).json({ success: false, error: err.message || 'Error al subir el archivo' });
        }
        next();
    });
}, (req, res) => {
    console.log('Procesando archivo...');
    console.log('req.file:', req.file ? 'Archivo recibido' : 'No hay archivo');
    console.log('req.body:', req.body);
    
    if (!req.file) {
        console.log('Error: No se proporcionó archivo');
        return res.status(400).json({ success: false, error: 'No se proporcionó ninguna imagen' });
    }
    
    console.log('Archivo recibido:', req.file.filename, 'Tamaño:', req.file.size, 'Tipo:', req.file.mimetype);
    
    // Ruta relativa para guardar en la base de datos
    const profilePicturePath = `/uploads/profile-pictures/${req.file.filename}`;
    
    // Eliminar foto anterior si existe
    db.get('SELECT profile_picture FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err) {
            console.error('Error al obtener foto anterior:', err);
            // Continuar de todas formas
        } else if (user && user.profile_picture && user.profile_picture.startsWith('/uploads/profile-pictures/')) {
            // Eliminar archivo anterior
            const filename = path.basename(user.profile_picture);
            const oldFilePath = path.join(PROFILE_PICTURES_DIR, filename);
            fs.unlink(oldFilePath, (err) => {
                if (err && err.code !== 'ENOENT') {
                    console.error('Error al eliminar foto anterior:', err);
                }
            });
        }
        
        // Actualizar en la base de datos
        db.run('UPDATE users SET profile_picture = ? WHERE id = ?', 
            [profilePicturePath, req.session.userId], 
            function(err) {
                if (err) {
                    console.error('Error al actualizar en BD:', err);
                    // Eliminar archivo subido si hay error
                    fs.unlink(req.file.path, () => {});
                    return res.status(500).json({ success: false, error: 'Error al guardar la foto de perfil en la base de datos' });
                }
                
                console.log('Foto de perfil actualizada exitosamente para usuario:', req.session.userId);
                res.json({ 
                    success: true, 
                    message: 'Foto de perfil actualizada',
                    profilePicture: profilePicturePath
                });
            });
    });
});

// ==================== ENDPOINTS DE PROGRESO ====================

app.post('/api/user/progress', requireAuth, (req, res) => {
    const { pdf_id, current_page, total_pages } = req.body;
    
    if (!pdf_id || !current_page || !total_pages) {
        return res.status(400).json({ success: false, error: 'Datos incompletos' });
    }

    db.run(`INSERT INTO reading_progress (user_id, pdf_id, current_page, total_pages, last_read)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, pdf_id) DO UPDATE SET
        current_page = excluded.current_page,
        total_pages = excluded.total_pages,
        last_read = CURRENT_TIMESTAMP`,
        [req.session.userId, pdf_id, current_page, total_pages], function(err) {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error al guardar progreso' });
            }
            res.json({ success: true });
        });
});

app.get('/api/user/progress', requireAuth, (req, res) => {
    // Obtener tiempo total del usuario
    db.get('SELECT total_time_minutes FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error del servidor' });
        }
        
        const totalTimeMinutes = user ? (user.total_time_minutes || 0) : 0;
        
        // Obtener progreso de lectura
        db.all(`SELECT rp.current_page, rp.total_pages, rp.last_read,
                p.original_name, p.cover_image, p.category, p.views, p.id as pdf_id
                FROM reading_progress rp
                JOIN pdfs p ON rp.pdf_id = p.id
                WHERE rp.user_id = ?
                ORDER BY rp.last_read DESC`,
            [req.session.userId], (err, rows) => {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error del servidor' });
                }
                
                // Devolver progreso junto con estadísticas
                res.json({
                    progress: rows || [],
                    stats: {
                        totalTimeMinutes: totalTimeMinutes,
                        totalBooks: rows ? rows.length : 0
                    }
                });
            });
    });
});

// ==================== ENDPOINTS DE ACTIVIDAD ====================

app.post('/api/user/activity', requireAuth, (req, res) => {
    const minutes = req.body.minutes || 0;
    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Actualizar tiempo total del usuario
    db.run('UPDATE users SET total_time_minutes = total_time_minutes + ?, last_activity = ? WHERE id = ?',
        [minutes, now, req.session.userId], (err) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error al actualizar actividad' });
            }
            
            // Registrar tiempo de lectura del día
            db.run(`INSERT INTO user_reading_time (user_id, date, minutes, last_updated)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id, date) DO UPDATE SET
                    minutes = minutes + excluded.minutes,
                    last_updated = excluded.last_updated`,
                [req.session.userId, today, minutes, now], (err2) => {
                    if (err2) {
                        console.error('Error al registrar tiempo diario:', err2);
                    }
                    res.json({ success: true });
                });
        });
});

// Endpoint para obtener actividad por período
app.get('/api/user/activity/stats', requireAuth, (req, res) => {
    const period = req.query.period || '7days'; // 7days, 1week, 1month
    
    let daysBack = 7;
    if (period === '1week') {
        daysBack = 7; // 1 semana = 7 días (mismo que 7days pero con agrupación semanal)
    } else if (period === '1month') {
        daysBack = 30; // 1 mes = 30 días
    }
    
    console.log('=== GET /api/user/activity/stats ===');
    console.log('Period:', period);
    console.log('Days back:', daysBack);
    console.log('User ID:', req.session.userId);
    
    // Obtener actividad agrupada por día
    // Calcular la fecha límite en JavaScript para evitar problemas con SQLite
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - daysBack);
    dateThreshold.setHours(0, 0, 0, 0);
    const dateThresholdISO = dateThreshold.toISOString();
    
    console.log('=== Activity Stats Request ===');
    console.log('Date threshold:', dateThresholdISO);
    console.log('Days back:', daysBack);
    console.log('User ID:', req.session.userId);
    
    // Primero obtener el tiempo total del usuario
    db.get('SELECT total_time_minutes FROM users WHERE id = ?', [req.session.userId], (err, userRow) => {
        if (err) {
            console.error('Error al obtener tiempo total del usuario:', err);
            return res.status(500).json({ success: false, error: 'Error al obtener estadísticas' });
        }
        
        const totalTimeMinutes = userRow ? (userRow.total_time_minutes || 0) : 0;
        console.log('Total time minutes for user:', totalTimeMinutes);
        
        // Obtener tiempo de lectura por día de la nueva tabla
        const query = `SELECT 
                date,
                minutes
                FROM user_reading_time
                WHERE user_id = ? 
                AND date >= date(?)
                ORDER BY date ASC`;
        
        console.log('Executing query with params:', req.session.userId, dateThresholdISO.split('T')[0]);
        
        db.all(query, [req.session.userId, dateThresholdISO.split('T')[0]], (err, rows) => {
                if (err) {
                    console.error('Error al obtener estadísticas de actividad:', err);
                    return res.status(500).json({ success: false, error: 'Error al obtener estadísticas' });
                }
                
                console.log('=== Activity Stats Query Results ===');
                console.log('Rows from user_reading_time:', rows ? rows.length : 0);
                if (rows && rows.length > 0) {
                    console.log('Sample rows:', rows.slice(0, 3));
                }
                
                // Si no hay datos en user_reading_time pero hay tiempo total, usar reading_progress para aproximar
                if ((!rows || rows.length === 0) && totalTimeMinutes > 0) {
                    console.log('No hay datos en user_reading_time, usando reading_progress para aproximar...');
                    
                    // Obtener TODAS las fechas de actividad de reading_progress (no solo del período)
                    db.all(`SELECT 
                            strftime('%Y-%m-%d', last_read) as date,
                            COUNT(*) as sessions
                            FROM reading_progress
                            WHERE user_id = ?
                            GROUP BY strftime('%Y-%m-%d', last_read)
                            ORDER BY date ASC`,
                        [req.session.userId], (err2, allProgressRows) => {
                            if (err2) {
                                console.error('Error al obtener progreso:', err2);
                                return res.status(500).json({ success: false, error: 'Error al obtener estadísticas' });
                            }
                            
                            // Crear un objeto con todas las fechas del período
                            const activityData = {};
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            
                            for (let i = daysBack - 1; i >= 0; i--) {
                                const date = new Date(today);
                                date.setDate(date.getDate() - i);
                                const dateStr = date.toISOString().split('T')[0];
                                activityData[dateStr] = {
                                    date: dateStr,
                                    reading_time_minutes: 0
                                };
                            }
                            
                            // Filtrar solo las fechas dentro del período
                            const periodProgressRows = allProgressRows ? allProgressRows.filter(row => {
                                const rowDate = row.date ? row.date.trim() : null;
                                return rowDate && activityData[rowDate];
                            }) : [];
                            
                            // Distribuir el tiempo total proporcionalmente según las sesiones del período
                            if (periodProgressRows && periodProgressRows.length > 0) {
                                const totalSessions = periodProgressRows.reduce((sum, row) => sum + (parseInt(row.sessions) || 0), 0);
                                if (totalSessions > 0) {
                                    // Calcular cuánto tiempo corresponde a este período
                                    // Si hay actividad fuera del período, distribuir solo una parte proporcional
                                    const allSessions = allProgressRows.reduce((sum, row) => sum + (parseInt(row.sessions) || 0), 0);
                                    const periodTimeMinutes = allSessions > 0 ? Math.round((totalTimeMinutes * totalSessions) / allSessions) : totalTimeMinutes;
                                    
                                    const minutesPerSession = totalSessions > 0 ? Math.round(periodTimeMinutes / totalSessions) : 0;
                                    
                                    periodProgressRows.forEach(row => {
                                        const rowDate = row.date ? row.date.trim() : null;
                                        if (rowDate && activityData[rowDate]) {
                                            const sessions = parseInt(row.sessions) || 0;
                                            activityData[rowDate].reading_time_minutes = sessions * minutesPerSession;
                                        }
                                    });
                                    
                                    console.log('Distribuyendo tiempo:', periodTimeMinutes, 'minutos en', totalSessions, 'sesiones del período');
                                }
                            }
                            
                            // Convertir a array y formatear fechas
                            const result = Object.values(activityData).map(item => ({
                                date: item.date,
                                label: formatDateLabel(item.date, period),
                                reading_time_minutes: parseInt(item.reading_time_minutes) || 0
                            }));
                            
                            console.log('Final result (aproximado):');
                            console.log('- Total days:', result.length);
                            console.log('- Sample data:', JSON.stringify(result.slice(0, 3), null, 2));
                            console.log('- Total time in period:', result.reduce((sum, r) => sum + r.reading_time_minutes, 0), 'minutes');
                            
                            res.json({ success: true, data: result });
                        });
                } else {
                    // Usar datos de user_reading_time
                    // Crear un objeto con todas las fechas del período
                    const activityData = {};
                    const today = new Date();
                    today.setHours(0, 0, 0, 0); // Normalizar a medianoche
                    
                    for (let i = daysBack - 1; i >= 0; i--) {
                        const date = new Date(today);
                        date.setDate(date.getDate() - i);
                        const dateStr = date.toISOString().split('T')[0];
                        activityData[dateStr] = {
                            date: dateStr,
                            reading_time_minutes: 0
                        };
                    }
                    
                    console.log('Generated date range:', Object.keys(activityData)[0], 'to', Object.keys(activityData)[Object.keys(activityData).length - 1]);
                    
                    // Llenar con datos reales
                    if (rows && rows.length > 0) {
                        rows.forEach(row => {
                            const rowDate = row.date ? row.date.trim() : null;
                            console.log('Processing row - date:', rowDate, 'minutes:', row.minutes);
                            if (rowDate && activityData[rowDate]) {
                                activityData[rowDate].reading_time_minutes = parseInt(row.minutes) || 0;
                            } else if (rowDate) {
                                console.log('⚠️ Date from DB not in range:', rowDate);
                            }
                        });
                    } else {
                        console.log('⚠️ No rows returned - user may not have reading activity in this period');
                    }
                    
                    // Convertir a array y formatear fechas
                    const result = Object.values(activityData).map(item => ({
                        date: item.date,
                        label: formatDateLabel(item.date, period),
                        reading_time_minutes: parseInt(item.reading_time_minutes) || 0
                    }));
                    
                    console.log('Final result:');
                    console.log('- Total days:', result.length);
                    console.log('- Sample data:', JSON.stringify(result.slice(0, 3), null, 2));
                    console.log('- Has activity:', result.some(r => r.reading_time_minutes > 0));
                    
                    res.json({ success: true, data: result });
                }
            });
    });
});

function formatDateLabel(dateStr, period) {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Comparar fechas sin hora
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    
    if (dateOnly.getTime() === todayOnly.getTime()) {
        return 'Hoy';
    } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
        return 'Ayer';
    } else if (period === '1month') {
        // Para 1 mes, mostrar día y mes
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } else {
        // Para 7 días y 1 semana, mostrar día de la semana
        return date.toLocaleDateString('es-ES', { weekday: 'short' });
    }
}

// ==================== ENDPOINTS DE PDFs ====================

app.get('/api/pdfs', requireAuth, (req, res) => {
    db.all('SELECT * FROM pdfs ORDER BY upload_date DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error del servidor' });
        }
        res.json(rows);
    });
});

app.get('/api/pdfs/popular', requireAuth, (req, res) => {
    db.all('SELECT * FROM pdfs ORDER BY views DESC LIMIT 10', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error del servidor' });
        }
        res.json(rows);
    });
});

app.get('/api/pdfs/category/:category', requireAuth, (req, res) => {
    const category = req.params.category;
    
    let query = 'SELECT * FROM pdfs';
    let params = [];
    
    if (category !== 'all') {
        query += ' WHERE COALESCE(category, \'Otros\') = ?';
        params.push(category);
    }
    
    query += ' ORDER BY upload_date DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error del servidor' });
        }
        
        // Garantizar valores por defecto
        const normalizedRows = rows.map(row => ({
            ...row,
            category: row.category || 'Otros',
            cover_image: row.cover_image || null,
            description: row.description || null,
            views: row.views || 0
        }));
        
        res.json(normalizedRows);
    });
});

app.post('/api/pdfs/upload', requireAdmin, upload.array('pdf', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No se proporcionaron archivos' });
        }

        const { category, description, cover_image } = req.body;
        const uploadedPdfs = [];
        let errors = [];

        for (const file of req.files) {
            db.run(`INSERT INTO pdfs (filename, original_name, user_id, category, description, cover_image)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [file.filename, file.originalname, req.session.userId, 
                 category || 'Otros', description || null, cover_image || null],
                function(err) {
                    if (err) {
                        errors.push({ file: file.originalname, error: err.message });
                    } else {
                        uploadedPdfs.push({ id: this.lastID, filename: file.originalname });
                    }
                });
        }

        // Esperar un momento para que se completen las inserciones
        setTimeout(() => {
            if (uploadedPdfs.length > 0) {
                res.json({ 
                    success: true, 
                    message: `${uploadedPdfs.length} PDF(s) subido(s) exitosamente`,
                    pdfIds: uploadedPdfs.map(p => p.id)
                });
            } else {
                res.status(500).json({ success: false, error: 'Error al subir PDFs', errors });
            }
        }, 500);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al procesar archivos' });
    }
});

// Endpoint para actualizar un PDF (debe ir ANTES de las rutas GET con :id para evitar conflictos)
app.put('/api/pdfs/:id', requireAdmin, (req, res) => {
    console.log('=== PUT /api/pdfs/:id ENDPOINT HIT ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Params:', req.params);
    console.log('Body:', req.body);
    
    try {
        const pdfId = parseInt(req.params.id);
        const { original_name, category, description, cover_image } = req.body;
        
        console.log('PUT /api/pdfs/:id - Procesando - ID:', pdfId);
        
        if (!pdfId || isNaN(pdfId)) {
            console.log('Error: ID de PDF inválido');
            return res.status(400).json({ success: false, error: 'ID de PDF inválido' });
        }
        
        if (!original_name || !original_name.trim()) {
            console.log('Error: Nombre de PDF requerido');
            return res.status(400).json({ success: false, error: 'El nombre del PDF es requerido' });
        }
        
        // Validar que el PDF existe
        db.get('SELECT id FROM pdfs WHERE id = ?', [pdfId], (err, pdf) => {
            if (err) {
                console.error('Error al verificar PDF:', err);
                return res.status(500).json({ success: false, error: 'Error al verificar el PDF' });
            }
            
            if (!pdf) {
                console.log('Error: PDF no encontrado');
                return res.status(404).json({ success: false, error: 'PDF no encontrado' });
            }
            
            // Actualizar el PDF
            db.run(`UPDATE pdfs 
                    SET original_name = ?, category = ?, description = ?, cover_image = ?
                    WHERE id = ?`,
                [original_name.trim(), category || 'Otros', description ? description.trim() : null, cover_image ? cover_image.trim() : null, pdfId],
                function(err) {
                    if (err) {
                        console.error('Error al actualizar PDF:', err);
                        return res.status(500).json({ success: false, error: 'Error al actualizar el PDF: ' + err.message });
                    }
                    
                    console.log('PDF actualizado exitosamente - ID:', pdfId);
                    res.json({ 
                        success: true, 
                        message: 'PDF actualizado exitosamente' 
                    });
                });
        });
    } catch (error) {
        console.error('Error en PUT /api/pdfs/:id:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

// Rutas GET con parámetros :id al final (después de PUT/POST/DELETE)
app.get('/api/pdfs/:id/text', requireAuth, async (req, res) => {
    try {
        const pdfId = req.params.id;
        
        db.get('SELECT filename FROM pdfs WHERE id = ?', [pdfId], async (err, pdf) => {
            if (err || !pdf) {
                return res.status(404).json({ success: false, error: 'PDF no encontrado' });
            }
            
            const filePath = path.join(UPLOADS_DIR, pdf.filename);
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            
            res.json({ text: data.text });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al extraer texto del PDF' });
    }
});

app.get('/api/pdfs/:id', requireAuth, (req, res) => {
    const pdfId = req.params.id;
    
    // Incrementar contador de vistas
    db.run('UPDATE pdfs SET views = views + 1 WHERE id = ?', [pdfId]);
    
    // Obtener información del PDF
    db.get('SELECT filename FROM pdfs WHERE id = ?', [pdfId], (err, pdf) => {
        if (err || !pdf) {
            return res.status(404).json({ success: false, error: 'PDF no encontrado' });
        }
        
        const filePath = path.join(UPLOADS_DIR, pdf.filename);
        res.sendFile(filePath);
    });
});

// ==================== ENDPOINTS DE ADMINISTRACIÓN ====================

app.get('/api/admin/stats', requireAdmin, (req, res) => {
    db.get('SELECT COUNT(*) as totalUsers FROM users', [], (err, usersRow) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error del servidor' });
        }
        
        db.get('SELECT COUNT(*) as totalPdfs FROM pdfs', [], (err, pdfsRow) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error del servidor' });
            }
            
            db.get('SELECT SUM(views) as totalViews FROM pdfs', [], (err, viewsRow) => {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error del servidor' });
                }
                
                res.json({
                    totalUsers: usersRow.totalUsers,
                    totalPdfs: pdfsRow.totalPdfs,
                    totalViews: viewsRow.totalViews || 0
                });
            });
        });
    });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
    db.all(`SELECT u.id, u.username, u.is_admin, u.created_at, u.last_login, 
            u.total_time_minutes, u.last_activity,
            COUNT(DISTINCT rp.pdf_id) as books_read,
            COUNT(rp.id) as total_books,
            COALESCE(AVG(CASE WHEN rp.total_pages > 0 THEN 
                (rp.current_page * 100.0 / rp.total_pages) ELSE 0 END), 0) as avg_progress_percent
            FROM users u
            LEFT JOIN reading_progress rp ON u.id = rp.user_id
            GROUP BY u.id
            ORDER BY u.created_at DESC`,
        [], (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error del servidor' });
            }
            res.json(rows);
        });
});

app.get('/api/admin/users/connected', requireAdmin, (req, res) => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    db.all(`SELECT id, username, is_admin, last_activity
            FROM users
            WHERE last_activity > ?
            ORDER BY last_activity DESC`,
        [thirtyMinutesAgo], (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error del servidor' });
            }
            res.json(rows);
        });
});

app.get('/api/admin/users/:userId/details', requireAdmin, (req, res) => {
    const userId = req.params.userId;
    
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        
        db.all(`SELECT rp.*, p.original_name, p.cover_image, p.category
                FROM reading_progress rp
                JOIN pdfs p ON rp.pdf_id = p.id
                WHERE rp.user_id = ?
                ORDER BY rp.last_read DESC`,
            [userId], (err, progress) => {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error del servidor' });
                }
                
                const hours = Math.floor(user.total_time_minutes / 60);
                const minutes = user.total_time_minutes % 60;
                
                res.json({
                    user: {
                        ...user,
                        total_time_formatted: `${hours}h ${minutes}m`
                    },
                    progress: progress || []
                });
            });
    });
});

// Eliminar usuario
app.delete('/api/admin/users/:userId', requireAdmin, (req, res) => {
    const userId = parseInt(req.params.userId);
    
    // No permitir eliminar el propio usuario admin
    if (userId === req.session.userId) {
        return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta' });
    }
    
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        
        // Eliminar en cascada: progreso, preferencias, testimonios
        db.run('DELETE FROM reading_progress WHERE user_id = ?', [userId], (err) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error al eliminar progreso del usuario' });
            }
            
            db.run('DELETE FROM user_preferences WHERE user_id = ?', [userId], (err) => {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error al eliminar preferencias del usuario' });
                }
                
                db.run('DELETE FROM testimonials WHERE user_id = ?', [userId], (err) => {
                    if (err) {
                        return res.status(500).json({ success: false, error: 'Error al eliminar testimonios del usuario' });
                    }
                    
                    // Finalmente eliminar el usuario
                    db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
                        if (err) {
                            return res.status(500).json({ success: false, error: 'Error al eliminar usuario' });
                        }
                        
                        res.json({ success: true, message: 'Usuario eliminado exitosamente' });
                    });
                });
            });
        });
    });
});

// Eliminar PDF
app.delete('/api/admin/pdfs/:pdfId', requireAdmin, (req, res) => {
    const pdfId = parseInt(req.params.pdfId);
    
    db.get('SELECT filename FROM pdfs WHERE id = ?', [pdfId], (err, pdf) => {
        if (err || !pdf) {
            return res.status(404).json({ success: false, error: 'PDF no encontrado' });
        }
        
        const filePath = path.join(UPLOADS_DIR, pdf.filename);
        
        // Eliminar en cascada: progreso de lectura
        db.run('DELETE FROM reading_progress WHERE pdf_id = ?', [pdfId], (err) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error al eliminar progreso del PDF' });
            }
            
            // Eliminar el registro de la base de datos
            db.run('DELETE FROM pdfs WHERE id = ?', [pdfId], (err) => {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error al eliminar PDF de la base de datos' });
                }
                
                // Eliminar el archivo físico si existe
                if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('Error al eliminar archivo físico:', err);
                            // No fallar si el archivo no existe, ya eliminamos el registro
                        }
                        res.json({ success: true, message: 'PDF eliminado exitosamente' });
                    });
                } else {
                    res.json({ success: true, message: 'PDF eliminado exitosamente' });
                }
            });
        });
    });
});

// ==================== ENDPOINTS PÚBLICOS ====================

app.get('/api/public/stats', (req, res) => {
    db.get('SELECT COUNT(*) as totalUsers FROM users', [], (err, usersRow) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error del servidor' });
        }
        
        db.get('SELECT COUNT(*) as totalPdfs FROM pdfs', [], (err, pdfsRow) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error del servidor' });
            }
            
            db.get('SELECT SUM(views) as totalViews FROM pdfs', [], (err, viewsRow) => {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error del servidor' });
                }
                
                res.json({
                    totalUsers: usersRow.totalUsers,
                    totalPdfs: pdfsRow.totalPdfs,
                    totalViews: viewsRow.totalViews || 0
                });
            });
        });
    });
});

app.get('/api/public/testimonials', (req, res) => {
    db.all(`SELECT * FROM testimonials 
            WHERE approved = 1 
            ORDER BY created_at DESC 
            LIMIT 10`,
        [], (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error del servidor' });
            }
            res.json(rows);
        });
});

app.post('/api/testimonials', requireAuth, (req, res) => {
    const { comment, rating } = req.body;
    
    if (!comment) {
        return res.status(400).json({ success: false, error: 'Comentario requerido' });
    }

    db.run(`INSERT INTO testimonials (user_id, username, comment, rating)
            VALUES (?, ?, ?, ?)`,
        [req.session.userId, req.session.username, comment, rating || 5],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error al crear testimonio' });
            }
            res.json({ success: true, message: 'Testimonio creado exitosamente' });
        });
});

// Servir archivos estáticos DESPUÉS de todas las rutas de API
// IMPORTANTE: Express.static debe ir después de todas las rutas de API
app.use(express.static('public'));
// Servir archivos uploads desde el directorio de datos persistente
app.use('/uploads', express.static(UPLOADS_DIR));

// Manejar todas las demás rutas (SPA) - debe ir al final
app.get('*', (req, res) => {
    // Solo servir index.html para rutas que no sean API
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        // Para rutas API no encontradas, devolver JSON
        res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
    }
});

// Verificar que todas las rutas estén registradas
console.log('\n=== RUTAS REGISTRADAS ===');
console.log('PUT /api/pdfs/:id - Registrada:', typeof app._router !== 'undefined');

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Servidor ejecutándose en http://localhost:${PORT}`);
    console.log('✅ Endpoint PUT /api/pdfs/:id está registrado');
    console.log('✅ Listo para recibir peticiones\n');
});

