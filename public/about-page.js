/**
 * Acerca de: scroll reveal, contadores animados.
 */
(function () {
    'use strict';

    const reduceMotion = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Scroll reveal */
    document.querySelectorAll('.about-reveal').forEach((el) => {
        el.classList.add('about-reveal-pending');
    });

    const revealObs = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('about-reveal-in');
                entry.target.classList.remove('about-reveal-pending');
                revealObs.unobserve(entry.target);
            });
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    document.querySelectorAll('.about-reveal').forEach((el) => revealObs.observe(el));

    /* Contadores */
    function easeOutExpo(t) {
        return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function animateValue(el, target, duration, suffix, prefix) {
        const start = performance.now();
        const from = 0;
        const raw = el.getAttribute('data-decimal');
        const decimals = raw !== null ? parseInt(raw, 10) : 0;

        function frame(now) {
            const p = Math.min(1, (now - start) / duration);
            const v = from + (target - from) * easeOutExpo(p);
            const text =
                decimals > 0
                    ? v.toFixed(decimals)
                    : Math.round(v).toLocaleString('es');
            el.textContent = (prefix || '') + text + (suffix || '');
            if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    const counterObs = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const wrap = entry.target;
                counterObs.unobserve(wrap);
                if (reduceMotion()) {
                    wrap.querySelectorAll('[data-count]').forEach((el) => {
                        const t = parseFloat(el.getAttribute('data-count'));
                        const suf = el.getAttribute('data-suffix') || '';
                        const pre = el.getAttribute('data-prefix') || '';
                        const dec = el.getAttribute('data-decimal');
                        el.textContent =
                            pre +
                            (dec ? t.toFixed(parseInt(dec, 10)) : Math.round(t).toLocaleString('es')) +
                            suf;
                    });
                    return;
                }
                wrap.querySelectorAll('[data-count]').forEach((el) => {
                    const target = parseFloat(el.getAttribute('data-count'));
                    const suffix = el.getAttribute('data-suffix') || '';
                    const prefix = el.getAttribute('data-prefix') || '';
                    const ms = Math.min(
                        2400,
                        Math.max(900, Math.abs(target) * 1.2)
                    );
                    animateValue(el, target, ms, suffix, prefix);
                });
            });
        },
        { threshold: 0.25 }
    );

    const statsRoot = document.getElementById('aboutStats');
    if (statsRoot) counterObs.observe(statsRoot);
})();
