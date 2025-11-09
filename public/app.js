// ==================== CONFIGURACIÓN INICIAL ====================

// Configurar PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Estado Global
let currentUser = null;
let currentPdfText = '';
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let isAutoReading = false; // Controla si está en modo lectura automática
let currentPageText = ''; // Texto de la página actual
let pdfDoc = null;
let currentPageNum = 1;
let totalPages = 1;
let currentScale = 1.0;
let rendering = false;
let isFullscreen = false;
let currentPdfId = null;
let currentPdfData = null;
let allPdfs = [];
let currentCategory = 'all';
let currentFilter = 'all';
let currentSort = 'recent';
let usageTrackingInterval = null;
let progressUpdateInterval = null;
let fullscreenControlsTimeout = null;
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');

// Referencias DOM
let pages = {};
let navLinks = {};

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    refreshPageReferences();
    refreshNavLinks();
    setupEventListeners();
    setupCarouselEventListeners();
    checkAuth();
    initTheme();
    initAnimations();
    loadPublicStats();
    loadTestimonials();
}

function refreshPageReferences() {
    pages = {
        home: document.getElementById('homePage'),
        login: document.getElementById('loginPage'),
        register: document.getElementById('registerPage'),
        dashboard: document.getElementById('dashboardPage'),
        admin: document.getElementById('adminPage'),
        preferences: document.getElementById('preferencesPage'),
        progress: document.getElementById('progressPage')
    };
}

function refreshNavLinks() {
    navLinks = {
        home: document.getElementById('homeLink'),
        login: document.getElementById('loginLink'),
        register: document.getElementById('registerLink'),
        dashboard: document.getElementById('dashboardLink'),
        admin: document.getElementById('adminLink'),
        logout: document.getElementById('logoutLink'),
        preferences: document.getElementById('preferencesLink'),
        progress: document.getElementById('progressLink')
    };
}

// ==================== GESTIÓN DE TEMA ====================

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        updateThemeIcon(true);
    }
}

function toggleNightMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
    
    // Sincronizar con preferencias si está autenticado
    if (currentUser) {
        const nightModeToggle = document.getElementById('nightModeToggle');
        if (nightModeToggle) {
            nightModeToggle.checked = isDark;
        }
    }
    
    // Recargar gráfica de actividad si existe para actualizar colores
    if (activityChart) {
        const currentPeriod = document.querySelector('#activityPeriod7Days.bg-primary, #activityPeriod1Week.bg-primary, #activityPeriod1Month.bg-primary');
        if (currentPeriod) {
            let period = '7days';
            if (currentPeriod.id === 'activityPeriod1Week') period = '1week';
            else if (currentPeriod.id === 'activityPeriod1Month') period = '1month';
            loadActivityChart(period);
        }
    }
}

function updateThemeIcon(isDark) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.innerHTML = isDark 
            ? '<span class="material-symbols-outlined text-xl">dark_mode</span>'
            : '<span class="material-symbols-outlined text-xl">light_mode</span>';
    }
}

// ==================== NAVEGACIÓN ====================

function showPage(pageName) {
    // Limpiar intervalo de actualización de progreso si existe
    if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
        progressUpdateInterval = null;
    }
    
    // Detener carruseles si se está saliendo de la página home
    const wasOnHome = pages.home && pages.home.classList.contains('active');
    
    // Ocultar todas las páginas
    Object.values(pages).forEach(page => {
        if (page) {
            page.classList.add('hidden');
            page.classList.remove('active');
        }
    });
    
    // Detener carruseles después de ocultar la página home
    if (wasOnHome && pageName !== 'home') {
        stopCarouselAutoPlay('testimonials');
        stopCarouselAutoPlay('books');
    }
    
    // Mostrar página solicitada
    if (pages[pageName]) {
        pages[pageName].classList.remove('hidden');
        pages[pageName].classList.add('active');
        
        // Refrescar referencias DOM
        refreshPageReferences();
        refreshNavLinks();
        
        // Cargar datos específicos de la página
        switch(pageName) {
            case 'home':
                loadPublicStats();
                loadTestimonials();
                initHomeAnimations();
                // Reiniciar animaciones cuando se muestra la página de inicio
                setTimeout(() => {
                    initAnimations();
                }, 100);
                break;
            case 'dashboard':
                if (currentUser) {
                    loadPdfs(currentCategory);
                    setupCategoryListeners();
                }
                break;
            case 'admin':
                if (currentUser && currentUser.isAdmin) {
                    loadAdminData();
                    initAdminAnimations();
                }
                break;
            case 'preferences':
                if (currentUser) {
                    loadPreferences();
                    // Configurar event listeners de preferencias después de cargar
                    setupPreferencesListeners();
                }
                break;
            case 'progress':
                if (currentUser) {
                    loadUserProgress().then(() => {
                        // Configurar listeners de gráfica de forma no bloqueante
                        setTimeout(() => {
                            try {
                                if (typeof setupActivityChartListeners === 'function') {
                                    setupActivityChartListeners();
                                }
                            } catch (error) {
                                console.error('Error al configurar listeners de gráfica:', error);
                            }
                        }, 1500);
                        // Actualizar inmediatamente después de cargar
                        setTimeout(() => {
                            updateTotalTimeDisplay();
                        }, 500);
                    });
                    // Actualizar el tiempo periódicamente mientras se está en la página de progreso
                    progressUpdateInterval = setInterval(() => {
                        updateTotalTimeDisplay();
                    }, 10000); // Actualizar cada 10 segundos para mayor frecuencia
                }
                break;
        }
    }
    
    // Scroll al inicio
    window.scrollTo(0, 0);
}

// ==================== AUTENTICACIÓN ====================

async function checkAuth() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            updateUI();
            // Cargar preferencias después de autenticarse
            await loadPreferences();
            if (currentUser.isAdmin) {
                showPage('admin');
            } else {
                showPage('dashboard');
            }
        } else {
            currentUser = null;
            updateUI();
            showPage('home');
        }
    } catch (error) {
        console.error('Error al verificar autenticación:', error);
        currentUser = null;
        updateUI();
        showPage('home');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUI();
            // Cargar preferencias después de iniciar sesión
            await loadPreferences();
            if (currentUser.isAdmin) {
                showPage('admin');
            } else {
                showPage('dashboard');
            }
            loadPdfs('all');
        } else {
            errorDiv.textContent = data.error || 'Error al iniciar sesión';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'Error de conexión';
        errorDiv.classList.remove('hidden');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const errorDiv = document.getElementById('registerError');
    const successDiv = document.getElementById('registerSuccess');
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            successDiv.textContent = 'Usuario creado exitosamente. Redirigiendo...';
            successDiv.classList.remove('hidden');
            errorDiv.classList.add('hidden');
            setTimeout(() => {
                showPage('login');
            }, 2000);
        } else {
            errorDiv.textContent = data.error || 'Error al registrar usuario';
            errorDiv.classList.remove('hidden');
            successDiv.classList.add('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'Error de conexión';
        errorDiv.classList.remove('hidden');
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        updateUI();
        showPage('home');
        stopUsageTracking();
        if (currentUtterance) {
            speechSynthesis.cancel();
        }
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    }
}

// Función para toggle de visibilidad de contraseña
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input || !button) return;
    
    const icon = button.querySelector('.material-symbols-outlined');
    if (!icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility';
    }
}

function updateUI() {
    // Actualizar navegación
    const authElements = [navLinks.login, navLinks.register];
    const protectedElements = [navLinks.dashboard, navLinks.admin, navLinks.logout];
    const profileContainer = document.getElementById('profileMenuContainer');
    
    if (currentUser) {
        authElements.forEach(el => {
            if (el) el.classList.add('hidden');
        });
        protectedElements.forEach(el => {
            if (el) el.classList.remove('hidden');
        });
        if (profileContainer) profileContainer.classList.remove('hidden');
        
        // Mostrar admin link solo si es admin
        if (currentUser.isAdmin) {
            if (navLinks.admin) navLinks.admin.classList.remove('hidden');
        } else {
            if (navLinks.admin) navLinks.admin.classList.add('hidden');
        }
        
        // Actualizar perfil
        const profileUsername = document.getElementById('profileUsername');
        if (profileUsername) profileUsername.textContent = currentUser.username;
        
        // Actualizar avatar
        updateProfileAvatar(currentUser.profilePicture);
        
        // Mobile menu
        const mobileAuth = ['mobileLoginLink', 'mobileRegisterLink'];
        const mobileProtected = ['mobileDashboardLink', 'mobileAdminLink', 'mobilePreferencesLink', 'mobileProgressLink', 'mobileLogoutLink'];
        mobileAuth.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        mobileProtected.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('hidden');
        });
        
        const mobileHomeLink = document.getElementById('mobileHomeLink');
        if (mobileHomeLink) {
            mobileHomeLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('mobileMenu')?.classList.add('hidden');
                showPage('home');
            });
        }
        
        // Testimonial form
        const testimonialForm = document.getElementById('testimonialFormContainer');
        if (testimonialForm) testimonialForm.classList.remove('hidden');
        
        startUsageTracking();
    } else {
        authElements.forEach(el => {
            if (el) el.classList.remove('hidden');
        });
        protectedElements.forEach(el => {
            if (el) el.classList.add('hidden');
        });
        if (profileContainer) profileContainer.classList.add('hidden');
        
        // Mobile menu
        const mobileAuth = ['mobileLoginLink', 'mobileRegisterLink'];
        const mobileProtected = ['mobileDashboardLink', 'mobileAdminLink', 'mobilePreferencesLink', 'mobileProgressLink', 'mobileLogoutLink'];
        mobileAuth.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('hidden');
        });
        mobileProtected.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        
        const testimonialForm = document.getElementById('testimonialFormContainer');
        if (testimonialForm) testimonialForm.classList.add('hidden');
    }
}

// ==================== PDFs ====================

async function loadPdfs(category) {
    try {
        currentCategory = category;
        const response = await fetch(`/api/pdfs/category/${category}`);
        if (response.ok) {
            allPdfs = await response.json();
            filterAndDisplayPdfs();
            updateCategoryTitle(category);
        }
    } catch (error) {
        console.error('Error al cargar PDFs:', error);
    }
}

function filterAndDisplayPdfs() {
    let filtered = [...allPdfs];
    
    // Filtrar por tipo
    if (currentFilter !== 'all') {
        filtered = filtered.filter(pdf => {
            const name = pdf.original_name.toLowerCase();
            if (currentFilter === 'PDF') return name.endsWith('.pdf');
            if (currentFilter === 'Libro') return name.includes('libro') || name.includes('book');
            if (currentFilter === 'Presentación') return name.includes('presentación') || name.includes('presentation');
            return true;
        });
    }
    
    // Ordenar
    if (currentSort === 'popular') {
        filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (currentSort === 'alphabetical') {
        filtered.sort((a, b) => a.original_name.localeCompare(b.original_name));
    } else {
        filtered.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
    }
    
    displayPdfs(filtered);
}

function displayPdfs(pdfs) {
    const pdfList = document.getElementById('pdfList');
    const pdfCount = document.getElementById('pdfCount');
    
    if (pdfCount) pdfCount.textContent = pdfs.length;
    
    if (!pdfList) return;
    
    pdfList.innerHTML = '';
    
    pdfs.forEach((pdf, index) => {
        const card = createPdfCard(pdf);
        card.style.animationDelay = `${index * 0.1}s`;
        card.classList.add('stagger-item');
        pdfList.appendChild(card);
    });
}

function createPdfCard(pdf) {
    const card = document.createElement('div');
    card.className = 'pdf-card bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-lg cursor-pointer group';
    
    const coverImage = pdf.cover_image || 'images/gojo.png';
    const displayName = pdf.original_name.replace('.pdf', '');
    const isFavorite = favorites.includes(pdf.id);
    
    card.innerHTML = `
        <div class="pdf-card-image-container bg-cover bg-center relative overflow-hidden pdf-card-image" style="background-image: url('${coverImage}')">
            <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            ${isFavorite ? '<div class="absolute top-2 right-2 p-2 bg-primary/90 rounded-full z-10 animate-pulse-once"><span class="material-symbols-outlined text-white text-sm">favorite</span></div>' : ''}
        </div>
        <div class="p-6 pdf-card-content">
            <div class="flex items-center gap-2 mb-2 pdf-card-category">
                <span class="material-symbols-outlined text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12">description</span>
                <span class="text-sm text-gray-600 dark:text-gray-400">${pdf.category || 'Otros'}</span>
            </div>
            <h3 class="text-xl font-bold mb-2 pdf-card-title">${displayName}</h3>
            <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2 pdf-card-description">${pdf.description || 'Sin descripción'}</p>
            <div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4 pdf-card-meta">
                <span class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs">visibility</span>
                    ${pdf.views || 0} vistas
                </span>
                <span class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs">calendar_today</span>
                    ${formatDate(pdf.upload_date)}
                </span>
            </div>
            <button onclick="showPdfDetails(${pdf.id})" 
                    class="pdf-card-button w-full px-4 py-2 bg-primary text-white rounded-lg font-bold relative overflow-hidden transition-all duration-300 transform group-hover:scale-105 group-hover:shadow-lg">
                <span class="relative z-10 flex items-center justify-center gap-2">
                    <span>Ver Detalles</span>
                    <span class="material-symbols-outlined text-sm transition-transform duration-300 group-hover:translate-x-1">arrow_forward</span>
                </span>
                <span class="absolute inset-0 bg-gradient-to-r from-primary to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
            </button>
        </div>
    `;
    
    // Agregar evento de click para animación
    card.addEventListener('click', function(e) {
        if (!e.target.closest('button')) {
            // Si no se hace click en el botón, mostrar detalles
            showPdfDetails(pdf.id);
        }
    });
    
    return card;
}

function updateCategoryTitle(category) {
    const categoryTitle = document.getElementById('categoryTitle');
    if (categoryTitle) {
        const titles = {
            'all': 'Todos los recursos',
            'Software': 'Software',
            'Bases de Datos': 'Bases de Datos',
            'Frontend': 'Frontend',
            'Backend': 'Backend',
            'Otros': 'Otros'
        };
        categoryTitle.textContent = titles[category] || category;
    }
}

function setupCategoryListeners() {
    const categoryLinks = document.querySelectorAll('.category-link');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const category = link.getAttribute('data-category');
            filterByCategory(category);
        });
    });
}

function filterByCategory(category) {
    // Actualizar estado activo
    document.querySelectorAll('.category-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-category="${category}"]`)?.classList.add('active');
    
    loadPdfs(category);
}

// ==================== DETALLES DEL PDF ====================

async function showPdfDetails(pdfId) {
    try {
        // Buscar el PDF en la lista
        const pdf = allPdfs.find(p => p.id === pdfId);
        if (!pdf) {
            // Si no está en la lista, cargar todos los PDFs
            await loadPdfs('all');
            const foundPdf = allPdfs.find(p => p.id === pdfId);
            if (!foundPdf) {
                alert('PDF no encontrado');
                return;
            }
            currentPdfData = foundPdf;
        } else {
            currentPdfData = pdf;
        }
        
        // Mostrar modal de detalles
        const modal = document.getElementById('pdfDetailsModal');
        const coverImage = currentPdfData.cover_image || 'images/gojo.png';
        const displayName = currentPdfData.original_name.replace('.pdf', '');
        const isFavorite = favorites.includes(pdfId);
        
        document.getElementById('pdfDetailsTitle').textContent = displayName;
        document.getElementById('pdfDetailsCover').src = coverImage;
        document.getElementById('pdfDetailsCover').alt = `Portada de ${displayName}`;
        document.getElementById('pdfDetailsName').textContent = displayName;
        document.getElementById('pdfDetailsCategory').textContent = currentPdfData.category || 'Otros';
        document.getElementById('pdfDetailsCategoryFull').textContent = currentPdfData.category || 'Otros';
        document.getElementById('pdfDetailsDescription').textContent = currentPdfData.description || 'Este documento no tiene descripción disponible.';
        document.getElementById('pdfDetailsDate').textContent = formatDate(currentPdfData.upload_date);
        document.getElementById('pdfDetailsViews').textContent = `${currentPdfData.views || 0} vistas`;
        document.getElementById('pdfDetailsViewsCount').textContent = currentPdfData.views || 0;
        
        // Actualizar botón de favoritos
        const favoriteBtn = document.getElementById('addToFavoritesBtn');
        const favoriteIcon = document.getElementById('favoriteIcon');
        const favoriteText = document.getElementById('favoriteText');
        if (isFavorite) {
            favoriteIcon.textContent = 'favorite';
            favoriteIcon.classList.add('text-red-500');
            favoriteText.textContent = 'En Favoritos';
            if (favoriteBtn) favoriteBtn.classList.add('active');
        } else {
            favoriteIcon.textContent = 'favorite_border';
            favoriteIcon.classList.remove('text-red-500');
            favoriteText.textContent = 'Agregar a Favoritos';
            if (favoriteBtn) favoriteBtn.classList.remove('active');
        }
        
        modal.classList.remove('hidden');
        
        // Configurar botones
        document.getElementById('readPdfBtn').onclick = () => {
            modal.classList.add('hidden');
            loadPdf(pdfId, displayName);
        };
        
        document.getElementById('addToFavoritesBtn').onclick = () => {
            toggleFavorite(pdfId);
        };
        
        document.getElementById('closePdfDetailsBtn').onclick = () => {
            modal.classList.add('hidden');
        };
        
        // Cerrar modal al hacer clic fuera
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        };
        
    } catch (error) {
        console.error('Error al mostrar detalles del PDF:', error);
        alert('Error al cargar los detalles del PDF');
    }
}

function toggleFavorite(pdfId) {
    const index = favorites.indexOf(pdfId);
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(pdfId);
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));
    
    // Actualizar UI
    const favoriteBtn = document.getElementById('addToFavoritesBtn');
    const favoriteIcon = document.getElementById('favoriteIcon');
    const favoriteText = document.getElementById('favoriteText');
    const isFavorite = favorites.includes(pdfId);
    
    if (favoriteIcon && favoriteText) {
        if (isFavorite) {
            favoriteIcon.textContent = 'favorite';
            favoriteIcon.classList.add('text-red-500');
            favoriteText.textContent = 'En Favoritos';
            if (favoriteBtn) favoriteBtn.classList.add('active');
        } else {
            favoriteIcon.textContent = 'favorite_border';
            favoriteIcon.classList.remove('text-red-500');
            favoriteText.textContent = 'Agregar a Favoritos';
            if (favoriteBtn) favoriteBtn.classList.remove('active');
        }
    }
    
    // Recargar lista para actualizar iconos
    filterAndDisplayPdfs();
}

// ==================== VISOR DE PDF ====================

