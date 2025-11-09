# Guía de Deploy - Sense-Tech

## Opción 1: Render.com (Recomendado - Gratis)

### Pasos para deploy en Render:

1. **Crear cuenta en Render.com**
   - Ve a https://render.com
   - Regístrate con GitHub, GitLab o email

2. **Conectar tu repositorio**
   - Si no tienes un repositorio Git, créalo en GitHub
   - En Render, haz clic en "New +" → "Web Service"
   - Conecta tu repositorio

3. **Configurar el servicio**
   - **Name:** sense-tech
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

4. **Variables de entorno**
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = (genera uno aleatorio, puedes usar: `openssl rand -hex 32`)

5. **Disco persistente (IMPORTANTE)**
   - En la sección "Disk", añade un disco:
     - **Name:** sense-tech-disk
     - **Mount Path:** `/opt/render/project/src`
     - **Size:** 1GB (gratis)
   - Esto es necesario para que la base de datos SQLite y los uploads persistan

6. **Deploy**
   - Haz clic en "Create Web Service"
   - Render construirá y desplegará tu aplicación automáticamente

### Notas importantes:
- La base de datos SQLite se creará automáticamente en el primer inicio
- Los archivos subidos se guardarán en el disco persistente
- El primer deploy puede tardar 5-10 minutos

---

## Opción 2: Railway.app (Alternativa)

1. Ve a https://railway.app
2. Conecta tu repositorio
3. Railway detectará automáticamente que es un proyecto Node.js
4. Añade variables de entorno:
   - `NODE_ENV=production`
   - `SESSION_SECRET=<tu-secret>`
5. Railway proporciona almacenamiento persistente automáticamente

---

## Opción 3: Vercel (Requiere configuración adicional)

Vercel está optimizado para frontend, pero puedes usar serverless functions.
Requiere refactorizar el código para usar funciones serverless.

---

## Verificación post-deploy

Después del deploy, verifica:
- ✅ La aplicación carga correctamente
- ✅ Puedes registrarte e iniciar sesión
- ✅ Los PDFs se pueden subir
- ✅ La base de datos funciona (crea un usuario de prueba)

---

## Solución de problemas

### Error: "Cannot find module"
- Verifica que todas las dependencias estén en `package.json`
- Ejecuta `npm install` localmente para verificar

### Error: "Port already in use"
- Render asigna el puerto automáticamente, no deberías tener este error
- Verifica que uses `process.env.PORT` en server.js

### Base de datos no persiste
- Asegúrate de tener un disco persistente configurado
- Verifica que el mount path sea correcto

### Archivos subidos se pierden
- Los uploads deben estar en el disco persistente
- Verifica que la carpeta `uploads/` esté en el mount path

