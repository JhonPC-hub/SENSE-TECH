/**
 * Navbar / tema / menú móvil en about.html (misma UX que index sin cargar app.js).
 */
(function () {
    'use strict';

    function updateThemeIcon() {
        const themeToggle = document.getElementById('themeToggle');
        if (!themeToggle) return;
        const dark = document.documentElement.classList.contains('dark');
        themeToggle.innerHTML = dark
            ? '<span class="material-symbols-outlined text-xl">dark_mode</span>'
            : '<span class="material-symbols-outlined text-xl">light_mode</span>';
    }

    function initTheme() {
        const saved = localStorage.getItem('theme') || 'light';
        if (saved === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        updateThemeIcon();
    }

    initTheme();

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem(
            'theme',
            document.documentElement.classList.contains('dark') ? 'dark' : 'light'
        );
        updateThemeIcon();
    });

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    mobileMenuBtn?.addEventListener('click', () => {
        mobileMenu?.classList.toggle('hidden');
        const open = mobileMenu && !mobileMenu.classList.contains('hidden');
        mobileMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    const profileMenuBtn = document.getElementById('profileMenuBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    profileMenuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown?.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
        profileDropdown?.classList.add('hidden');
    });

    async function doLogout(e) {
        e.preventDefault();
        try {
            await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
        } catch (_) {
            /* continuar redirección */
        }
        window.location.href = 'index.html';
    }
    document.getElementById('logoutLink')?.addEventListener('click', doLogout);
    document.getElementById('mobileLogoutLink')?.addEventListener('click', doLogout);

    fetch('/api/user', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
            if (!data || !data.user) return;
            const u = data.user;
            document.getElementById('loginLink')?.classList.add('hidden');
            document.getElementById('registerLink')?.classList.add('hidden');
            document.getElementById('dashboardLink')?.classList.remove('hidden');
            document.getElementById('mobileLoginLink')?.classList.add('hidden');
            document.getElementById('mobileRegisterLink')?.classList.add('hidden');
            document.getElementById('mobileDashboardLink')?.classList.remove('hidden');
            if (u.isAdmin) {
                document.getElementById('adminLink')?.classList.remove('hidden');
                document.getElementById('mobileAdminLink')?.classList.remove('hidden');
            }
            const pc = document.getElementById('profileMenuContainer');
            pc?.classList.remove('hidden');
            const un = document.getElementById('profileUsername');
            if (un) un.textContent = u.username;
            ['mobilePreferencesLink', 'mobileProgressLink', 'mobileLogoutLink'].forEach(
                (id) => {
                    document.getElementById(id)?.classList.remove('hidden');
                }
            );
        })
        .catch(() => {});

    const y = document.getElementById('aboutYear');
    if (y) y.textContent = String(new Date().getFullYear());
})();