async function loadPdf(pdfId, pdfName, startPage = null) {
    try {
        currentPdfId = pdfId;
        
        // Ocultar lista y modal de detalles
        const pdfList = document.getElementById('pdfList');
        if (pdfList) pdfList.style.display = 'none';
        
        const pdfDetailsModal = document.getElementById('pdfDetailsModal');
        if (pdfDetailsModal) pdfDetailsModal.classList.add('hidden');
        
        // Mostrar visor
        const pdfViewer = document.getElementById('pdfViewer');
        if (pdfViewer) {
            pdfViewer.classList.remove('hidden');
            // Forzar reflow para asegurar que el elemento esté visible
            pdfViewer.offsetHeight;
        }
        
        // Asegurar que el rastreo de uso esté activo cuando el PDF está abierto
        if (currentUser) {
            startUsageTracking();
            console.log('Rastreo de uso iniciado al abrir PDF');
        }
        
        // Actualizar título
        const pdfViewerTitle = document.getElementById('pdfViewerTitle');
        if (pdfViewerTitle) pdfViewerTitle.textContent = pdfName;
        
        // Verificar que el canvas exista antes de continuar
        const canvas = document.getElementById('pdfCanvas');
        if (!canvas) {
            console.error('Canvas no encontrado en el DOM');
            throw new Error('Canvas no encontrado');
        }
        
        // Cargar PDF
        const pdfUrl = `/api/pdfs/${pdfId}`;
        console.log('Cargando PDF desde:', pdfUrl);
        const loadingTask = pdfjsLib.getDocument({
            url: pdfUrl,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true
        });
        
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;
        console.log('PDF cargado, total de páginas:', totalPages);
        
        // Actualizar contador de páginas
        const totalPagesSpan = document.getElementById('totalPagesSpan');
        const totalPagesSpanDisplay = document.getElementById('totalPagesSpanDisplay');
        if (totalPagesSpan) totalPagesSpan.textContent = totalPages;
        if (totalPagesSpanDisplay) totalPagesSpanDisplay.textContent = totalPages;
        
        // Determinar página inicial
        let targetPage = 1;
        
        if (startPage !== null && startPage !== undefined && startPage !== 'null' && startPage !== 'undefined') {
            // Si se especifica una página explícitamente
            const parsedPage = parseInt(startPage);
            if (!isNaN(parsedPage) && parsedPage >= 1) {
                targetPage = Math.min(parsedPage, totalPages);
                console.log('Usando página especificada:', targetPage);
            }
        } else {
            // Cargar progreso guardado si no se especificó una página
            console.log('No se especificó página, cargando progreso guardado...');
            const savedProgress = await loadSavedProgress(pdfId);
            if (savedProgress && savedProgress.current_page) {
                const savedPage = parseInt(savedProgress.current_page);
                if (!isNaN(savedPage) && savedPage >= 1 && savedPage <= totalPages) {
                    targetPage = savedPage;
                    console.log('Página cargada del progreso guardado:', targetPage);
                } else {
                    console.log('Página guardada fuera de rango:', savedPage, 'de', totalPages);
                }
            } else {
                console.log('No se encontró progreso guardado, usando página 1');
            }
        }
        
        console.log('Cargando PDF en página:', { pdfId, targetPage, totalPages, startPageReceived: startPage });
        
        // Asegurar que rendering esté en false antes de continuar
        rendering = false;
        
        currentPageNum = targetPage;
        
        // Esperar un poco más para asegurar que el DOM esté completamente listo y el visor visible
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verificar nuevamente que el canvas esté disponible
        const canvasCheck = document.getElementById('pdfCanvas');
        if (!canvasCheck) {
            console.error('Canvas no disponible después de esperar');
            throw new Error('Canvas no disponible');
        }
        
        // Renderizar página
        console.log('Intentando renderizar página:', currentPageNum);
        await renderPage(currentPageNum);
        console.log('Página renderizada exitosamente:', currentPageNum);
        
        // Cargar texto del PDF
        await loadPdfText(pdfId);
        
        // Cargar voces
        loadVoices();
        
    } catch (error) {
        console.error('Error al cargar PDF:', error);
        alert('Error al cargar el PDF');
    }
}

async function loadPdfText(pdfId) {
    try {
        const response = await fetch(`/api/pdfs/${pdfId}/text`);
        if (response.ok) {
            const data = await response.json();
            currentPdfText = data.text;
        }
    } catch (error) {
        console.error('Error al cargar texto del PDF:', error);
    }
}

async function renderPage(pageNum) {
    console.log('renderPage llamado:', { pageNum, hasPdfDoc: !!pdfDoc, rendering, totalPages });
    
    if (!pdfDoc) {
        console.error('No hay pdfDoc disponible para renderizar');
        return;
    }
    
    if (rendering) {
        console.warn('Ya se está renderizando una página, esperando...');
        // Esperar a que termine el renderizado anterior
        let attempts = 0;
        while (rendering && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        if (rendering) {
            console.error('Timeout esperando renderizado anterior');
            rendering = false; // Forzar reset
        }
    }
    
    // Validar que la página esté dentro del rango válido
    if (pageNum < 1 || pageNum > totalPages) {
        console.error(`Página ${pageNum} fuera de rango (1-${totalPages})`);
        return;
    }
    
    rendering = true;
    
    // Mostrar overlay de carga
    const loadingOverlay = document.getElementById('pdfLoadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
    }
    
    try {
        console.log('Obteniendo página del PDF:', pageNum);
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });
        const canvas = document.getElementById('pdfCanvas');
        
        if (!canvas) {
            console.error('No se encontró el canvas del PDF');
            if (loadingOverlay) loadingOverlay.classList.add('hidden');
            return;
        }
        
        const context = canvas.getContext('2d');
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        console.log('Renderizando página en canvas:', pageNum);
        await page.render(renderContext).promise;
        console.log('Página renderizada en canvas:', pageNum);
        
        // Extraer texto de la página actual
        try {
            const textContent = await page.getTextContent();
            const textItems = textContent.items;
            currentPageText = textItems.map(item => item.str).join(' ').trim();
            console.log('Texto extraído de la página:', currentPageText.substring(0, 100) + '...');
        } catch (error) {
            console.error('Error al extraer texto de la página:', error);
            currentPageText = '';
        }
        
        // Ocultar overlay de carga
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
        
        // Actualizar estado global
        currentPageNum = pageNum;
        
        // Actualizar input de página
        const currentPageInput = document.getElementById('currentPageInput');
        if (currentPageInput) {
            currentPageInput.value = pageNum;
            currentPageInput.max = totalPages;
        }
        
        // Actualizar texto de página actual (si existe)
        const currentPageSpan = document.getElementById('currentPageSpan');
        if (currentPageSpan) {
            currentPageSpan.textContent = pageNum;
        }
        
        // Actualizar barra de progreso
        const readingProgressBar = document.getElementById('readingProgressBar');
        if (readingProgressBar && totalPages > 0) {
            const progress = (pageNum / totalPages) * 100;
            readingProgressBar.style.width = progress + '%';
        }
        
        // Agregar animación de transición de página
        const canvasContainer = document.querySelector('.pdf-page-container');
        if (canvasContainer) {
            canvasContainer.classList.add('pdf-page-transition');
            setTimeout(() => {
                canvasContainer.classList.remove('pdf-page-transition');
            }, 300);
        }
        
        // No reiniciar lectura automática aquí, ya que nextPage/previousPage
        // manejan la detención cuando el usuario navega manualmente
        
        // Guardar progreso
        saveProgress();
        
    } catch (error) {
        console.error('Error al renderizar página:', error);
        const loadingOverlay = document.getElementById('pdfLoadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
        throw error;
    } finally {
        rendering = false;
    }
}

function nextPage() {
    if (currentPageNum < totalPages) {
        // Si está en modo lectura automática, cancelar la lectura automática
        // para permitir navegación manual
        if (isAutoReading && currentUtterance) {
            isAutoReading = false;
            stopText();
        }
        currentPageNum++;
        renderPage(currentPageNum);
    }
}

function previousPage() {
    if (currentPageNum > 1) {
        // Si está en modo lectura automática, cancelar la lectura automática
        // para permitir navegación manual
        if (isAutoReading && currentUtterance) {
            isAutoReading = false;
            stopText();
        }
        currentPageNum--;
        renderPage(currentPageNum);
    }
}

function zoomIn() {
    currentScale = Math.min(currentScale + 0.25, 3.0);
    updateZoomSelect();
    renderPage(currentPageNum);
}

function zoomOut() {
    currentScale = Math.max(currentScale - 0.25, 0.25);
    updateZoomSelect();
    renderPage(currentPageNum);
}

function setZoom(scale) {
    currentScale = parseFloat(scale);
    updateZoomSelect();
    renderPage(currentPageNum);
}

function updateZoomSelect() {
    const zoomSelect = document.getElementById('zoomSelect');
    if (zoomSelect) {
        const percentage = Math.round(currentScale * 100);
        zoomSelect.value = currentScale;
    }
}

function closeViewer() {
    // Detener lectura automática y síntesis de voz
    stopText();
    isAutoReading = false;
    currentPageText = '';
    
    const pdfViewer = document.getElementById('pdfViewer');
    if (pdfViewer) pdfViewer.classList.add('hidden');
    
    const pdfList = document.getElementById('pdfList');
    if (pdfList) pdfList.style.display = 'grid';
    
    if (isFullscreen) {
        exitFullscreen();
    }
    
    // Detener rastreo de uso cuando se cierra el visor
    // No detener completamente, solo cuando no hay PDF abierto
    // El rastreo continuará mientras el usuario esté autenticado
    console.log('Visor de PDF cerrado');
    
    currentPdfId = null;
    pdfDoc = null;
    currentPageNum = 1;
    totalPages = 0;
    currentPdfText = '';
}

function enterFullscreen() {
    const pdfViewer = document.getElementById('pdfViewer');
    if (pdfViewer) {
        if (pdfViewer.requestFullscreen) {
            pdfViewer.requestFullscreen();
        } else if (pdfViewer.webkitRequestFullscreen) {
            pdfViewer.webkitRequestFullscreen();
        } else if (pdfViewer.msRequestFullscreen) {
            pdfViewer.msRequestFullscreen();
        }
        isFullscreen = true;
        updateFullscreenButton();
    }
}

function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
    isFullscreen = false;
    updateFullscreenButton();
}

function updateFullscreenButton() {
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
        const icon = fullscreenBtn.querySelector('.material-symbols-outlined');
        if (icon) {
            icon.textContent = isFullscreen ? 'fullscreen_exit' : 'fullscreen';
        }
    }
}

// Detectar cambios en fullscreen
document.addEventListener('fullscreenchange', () => {
    isFullscreen = !!document.fullscreenElement;
    updateFullscreenButton();
});

document.addEventListener('webkitfullscreenchange', () => {
    isFullscreen = !!document.webkitFullscreenElement;
    updateFullscreenButton();
});

document.addEventListener('msfullscreenchange', () => {
    isFullscreen = !!document.msFullscreenElement;
    updateFullscreenButton();
});

// ==================== TEXT-TO-SPEECH ====================

function loadVoices() {
    const voices = speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('voiceSelect');
    
    if (!voiceSelect) return;
    
    // Guardar la voz seleccionada actualmente
    const currentValue = voiceSelect.value;
    
    voiceSelect.innerHTML = '';
    
    // Filtrar solo voces de Microsoft en español
    const microsoftVoices = voices.filter(voice => 
        voice.name.includes('Microsoft') && 
        (voice.lang.startsWith('es') || voice.lang.includes('Spanish'))
    );
    
    const isDark = document.documentElement.classList.contains('dark');
    const optionClass = isDark ? 'bg-slate-800 text-slate-200' : 'bg-white text-gray-900';
    
    if (microsoftVoices.length > 0) {
        microsoftVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            option.className = optionClass;
            voiceSelect.appendChild(option);
        });
    } else {
        // Si no hay voces de Microsoft, mostrar mensaje
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No hay voces de Microsoft disponibles';
        option.className = optionClass;
        voiceSelect.appendChild(option);
    }
    
    // Restaurar la selección anterior si existe
    if (currentValue && voiceSelect.querySelector(`option[value="${currentValue}"]`)) {
        voiceSelect.value = currentValue;
    } else if (microsoftVoices.length > 0) {
        // Seleccionar la primera voz de Microsoft por defecto
        voiceSelect.value = microsoftVoices[0].name;
    }
}

function playText() {
    // Si hay un utterance activo y está hablando, reanudar si está pausado
    if (currentUtterance && speechSynthesis.speaking) {
        if (speechSynthesis.paused) {
            speechSynthesis.resume();
            updatePlayButton(true);
        }
        return;
    }
    
    // Si hay un utterance pero no está hablando ni pausado, limpiarlo
    if (currentUtterance && !speechSynthesis.speaking && !speechSynthesis.paused) {
        currentUtterance = null;
    }
    
    // Usar el texto de la página actual si está disponible, sino usar el texto completo del PDF
    const textToRead = currentPageText || currentPdfText;
    
    if (!textToRead || textToRead.trim() === '') {
        // Intentar leer la página actual si no hay texto
        if (pdfDoc && currentPageNum) {
            console.log('No hay texto disponible, intentando extraer de la página actual...');
            // El texto se extraerá en la próxima renderización
            renderPage(currentPageNum).then(() => {
                if (currentPageText) {
                    playText();
                } else {
                    alert('No hay texto disponible para reproducir en esta página');
                }
            });
            return;
        } else {
            alert('No hay texto disponible para reproducir');
            return;
        }
    }
    
    // Activar modo lectura automática
    isAutoReading = true;
    
    const voiceSelect = document.getElementById('voiceSelect');
    const speedRangeElement = document.getElementById('speedRange');
    
    // Usar preferencias guardadas o valores del visor
    // Priorizar el valor del slider si existe, luego las preferencias guardadas
    const speed = speedRangeElement?.value ? parseFloat(speedRangeElement.value) : 
                  (currentPreferences.reading_speed || 1.0);
    const selectedVoiceName = voiceSelect?.value || currentPreferences.voice_name;
    const volume = currentPreferences.voice_volume || 1.0;
    const pitch = currentPreferences.voice_pitch || 1.0;
    
    // Actualizar el valor mostrado en el slider si existe (asegurar sincronización)
    if (speedRangeElement && !speedRangeElement.value) {
        speedRangeElement.value = speed;
    }
    const speedValueElement = document.getElementById('speedValue');
    if (speedValueElement) {
        speedValueElement.textContent = `${speed}x`;
    }
    
    const voices = speechSynthesis.getVoices();
    let selectedVoice = null;
    
    if (selectedVoiceName) {
        selectedVoice = voices.find(v => v.name === selectedVoiceName);
    }
    
    if (!selectedVoice) {
        // Si no se encuentra, usar la primera voz de Microsoft en español
        const microsoftVoices = voices.filter(v => 
            v.name.includes('Microsoft') && 
            (v.lang.startsWith('es') || v.lang.includes('Spanish'))
        );
        if (microsoftVoices.length > 0) {
            selectedVoice = microsoftVoices[0];
        } else {
            // Si no hay voces de Microsoft, usar la primera voz disponible como fallback
            selectedVoice = voices[0];
        }
    }
    
    currentUtterance = new SpeechSynthesisUtterance(textToRead);
    currentUtterance.lang = 'es-ES';
    currentUtterance.rate = parseFloat(speed);
    currentUtterance.volume = parseFloat(volume);
    currentUtterance.pitch = parseFloat(pitch);
    currentUtterance.voice = selectedVoice;
    
    // Actualizar selector de voz en el visor si existe
    if (voiceSelect && selectedVoice) {
        voiceSelect.value = selectedVoice.name;
    }
    
    currentUtterance.onend = () => {
        currentUtterance = null;
        
        // Si está en modo lectura automática, pasar a la siguiente página
        if (isAutoReading && currentPageNum < totalPages) {
            console.log('Página leída completamente, pasando a la siguiente...');
            // Pasar a la siguiente página automáticamente (sin detener lectura)
            const nextPageNum = currentPageNum + 1;
            currentPageNum = nextPageNum;
            // Renderizar la siguiente página
            renderPage(nextPageNum).then(() => {
                // Leer la nueva página después de que se haya renderizado
                setTimeout(() => {
                    if (currentPageText && currentPageText.trim() !== '') {
                        // Continuar lectura automática con la nueva página
                        playText();
                    } else {
                        // Si no hay texto, esperar un poco más y reintentar
                        setTimeout(() => {
                            if (currentPageText && currentPageText.trim() !== '') {
                                playText();
                            } else {
                                console.log('No se pudo extraer texto de la nueva página, deteniendo lectura automática');
                                isAutoReading = false;
                                updatePlayButton(false);
                            }
                        }, 500);
                    }
                }, 400);
            }).catch(error => {
                console.error('Error al pasar a la siguiente página:', error);
                isAutoReading = false;
                updatePlayButton(false);
            });
        } else if (isAutoReading && currentPageNum >= totalPages) {
            // Llegamos al final del documento
            console.log('Llegamos al final del documento');
            isAutoReading = false;
            updatePlayButton(false);
            // Mostrar notificación más suave
            const playPauseBtn = document.getElementById('playPauseBtn');
            if (playPauseBtn) {
                playPauseBtn.title = 'Has llegado al final del documento';
            }
        } else {
            // No está en modo automático o fue pausado manualmente
            updatePlayButton(false);
        }
    };
    
    currentUtterance.onerror = (event) => {
        console.error('Error en la síntesis de voz:', event);
        currentUtterance = null;
        isAutoReading = false;
        updatePlayButton(false);
    };
    
    speechSynthesis.speak(currentUtterance);
    updatePlayButton(true);
}

function pauseText() {
    if (currentUtterance) {
        speechSynthesis.pause();
        updatePlayButton(false);
        // No desactivar isAutoReading aquí, para que pueda reanudar
    }
}

function stopText() {
    speechSynthesis.cancel();
    currentUtterance = null;
    isAutoReading = false;
    updatePlayButton(false);
}

function updatePlayButton(isPlaying) {
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
        playPauseBtn.innerHTML = isPlaying 
            ? '<span class="material-symbols-outlined">pause</span>'
            : '<span class="material-symbols-outlined">play_arrow</span>';
    }
}

// ==================== PROGRESO ====================

async function saveProgress() {
    if (!currentPdfId || !currentUser) return;
    
    try {
        await fetch('/api/user/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pdf_id: currentPdfId,
                current_page: currentPageNum,
                total_pages: totalPages
            })
        });
    } catch (error) {
        console.error('Error al guardar progreso:', error);
    }
}

