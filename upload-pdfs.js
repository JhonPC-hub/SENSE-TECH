const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
// Usar node-fetch
const fetch = require('node-fetch');

// Configuración
const PDFS_DIR = 'c:\\Users\\JhonS\\Desktop\\pdfs';
const API_BASE = 'http://localhost:3000';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

// Mapeo de carpetas a categorías
const CATEGORY_MAP = {
    'Software': 'Software',
    'Bases de datos': 'Bases de Datos',
    'Fronted': 'Frontend', // Corregir typo
    'Backend': 'Backend'
};

// Función para hacer login
async function login() {
    try {
        const response = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: ADMIN_USERNAME,
                password: ADMIN_PASSWORD
            })
        });

        const data = await response.json();
        
        if (data.success) {
            // Extraer cookies de la respuesta
            const setCookieHeader = response.headers.raw()['set-cookie'];
            if (setCookieHeader && setCookieHeader.length > 0) {
                // Extraer solo el valor de la cookie de sesión
                const sessionCookie = setCookieHeader.find(c => c.includes('connect.sid'));
                if (sessionCookie) {
                    return sessionCookie.split(';')[0];
                }
                return setCookieHeader.join('; ');
            }
            // Si no hay cookies en set-cookie, intentar obtenerlas de otra forma
            return '';
        } else {
            throw new Error('Error al iniciar sesión: ' + data.error);
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error('No se puede conectar al servidor. Asegúrate de que esté corriendo en http://localhost:3000');
        }
        throw new Error('Error de conexión al hacer login: ' + error.message);
    }
}

// Función para subir un PDF
async function uploadPdf(filePath, category, cookies) {
    return new Promise((resolve, reject) => {
        try {
            const formData = new FormData();
            const fileName = path.basename(filePath);
            
            // Agregar el archivo
            formData.append('pdf', fs.createReadStream(filePath), fileName);
            
            // Agregar categoría
            formData.append('category', category);
            
            // Agregar descripción basada en el nombre del archivo
            const description = `Documento: ${fileName.replace('.pdf', '')}`;
            formData.append('description', description);

            // Usar headers de form-data
            const headers = formData.getHeaders();
            if (cookies) {
                headers['Cookie'] = cookies;
            }

            fetch(`${API_BASE}/api/pdfs/upload`, {
                method: 'POST',
                headers: headers,
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log(`✅ Subido: ${fileName} (${category})`);
                    resolve(data);
                } else {
                    console.error(`❌ Error al subir ${fileName}: ${data.error}`);
                    reject(new Error(data.error));
                }
            })
            .catch(error => {
                console.error(`❌ Error al subir ${fileName}:`, error.message);
                reject(error);
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Función principal
async function main() {
    console.log('🚀 Iniciando subida masiva de PDFs...\n');
    
    // Verificar que el directorio existe
    if (!fs.existsSync(PDFS_DIR)) {
        console.error(`❌ Error: El directorio ${PDFS_DIR} no existe`);
        process.exit(1);
    }

    // Hacer login
    console.log('🔐 Autenticando como administrador...');
    let cookies;
    try {
        cookies = await login();
        console.log('✅ Login exitoso\n');
    } catch (error) {
        console.error('❌ Error al autenticar:', error.message);
        console.log('\n💡 Asegúrate de que el servidor esté corriendo en http://localhost:3000');
        process.exit(1);
    }

    // Leer carpetas de categorías
    const categories = fs.readdirSync(PDFS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    console.log(`📁 Categorías encontradas: ${categories.join(', ')}\n`);

    let totalUploaded = 0;
    let totalErrors = 0;

    // Procesar cada categoría
    for (const folderName of categories) {
        const category = CATEGORY_MAP[folderName] || 'Otros';
        const categoryPath = path.join(PDFS_DIR, folderName);

        console.log(`📂 Procesando categoría: ${category} (${folderName})`);

        // Leer archivos PDF de la carpeta
        const files = fs.readdirSync(categoryPath)
            .filter(file => file.toLowerCase().endsWith('.pdf'));

        if (files.length === 0) {
            console.log(`   ⚠️  No se encontraron PDFs en esta carpeta\n`);
            continue;
        }

        console.log(`   📄 Encontrados ${files.length} PDF(s)\n`);

        // Subir cada PDF
        for (const file of files) {
            const filePath = path.join(categoryPath, file);
            
            try {
                await uploadPdf(filePath, category, cookies);
                totalUploaded++;
                
                // Pequeña pausa entre archivos
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                totalErrors++;
                console.error(`   ❌ Error: ${error.message}\n`);
            }
        }

        console.log('');
    }

    // Resumen
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESUMEN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ PDFs subidos exitosamente: ${totalUploaded}`);
    console.log(`❌ Errores: ${totalErrors}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (totalUploaded > 0) {
        console.log('🎉 ¡Subida completada! Puedes ver los PDFs en el dashboard.');
    }
}

// Ejecutar
main().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});

