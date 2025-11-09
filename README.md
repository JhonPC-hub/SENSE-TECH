# Sense-Tech

Plataforma web accesible diseñada para estudiantes de ingeniería en sistemas con baja visión. Permite leer documentos PDF mediante tecnología de text-to-speech (texto a voz) en español.

## Características Principales

- 📖 **Text-to-Speech**: Reproduce documentos PDF en voz alta con síntesis de voz en español
- ♿ **Accesibilidad**: Diseño completamente accesible con navegación por teclado, alto contraste y ajuste de tamaño de fuente
- 📚 **Biblioteca Digital**: Organiza documentos por categorías (Software, Bases de Datos, Frontend, Backend, Otros)
- 📊 **Seguimiento de Progreso**: Guarda automáticamente tu progreso de lectura
- 🎨 **Diseño Moderno**: Interfaz elegante con modo oscuro/claro
- 📱 **Responsive**: Funciona perfectamente en móvil, tablet y escritorio
- 👥 **Panel de Administración**: Gestión completa de usuarios y contenido

## Requisitos

- Node.js 14 o superior
- npm o yarn

## Instalación

1. Clonar o descargar el repositorio
2. Instalar dependencias:

```bash
npm install
```

3. Iniciar el servidor:

```bash
npm start
```

Para desarrollo con auto-reload:

```bash
npm run dev
```

4. Abrir en el navegador: `http://localhost:3000`

## Credenciales por Defecto

**Administrador:**
- Usuario: `admin`
- Contraseña: `admin123`

## Estructura del Proyecto

```
PROJECT/
├── server.js                 # Servidor Express principal
├── package.json              # Dependencias npm
├── sense-tech.db             # Base de datos SQLite (auto-generada)
├── uploads/                  # Carpeta de PDFs subidos
└── public/                   # Archivos estáticos
    ├── index.html           # HTML principal (SPA)
    ├── about.html           # Página "Acerca de"
    ├── app.js               # JavaScript frontend
    ├── styles.css           # Estilos CSS personalizados
    └── images/              # Assets de imágenes
        ├── logo.png         # Logo modo claro
        └── logo2.png        # Logo modo oscuro
```

## Uso

### Para Usuarios

1. **Registrarse**: Crea una cuenta nueva desde la página de inicio
2. **Iniciar Sesión**: Accede con tus credenciales
3. **Explorar PDFs**: Navega por categorías en el dashboard
4. **Leer Documentos**: Haz clic en "Leer documento" para abrir el visor
5. **Text-to-Speech**: Usa el botón de reproducir para escuchar el contenido
6. **Ajustar Configuración**: Personaliza velocidad, voz y preferencias en "Preferencias"

### Para Administradores

1. **Subir PDFs**: Usa el panel de administración para subir múltiples PDFs
2. **Gestionar Usuarios**: Visualiza estadísticas y detalles de usuarios
3. **Monitorear Actividad**: Ve usuarios conectados y estadísticas en tiempo real

## API Endpoints

### Autenticación
- `POST /api/register` - Registro de usuario
- `POST /api/login` - Iniciar sesión
- `POST /api/logout` - Cerrar sesión
- `GET /api/user` - Obtener usuario actual

### PDFs
- `GET /api/pdfs` - Listar todos los PDFs
- `GET /api/pdfs/category/:category` - PDFs por categoría
- `GET /api/pdfs/:id` - Descargar PDF
- `GET /api/pdfs/:id/text` - Extraer texto del PDF
- `POST /api/pdfs/upload` - Subir PDFs (admin)

### Progreso
- `GET /api/user/progress` - Obtener progreso del usuario
- `POST /api/user/progress` - Guardar progreso

### Preferencias
- `GET /api/user/preferences` - Obtener preferencias
- `POST /api/user/preferences` - Actualizar preferencias

### Administración
- `GET /api/admin/stats` - Estadísticas globales
- `GET /api/admin/users` - Lista de usuarios
- `GET /api/admin/users/connected` - Usuarios conectados
- `GET /api/admin/users/:id/details` - Detalles de usuario

## Tecnologías Utilizadas

- **Backend**: Node.js, Express.js, SQLite3
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla), Tailwind CSS
- **PDF**: PDF.js para renderizado
- **Voz**: Web Speech API para text-to-speech
- **Autenticación**: Express-session, bcrypt

## Características de Accesibilidad

- ✅ Navegación completa por teclado
- ✅ Etiquetas ARIA apropiadas
- ✅ Modo de alto contraste
- ✅ Ajuste de tamaño de fuente (4 niveles)
- ✅ Focus visible en todos los elementos
- ✅ Contenido semántico y estructurado
- ✅ Text-to-speech configurable

## Notas Importantes

- La base de datos SQLite se crea automáticamente al iniciar el servidor
- Los PDFs se almacenan en la carpeta `uploads/`
- El usuario admin por defecto se crea automáticamente si no existe
- Las sesiones se almacenan en memoria (para producción, considerar Redis)

## Licencia

ISC

## Soporte

Para problemas, sugerencias o preguntas, por favor abre un issue en el repositorio.