async function loadSavedProgress(pdfId) {
    try {
        const response = await fetch('/api/user/progress');
        if (response.ok) {
            const data = await response.json();
            // El endpoint devuelve { progress: [...], stats: {...} }
            const progressList = data.progress || data || [];
            
            // Buscar por pdf_id
            const progress = progressList.find(p => {
                const pid = p.pdf_id || p.id;
                return pid && parseInt(pid) === parseInt(pdfId);
            });
            
            if (progress) {
                console.log('Progreso encontrado para PDF', pdfId, ':', progress);
                return {
                    pdf_id: progress.pdf_id || progress.id,
                    current_page: parseInt(progress.current_page) || 1,
                    total_pages: parseInt(progress.total_pages) || 1
                };
            } else {
                console.log('No se encontró progreso para PDF', pdfId);
            }
        }
    } catch (error) {
        console.error('Error al cargar progreso:', error);
    }
    return null;
}

async function loadUserProgress() {
    try {
        // Cargar progreso de lectura y estadísticas
        const response = await fetch('/api/user/progress');
        if (response.ok) {
            const data = await response.json();
            
            // Manejar tanto el formato antiguo (array) como el nuevo (objeto con progress y stats)
            let progressList = [];
            let stats = { totalTimeMinutes: 0, totalBooks: 0 };
            
            if (Array.isArray(data)) {
                // Formato antiguo: solo array de progreso
                progressList = data;
                stats.totalBooks = data.length;
            } else if (data.progress && data.stats) {
                // Formato nuevo: objeto con progress y stats
                progressList = data.progress;
                stats = data.stats;
            }
            
            displayUserProgress(progressList, stats);
        }
        
        // Cargar favoritos
        loadFavorites();
        
        // Cargar gráfica de actividad de forma no bloqueante
        // Solo intentar cargar si Chart.js está disponible y la función existe
        if (typeof loadActivityChart === 'function') {
            setTimeout(() => {
                try {
                    if (typeof Chart !== 'undefined') {
                        loadActivityChart('7days');
                    }
                } catch (error) {
                    console.error('Error al cargar gráfica de actividad:', error);
                    // No bloquear la aplicación si hay un error con la gráfica
                }
            }, 1500);
        }
    } catch (error) {
        console.error('Error al cargar progreso del usuario:', error);
    }
}

let activityChart = null;

async function loadActivityChart(period = '7days') {
    // Si Chart.js no está disponible, simplemente no hacer nada
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js no está disponible, omitiendo gráfica de actividad');
        const noActivityData = document.getElementById('noActivityData');
        if (noActivityData) {
            noActivityData.classList.remove('hidden');
        }
        return;
    }
    
    try {
        const response = await fetch(`/api/user/activity/stats?period=${period}`);
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.success && result.data && Array.isArray(result.data)) {
                // Mostrar gráfica incluso si todos los valores son 0
                console.log('Datos recibidos para gráfica:', result.data.length, 'días');
                console.log('Muestra de datos:', result.data.slice(0, 3));
                displayActivityChart(result.data, period);
            } else {
                console.log('No se recibieron datos válidos:', result);
                showNoActivityData();
            }
        } else {
            showNoActivityData();
        }
    } catch (error) {
        console.error('Error al cargar gráfica de actividad:', error);
        showNoActivityData();
    }
}

function displayActivityChart(data, period) {
    // Verificar que Chart.js esté disponible
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js no está disponible');
        showNoActivityData();
        return;
    }
    
    const canvas = document.getElementById('activityChart');
    const noActivityData = document.getElementById('noActivityData');
    
    if (!canvas) {
        return;
    }
    
    // Ocultar mensaje de sin datos
    if (noActivityData) {
        noActivityData.classList.add('hidden');
    }
    canvas.style.display = 'block';
    
    // Destruir gráfica anterior si existe
    if (activityChart) {
        activityChart.destroy();
        activityChart = null;
    }
    
    // Verificar si hay datos (mostrar gráfica incluso si todos los valores son 0)
    if (!data || !Array.isArray(data) || data.length === 0) {
        console.log('No hay datos para mostrar en la gráfica');
        showNoActivityData();
        return;
    }
    
    console.log('Preparando gráfica con', data.length, 'puntos de datos');
    console.log('Datos validados (primeros 3):', data.slice(0, 3));
    
    // La gráfica se mostrará incluso si todos los valores son 0
    
    // Asegurarse de que todos los datos tengan las propiedades necesarias
    const validatedData = data.map(item => ({
        date: item.date || '',
        label: item.label || item.date || '',
        reading_time_minutes: parseInt(item.reading_time_minutes) || 0
    }));
    
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#1e293b';
    const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)';
    const primaryColor = '#137fec';
    const secondaryColor = '#3b82f6';
    const primaryColorAlpha = 'rgba(19, 127, 236, 0.2)'; // 20% de opacidad
    const secondaryColorAlpha = 'rgba(59, 130, 246, 0.2)'; // 20% de opacidad
    
    const ctx = canvas.getContext('2d');
    
    // Preparar datos para la gráfica - Convertir minutos a horas
    const labels = validatedData.map(item => item.label);
    const readingTimeHours = validatedData.map(item => {
        const minutes = parseInt(item.reading_time_minutes) || 0;
        return (minutes / 60).toFixed(2); // Convertir minutos a horas con 2 decimales
    });
    
    console.log('📊 Preparando gráfica de tiempo de lectura:');
    console.log('- Labels:', labels.slice(0, 5));
    console.log('- Reading time (hours):', readingTimeHours.slice(0, 5));
    console.log('- Total puntos:', labels.length);
    
    try {
        activityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Tiempo de Lectura (horas)',
                        data: readingTimeHours,
                        borderColor: primaryColor,
                        backgroundColor: primaryColorAlpha,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4, // Suaviza las líneas (curva suave)
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: primaryColor,
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointHoverBackgroundColor: primaryColor,
                        pointHoverBorderColor: '#ffffff',
                        pointHoverBorderWidth: 3,
                    }
                ]
            },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1500, // Duración de la animación en milisegundos
                easing: 'easeInOutQuart', // Tipo de animación suave
                delay: (context) => {
                    // Animación escalonada: cada punto aparece con un pequeño delay
                    return context.dataIndex * 50;
                }
            },
            animations: {
                x: {
                    from: 0,
                    duration: 1500,
                    easing: 'easeInOutQuart'
                },
                y: {
                    from: 0,
                    duration: 1500,
                    easing: 'easeInOutQuart'
                },
                colors: {
                    from: 'transparent',
                    duration: 1500
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: textColor,
                        font: {
                            size: 12,
                            weight: '500'
                        },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: gridColor,
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    animation: {
                        duration: 200
                    },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            const hours = parseFloat(context.parsed.y);
                            if (hours < 1) {
                                // Si es menos de 1 hora, mostrar en minutos
                                const minutes = Math.round(hours * 60);
                                label += minutes + ' ' + (minutes === 1 ? 'minuto' : 'minutos');
                            } else {
                                // Si es 1 hora o más, mostrar en horas y minutos
                                const wholeHours = Math.floor(hours);
                                const minutes = Math.round((hours - wholeHours) * 60);
                                if (minutes > 0) {
                                    label += wholeHours + 'h ' + minutes + 'm';
                                } else {
                                    label += wholeHours + ' ' + (wholeHours === 1 ? 'hora' : 'horas');
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: true,
                        color: gridColor,
                        drawBorder: false
                    },
                    ticks: {
                        color: textColor,
                        font: {
                            size: 11
                        }
                    },
                    border: {
                        color: gridColor
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: gridColor,
                        drawBorder: false
                    },
                    ticks: {
                        color: textColor,
                        font: {
                            size: 11
                        },
                        stepSize: 0.5,
                        precision: 1,
                        callback: function(value) {
                            // Formatear el eje Y para mostrar horas
                            if (value < 1) {
                                return Math.round(value * 60) + 'm';
                            } else {
                                return value.toFixed(1) + 'h';
                            }
                        }
                    },
                    border: {
                        color: gridColor
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            elements: {
                point: {
                    hoverRadius: 8,
                    hoverBorderWidth: 3
                }
            }
        }
        });
        
        console.log('✅ Gráfica creada exitosamente');
    } catch (error) {
        console.error('❌ Error creating chart:', error);
        console.error('Error details:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        showNoActivityData();
    }
}

function showNoActivityData() {
    const canvas = document.getElementById('activityChart');
    const noActivityData = document.getElementById('noActivityData');
    
    if (canvas) {
        canvas.style.display = 'none';
    }
    
    if (noActivityData) {
        noActivityData.classList.remove('hidden');
    }
    
    if (activityChart) {
        activityChart.destroy();
        activityChart = null;
    }
}

function setupActivityChartListeners() {
    const period7Days = document.getElementById('activityPeriod7Days');
    const period1Week = document.getElementById('activityPeriod1Week');
    const period1Month = document.getElementById('activityPeriod1Month');
    
    const updateActiveButton = (activeBtn) => {
        [period7Days, period1Week, period1Month].forEach(btn => {
            if (btn) {
                btn.classList.remove('bg-primary', 'text-white');
                btn.classList.add('bg-gray-200', 'dark:bg-slate-700', 'text-gray-700', 'dark:text-gray-300');
            }
        });
        if (activeBtn) {
            activeBtn.classList.remove('bg-gray-200', 'dark:bg-slate-700', 'text-gray-700', 'dark:text-gray-300');
            activeBtn.classList.add('bg-primary', 'text-white');
        }
    };
    
    if (period7Days) {
        period7Days.addEventListener('click', () => {
            updateActiveButton(period7Days);
            loadActivityChart('7days');
        });
    }
    
    if (period1Week) {
        period1Week.addEventListener('click', () => {
            updateActiveButton(period1Week);
            loadActivityChart('1week');
        });
    }
    
    if (period1Month) {
        period1Month.addEventListener('click', () => {
            updateActiveButton(period1Month);
            loadActivityChart('1month');
        });
    }
}

async function loadFavorites() {
    try {
        // Recargar favoritos desde localStorage
        favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        
        if (favorites.length === 0) {
            document.getElementById('favoritesList').innerHTML = '';
            document.getElementById('noFavorites').classList.remove('hidden');
            return;
        }
        
        document.getElementById('noFavorites').classList.add('hidden');
        
        // Cargar todos los PDFs para obtener información de los favoritos
        const response = await fetch('/api/pdfs');
        if (response.ok) {
            const allPdfsData = await response.json();
            const favoritePdfs = allPdfsData.filter(pdf => favorites.includes(pdf.id));
            displayFavorites(favoritePdfs);
        }
    } catch (error) {
        console.error('Error al cargar favoritos:', error);
    }
}

function displayFavorites(favoritePdfs) {
    const container = document.getElementById('favoritesList');
    const noFavorites = document.getElementById('noFavorites');
    
    if (!container) return;
    
    if (favoritePdfs.length === 0) {
        container.innerHTML = '';
        if (noFavorites) {
            noFavorites.classList.remove('hidden');
            noFavorites.style.opacity = '0';
            setTimeout(() => {
                noFavorites.style.transition = 'opacity 0.5s ease';
                noFavorites.style.opacity = '1';
            }, 100);
        }
        return;
    }
    
    if (noFavorites) noFavorites.classList.add('hidden');
    
    container.innerHTML = '';
    
    favoritePdfs.forEach((pdf, index) => {
        const card = createFavoriteCard(pdf, index);
        container.appendChild(card);
    });
}

function createFavoriteCard(pdf, index) {
    const card = document.createElement('div');
    card.className = 'progress-favorite-card bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-lg group cursor-pointer';
    card.style.animationDelay = `${index * 0.1}s`;
    card.style.opacity = '0';
    
    const coverImage = pdf.cover_image || 'images/gojo.png';
    const displayName = pdf.original_name.replace('.pdf', '');
    const pdfId = pdf.id;
    
    card.innerHTML = `
        <div class="pdf-card-image-container bg-cover bg-center relative overflow-hidden progress-favorite-image" style="background-image: url('${coverImage}')">
            <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div class="absolute top-2 right-2 p-2 bg-primary/90 rounded-full z-10 animate-pulse-once">
                <span class="material-symbols-outlined text-white text-sm">favorite</span>
            </div>
        </div>
        <div class="p-6 progress-favorite-content">
            <div class="flex items-center gap-2 mb-2 progress-favorite-category">
                <span class="material-symbols-outlined text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12">description</span>
                <span class="text-sm text-gray-600 dark:text-gray-400">${pdf.category || 'Otros'}</span>
            </div>
            <h3 class="text-xl font-bold mb-2 progress-favorite-title">${displayName}</h3>
            <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2 progress-favorite-description">${pdf.description || 'Sin descripción'}</p>
            <div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4 progress-favorite-meta">
                <span class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs">visibility</span>
                    ${pdf.views || 0} vistas
                </span>
                <span class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs">calendar_today</span>
                    ${formatDate(pdf.upload_date)}
                </span>
            </div>
            <button class="progress-favorite-button read-favorite-btn w-full px-4 py-2 bg-primary text-white rounded-lg font-bold relative overflow-hidden transition-all duration-300 transform group-hover:scale-105 group-hover:shadow-lg"
                    data-pdf-id="${pdfId}" 
                    data-pdf-name="${displayName.replace(/'/g, "\\'")}">
                <span class="relative z-10 flex items-center justify-center gap-2">
                    <span>Leer</span>
                    <span class="material-symbols-outlined text-sm transition-transform duration-300 group-hover:translate-x-1">arrow_forward</span>
                </span>
                <span class="absolute inset-0 bg-gradient-to-r from-primary to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
            </button>
        </div>
    `;
    
    // Agregar animación de entrada
    setTimeout(() => {
        card.style.opacity = '1';
        card.classList.add('animate-fade-in-up');
    }, index * 100);
    
    // Agregar event listener al botón
    const button = card.querySelector('.read-favorite-btn');
    if (button) {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const pdfId = parseInt(button.getAttribute('data-pdf-id'));
            const pdfName = button.getAttribute('data-pdf-name');
            // Intentar cargar desde el progreso guardado
            try {
                const savedProgress = await loadSavedProgress(pdfId);
                const savedPage = savedProgress && savedProgress.current_page ? parseInt(savedProgress.current_page) : null;
                continueReadingFromProgress(pdfId, pdfName, savedPage);
            } catch (error) {
                console.error('Error al cargar progreso:', error);
                continueReadingFromProgress(pdfId, pdfName, null);
            }
        });
    }
    
    return card;
}

function displayUserProgress(progressList, stats = {}) {
    const progressListEl = document.getElementById('progressList');
    const noProgressEl = document.getElementById('noProgress');
    const totalTimeEl = document.getElementById('totalTime');
    const totalBooks = document.getElementById('totalBooks');
    const avgProgress = document.getElementById('avgProgress');
    
    if (!progressListEl) return;
    
    // Animar estadísticas con efecto de conteo
    function animateValue(element, start, end, duration, suffix = '') {
        if (!element) return;
        const startTime = performance.now();
        const isNumber = typeof end === 'number';
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            if (isNumber) {
                const current = Math.floor(start + (end - start) * progress);
                element.textContent = current + suffix;
            } else {
                element.textContent = end;
            }
            
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        requestAnimationFrame(update);
    }
    
    // Mostrar tiempo total con animación
    if (totalTimeEl) {
        const totalMinutes = stats.totalTimeMinutes || 0;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        animateValue(totalTimeEl, 0, `${hours}h ${minutes}m`, 1000);
    }
    
    if (progressList.length === 0) {
        progressListEl.innerHTML = '';
        if (noProgressEl) noProgressEl.classList.remove('hidden');
        if (totalBooks) animateValue(totalBooks, 0, 0, 800);
        if (avgProgress) animateValue(avgProgress, 0, '0%', 800);
        return;
    }
    
    if (noProgressEl) noProgressEl.classList.add('hidden');
    
    // Mostrar total de libros (usar stats si está disponible, sino contar el array)
    const bookCount = stats.totalBooks !== undefined ? stats.totalBooks : progressList.length;
    if (totalBooks) {
        animateValue(totalBooks, 0, bookCount, 1000);
    }
    
    // Calcular progreso promedio
    let totalProgress = 0;
    progressList.forEach(p => {
        const percent = (p.current_page / p.total_pages) * 100;
        totalProgress += percent;
    });
    
    const avg = progressList.length > 0 ? totalProgress / progressList.length : 0;
    if (avgProgress) {
        animateValue(avgProgress, 0, Math.round(avg), 1000, '%');
    }
    
    progressListEl.innerHTML = '';
    
    progressList.forEach((progress, index) => {
        const card = createProgressCard(progress, index);
        progressListEl.appendChild(card);
    });
}

function createProgressCard(progress, index) {
    const card = document.createElement('div');
    card.className = 'progress-reading-card bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg group cursor-pointer';
    card.style.animationDelay = `${index * 0.1}s`;
    card.style.opacity = '0';
    
    const percent = Math.round((progress.current_page / progress.total_pages) * 100);
    const coverImage = progress.cover_image || 'images/gojo.png';
    const pdfId = progress.pdf_id || progress.id;
    const pdfName = (progress.original_name || '').replace(/\.pdf$/, '');
    const savedPage = parseInt(progress.current_page) || 1;
    
    card.innerHTML = `
        <div class="flex gap-6">
            <div class="w-32 h-48 bg-cover bg-center rounded-lg flex-shrink-0 shadow-md progress-reading-image transition-transform duration-500 group-hover:scale-105" style="background-image: url('${coverImage}')"></div>
            <div class="flex-1 progress-reading-content">
                <h3 class="text-xl font-bold mb-2 progress-reading-title transition-colors duration-300 group-hover:text-primary">${pdfName}</h3>
                <div class="mb-4">
                    <div class="flex justify-between text-sm mb-1">
                        <span class="font-medium flex items-center gap-1">
                            <span class="material-symbols-outlined text-xs">percent</span>
                            Progreso
                        </span>
                        <span class="font-bold text-primary progress-reading-percent transition-transform duration-300 group-hover:scale-110">${percent}%</span>
                    </div>
                    <div class="progress-bar h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
                        <div class="progress-bar-fill h-full bg-gradient-to-r from-primary to-blue-500 rounded-full transition-all duration-1000 ease-out shadow-lg" style="width: 0%"></div>
                    </div>
                </div>
                <div class="flex flex-wrap gap-4 mb-4 text-sm text-gray-600 dark:text-gray-400 progress-reading-meta">
                    <span class="flex items-center gap-1 transition-transform duration-300 group-hover:translate-x-1">
                        <span class="material-symbols-outlined text-xs">book</span>
                        Página ${progress.current_page} de ${progress.total_pages}
                    </span>
                    <span class="flex items-center gap-1 transition-transform duration-300 group-hover:translate-x-1">
                        <span class="material-symbols-outlined text-xs">schedule</span>
                        Última lectura: ${formatDate(progress.last_read)}
                    </span>
                </div>
                <button class="progress-continue-btn continue-reading-btn px-6 py-2 bg-primary text-white rounded-lg font-bold relative overflow-hidden transition-all duration-300 transform group-hover:scale-105 group-hover:shadow-lg" 
                        data-pdf-id="${pdfId}" 
                        data-pdf-name="${pdfName.replace(/'/g, "\\'")}" 
                        data-saved-page="${savedPage}">
                    <span class="relative z-10 flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-sm">play_arrow</span>
                        <span>Continuar lectura</span>
                        <span class="material-symbols-outlined text-sm transition-transform duration-300 group-hover:translate-x-1">arrow_forward</span>
                    </span>
                    <span class="absolute inset-0 bg-gradient-to-r from-primary to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                </button>
            </div>
        </div>
    `;
    
    // Animar la barra de progreso después de un pequeño delay
    setTimeout(() => {
        const progressBarFill = card.querySelector('.progress-bar-fill');
        if (progressBarFill) {
            progressBarFill.style.width = `${percent}%`;
        }
    }, 300 + (index * 100));
    
    // Agregar animación de entrada
    setTimeout(() => {
        card.style.opacity = '1';
        card.classList.add('animate-fade-in-up');
    }, index * 100);
    
    // Agregar event listener al botón de continuar lectura
    const button = card.querySelector('.continue-reading-btn');
    if (button) {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Evitar que el click en el botón active el click de la tarjeta
            const pdfId = parseInt(button.getAttribute('data-pdf-id'));
            const pdfName = button.getAttribute('data-pdf-name');
            const savedPage = parseInt(button.getAttribute('data-saved-page'));
            continueReadingFromProgress(pdfId, pdfName, savedPage);
        });
    }
    
    return card;
}

async function continueReadingFromProgress(pdfId, pdfName, savedPage = null) {
    try {
        // Convertir pdfId a número
        const numericPdfId = parseInt(pdfId);
        
        // Convertir savedPage a número si existe
        let pageToLoad = null;
        if (savedPage !== null && savedPage !== undefined && savedPage !== 'null' && savedPage !== 'undefined') {
            const parsedPage = parseInt(savedPage);
            if (!isNaN(parsedPage) && parsedPage > 0) {
                pageToLoad = parsedPage;
                console.log('Página recibida del botón:', pageToLoad);
            }
        }
        
        // Si no hay página especificada, intentar cargar desde el progreso guardado
        if (pageToLoad === null || pageToLoad === undefined) {
            console.log('Buscando progreso guardado para PDF:', numericPdfId);
            const savedProgress = await loadSavedProgress(numericPdfId);
            console.log('Progreso encontrado:', savedProgress);
            if (savedProgress && savedProgress.current_page) {
                const parsedSavedPage = parseInt(savedProgress.current_page);
                if (!isNaN(parsedSavedPage) && parsedSavedPage > 0) {
                    pageToLoad = parsedSavedPage;
                    console.log('Página cargada del progreso:', pageToLoad);
                }
            }
        }
        
        console.log('Continuando lectura:', { 
            pdfId: numericPdfId, 
            pdfName, 
            savedPageReceived: savedPage,
            pageToLoad 
        });
        
        // Asegurarse de que estamos en la página del dashboard para mostrar el visor
        // Verificar si existe el elemento dashboard y navegar a él
        if (pages.dashboard) {
            // Mostrar el dashboard usando showPage
            showPage('dashboard');
            // Esperar un momento para que el DOM se actualice
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        
        // Cargar PDF con la página especificada
        await loadPdf(numericPdfId, pdfName, pageToLoad);
        
        // Hacer scroll al visor de PDF para que el usuario vea inmediatamente la página
        const pdfViewer = document.getElementById('pdfViewer');
        if (pdfViewer) {
            pdfViewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch (error) {
        console.error('Error al continuar lectura:', error);
        alert('Error al cargar el documento: ' + error.message);
    }
}

// ==================== PREFERENCIAS ====================

let currentPreferences = {
    font_size: 1.0,
    high_contrast: 0,
    reading_speed: 1.0,
    letter_spacing: 0,
    line_height: 1.5,
    font_weight_bold: 0,
    larger_click_areas: 0,
    large_cursor: 0,
    disable_animations: 0,
    enhanced_focus: 0,
    voice_name: null,
    voice_volume: 1.0,
    voice_pitch: 1.0,
    voice_pause: 0.5,
    ui_density: 'comfortable',
    border_style: 'rounded',
    reduce_motion: 0,
    transition_speed: 'normal',
    background_opacity: 1.0
};

let preferencesListenersSetup = false;

async function loadPreferences() {
    try {
        const response = await fetch('/api/user/preferences');
        if (response.ok) {
            const prefs = await response.json();
            currentPreferences = { ...currentPreferences, ...prefs };
            applyPreferences(currentPreferences);
        }
    } catch (error) {
        console.error('Error al cargar preferencias:', error);
    }
}

function applyPreferences(prefs) {
    // Normalizar valores (convertir a números/booleanos según corresponda)
    const font_size = parseFloat(prefs.font_size) || 1.0;
    const high_contrast = parseInt(prefs.high_contrast) || 0;
    const letter_spacing = parseFloat(prefs.letter_spacing) || 0;
    const line_height = parseFloat(prefs.line_height) || 1.5;
    const font_weight_bold = parseInt(prefs.font_weight_bold) || 0;
    
    // Actualizar botones de voz
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn && prefs.voice_name) {
        voiceBtn.textContent = prefs.voice_name.split(' (')[0];
    } else if (voiceBtn) {
        voiceBtn.textContent = 'Predeterminada';
    }
    
    const volumeBtn = document.getElementById('volumeBtn');
    if (volumeBtn) {
        const volume = Math.round((prefs.voice_volume || 1.0) * 100);
        volumeBtn.textContent = `${volume}%`;
    }
    
    const pitchBtn = document.getElementById('pitchBtn');
    if (pitchBtn) {
        pitchBtn.textContent = parseFloat(prefs.voice_pitch || 1.0).toFixed(1);
    }
    
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.textContent = `${parseFloat(prefs.voice_pause || 0.5).toFixed(1)}s`;
    }
    const larger_click_areas = parseInt(prefs.larger_click_areas) || 0;
    const large_cursor = parseInt(prefs.large_cursor) || 0;
    const enhanced_focus = parseInt(prefs.enhanced_focus) || 0;
    const disable_animations = parseInt(prefs.disable_animations) || 0;
    const reading_speed = parseFloat(prefs.reading_speed) || 1.0;
    
    console.log('Aplicando preferencias:', {
        font_size, high_contrast, letter_spacing, line_height,
        font_weight_bold, larger_click_areas, large_cursor,
        enhanced_focus, disable_animations, reading_speed
    });
    
    // Font size
    const fontSizeBtn = document.getElementById('fontSizeBtn');
    if (fontSizeBtn) {
        const sizes = { 
            0.8: 'Pequeño', 
            1.0: 'Mediano', 
            1.2: 'Grande', 
            1.5: 'Extra Grande',
            2.0: 'Muy Grande',
            2.5: 'Extremo'
        };
        fontSizeBtn.textContent = sizes[font_size] || 'Mediano';
    }
    
    // Limpiar clases de preferencias del body
    document.body.classList.remove(
        'font-size-small', 'font-size-medium', 'font-size-large', 
        'font-size-extra-large', 'font-size-very-large', 'font-size-extreme',
        'high-contrast', 'letter-spacing-active', 'line-height-active',
        'font-weight-bold', 'larger-click-areas', 'large-cursor',
        'enhanced-focus', 'disable-animations'
    );
    
    // Aplicar tamaño de fuente
    if (font_size === 0.8) document.body.classList.add('font-size-small');
    else if (font_size === 1.0) document.body.classList.add('font-size-medium');
    else if (font_size === 1.2) document.body.classList.add('font-size-large');
    else if (font_size === 1.5) document.body.classList.add('font-size-extra-large');
    else if (font_size === 2.0) document.body.classList.add('font-size-very-large');
    else if (font_size === 2.5) document.body.classList.add('font-size-extreme');
    else document.body.classList.add('font-size-medium');
    
    document.body.style.fontSize = `${font_size}em`;
    
    // High contrast
    const highContrastToggle = document.getElementById('highContrastToggle');
    if (highContrastToggle) {
        highContrastToggle.checked = high_contrast === 1;
    }
    if (high_contrast === 1) {
        document.body.classList.add('high-contrast');
    }
    
    // Letter spacing
    const letterSpacingBtn = document.getElementById('letterSpacingBtn');
    if (letterSpacingBtn) {
        const spacingLabels = { 0: 'Normal', 0.05: 'Pequeño', 0.1: 'Mediano', 0.15: 'Grande', 0.2: 'Muy Grande' };
        letterSpacingBtn.textContent = spacingLabels[letter_spacing] || 'Normal';
    }
    document.documentElement.style.setProperty('--letter-spacing', `${letter_spacing}em`);
    if (letter_spacing > 0) {
        document.body.classList.add('letter-spacing-active');
    }
    
    // Line height
    const lineHeightBtn = document.getElementById('lineHeightBtn');
    if (lineHeightBtn) {
        const heightLabels = { 1.5: 'Normal', 1.8: 'Pequeño', 2.0: 'Mediano', 2.5: 'Grande', 3.0: 'Muy Grande' };
        lineHeightBtn.textContent = heightLabels[line_height] || 'Normal';
    }
    document.documentElement.style.setProperty('--line-height', line_height.toString());
    if (line_height !== 1.5) {
        document.body.classList.add('line-height-active');
    }
    
    // Font weight bold
    const fontWeightBoldToggle = document.getElementById('fontWeightBoldToggle');
    if (fontWeightBoldToggle) {
        fontWeightBoldToggle.checked = font_weight_bold === 1;
    }
    if (font_weight_bold === 1) {
        document.body.classList.add('font-weight-bold');
    }
    
    // Larger click areas
    const largerClickAreasToggle = document.getElementById('largerClickAreasToggle');
    if (largerClickAreasToggle) {
        largerClickAreasToggle.checked = larger_click_areas === 1;
    }
    if (larger_click_areas === 1) {
        document.body.classList.add('larger-click-areas');
    }
    
    // Large cursor
    const largeCursorToggle = document.getElementById('largeCursorToggle');
    if (largeCursorToggle) {
        largeCursorToggle.checked = large_cursor === 1;
    }
    if (large_cursor === 1) {
        document.body.classList.add('large-cursor');
    }
    
    // Enhanced focus
    const enhancedFocusToggle = document.getElementById('enhancedFocusToggle');
    if (enhancedFocusToggle) {
        enhancedFocusToggle.checked = enhanced_focus === 1;
    }
    if (enhanced_focus === 1) {
        document.body.classList.add('enhanced-focus');
    }
    
    // Disable animations
    const disableAnimationsToggle = document.getElementById('disableAnimationsToggle');
    if (disableAnimationsToggle) {
        disableAnimationsToggle.checked = disable_animations === 1;
    }
    if (disable_animations === 1) {
        document.body.classList.add('disable-animations');
    }
    
    // Reading speed
    const speedBtn = document.getElementById('speedBtn');
    if (speedBtn) {
        speedBtn.textContent = `${reading_speed}x`;
    }
    
    const speedRange = document.getElementById('speedRange');
    if (speedRange) {
        speedRange.value = reading_speed;
    }
    
    // Night mode
    const nightModeToggle = document.getElementById('nightModeToggle');
    if (nightModeToggle) {
        const isDark = document.documentElement.classList.contains('dark');
        nightModeToggle.checked = isDark;
    }
    
    // UI Density
    const densityBtn = document.getElementById('densityBtn');
    if (densityBtn) {
        const density = prefs.ui_density || 'comfortable';
        const densityLabels = {
            'compact': 'Compacta',
            'comfortable': 'Cómoda',
            'spacious': 'Espaciosa'
        };
        densityBtn.textContent = densityLabels[density] || 'Cómoda';
        document.body.classList.remove('ui-density-compact', 'ui-density-comfortable', 'ui-density-spacious');
        document.body.classList.add(`ui-density-${density}`);
    }
    
    // Border Style
    const borderStyleBtn = document.getElementById('borderStyleBtn');
    if (borderStyleBtn) {
        const borderStyle = prefs.border_style || 'rounded';
        borderStyleBtn.textContent = borderStyle === 'rounded' ? 'Redondeado' : 'Cuadrado';
        document.body.classList.remove('border-style-rounded', 'border-style-square');
        document.body.classList.add(`border-style-${borderStyle}`);
    }
    
    // Reduce Motion
    const reduceMotionToggle = document.getElementById('reduceMotionToggle');
    if (reduceMotionToggle) {
        reduceMotionToggle.checked = (prefs.reduce_motion || 0) === 1;
        if (prefs.reduce_motion === 1) {
            document.body.classList.add('reduce-motion');
        } else {
            document.body.classList.remove('reduce-motion');
        }
    }
    
    // Transition Speed
    const transitionSpeedBtn = document.getElementById('transitionSpeedBtn');
    if (transitionSpeedBtn) {
        const speed = prefs.transition_speed || 'normal';
        const speedLabels = {
            'fast': 'Rápida',
            'normal': 'Normal',
            'slow': 'Lenta'
        };
        transitionSpeedBtn.textContent = speedLabels[speed] || 'Normal';
        document.body.classList.remove('transition-speed-fast', 'transition-speed-normal', 'transition-speed-slow');
        document.body.classList.add(`transition-speed-${speed}`);
    }
    
    // Background Opacity
    const opacityBtn = document.getElementById('opacityBtn');
    if (opacityBtn) {
        const opacity = prefs.background_opacity || 1.0;
        opacityBtn.textContent = `${Math.round(opacity * 100)}%`;
        document.documentElement.style.setProperty('--background-opacity', opacity.toString());
    }
    
    console.log('Preferencias aplicadas. Clases del body:', document.body.className);
}

async function savePreferences(prefs) {
    try {
        // Actualizar preferencias actuales
        currentPreferences = { ...currentPreferences, ...prefs };
        const response = await fetch('/api/user/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentPreferences)
        });
        if (response.ok) {
            // Aplicar inmediatamente sin recargar
            applyPreferences(currentPreferences);
            console.log('Preferencias guardadas y aplicadas:', currentPreferences);
        } else {
            console.error('Error al guardar preferencias:', await response.text());
        }
    } catch (error) {
        console.error('Error al guardar preferencias:', error);
    }
}

function setupPreferencesListeners() {
    // Esta función puede llamarse múltiples veces, pero los listeners se añaden solo una vez
    // debido a que verificamos si los elementos existen antes de añadirlos
    
    // Font size
    const fontSizeBtn = document.getElementById('fontSizeBtn');
    const fontSizeModal = document.getElementById('fontSizeModal');
    const fontSizeSave = document.getElementById('fontSizeSave');
    const fontSizeCancel = document.getElementById('fontSizeCancel');
    
    if (fontSizeBtn && fontSizeModal) {
        fontSizeBtn.addEventListener('click', () => {
            const currentSize = currentPreferences.font_size || 1.0;
            document.querySelectorAll('.font-size-option').forEach(btn => {
                btn.classList.remove('selected');
                if (parseFloat(btn.getAttribute('data-size')) === currentSize) {
                    btn.classList.add('selected');
                }
            });
            fontSizeModal.classList.remove('hidden');
        });
    }
    if (fontSizeCancel) {
        fontSizeCancel.addEventListener('click', () => {
            if (fontSizeModal) fontSizeModal.classList.add('hidden');
        });
    }
    if (fontSizeSave) {
        fontSizeSave.addEventListener('click', () => {
            const selected = document.querySelector('.font-size-option.selected');
            if (selected) {
                const size = parseFloat(selected.getAttribute('data-size'));
                savePreferences({ font_size: size });
            }
            if (fontSizeModal) fontSizeModal.classList.add('hidden');
        });
    }
    
    document.querySelectorAll('.font-size-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.font-size-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
    
    // High contrast
    const highContrastToggle = document.getElementById('highContrastToggle');
    if (highContrastToggle && !highContrastToggle.dataset.listenerAdded) {
        highContrastToggle.dataset.listenerAdded = 'true';
        highContrastToggle.addEventListener('change', (e) => {
            console.log('High contrast cambiado:', e.target.checked);
            const value = e.target.checked ? 1 : 0;
            if (value === 1) {
                document.body.classList.add('high-contrast');
            } else {
                document.body.classList.remove('high-contrast');
            }
            savePreferences({ high_contrast: value });
        });
    }
    
    // Letter spacing
    const letterSpacingBtn = document.getElementById('letterSpacingBtn');
    const letterSpacingModal = document.getElementById('letterSpacingModal');
    const letterSpacingSave = document.getElementById('letterSpacingSave');
    const letterSpacingCancel = document.getElementById('letterSpacingCancel');
    
    if (letterSpacingBtn && letterSpacingModal) {
        letterSpacingBtn.addEventListener('click', () => {
            const currentSpacing = currentPreferences.letter_spacing || 0;
            document.querySelectorAll('.letter-spacing-option').forEach(btn => {
                btn.classList.remove('selected');
                if (parseFloat(btn.getAttribute('data-spacing')) === currentSpacing) {
                    btn.classList.add('selected');
                }
            });
            letterSpacingModal.classList.remove('hidden');
        });
    }
    if (letterSpacingCancel) {
        letterSpacingCancel.addEventListener('click', () => {
            if (letterSpacingModal) letterSpacingModal.classList.add('hidden');
        });
    }
    if (letterSpacingSave) {
        letterSpacingSave.addEventListener('click', () => {
            const selected = document.querySelector('.letter-spacing-option.selected');
            if (selected) {
                const spacing = parseFloat(selected.getAttribute('data-spacing'));
                savePreferences({ letter_spacing: spacing });
            }
            if (letterSpacingModal) letterSpacingModal.classList.add('hidden');
        });
    }
    document.querySelectorAll('.letter-spacing-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.letter-spacing-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
    
    // Line height
    const lineHeightBtn = document.getElementById('lineHeightBtn');
    const lineHeightModal = document.getElementById('lineHeightModal');
    const lineHeightSave = document.getElementById('lineHeightSave');
    const lineHeightCancel = document.getElementById('lineHeightCancel');
    
    if (lineHeightBtn && lineHeightModal) {
        lineHeightBtn.addEventListener('click', () => {
            const currentHeight = currentPreferences.line_height || 1.5;
            document.querySelectorAll('.line-height-option').forEach(btn => {
                btn.classList.remove('selected');
                if (parseFloat(btn.getAttribute('data-height')) === currentHeight) {
                    btn.classList.add('selected');
                }
            });
            lineHeightModal.classList.remove('hidden');
        });
    }
    if (lineHeightCancel) {
        lineHeightCancel.addEventListener('click', () => {
            if (lineHeightModal) lineHeightModal.classList.add('hidden');
        });
    }
    if (lineHeightSave) {
        lineHeightSave.addEventListener('click', () => {
            const selected = document.querySelector('.line-height-option.selected');
            if (selected) {
                const height = parseFloat(selected.getAttribute('data-height'));
                savePreferences({ line_height: height });
            }
            if (lineHeightModal) lineHeightModal.classList.add('hidden');
        });
    }
    document.querySelectorAll('.line-height-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.line-height-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
    
    // Font weight bold
    const fontWeightBoldToggle = document.getElementById('fontWeightBoldToggle');
    if (fontWeightBoldToggle && !fontWeightBoldToggle.dataset.listenerAdded) {
        fontWeightBoldToggle.dataset.listenerAdded = 'true';
        fontWeightBoldToggle.addEventListener('change', (e) => {
            console.log('Font weight bold cambiado:', e.target.checked);
            const value = e.target.checked ? 1 : 0;
            if (value === 1) {
                document.body.classList.add('font-weight-bold');
            } else {
                document.body.classList.remove('font-weight-bold');
            }
            savePreferences({ font_weight_bold: value });
        });
    }
    
    // Larger click areas
    const largerClickAreasToggle = document.getElementById('largerClickAreasToggle');
    if (largerClickAreasToggle && !largerClickAreasToggle.dataset.listenerAdded) {
        largerClickAreasToggle.dataset.listenerAdded = 'true';
        largerClickAreasToggle.addEventListener('change', (e) => {
            console.log('Larger click areas cambiado:', e.target.checked);
            const value = e.target.checked ? 1 : 0;
            if (value === 1) {
                document.body.classList.add('larger-click-areas');
            } else {
                document.body.classList.remove('larger-click-areas');
            }
            savePreferences({ larger_click_areas: value });
        });
    }
    
    // Large cursor
    const largeCursorToggle = document.getElementById('largeCursorToggle');
    if (largeCursorToggle && !largeCursorToggle.dataset.listenerAdded) {
        largeCursorToggle.dataset.listenerAdded = 'true';
        largeCursorToggle.addEventListener('change', (e) => {
            console.log('Large cursor cambiado:', e.target.checked);
            const value = e.target.checked ? 1 : 0;
            if (value === 1) {
                document.body.classList.add('large-cursor');
            } else {
                document.body.classList.remove('large-cursor');
            }
            savePreferences({ large_cursor: value });
        });
    }
    
    // Enhanced focus
    const enhancedFocusToggle = document.getElementById('enhancedFocusToggle');
    if (enhancedFocusToggle && !enhancedFocusToggle.dataset.listenerAdded) {
        enhancedFocusToggle.dataset.listenerAdded = 'true';
        enhancedFocusToggle.addEventListener('change', (e) => {
            console.log('Enhanced focus cambiado:', e.target.checked);
            const value = e.target.checked ? 1 : 0;
            if (value === 1) {
                document.body.classList.add('enhanced-focus');
            } else {
                document.body.classList.remove('enhanced-focus');
            }
            savePreferences({ enhanced_focus: value });
        });
    }
    
    // Disable animations
    const disableAnimationsToggle = document.getElementById('disableAnimationsToggle');
    if (disableAnimationsToggle && !disableAnimationsToggle.dataset.listenerAdded) {
        disableAnimationsToggle.dataset.listenerAdded = 'true';
        disableAnimationsToggle.addEventListener('change', (e) => {
            console.log('Disable animations cambiado:', e.target.checked);
            const value = e.target.checked ? 1 : 0;
            if (value === 1) {
                document.body.classList.add('disable-animations');
            } else {
                document.body.classList.remove('disable-animations');
            }
            savePreferences({ disable_animations: value });
        });
    }
    
    // Reading speed
    const speedBtn = document.getElementById('speedBtn');
    const speedModal = document.getElementById('speedModal');
    const speedSave = document.getElementById('speedSave');
    const speedCancel = document.getElementById('speedCancel');
    const speedModalRange = document.getElementById('speedModalRange');
    const speedModalValue = document.getElementById('speedModalValue');
    
    if (speedBtn && speedModal) {
        speedBtn.addEventListener('click', () => {
            if (speedModalRange) {
                speedModalRange.value = currentPreferences.reading_speed || 1.0;
            }
            if (speedModalValue) {
                speedModalValue.textContent = `${currentPreferences.reading_speed || 1.0}x`;
            }
            speedModal.classList.remove('hidden');
        });
    }
    if (speedCancel) {
        speedCancel.addEventListener('click', () => {
            if (speedModal) speedModal.classList.add('hidden');
        });
    }
    if (speedModalRange && speedModalValue) {
        speedModalRange.addEventListener('input', (e) => {
            speedModalValue.textContent = `${e.target.value}x`;
        });
    }
    if (speedSave) {
        speedSave.addEventListener('click', () => {
            if (speedModalRange) {
                const speed = parseFloat(speedModalRange.value);
                savePreferences({ reading_speed: speed });
            }
            if (speedModal) speedModal.classList.add('hidden');
        });
    }
    
    // Cerrar modales con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = [fontSizeModal, letterSpacingModal, lineHeightModal, speedModal];
            modals.forEach(modal => {
                if (modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                }
            });
        }
    });
    
    // Cerrar modales al hacer clic fuera
    [fontSizeModal, letterSpacingModal, lineHeightModal, speedModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        }
    });
    
    // Foto de perfil
    const profilePictureInput = document.getElementById('profilePictureInput');
    if (profilePictureInput) {
        profilePictureInput.addEventListener('change', handleProfilePictureUpload);
    }
    
    // Cargar foto de perfil actual
    loadCurrentProfilePicture();
    
    // Configurar listeners para nuevas opciones de voz
    setupVoicePreferencesListeners();
    
    // Configurar listeners para opciones de apariencia
    setupAppearanceListeners();
    
    console.log('Listeners de preferencias configurados');
}

function setupVoicePreferencesListeners() {
    // Modal de Voz
    const voiceBtn = document.getElementById('voiceBtn');
    const voiceModal = document.getElementById('voiceModal');
    const voiceModalSelect = document.getElementById('voiceModalSelect');
    const voiceSave = document.getElementById('voiceSave');
    const voiceCancel = document.getElementById('voiceCancel');
    
    if (voiceBtn && voiceModal) {
        voiceBtn.addEventListener('click', () => {
            // Cargar voces disponibles
            const voices = speechSynthesis.getVoices();
            if (voiceModalSelect) {
                voiceModalSelect.innerHTML = '';
                
                // Filtrar solo voces de Microsoft en español
                const microsoftVoices = voices.filter(voice => 
                    voice.name.includes('Microsoft') && 
                    (voice.lang.startsWith('es') || voice.lang.includes('Spanish'))
                );
                
                if (microsoftVoices.length > 0) {
                    microsoftVoices.forEach(voice => {
                        const option = document.createElement('option');
                        option.value = voice.name;
                        option.textContent = `${voice.name} (${voice.lang})`;
                        if (currentPreferences.voice_name === voice.name) {
                            option.selected = true;
                        }
                        voiceModalSelect.appendChild(option);
                    });
                } else {
                    // Si no hay voces de Microsoft, mostrar mensaje
                    const option = document.createElement('option');
                    option.value = '';
                    option.textContent = 'No hay voces de Microsoft disponibles';
                    option.disabled = true;
                    voiceModalSelect.appendChild(option);
                }
                
                // Si no hay voz seleccionada, seleccionar la primera
                if (!currentPreferences.voice_name && microsoftVoices.length > 0) {
                    voiceModalSelect.value = microsoftVoices[0].name;
                }
            }
            voiceModal.classList.remove('hidden');
        });
    }
    
    if (voiceCancel) {
        voiceCancel.addEventListener('click', () => {
            if (voiceModal) voiceModal.classList.add('hidden');
        });
    }
    
    if (voiceSave) {
        voiceSave.addEventListener('click', () => {
            if (voiceModalSelect) {
                const voiceName = voiceModalSelect.value;
                savePreferences({ voice_name: voiceName });
                if (voiceBtn) {
                    const selectedOption = voiceModalSelect.options[voiceModalSelect.selectedIndex];
                    voiceBtn.textContent = selectedOption ? selectedOption.textContent.split(' (')[0] : 'Predeterminada';
                }
            }
            if (voiceModal) voiceModal.classList.add('hidden');
        });
    }
    
    // Modal de Volumen
    const volumeBtn = document.getElementById('volumeBtn');
    const volumeModal = document.getElementById('volumeModal');
    const volumeModalRange = document.getElementById('volumeModalRange');
    const volumeModalValue = document.getElementById('volumeModalValue');
    const volumeSave = document.getElementById('volumeSave');
    const volumeCancel = document.getElementById('volumeCancel');
    
    if (volumeBtn && volumeModal) {
        volumeBtn.addEventListener('click', () => {
            if (volumeModalRange) {
                const volume = (currentPreferences.voice_volume || 1.0) * 100;
                volumeModalRange.value = volume;
            }
            if (volumeModalValue) {
                volumeModalValue.textContent = `${Math.round((currentPreferences.voice_volume || 1.0) * 100)}%`;
            }
            volumeModal.classList.remove('hidden');
        });
    }
    
    if (volumeCancel) {
        volumeCancel.addEventListener('click', () => {
            if (volumeModal) volumeModal.classList.add('hidden');
        });
    }
    
    if (volumeModalRange && volumeModalValue) {
        volumeModalRange.addEventListener('input', (e) => {
            volumeModalValue.textContent = `${e.target.value}%`;
        });
    }
    
    if (volumeSave) {
        volumeSave.addEventListener('click', () => {
            if (volumeModalRange) {
                const volume = parseFloat(volumeModalRange.value) / 100;
                savePreferences({ voice_volume: volume });
                if (volumeBtn) {
                    volumeBtn.textContent = `${Math.round(volume * 100)}%`;
                }
            }
            if (volumeModal) volumeModal.classList.add('hidden');
        });
    }
    
    // Modal de Pitch
    const pitchBtn = document.getElementById('pitchBtn');
    const pitchModal = document.getElementById('pitchModal');
    const pitchModalRange = document.getElementById('pitchModalRange');
    const pitchModalValue = document.getElementById('pitchModalValue');
    const pitchSave = document.getElementById('pitchSave');
    const pitchCancel = document.getElementById('pitchCancel');
    
    if (pitchBtn && pitchModal) {
        pitchBtn.addEventListener('click', () => {
            if (pitchModalRange) {
                pitchModalRange.value = currentPreferences.voice_pitch || 1.0;
            }
            if (pitchModalValue) {
                pitchModalValue.textContent = currentPreferences.voice_pitch || 1.0;
            }
            pitchModal.classList.remove('hidden');
        });
    }
    
    if (pitchCancel) {
        pitchCancel.addEventListener('click', () => {
            if (pitchModal) pitchModal.classList.add('hidden');
        });
    }
    
    if (pitchModalRange && pitchModalValue) {
        pitchModalRange.addEventListener('input', (e) => {
            pitchModalValue.textContent = parseFloat(e.target.value).toFixed(1);
        });
    }
    
    if (pitchSave) {
        pitchSave.addEventListener('click', () => {
            if (pitchModalRange) {
                const pitch = parseFloat(pitchModalRange.value);
                savePreferences({ voice_pitch: pitch });
                if (pitchBtn) {
                    pitchBtn.textContent = parseFloat(pitch).toFixed(1);
                }
            }
            if (pitchModal) pitchModal.classList.add('hidden');
        });
    }
    
    // Modal de Pausa
    const pauseBtn = document.getElementById('pauseBtn');
    const pauseModal = document.getElementById('pauseModal');
    const pauseModalRange = document.getElementById('pauseModalRange');
    const pauseModalValue = document.getElementById('pauseModalValue');
    const pauseSave = document.getElementById('pauseSave');
    const pauseCancel = document.getElementById('pauseCancel');
    
    if (pauseBtn && pauseModal) {
        pauseBtn.addEventListener('click', () => {
            if (pauseModalRange) {
                pauseModalRange.value = currentPreferences.voice_pause || 0.5;
            }
            if (pauseModalValue) {
                pauseModalValue.textContent = `${currentPreferences.voice_pause || 0.5}s`;
            }
            pauseModal.classList.remove('hidden');
        });
    }
    
    if (pauseCancel) {
        pauseCancel.addEventListener('click', () => {
            if (pauseModal) pauseModal.classList.add('hidden');
        });
    }
    
    if (pauseModalRange && pauseModalValue) {
        pauseModalRange.addEventListener('input', (e) => {
            pauseModalValue.textContent = `${parseFloat(e.target.value).toFixed(1)}s`;
        });
    }
    
    if (pauseSave) {
        pauseSave.addEventListener('click', () => {
            if (pauseModalRange) {
                const pause = parseFloat(pauseModalRange.value);
                savePreferences({ voice_pause: pause });
                if (pauseBtn) {
                    pauseBtn.textContent = `${parseFloat(pause).toFixed(1)}s`;
                }
            }
            if (pauseModal) pauseModal.classList.add('hidden');
        });
    }
    
    // Cerrar modales con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = ['voiceModal', 'volumeModal', 'pitchModal', 'pauseModal'];
            modals.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                }
            });
        }
    });
    
    // Cerrar modales al hacer click fuera
    ['voiceModal', 'volumeModal', 'pitchModal', 'pauseModal'].forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        }
    });
}

function setupAppearanceListeners() {
    // Modal de Densidad
    const densityBtn = document.getElementById('densityBtn');
    const densityModal = document.getElementById('densityModal');
    const densityOptions = document.querySelectorAll('.density-option');
    const densitySave = document.getElementById('densitySave');
    const densityCancel = document.getElementById('densityCancel');
    let selectedDensity = currentPreferences.ui_density || 'comfortable';
    
    if (densityBtn && densityModal) {
        densityBtn.addEventListener('click', () => {
            selectedDensity = currentPreferences.ui_density || 'comfortable';
            densityOptions.forEach(opt => {
                if (opt.dataset.density === selectedDensity) {
                    opt.classList.add('bg-primary', 'text-white');
                    opt.classList.remove('bg-gray-100', 'dark:bg-slate-700');
                } else {
                    opt.classList.remove('bg-primary', 'text-white');
                    opt.classList.add('bg-gray-100', 'dark:bg-slate-700');
                }
            });
            densityModal.classList.remove('hidden');
        });
    }
    
    densityOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            selectedDensity = opt.dataset.density;
            densityOptions.forEach(o => {
                o.classList.remove('bg-primary', 'text-white');
                o.classList.add('bg-gray-100', 'dark:bg-slate-700');
            });
            opt.classList.add('bg-primary', 'text-white');
            opt.classList.remove('bg-gray-100', 'dark:bg-slate-700');
        });
    });
    
    if (densityCancel) {
        densityCancel.addEventListener('click', () => {
            if (densityModal) densityModal.classList.add('hidden');
        });
    }
    
    if (densitySave) {
        densitySave.addEventListener('click', () => {
            savePreferences({ ui_density: selectedDensity });
            if (densityModal) densityModal.classList.add('hidden');
        });
    }
    
    // Modal de Estilo de Bordes
    const borderStyleBtn = document.getElementById('borderStyleBtn');
    const borderStyleModal = document.getElementById('borderStyleModal');
    const borderStyleOptions = document.querySelectorAll('.border-style-option');
    const borderStyleSave = document.getElementById('borderStyleSave');
    const borderStyleCancel = document.getElementById('borderStyleCancel');
    let selectedBorderStyle = currentPreferences.border_style || 'rounded';
    
    if (borderStyleBtn && borderStyleModal) {
        borderStyleBtn.addEventListener('click', () => {
            selectedBorderStyle = currentPreferences.border_style || 'rounded';
            borderStyleOptions.forEach(opt => {
                if (opt.dataset.style === selectedBorderStyle) {
                    opt.classList.add('bg-primary', 'text-white');
                    opt.classList.remove('bg-gray-100', 'dark:bg-slate-700');
                } else {
                    opt.classList.remove('bg-primary', 'text-white');
                    opt.classList.add('bg-gray-100', 'dark:bg-slate-700');
                }
            });
            borderStyleModal.classList.remove('hidden');
        });
    }
    
    borderStyleOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            selectedBorderStyle = opt.dataset.style;
            borderStyleOptions.forEach(o => {
                o.classList.remove('bg-primary', 'text-white');
                o.classList.add('bg-gray-100', 'dark:bg-slate-700');
            });
            opt.classList.add('bg-primary', 'text-white');
            opt.classList.remove('bg-gray-100', 'dark:bg-slate-700');
        });
    });
    
    if (borderStyleCancel) {
        borderStyleCancel.addEventListener('click', () => {
            if (borderStyleModal) borderStyleModal.classList.add('hidden');
        });
    }
    
    if (borderStyleSave) {
        borderStyleSave.addEventListener('click', () => {
            savePreferences({ border_style: selectedBorderStyle });
            if (borderStyleModal) borderStyleModal.classList.add('hidden');
        });
    }
    
    // Reducir Movimiento
    const reduceMotionToggle = document.getElementById('reduceMotionToggle');
    if (reduceMotionToggle) {
        reduceMotionToggle.addEventListener('change', () => {
            savePreferences({ reduce_motion: reduceMotionToggle.checked ? 1 : 0 });
        });
    }
    
    // Modal de Velocidad de Transiciones
    const transitionSpeedBtn = document.getElementById('transitionSpeedBtn');
    const transitionSpeedModal = document.getElementById('transitionSpeedModal');
    const transitionSpeedOptions = document.querySelectorAll('.transition-speed-option');
    const transitionSpeedSave = document.getElementById('transitionSpeedSave');
    const transitionSpeedCancel = document.getElementById('transitionSpeedCancel');
    let selectedTransitionSpeed = currentPreferences.transition_speed || 'normal';
    
    if (transitionSpeedBtn && transitionSpeedModal) {
        transitionSpeedBtn.addEventListener('click', () => {
            selectedTransitionSpeed = currentPreferences.transition_speed || 'normal';
            transitionSpeedOptions.forEach(opt => {
                if (opt.dataset.speed === selectedTransitionSpeed) {
                    opt.classList.add('bg-primary', 'text-white');
                    opt.classList.remove('bg-gray-100', 'dark:bg-slate-700');
                } else {
                    opt.classList.remove('bg-primary', 'text-white');
                    opt.classList.add('bg-gray-100', 'dark:bg-slate-700');
                }
            });
            transitionSpeedModal.classList.remove('hidden');
        });
    }
    
    transitionSpeedOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            selectedTransitionSpeed = opt.dataset.speed;
            transitionSpeedOptions.forEach(o => {
                o.classList.remove('bg-primary', 'text-white');
                o.classList.add('bg-gray-100', 'dark:bg-slate-700');
            });
            opt.classList.add('bg-primary', 'text-white');
            opt.classList.remove('bg-gray-100', 'dark:bg-slate-700');
        });
    });
    
    if (transitionSpeedCancel) {
        transitionSpeedCancel.addEventListener('click', () => {
            if (transitionSpeedModal) transitionSpeedModal.classList.add('hidden');
        });
    }
    
    if (transitionSpeedSave) {
        transitionSpeedSave.addEventListener('click', () => {
            savePreferences({ transition_speed: selectedTransitionSpeed });
            if (transitionSpeedModal) transitionSpeedModal.classList.add('hidden');
        });
    }
    
    // Modal de Opacidad
    const opacityBtn = document.getElementById('opacityBtn');
    const opacityModal = document.getElementById('opacityModal');
    const opacityModalRange = document.getElementById('opacityModalRange');
    const opacityModalValue = document.getElementById('opacityModalValue');
    const opacitySave = document.getElementById('opacitySave');
    const opacityCancel = document.getElementById('opacityCancel');
    
    if (opacityBtn && opacityModal) {
        opacityBtn.addEventListener('click', () => {
            if (opacityModalRange) {
                const opacity = currentPreferences.background_opacity || 1.0;
                opacityModalRange.value = opacity;
            }
            if (opacityModalValue) {
                opacityModalValue.textContent = `${Math.round((currentPreferences.background_opacity || 1.0) * 100)}%`;
            }
            opacityModal.classList.remove('hidden');
        });
    }
    
    if (opacityCancel) {
        opacityCancel.addEventListener('click', () => {
            if (opacityModal) opacityModal.classList.add('hidden');
        });
    }
    
    if (opacityModalRange && opacityModalValue) {
        opacityModalRange.addEventListener('input', (e) => {
            const opacity = parseFloat(e.target.value);
            opacityModalValue.textContent = `${Math.round(opacity * 100)}%`;
        });
    }
    
    if (opacitySave) {
        opacitySave.addEventListener('click', () => {
            if (opacityModalRange) {
                const opacity = parseFloat(opacityModalRange.value);
                savePreferences({ background_opacity: opacity });
                if (opacityBtn) {
                    opacityBtn.textContent = `${Math.round(opacity * 100)}%`;
                }
            }
            if (opacityModal) opacityModal.classList.add('hidden');
        });
    }
    
    // Cerrar modales con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = ['densityModal', 'borderStyleModal', 'transitionSpeedModal', 'opacityModal'];
            modals.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                }
            });
        }
    });
    
    // Cerrar modales al hacer click fuera
    ['densityModal', 'borderStyleModal', 'transitionSpeedModal', 'opacityModal'].forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        }
    });
}

async function loadCurrentProfilePicture() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            const data = await response.json();
            if (data.user && data.user.profilePicture) {
                const profilePictureImg = document.getElementById('currentProfilePicture');
                if (profilePictureImg) {
                    profilePictureImg.src = data.user.profilePicture;
                }
                // Actualizar también el avatar del menú
                updateProfileAvatar(data.user.profilePicture);
            }
        }
    } catch (error) {
        console.error('Error al cargar foto de perfil:', error);
    }
}

function updateProfileAvatar(profilePictureUrl) {
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar && profilePictureUrl) {
        profileAvatar.src = profilePictureUrl;
    } else if (profileAvatar && currentUser) {
        // Usar avatar generado si no hay foto
        profileAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.username)}&background=137fec&color=fff`;
    }
}

async function handleProfilePictureUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validar tamaño (5MB)
    if (file.size > 5 * 1024 * 1024) {
        showProfilePictureMessage('El archivo es demasiado grande. Máximo 5MB.', 'error');
        return;
    }
    
    // Validar tipo
    if (!file.type.startsWith('image/')) {
        showProfilePictureMessage('Solo se permiten archivos de imagen.', 'error');
        return;
    }
    
    // Mostrar loading
    const loading = document.getElementById('profilePictureLoading');
    const message = document.getElementById('profilePictureMessage');
    if (loading) loading.classList.remove('hidden');
    if (message) message.classList.add('hidden');
    
    // Crear FormData
    const formData = new FormData();
    formData.append('profilePicture', file);
    
    try {
        const response = await fetch('/api/user/profile-picture', {
            method: 'POST',
            body: formData
        });
        
        // Verificar si la respuesta es JSON
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error('Respuesta no es JSON:', text);
            showProfilePictureMessage('Error: El servidor devolvió una respuesta inesperada', 'error');
            return;
        }
        
        if (data.success) {
            // Actualizar imagen
            const profilePictureImg = document.getElementById('currentProfilePicture');
            if (profilePictureImg && data.profilePicture) {
                profilePictureImg.src = data.profilePicture + '?t=' + Date.now(); // Cache busting
            }
            
            // Actualizar avatar del menú
            updateProfileAvatar(data.profilePicture);
            
            // Actualizar currentUser
            if (currentUser) {
                currentUser.profilePicture = data.profilePicture;
            }
            
            showProfilePictureMessage('Foto de perfil actualizada exitosamente', 'success');
        } else {
            showProfilePictureMessage(data.error || 'Error al subir la foto', 'error');
        }
    } catch (error) {
        console.error('Error al subir foto de perfil:', error);
        showProfilePictureMessage('Error al subir la foto de perfil: ' + error.message, 'error');
    } finally {
        if (loading) loading.classList.add('hidden');
        // Limpiar input
        e.target.value = '';
    }
}

function showProfilePictureMessage(text, type) {
    const message = document.getElementById('profilePictureMessage');
    if (message) {
        message.textContent = text;
        message.className = `text-sm font-medium ${type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`;
        message.classList.remove('hidden');
        
        // Ocultar después de 5 segundos
        setTimeout(() => {
            message.classList.add('hidden');
        }, 5000);
    }
}

// ==================== ADMIN ====================

function initAdminAnimations() {
    // Las animaciones CSS se aplican automáticamente
    // Esta función puede usarse para animaciones adicionales si es necesario
    const adminPage = document.getElementById('adminPage');
    if (adminPage) {
        // Forzar reflow para reiniciar animaciones
        adminPage.style.animation = 'none';
        setTimeout(() => {
            adminPage.style.animation = '';
        }, 10);
    }
}

async function loadAdminData() {
    await Promise.all([
        loadAdminStats(),
        loadAdminUsers(),
        loadConnectedUsers(),
        loadAdminPdfs(),
        loadPopularPdfs()
    ]);
}

// Función para animar conteo de números
function animateNumber(element, target, duration = 1000) {
    if (!element) return;
    
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;
    
    element.textContent = '0';
    element.classList.add('admin-stat-number');
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

async function loadAdminStats() {
    try {
        const response = await fetch('/api/admin/stats');
        if (response.ok) {
            const stats = await response.json();
            const totalUsers = document.getElementById('totalUsers');
            const totalPdfs = document.getElementById('totalPdfs');
            const totalViews = document.getElementById('totalViews');
            
            // Animar los números con conteo
            if (totalUsers) {
                animateNumber(totalUsers, stats.totalUsers, 800);
            }
            if (totalPdfs) {
                setTimeout(() => animateNumber(totalPdfs, stats.totalPdfs, 800), 200);
            }
            if (totalViews) {
                setTimeout(() => animateNumber(totalViews, stats.totalViews, 800), 400);
            }
        }
    } catch (error) {
        console.error('Error al cargar estadísticas admin:', error);
    }
}

async function loadAdminUsers() {
    try {
        const response = await fetch('/api/admin/users');
        if (response.ok) {
            const users = await response.json();
            displayAdminUsers(users);
        }
    } catch (error) {
        console.error('Error al cargar usuarios admin:', error);
    }
}

function displayAdminUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    users.forEach((user, index) => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-300 dark:border-gray-700';
        row.style.opacity = '0';
        row.style.transform = 'translateX(-15px)';
        
        const hours = Math.floor(user.total_time_minutes / 60);
        const minutes = user.total_time_minutes % 60;
        const timeFormatted = `${hours}h ${minutes}m`;
        
        row.innerHTML = `
            <td class="py-3 px-4">${user.id}</td>
            <td class="py-3 px-4">${user.username}</td>
            <td class="py-3 px-4">${user.is_admin ? 'Sí' : 'No'}</td>
            <td class="py-3 px-4">${formatDate(user.created_at)}</td>
            <td class="py-3 px-4">${user.last_login ? formatDate(user.last_login) : 'Nunca'}</td>
            <td class="py-3 px-4">${timeFormatted}</td>
            <td class="py-3 px-4">${user.books_read || 0} de ${user.total_books || 0}</td>
            <td class="py-3 px-4">${Math.round(user.avg_progress_percent || 0)}%</td>
            <td class="py-3 px-4">
                <div class="flex gap-2">
                    <button onclick="showUserDetails(${user.id})" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                        Ver Detalles
                    </button>
                    <button onclick="deleteUser(${user.id}, '${user.username.replace(/'/g, "\\'")}')" 
                            class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                        Eliminar
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
        
        // Animar entrada de la fila
        setTimeout(() => {
            row.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            row.style.opacity = '1';
            row.style.transform = 'translateX(0)';
        }, 100 + (index * 50));
    });
}

async function loadConnectedUsers() {
    try {
        const response = await fetch('/api/admin/users/connected');
        if (response.ok) {
            const users = await response.json();
            displayConnectedUsers(users);
        }
    } catch (error) {
        console.error('Error al cargar usuarios conectados:', error);
    }
}

function displayConnectedUsers(users) {
    const container = document.getElementById('connectedUsersList');
    if (!container) return;
    
    if (users.length === 0) {
        container.innerHTML = '<p class="text-gray-600 dark:text-gray-400">No hay usuarios conectados</p>';
        return;
    }
    
    container.innerHTML = '';
    
    users.forEach((user, index) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-4 bg-gray-100 dark:bg-slate-700 rounded-lg';
        item.style.opacity = '0';
        item.style.transform = 'translateX(-20px)';
        item.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-3 h-3 bg-green-500 rounded-full"></div>
                <span class="font-medium">${user.username}</span>
                ${user.is_admin ? '<span class="px-2 py-1 bg-primary text-white text-xs rounded">Admin</span>' : ''}
            </div>
            <span class="text-sm text-gray-600 dark:text-gray-400">${formatDate(user.last_activity)}</span>
        `;
        container.appendChild(item);
        
        // Animar entrada del item
        setTimeout(() => {
            item.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            item.style.opacity = '1';
            item.style.transform = 'translateX(0)';
        }, 100 + (index * 100));
    });
}

async function loadAdminPdfs() {
    try {
        const response = await fetch('/api/pdfs');
        if (response.ok) {
            const pdfs = await response.json();
            displayAdminPdfs(pdfs);
        }
    } catch (error) {
        console.error('Error al cargar PDFs admin:', error);
    }
}

function displayAdminPdfs(pdfs) {
    const tbody = document.getElementById('pdfsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    pdfs.forEach((pdf, index) => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-300 dark:border-gray-700';
        row.style.opacity = '0';
        row.style.transform = 'translateX(-15px)';
        row.innerHTML = `
            <td class="py-3 px-4">${pdf.id}</td>
            <td class="py-3 px-4">${pdf.original_name}</td>
            <td class="py-3 px-4">${pdf.category || 'Otros'}</td>
            <td class="py-3 px-4">${formatDate(pdf.upload_date)}</td>
            <td class="py-3 px-4">${pdf.views || 0}</td>
            <td class="py-3 px-4">
                <div class="flex gap-2">
                    <button onclick="editPdf(${pdf.id})" 
                            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">edit</span>
                        Editar
                    </button>
                    <button onclick="deletePdf(${pdf.id}, '${(pdf.original_name || '').replace(/'/g, "\\'")}')" 
                            class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">delete</span>
                        Eliminar
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
        
        // Animar entrada de la fila
        setTimeout(() => {
            row.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            row.style.opacity = '1';
            row.style.transform = 'translateX(0)';
        }, 100 + (index * 50));
    });
}

async function loadPopularPdfs() {
    try {
        const response = await fetch('/api/pdfs/popular');
        if (response.ok) {
            const pdfs = await response.json();
            displayPopularPdfs(pdfs.slice(0, 5));
        }
    } catch (error) {
        console.error('Error al cargar PDFs populares:', error);
    }
}

function displayPopularPdfs(pdfs) {
    const tbody = document.getElementById('popularPdfsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    pdfs.forEach(pdf => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-300 dark:border-gray-700';
        row.innerHTML = `
            <td class="py-3 px-4">${pdf.id}</td>
            <td class="py-3 px-4">${pdf.original_name}</td>
            <td class="py-3 px-4">${pdf.views || 0}</td>
            <td class="py-3 px-4">${formatDate(pdf.upload_date)}</td>
        `;
        tbody.appendChild(row);
    });
}

async function showUserDetails(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/details`);
        if (response.ok) {
            const data = await response.json();
            displayUserDetails(data);
        }
    } catch (error) {
        console.error('Error al cargar detalles de usuario:', error);
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`¿Estás seguro de que deseas eliminar al usuario "${username}"?\n\nEsta acción no se puede deshacer y eliminará todos sus datos: progreso de lectura, preferencias y testimonios.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Usuario eliminado exitosamente');
            // Recargar la lista de usuarios y estadísticas
            await loadAdminUsers();
            await loadAdminStats();
        } else {
            alert('Error al eliminar usuario: ' + (data.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        alert('Error al eliminar usuario: ' + error.message);
    }
}

async function editPdf(pdfId) {
    try {
        // Obtener los datos del PDF
        const response = await fetch('/api/pdfs');
        if (!response.ok) {
            throw new Error('Error al cargar los PDFs');
        }
        
        const pdfs = await response.json();
        const pdf = pdfs.find(p => p.id === pdfId);
        
        if (!pdf) {
            alert('PDF no encontrado');
            return;
        }
        
        // Llenar el formulario con los datos del PDF
        document.getElementById('editPdfId').value = pdf.id;
        document.getElementById('editPdfName').value = pdf.original_name || '';
        document.getElementById('editPdfCategory').value = pdf.category || 'Otros';
        document.getElementById('editPdfCoverImage').value = pdf.cover_image || '';
        document.getElementById('editPdfDescription').value = pdf.description || '';
        
        // Mostrar el modal
        const modal = document.getElementById('editPdfModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            modal.classList.add('items-center', 'justify-center');
        }
    } catch (error) {
        console.error('Error al cargar PDF para editar:', error);
        alert('Error al cargar los datos del PDF: ' + error.message);
    }
}

function closeEditPdfModal() {
    const modal = document.getElementById('editPdfModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        // Limpiar el formulario
        document.getElementById('editPdfForm').reset();
    }
}

async function handleEditPdf(e) {
    e.preventDefault();
    
    const pdfId = document.getElementById('editPdfId').value;
    const original_name = document.getElementById('editPdfName').value;
    const category = document.getElementById('editPdfCategory').value;
    const cover_image = document.getElementById('editPdfCoverImage').value;
    const description = document.getElementById('editPdfDescription').value;
    
    if (!original_name.trim()) {
        alert('El nombre del PDF es requerido');
        return;
    }
    
    try {
        const response = await fetch(`/api/pdfs/${pdfId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                original_name: original_name.trim(),
                category: category,
                cover_image: cover_image.trim() || null,
                description: description.trim() || null
            })
        });
        
        // Verificar el tipo de contenido de la respuesta
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Respuesta no es JSON:', text.substring(0, 200));
            alert('Error: El servidor devolvió una respuesta inesperada. Por favor, recarga la página e intenta de nuevo.');
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Cerrar el modal
            closeEditPdfModal();
            
            // Recargar la lista de PDFs y estadísticas
            await loadAdminPdfs();
            await loadAdminStats();
            
            // Mostrar mensaje de éxito
            showUploadMessage('PDF actualizado exitosamente', 'success');
            
            // Si estás en el dashboard, también recargar los PDFs
            if (pages.dashboard && pages.dashboard.classList.contains('active')) {
                await loadPdfs(currentCategory);
            }
        } else {
            alert('Error al actualizar PDF: ' + (data.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error al actualizar PDF:', error);
        alert('Error al actualizar PDF: ' + error.message);
    }
}

async function deletePdf(pdfId, pdfName) {
    if (!confirm(`¿Estás seguro de que deseas eliminar el PDF "${pdfName}"?\n\nEsta acción no se puede deshacer y eliminará el archivo y todos los registros de progreso asociados.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/pdfs/${pdfId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('PDF eliminado exitosamente');
            // Recargar la lista de PDFs y estadísticas
            await loadAdminPdfs();
            await loadAdminStats();
            // Si estás en el dashboard, también recargar los PDFs
            if (pages.dashboard && pages.dashboard.classList.contains('active')) {
                await loadPdfs(currentCategory);
            }
        } else {
            alert('Error al eliminar PDF: ' + (data.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error al eliminar PDF:', error);
        alert('Error al eliminar PDF: ' + error.message);
    }
}

function displayUserDetails(data) {
    const modal = document.getElementById('userDetailsModal');
    const content = document.getElementById('userDetailsContent');
    
    if (!modal || !content) return;
    
    content.innerHTML = `
        <div class="mb-6">
            <h4 class="font-bold mb-2">Información del Usuario</h4>
            <p><strong>Usuario:</strong> ${data.user.username}</p>
            <p><strong>Tiempo Total:</strong> ${data.user.total_time_formatted}</p>
            <p><strong>Libros Leídos:</strong> ${data.progress.length}</p>
            <p><strong>Fecha de Creación:</strong> ${formatDate(data.user.created_at)}</p>
            <p><strong>Última Actividad:</strong> ${data.user.last_activity ? formatDate(data.user.last_activity) : 'Nunca'}</p>
        </div>
        <div>
            <h4 class="font-bold mb-4">Progreso de Lectura</h4>
            <div class="space-y-4">
                ${data.progress.map(p => {
                    const percent = Math.round((p.current_page / p.total_pages) * 100);
                    return `
                        <div class="p-4 bg-gray-100 dark:bg-slate-700 rounded-lg">
                            <h5 class="font-medium mb-2">${p.original_name}</h5>
                            <div class="mb-2">
                                <div class="flex justify-between text-sm mb-1">
                                    <span>Progreso</span>
                                    <span>${percent}%</span>
                                </div>
                                <div class="progress-bar">
                                    <div class="progress-bar-fill" style="width: ${percent}%"></div>
                                </div>
                            </div>
                            <p class="text-sm">Página ${p.current_page} de ${p.total_pages}</p>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Última lectura: ${formatDate(p.last_read)}</p>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

// ==================== CONFIGURACIÓN DE SUBIDA DE ARCHIVOS ====================

function setupFileUpload() {
    const fileInput = document.getElementById('pdfFiles');
    const fileDropZone = document.getElementById('fileDropZone');
    const fileList = document.getElementById('fileList');
    
    if (!fileInput || !fileDropZone) return;
    
    // Click en el área de drop para abrir el selector de archivos
    fileDropZone.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Mostrar archivos seleccionados
    fileInput.addEventListener('change', (e) => {
        updateFileList(e.target.files);
    });
    
    // Drag & Drop
    fileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileDropZone.classList.add('dragover');
    });
    
    fileDropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileDropZone.classList.remove('dragover');
    });
    
    fileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileDropZone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files).filter(file => 
            file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        );
        
        if (files.length === 0) {
            showUploadMessage('Por favor, selecciona solo archivos PDF', 'error');
            return;
        }
        
        // Crear un DataTransfer para actualizar el input
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
        
        updateFileList(fileInput.files);
    });
}

function updateFileList(files) {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    
    if (files.length === 0) {
        fileList.classList.add('hidden');
        fileList.innerHTML = '';
        return;
    }
    
    fileList.classList.remove('hidden');
    fileList.innerHTML = '';
    
    Array.from(files).forEach((file) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-item-info">
                <span class="material-symbols-outlined text-primary">description</span>
                <div>
                    <div class="file-item-name">${file.name}</div>
                    <div class="file-item-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button type="button" class="file-item-remove" data-filename="${file.name}" aria-label="Eliminar archivo">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;
        
        // Agregar event listener para el botón de eliminar usando el nombre del archivo
        const removeBtn = fileItem.querySelector('.file-item-remove');
        removeBtn.addEventListener('click', () => {
            removeFileByName(file.name);
        });
        
        fileList.appendChild(fileItem);
    });
}

function removeFileByName(fileName) {
    const fileInput = document.getElementById('pdfFiles');
    if (!fileInput) return;
    
    const files = Array.from(fileInput.files);
    const filteredFiles = files.filter(file => file.name !== fileName);
    
    // Crear un DataTransfer para actualizar el input
    const dataTransfer = new DataTransfer();
    filteredFiles.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;
    
    updateFileList(fileInput.files);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showUploadMessage(message, type = 'success') {
    const messageDiv = document.getElementById('uploadMessage');
    if (!messageDiv) return;
    
    messageDiv.className = `mt-4 p-4 rounded-xl flex items-center gap-3 ${type}`;
    messageDiv.innerHTML = `
        <span class="material-symbols-outlined">${type === 'success' ? 'check_circle' : 'error'}</span>
        <span>${message}</span>
    `;
    messageDiv.classList.remove('hidden');
    
    if (type === 'success') {
        setTimeout(() => {
            messageDiv.classList.add('hidden');
        }, 5000);
    }
}

async function handleUpload(e) {
    e.preventDefault();
    
    const formData = new FormData();
    const files = document.getElementById('pdfFiles').files;
    const category = document.getElementById('uploadCategory').value;
    const coverImage = document.getElementById('uploadCoverImage').value;
    const description = document.getElementById('uploadDescription').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (files.length === 0) {
        showUploadMessage('Selecciona al menos un archivo PDF', 'error');
        return;
    }
    
    // Deshabilitar botón y mostrar estado de carga
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
    }
    
    // Subir cada archivo
    for (let file of files) {
        formData.append('pdf', file);
    }
    formData.append('category', category);
    if (coverImage) formData.append('cover_image', coverImage);
    if (description) formData.append('description', description);
    
    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const messageDiv = document.getElementById('uploadMessage');
    
    if (progressDiv) progressDiv.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    
    // Simular progreso
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 90) progress = 90;
        if (progressBar) progressBar.style.width = progress + '%';
        if (progressText) progressText.textContent = Math.round(progress) + '%';
    }, 200);
    
    try {
        const response = await fetch('/api/pdfs/upload', {
            method: 'POST',
            body: formData
        });
        
        clearInterval(progressInterval);
        
        const data = await response.json();
        
        if (data.success) {
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '100%';
            showUploadMessage(data.message || 'PDF(s) subido(s) exitosamente', 'success');
            
            // Limpiar formulario
            document.getElementById('uploadForm').reset();
            updateFileList([]);
            
            // Recargar datos
            setTimeout(() => {
                loadAdminData();
                if (progressDiv) progressDiv.classList.add('hidden');
            }, 2000);
        } else {
            if (progressBar) progressBar.style.width = '0%';
            if (progressText) progressText.textContent = '0%';
            showUploadMessage(data.error || 'Error al subir PDFs', 'error');
        }
    } catch (error) {
        clearInterval(progressInterval);
        console.error('Error al subir PDFs:', error);
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        showUploadMessage('Error de conexión. Por favor, intenta de nuevo.', 'error');
    } finally {
        // Habilitar botón
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
        }
    }
}

// ==================== PÚBLICO ====================

async function loadPublicStats() {
    try {
        const response = await fetch('/api/public/stats');
        if (response.ok) {
            const stats = await response.json();
            animateCounter('publicTotalUsers', stats.totalUsers);
            animateCounter('publicTotalPdfs', stats.totalPdfs);
            animateCounter('publicTotalViews', stats.totalViews);
        }
    } catch (error) {
        console.error('Error al cargar estadísticas públicas:', error);
    }
}

function animateCounter(elementId, target) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Añadir clase animate
    element.classList.add('stat-number', 'animate');
    
    let current = 0;
    const increment = target / 50;
    const duration = 2000; // 2 segundos
    const steps = 50;
    const stepTime = duration / steps;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
            // Animar barras del gráfico
            animateBars();
        } else {
            element.textContent = Math.floor(current);
        }
    }, stepTime);
}

function animateBars() {
    // Animar las barras del gráfico de crecimiento
    const bars = ['bar-2021', 'bar-2022', 'bar-2023', 'bar-2024'];
    const heights = ['20%', '45%', '70%', '100%'];
    
    bars.forEach((barId, index) => {
        const bar = document.getElementById(barId);
        if (bar) {
            // Resetear altura inicial
            bar.style.height = '0%';
            setTimeout(() => {
                bar.style.transition = 'height 1s ease-out';
                bar.style.height = heights[index];
            }, index * 200);
        }
    });
}

// Animar barras cuando se carga la página de inicio
function initHomeAnimations() {
    if (pages.home && pages.home.classList.contains('active')) {
        // Animar barras después de un pequeño delay
        setTimeout(() => {
            animateBars();
        }, 500);
        
        // Iniciar carruseles después de cargar contenido
        setTimeout(() => {
            const testimonialsWrapper = document.getElementById('testimonialsCarousel');
            if (testimonialsWrapper && testimonialsWrapper.querySelectorAll('.carousel-item').length > 0) {
                const testimonialsItems = testimonialsWrapper.querySelectorAll('.carousel-item');
                updateCarouselIndicators('testimonialsCarouselIndicators', testimonialsItems.length, testimonialsCarousel.currentIndex);
                startCarouselAutoPlay('testimonials');
            }
            
            // Iniciar carrusel de libros si tiene múltiples slides
            const booksWrapper = document.getElementById('booksCarousel');
            if (booksWrapper) {
                const booksItems = booksWrapper.querySelectorAll('.carousel-item');
                if (booksItems.length > 0) {
                    // Inicializar indicadores del carrusel de libros
                    updateCarouselIndicators('booksCarouselIndicators', booksItems.length, booksCarousel.currentIndex);
                    // Inicializar la posición del carrusel
                    goToCarouselSlide('books', 0);
                    
                    // Iniciar auto-play si hay más de un slide
                    if (booksItems.length > 1) {
                        startCarouselAutoPlay('books');
                    }
                }
            }
        }, 1000);
    }
}

async function loadTestimonials() {
    try {
        const response = await fetch('/api/public/testimonials');
        if (response.ok) {
            const testimonials = await response.json();
            displayTestimonials(testimonials);
        }
    } catch (error) {
        console.error('Error al cargar testimonios:', error);
    }
}

// Variables globales para carruseles
let testimonialsCarousel = {
    currentIndex: 0,
    items: [],
    itemsPerSlide: 3
};

let booksCarousel = {
    currentIndex: 0,
    items: [],
    itemsPerSlide: 3
};

let carouselIntervals = {};

// Función auxiliar para crear tarjeta de testimonio
function createTestimonialCard(testimonial, index) {
    const card = document.createElement('article');
    card.className = 'flex flex-col gap-4 p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover-lift';
    card.setAttribute('aria-label', `Testimonio de ${testimonial.username}`);
    
    const initials = testimonial.username.split(' ').map(n => n[0]).join('').toUpperCase();
    const bgColors = ['bg-blue-100', 'bg-green-100', 'bg-purple-100', 'bg-pink-100', 'bg-yellow-100'];
    const bgColor = bgColors[index % bgColors.length];
    
    card.innerHTML = `
        <div class="flex items-center gap-4">
            <div aria-label="Retrato de ${testimonial.username}." class="w-12 h-12 rounded-full ${bgColor} dark:bg-slate-700 flex items-center justify-center text-primary dark:text-white font-bold" role="img">
                ${initials}
            </div>
            <div class="text-left">
                <h3 class="font-bold">${testimonial.username}</h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">${testimonial.role || 'Usuario'}</p>
            </div>
        </div>
        <div class="flex items-center gap-2 mb-2">
            <div class="flex text-yellow-400">
                ${'★'.repeat(testimonial.rating || 5)}
            </div>
        </div>
        <blockquote class="text-left text-gray-700 dark:text-gray-300">"${testimonial.comment}"</blockquote>
    `;
    
    return card;
}

// Funciones de carrusel
function updateCarouselIndicators(indicatorsId, totalSlides, currentIndex) {
    const indicators = document.getElementById(indicatorsId);
    if (!indicators) return;
    
    indicators.innerHTML = '';
    for (let i = 0; i < totalSlides; i++) {
        const indicator = document.createElement('button');
        indicator.className = `carousel-indicator ${i === currentIndex ? 'active' : ''}`;
        indicator.setAttribute('aria-label', `Ir a slide ${i + 1}`);
        indicator.addEventListener('click', () => {
            if (indicatorsId.includes('testimonials')) {
                stopCarouselAutoPlay('testimonials');
                goToCarouselSlide('testimonials', i);
                setTimeout(() => {
                    const wrapper = document.getElementById('testimonialsCarousel');
                    if (wrapper && wrapper.querySelectorAll('.carousel-item').length > 1) {
                        startCarouselAutoPlay('testimonials');
                    }
                }, 5000);
            } else if (indicatorsId.includes('books')) {
                goToCarouselSlide('books', i);
                // Reiniciar el intervalo para mantener la continuidad
                const wrapper = document.getElementById('booksCarousel');
                if (wrapper && wrapper.querySelectorAll('.carousel-item').length > 1) {
                    startCarouselAutoPlay('books');
                }
            }
        });
        indicators.appendChild(indicator);
    }
}

function goToCarouselSlide(carouselType, index) {
    const carousel = carouselType === 'testimonials' ? testimonialsCarousel : booksCarousel;
    const wrapperId = carouselType === 'testimonials' ? 'testimonialsCarousel' : 'booksCarousel';
    const indicatorsId = carouselType === 'testimonials' ? 'testimonialsCarouselIndicators' : 'booksCarouselIndicators';
    
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) {
        console.warn(`Carrusel wrapper no encontrado: ${wrapperId}`);
        return;
    }
    
    const items = wrapper.querySelectorAll('.carousel-item');
    if (items.length === 0) {
        console.warn(`No hay items en el carrusel: ${carouselType}`);
        return;
    }
    
    if (index < 0 || index >= items.length) {
        console.warn(`Índice fuera de rango: ${index}, total items: ${items.length}`);
        return;
    }
    
    // Actualizar índice
    carousel.currentIndex = index;
    
    // Actualizar indicadores
    updateCarouselIndicators(indicatorsId, items.length, index);
    
    // Animar transición usando transform en el wrapper
    const translateX = -index * 100;
    wrapper.style.transform = `translateX(${translateX}%)`;
    
    console.log(`Carrusel ${carouselType} movido a slide ${index + 1} de ${items.length}, transform: translateX(${translateX}%)`);
}

function nextCarouselSlide(carouselType) {
    const carousel = carouselType === 'testimonials' ? testimonialsCarousel : booksCarousel;
    const wrapperId = carouselType === 'testimonials' ? 'testimonialsCarousel' : 'booksCarousel';
    
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    
    const items = wrapper.querySelectorAll('.carousel-item');
    const nextIndex = (carousel.currentIndex + 1) % items.length;
    goToCarouselSlide(carouselType, nextIndex);
}

function prevCarouselSlide(carouselType) {
    const carousel = carouselType === 'testimonials' ? testimonialsCarousel : booksCarousel;
    const wrapperId = carouselType === 'testimonials' ? 'testimonialsCarousel' : 'booksCarousel';
    
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    
    const items = wrapper.querySelectorAll('.carousel-item');
    const prevIndex = (carousel.currentIndex - 1 + items.length) % items.length;
    goToCarouselSlide(carouselType, prevIndex);
}

function startCarouselAutoPlay(carouselType) {
    // Detener auto-play anterior si existe
    if (carouselIntervals[carouselType]) {
        clearInterval(carouselIntervals[carouselType]);
    }
    
    // Iniciar auto-play cada 3.5 segundos para transición lenta y constante
    // La transición CSS es de 2s, así que esto permite 1.5s de pausa entre transiciones
    carouselIntervals[carouselType] = setInterval(() => {
        nextCarouselSlide(carouselType);
    }, 3500);
}

function stopCarouselAutoPlay(carouselType) {
    if (carouselIntervals[carouselType]) {
        clearInterval(carouselIntervals[carouselType]);
        carouselIntervals[carouselType] = null;
    }
}

// Configurar event listeners del carrusel usando delegación de eventos
function setupCarouselEventListeners() {
    // Botones del carrusel usando delegación de eventos
    document.addEventListener('click', (e) => {
        // Botón anterior de testimonios
        const testimonialsPrevBtn = e.target.closest('#testimonialsCarouselPrev');
        if (testimonialsPrevBtn) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en botón anterior de testimonios');
            prevCarouselSlide('testimonials');
            stopCarouselAutoPlay('testimonials');
            setTimeout(() => {
                const wrapper = document.getElementById('testimonialsCarousel');
                if (wrapper && wrapper.querySelectorAll('.carousel-item').length > 1) {
                    startCarouselAutoPlay('testimonials');
                }
            }, 5000);
            return;
        }
        
        // Botón siguiente de testimonios
        const testimonialsNextBtn = e.target.closest('#testimonialsCarouselNext');
        if (testimonialsNextBtn) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en botón siguiente de testimonios');
            nextCarouselSlide('testimonials');
            stopCarouselAutoPlay('testimonials');
            setTimeout(() => {
                const wrapper = document.getElementById('testimonialsCarousel');
                if (wrapper && wrapper.querySelectorAll('.carousel-item').length > 1) {
                    startCarouselAutoPlay('testimonials');
                }
            }, 5000);
            return;
        }
        
        // Botón anterior de libros
        const booksPrevBtn = e.target.closest('#booksCarouselPrev');
        if (booksPrevBtn) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en botón anterior de libros');
            prevCarouselSlide('books');
            // Reiniciar el intervalo para mantener la continuidad
            const wrapper = document.getElementById('booksCarousel');
            if (wrapper && wrapper.querySelectorAll('.carousel-item').length > 1) {
                startCarouselAutoPlay('books');
            }
            return;
        }
        
        // Botón siguiente de libros
        const booksNextBtn = e.target.closest('#booksCarouselNext');
        if (booksNextBtn) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en botón siguiente de libros');
            nextCarouselSlide('books');
            // Reiniciar el intervalo para mantener la continuidad
            const wrapper = document.getElementById('booksCarousel');
            if (wrapper && wrapper.querySelectorAll('.carousel-item').length > 1) {
                startCarouselAutoPlay('books');
            }
            return;
        }
    });
    
    // Pausar carruseles al hacer hover sobre las imágenes (carousel-item o carousel-wrapper)
    // pero no sobre los botones de navegación
    document.addEventListener('mouseenter', (e) => {
        // Solo pausar si el mouse está sobre el carousel-item o carousel-wrapper
        // No pausar si está sobre los botones o indicadores
        const carouselItem = e.target.closest('.carousel-item');
        const carouselWrapper = e.target.closest('.carousel-wrapper');
        const isButton = e.target.closest('.carousel-btn') || e.target.closest('.carousel-indicator');
        
        if ((carouselItem || carouselWrapper) && !isButton) {
            const container = e.target.closest('.carousel-container');
            if (container) {
                const carouselType = container.querySelector('#testimonialsCarousel') ? 'testimonials' : 'books';
                stopCarouselAutoPlay(carouselType);
            }
        }
    }, true);
    
    document.addEventListener('mouseleave', (e) => {
        // Solo reanudar si el mouse sale del carousel-item o carousel-wrapper
        const carouselItem = e.target.closest('.carousel-item');
        const carouselWrapper = e.target.closest('.carousel-wrapper');
        const isButton = e.target.closest('.carousel-btn') || e.target.closest('.carousel-indicator');
        
        if ((carouselItem || carouselWrapper) && !isButton) {
            const container = e.target.closest('.carousel-container');
            if (container) {
                const carouselType = container.querySelector('#testimonialsCarousel') ? 'testimonials' : 'books';
                const wrapper = container.querySelector('.carousel-wrapper');
                if (wrapper && wrapper.querySelectorAll('.carousel-item').length > 1) {
                    startCarouselAutoPlay(carouselType);
                }
            }
        }
    }, true);
}

function displayTestimonials(testimonials) {
    const carouselWrapper = document.getElementById('testimonialsCarousel');
    if (!carouselWrapper) {
        console.warn('testimonialsCarousel no encontrado');
        return;
    }
    
    if (testimonials.length === 0) {
        // Mostrar testimonios por defecto si no hay ninguno
        const defaultTestimonials = [
            {
                username: 'Aisha Khan',
                role: 'Ingeniera de Sistemas Principal',
                comment: 'Las descripciones de audio para diagramas complejos son un cambio radical. Por primera vez, siento que tengo los mismos recursos que mis colegas videntes. Un diseño verdaderamente inclusivo.',
                rating: 5
            },
            {
                username: 'Ben Carter',
                role: 'Ingeniero Aeroespacial',
                comment: 'Navegar por los cursos solo con mi teclado y lector de pantalla es impecable. El contenido es de primera categoría y las características de accesibilidad están implementadas cuidadosamente.',
                rating: 5
            },
            {
                username: 'Chloe Garcia',
                role: 'Ingeniera Junior',
                comment: 'Esta plataforma me dio la confianza para obtener mi certificación. El contenido estructurado y las diapositivas accesibles marcaron toda la diferencia en mis estudios.',
                rating: 5
            },
            {
                username: 'David Martinez',
                role: 'Estudiante de Ingeniería',
                comment: 'La función de text-to-speech es increíble. Puedo estudiar mientras camino o hago otras actividades. Realmente ha mejorado mi productividad.',
                rating: 5
            },
            {
                username: 'Emma Wilson',
                role: 'Ingeniera de Software',
                comment: 'Los recursos son de alta calidad y la interfaz es muy intuitiva. Me encanta cómo todo está diseñado pensando en la accesibilidad.',
                rating: 5
            },
            {
                username: 'Felipe Rodriguez',
                role: 'Profesor',
                comment: 'Como educador, aprecio mucho cómo esta plataforma hace que el aprendizaje sea accesible para todos. Mis estudiantes con discapacidad visual pueden seguir el ritmo perfectamente.',
                rating: 5
            }
        ];
        testimonials = defaultTestimonials;
    }
    
    testimonialsCarousel.items = testimonials;
    
    // Determinar items por slide según el ancho de pantalla
    let itemsPerSlide = 3;
    if (window.innerWidth < 768) {
        itemsPerSlide = 1;
    } else if (window.innerWidth < 1024) {
        itemsPerSlide = 2;
    }
    testimonialsCarousel.itemsPerSlide = itemsPerSlide;
    
    // Calcular número de slides
    const totalSlides = Math.ceil(testimonials.length / itemsPerSlide);
    
    // Limpiar contenido existente
    carouselWrapper.innerHTML = '';
    
    // Resetear transform
    carouselWrapper.style.transform = 'translateX(0)';
    
    // Crear slides
    for (let i = 0; i < totalSlides; i++) {
        const slide = document.createElement('div');
        slide.className = 'carousel-item';
        
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-4';
        
        const startIndex = i * itemsPerSlide;
        const endIndex = Math.min(startIndex + itemsPerSlide, testimonials.length);
        
        for (let j = startIndex; j < endIndex; j++) {
            const testimonial = testimonials[j];
            const card = createTestimonialCard(testimonial, j);
            grid.appendChild(card);
        }
        
        slide.appendChild(grid);
        carouselWrapper.appendChild(slide);
    }
    
    // Resetear índice del carrusel
    testimonialsCarousel.currentIndex = 0;
    
    // Asegurar que el wrapper esté en la posición inicial
    carouselWrapper.style.transform = 'translateX(0)';
    
    // Actualizar indicadores solo si hay más de un slide
    if (totalSlides > 1) {
        updateCarouselIndicators('testimonialsCarouselIndicators', totalSlides, 0);
    } else {
        // Si solo hay un slide, ocultar controles
        const prevBtn = document.getElementById('testimonialsCarouselPrev');
        const nextBtn = document.getElementById('testimonialsCarouselNext');
        const indicators = document.getElementById('testimonialsCarouselIndicators');
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (indicators) indicators.style.display = 'none';
    }
    
    // Iniciar auto-play solo si hay más de un slide
    if (totalSlides > 1) {
        // Detener auto-play anterior si existe
        stopCarouselAutoPlay('testimonials');
        // Iniciar nuevo auto-play después de un breve delay
        setTimeout(() => {
            startCarouselAutoPlay('testimonials');
        }, 2000);
    }
    
    console.log(`Testimonios cargados: ${testimonials.length}, Slides: ${totalSlides}, Items por slide: ${itemsPerSlide}`);
}

async function handleTestimonialSubmit(e) {
    e.preventDefault();
    
    const comment = document.getElementById('testimonialComment').value;
    const rating = document.getElementById('testimonialRating').value;
    
    try {
        const response = await fetch('/api/testimonials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment, rating: parseInt(rating) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('testimonialComment').value = '';
            loadTestimonials();
            alert('Testimonio enviado exitosamente');
        } else {
            alert(data.error || 'Error al enviar testimonio');
        }
    } catch (error) {
        console.error('Error al enviar testimonio:', error);
        alert('Error de conexión');
    }
}

// ==================== UTILIDADES ====================

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function initAnimations() {
    // Intersection Observer para animaciones al hacer scroll
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible', 'animate-fade-in-up');
                // Añadir clase animate a números de estadísticas
                if (entry.target.classList.contains('stat-number')) {
                    entry.target.classList.add('animate');
                }
            }
        });
    }, { threshold: 0.1 });
    
    // Observar elementos con fade-in-on-scroll
    document.querySelectorAll('.fade-in-on-scroll').forEach(el => {
        observer.observe(el);
    });
    
    document.querySelectorAll('.stagger-item').forEach(el => {
        observer.observe(el);
    });
    
    // Observar números de estadísticas
    document.querySelectorAll('.stat-number').forEach(el => {
        observer.observe(el);
    });
    
    // Efecto parallax en scroll
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const parallaxElements = document.querySelectorAll('.parallax');
                const scrollY = window.scrollY;
                
                parallaxElements.forEach(element => {
                    const rect = element.getBoundingClientRect();
                    if (rect.top < window.innerHeight && rect.bottom > 0) {
                        const speed = 0.3;
                        const yPos = -(scrollY * speed);
                        element.style.transform = `translateY(${yPos}px)`;
                    }
                });
                
                ticking = false;
            });
            ticking = true;
        }
    });
}

function startUsageTracking() {
    // Solo iniciar si el usuario está autenticado y no hay un intervalo activo
    if (!currentUser) {
        console.log('No se puede iniciar rastreo: usuario no autenticado');
        return;
    }
    
    if (usageTrackingInterval) {
        console.log('Rastreo de uso ya está activo');
        return;
    }
    
    console.log('Iniciando rastreo de uso...');
    
    usageTrackingInterval = setInterval(async () => {
        // Verificar si hay un PDF abierto antes de rastrear
        const pdfViewer = document.getElementById('pdfViewer');
        const isViewerVisible = pdfViewer && !pdfViewer.classList.contains('hidden');
        
        if (!currentUser) {
            console.log('Deteniendo rastreo: usuario no autenticado');
            stopUsageTracking();
            return;
        }
        
        // Solo rastrear si el visor está abierto o si el usuario está activo
        if (isViewerVisible || document.visibilityState === 'visible') {
            try {
                console.log('Registrando 1 minuto de actividad...');
                const response = await fetch('/api/user/activity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ minutes: 1 })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('Actividad registrada exitosamente:', result);
                    
                    // Actualizar el tiempo en la UI si estamos en la página de progreso
                    const progressPage = document.getElementById('progressPage');
                    if (progressPage && !progressPage.classList.contains('hidden')) {
                        updateTotalTimeDisplay();
                    }
                } else {
                    const errorText = await response.text();
                    console.error('Error al registrar actividad:', response.status, errorText);
                }
            } catch (error) {
                console.error('Error al registrar actividad:', error);
            }
        } else {
            console.log('Rastreo pausado: visor no visible');
        }
    }, 60000); // Cada minuto
    
    console.log('Rastreo de uso iniciado correctamente');
}

// Función auxiliar para actualizar el tiempo total en la UI
async function updateTotalTimeDisplay() {
    try {
        console.log('Actualizando tiempo total en la UI...');
        const response = await fetch('/api/user/progress');
        if (response.ok) {
            const data = await response.json();
            console.log('Datos recibidos:', data);
            const totalTimeEl = document.getElementById('totalTime');
            
            if (totalTimeEl) {
                let totalMinutes = 0;
                
                if (data.stats && data.stats.totalTimeMinutes !== undefined) {
                    totalMinutes = data.stats.totalTimeMinutes;
                } else if (Array.isArray(data)) {
                    // Formato antiguo, intentar obtener desde otra fuente
                    console.warn('Formato de datos antiguo, no se puede obtener tiempo total');
                    return;
                }
                
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                const timeText = `${hours}h ${minutes}m`;
                totalTimeEl.textContent = timeText;
                console.log('Tiempo total actualizado:', timeText);
            } else {
                console.warn('Elemento totalTime no encontrado en el DOM');
            }
        } else {
            console.error('Error al obtener progreso:', response.status, await response.text());
        }
    } catch (error) {
        console.error('Error al actualizar tiempo total:', error);
    }
}

function stopUsageTracking() {
    if (usageTrackingInterval) {
        console.log('Deteniendo rastreo de uso...');
        clearInterval(usageTrackingInterval);
        usageTrackingInterval = null;
        console.log('Rastreo de uso detenido');
    }
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    // Navegación
    if (navLinks.home) navLinks.home.addEventListener('click', (e) => { e.preventDefault(); showPage('home'); });
    if (navLinks.login) navLinks.login.addEventListener('click', (e) => { e.preventDefault(); showPage('login'); });
    if (navLinks.register) navLinks.register.addEventListener('click', (e) => { e.preventDefault(); showPage('register'); });
    if (navLinks.dashboard) navLinks.dashboard.addEventListener('click', (e) => { e.preventDefault(); showPage('dashboard'); });
    if (navLinks.admin) navLinks.admin.addEventListener('click', (e) => { e.preventDefault(); showPage('admin'); });
    if (navLinks.logout) navLinks.logout.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    if (navLinks.preferences) navLinks.preferences.addEventListener('click', (e) => { e.preventDefault(); showPage('preferences'); });
    if (navLinks.progress) navLinks.progress.addEventListener('click', (e) => { e.preventDefault(); showPage('progress'); });
    
    // Hero buttons
    const heroRegisterBtn = document.getElementById('heroRegisterBtn');
    const heroLoginBtn = document.getElementById('heroLoginBtn');
    const finalRegisterBtn = document.getElementById('finalRegisterBtn');
    
    if (heroRegisterBtn) heroRegisterBtn.addEventListener('click', (e) => { e.preventDefault(); showPage('register'); });
    if (heroLoginBtn) heroLoginBtn.addEventListener('click', (e) => { e.preventDefault(); showPage('login'); });
    if (finalRegisterBtn) finalRegisterBtn.addEventListener('click', (e) => { e.preventDefault(); showPage('register'); });
    
    // Forms
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const uploadForm = document.getElementById('uploadForm');
    const testimonialForm = document.getElementById('testimonialForm');
    
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    
    // Enlaces entre login y registro
    const loginToRegisterLink = document.getElementById('loginToRegisterLink');
    const registerToLoginLink = document.getElementById('registerToLoginLink');
    
    if (loginToRegisterLink) {
        loginToRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            showPage('register');
        });
    }
    
    if (registerToLoginLink) {
        registerToLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            showPage('login');
        });
    }
    if (uploadForm) uploadForm.addEventListener('submit', handleUpload);
    if (testimonialForm) testimonialForm.addEventListener('submit', handleTestimonialSubmit);
    
    // Inicializar funcionalidad de drag & drop y visualización de archivos
    setupFileUpload();
    
    // Formulario de edición de PDF
    const editPdfForm = document.getElementById('editPdfForm');
    if (editPdfForm) {
        editPdfForm.addEventListener('submit', handleEditPdf);
    }
    
    // Cerrar modal al hacer click fuera o presionar ESC
    const editPdfModal = document.getElementById('editPdfModal');
    if (editPdfModal) {
        editPdfModal.addEventListener('click', (e) => {
            if (e.target === editPdfModal) {
                closeEditPdfModal();
            }
        });
        
        // Cerrar con tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !editPdfModal.classList.contains('hidden')) {
                closeEditPdfModal();
            }
        });
    }
    
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleNightMode);
    
    // Profile menu
    const profileMenuBtn = document.getElementById('profileMenuBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileMenuBtn) {
        profileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (profileDropdown) profileDropdown.classList.toggle('hidden');
        });
    }
    
    document.addEventListener('click', () => {
        if (profileDropdown) profileDropdown.classList.add('hidden');
    });
    
    // PDF Viewer controls
    const closeViewerBtn = document.getElementById('closeViewerBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const currentPageInput = document.getElementById('currentPageInput');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomSelect = document.getElementById('zoomSelect');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const speedRange = document.getElementById('speedRange');
    const speedValue = document.getElementById('speedValue');
    
    if (closeViewerBtn) closeViewerBtn.addEventListener('click', closeViewer);
    if (prevPageBtn) prevPageBtn.addEventListener('click', previousPage);
    if (nextPageBtn) nextPageBtn.addEventListener('click', nextPage);
    if (currentPageInput) {
        currentPageInput.addEventListener('change', (e) => {
            const page = parseInt(e.target.value);
            if (page >= 1 && page <= totalPages) {
                // Si está en modo lectura automática, cancelar la lectura automática
                // para permitir navegación manual
                if (isAutoReading && currentUtterance) {
                    isAutoReading = false;
                    stopText();
                }
                currentPageNum = page;
                renderPage(page);
            }
        });
    }
    if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
    if (zoomSelect) zoomSelect.addEventListener('change', (e) => setZoom(e.target.value));
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (isFullscreen) {
                exitFullscreen();
            } else {
                enterFullscreen();
            }
        });
    }
    
    // Toggle de modo nocturno en el visor de PDF
    const pdfViewerThemeToggle = document.getElementById('pdfViewerThemeToggle');
    const pdfViewerThemeIcon = document.getElementById('pdfViewerThemeIcon');
    if (pdfViewerThemeToggle) {
        pdfViewerThemeToggle.addEventListener('click', () => {
            toggleNightMode();
            // Actualizar icono después de cambiar el tema
            setTimeout(() => {
                updatePdfViewerThemeIcon();
            }, 100);
        });
    }
    
    // Función para actualizar el icono del tema en el visor
    function updatePdfViewerThemeIcon() {
        if (pdfViewerThemeIcon) {
            const isDark = document.documentElement.classList.contains('dark');
            pdfViewerThemeIcon.textContent = isDark ? 'light_mode' : 'dark_mode';
            pdfViewerThemeToggle?.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo nocturno');
        }
    }
    
    // Actualizar icono al cargar
    updatePdfViewerThemeIcon();
    
    // Observar cambios en el tema para actualizar el icono y recargar voces
    const observer = new MutationObserver(() => {
        updatePdfViewerThemeIcon();
        // Recargar voces para actualizar los colores de las opciones
        setTimeout(() => {
            loadVoices();
        }, 100);
    });
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
    });
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            if (currentUtterance && speechSynthesis.speaking) {
                // Si está pausado, reanudar
                if (speechSynthesis.paused) {
                    playText();
                } else {
                    // Si está reproduciendo, pausar
                    pauseText();
                }
            } else if (currentUtterance && speechSynthesis.paused) {
                // Si hay un utterance pausado, reanudar
                playText();
            } else {
                // Iniciar lectura
                playText();
            }
        });
    }
    if (speedRange && speedValue) {
        speedRange.addEventListener('input', (e) => {
            const newSpeed = parseFloat(e.target.value);
            speedValue.textContent = `${newSpeed}x`;
            
            // Si hay un utterance activo, aplicar la nueva velocidad inmediatamente
            if (currentUtterance && (speechSynthesis.speaking || speechSynthesis.paused)) {
                // Guardar el estado actual (si estaba pausado)
                const wasPaused = speechSynthesis.paused;
                
                // Cancelar el utterance actual
                speechSynthesis.cancel();
                currentUtterance = null;
                
                // Si estaba reproduciendo (no pausado), reiniciar con la nueva velocidad
                if (!wasPaused && (currentPageText || currentPdfText)) {
                    // Pequeño delay para asegurar que la cancelación se complete
                    setTimeout(() => {
                        // Reiniciar la lectura con la nueva velocidad
                        playText();
                    }, 100);
                } else if (wasPaused) {
                    // Si estaba pausado, solo actualizar la velocidad para la próxima reproducción
                    // El usuario puede presionar play cuando quiera
                    updatePlayButton(false);
                }
            }
            
            // Guardar la preferencia de velocidad
            if (currentPreferences) {
                currentPreferences.reading_speed = newSpeed;
                // Opcionalmente guardar en el servidor (sin bloquear la UI)
                savePreferences({ reading_speed: newSpeed }).catch(err => {
                    console.error('Error al guardar preferencia de velocidad:', err);
                });
            }
        });
    }
    
    // Voice selection
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    loadVoices();
    
    // Listener para cambio de voz en el visor de PDF
    const voiceSelect = document.getElementById('voiceSelect');
    if (voiceSelect) {
        voiceSelect.addEventListener('change', (e) => {
            const newVoiceName = e.target.value;
            
            // Guardar la preferencia de voz
            if (currentPreferences) {
                currentPreferences.voice_name = newVoiceName;
                // Opcionalmente guardar en el servidor (sin bloquear la UI)
                savePreferences({ voice_name: newVoiceName }).catch(err => {
                    console.error('Error al guardar preferencia de voz:', err);
                });
            }
            
            // Si hay un utterance activo, aplicar la nueva voz inmediatamente
            if (currentUtterance && (speechSynthesis.speaking || speechSynthesis.paused)) {
                // Guardar el estado actual (si estaba pausado)
                const wasPaused = speechSynthesis.paused;
                
                // Cancelar el utterance actual
                speechSynthesis.cancel();
                currentUtterance = null;
                
                // Si estaba reproduciendo (no pausado), reiniciar con la nueva voz
                if (!wasPaused && (currentPageText || currentPdfText)) {
                    // Pequeño delay para asegurar que la cancelación se complete
                    setTimeout(() => {
                        // Reiniciar la lectura con la nueva voz
                        playText();
                    }, 100);
                } else if (wasPaused) {
                    // Si estaba pausado, solo actualizar la voz para la próxima reproducción
                    // El usuario puede presionar play cuando quiera
                    updatePlayButton(false);
                }
            }
        });
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (pages.dashboard && pages.dashboard.classList.contains('active')) {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                previousPage();
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                nextPage();
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                zoomIn();
            } else if (e.key === '-') {
                e.preventDefault();
                zoomOut();
            } else if (e.key === 'Escape') {
                if (isFullscreen) exitFullscreen();
                else closeViewer();
            }
        }
    });
    
    // Window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (pdfDoc && currentPageNum) {
                renderPage(currentPageNum);
            }
        }, 300);
    });
    
    // Dashboard filters
    const typeFilter = document.getElementById('typeFilter');
    const sortFilter = document.getElementById('sortFilter');
    const reloadPdfsBtn = document.getElementById('reloadPdfsBtn');
    
    if (typeFilter) {
        typeFilter.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            filterAndDisplayPdfs();
        });
    }
    if (sortFilter) {
        sortFilter.addEventListener('change', (e) => {
            currentSort = e.target.value;
            filterAndDisplayPdfs();
        });
    }
    if (reloadPdfsBtn) {
        reloadPdfsBtn.addEventListener('click', () => {
            loadPdfs(currentCategory);
        });
    }
    
    // Night mode toggle (siempre disponible)
    const nightModeToggle = document.getElementById('nightModeToggle');
    if (nightModeToggle) {
        nightModeToggle.addEventListener('change', () => {
            toggleNightMode();
        });
    }
    
    // User details modal
    const closeUserDetailsModal = document.getElementById('closeUserDetailsModal');
    if (closeUserDetailsModal) {
        closeUserDetailsModal.addEventListener('click', () => {
            const modal = document.getElementById('userDetailsModal');
            if (modal) modal.classList.add('hidden');
        });
    }
    
    // Mobile menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }
    
    // Mobile sidebar
    const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (mobileSidebarToggle && sidebar) {
        mobileSidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
    }
}

// Hacer funciones disponibles globalmente
window.loadPdf = loadPdf;
window.showPdfDetails = showPdfDetails;
window.showUserDetails = showUserDetails;
window.continueReadingFromProgress = continueReadingFromProgress;
window.deleteUser = deleteUser;
window.deletePdf = deletePdf;
window.editPdf = editPdf;
window.closeEditPdfModal = closeEditPdfModal;

