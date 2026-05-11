/**
 * Fondo tecnológico animado para Acerca de (canvas + brillo cursor).
 * Respeta prefers-reduced-motion y pausa en pestaña oculta.
 */
(function () {
    'use strict';

    const host = document.getElementById('aboutAmbientHost');
    const canvas = document.getElementById('aboutTechCanvas');
    const glow = document.getElementById('aboutMouseGlow');
    if (!host || !canvas) return;

    const ctx = canvas.getContext('2d');
    let rafId = null;
    let running = false;
    let w = 0;
    let h = 0;
    let t = 0;
    let dpr = 1;

    let particles = [];
    let nodes = [];
    let edges = [];

    const reduceMotion = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
        const rect = host.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = Math.max(1, Math.floor(rect.width));
        h = Math.max(1, Math.floor(rect.height));
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildGraph();
    }

    function buildGraph() {
        nodes = [];
        edges = [];
        const n = Math.min(48, Math.max(22, Math.floor((w * h) / 32000)));
        const pad = 36;
        for (let i = 0; i < n; i++) {
            nodes.push({
                x: pad + Math.random() * (w - pad * 2),
                y: pad + Math.random() * (h - pad * 2),
            });
        }
        const maxD = Math.min(w, h) * 0.11;
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const d = Math.hypot(dx, dy);
                if (d < maxD && Math.random() > 0.55) {
                    edges.push({ i, j, phase: Math.random() * Math.PI * 2 });
                }
            }
        }
        particles = [];
        const pCount = Math.min(40, Math.max(18, Math.floor(n * 0.8)));
        for (let i = 0; i < pCount; i++) {
            particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.2,
                vy: (Math.random() - 0.5) * 0.2,
                r: 0.45 + Math.random() * 1.5,
                a: 0.07 + Math.random() * 0.26,
            });
        }
    }

    function drawGrid(offset) {
        const step = 52;
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.045)';
        ctx.lineWidth = 1;
        const ox = ((offset * 0.014) % step) - step;
        const oy = ((offset * 0.011) % step) - step;
        for (let x = ox; x < w + step; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = oy; y < h + step; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function draw() {
        if (!running || reduceMotion()) return;

        t += 0.013;
        const breathe = 0.5 + 0.5 * Math.sin(t * 0.62);

        const g = ctx.createLinearGradient(0, 0, w, h * 1.15);
        g.addColorStop(0, '#ecfeff');
        g.addColorStop(0.4, '#e0f2fe');
        g.addColorStop(0.75, '#f0f9ff');
        g.addColorStop(1, '#f8fafc');
        ctx.fillStyle = g;
        if (document.documentElement.classList.contains('dark')) {
            const gd = ctx.createLinearGradient(0, 0, w, h);
            gd.addColorStop(0, '#020617');
            gd.addColorStop(0.5, '#0c1220');
            gd.addColorStop(1, '#020617');
            ctx.fillStyle = gd;
        }
        ctx.fillRect(0, 0, w, h);

        drawGrid(t * 5.5);

        edges.forEach((e) => {
            const a = nodes[e.i];
            const b = nodes[e.j];
            const pulse = 0.16 + 0.14 * Math.sin(t * 1.05 + e.phase);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(14, 165, 233, ${pulse * breathe * 0.38})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
        });

        nodes.forEach((n, idx) => {
            const pulse = 0.28 + 0.22 * Math.sin(t * 0.82 + idx * 0.32);
            const r = 2 + pulse * 0.65;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(56, 189, 248, ${0.035 * pulse})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(14, 165, 233, ${0.42 + 0.14 * pulse})`;
            ctx.fill();
        });

        particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(56, 189, 248, ${p.a})`;
            ctx.fill();
        });

        rafId = requestAnimationFrame(draw);
    }

    function staticFrame() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const light = ctx.createLinearGradient(0, 0, w, h);
        light.addColorStop(0, '#ecfeff');
        light.addColorStop(1, '#e0f2fe');
        ctx.fillStyle = light;
        if (document.documentElement.classList.contains('dark')) {
            const d = ctx.createLinearGradient(0, 0, w, h);
            d.addColorStop(0, '#020617');
            d.addColorStop(1, '#0f172a');
            ctx.fillStyle = d;
        }
        ctx.fillRect(0, 0, w, h);
        drawGrid(0);
    }

    function start() {
        if (running) return;
        running = true;
        resize();
        if (reduceMotion()) {
            staticFrame();
            running = false;
            return;
        }
        draw();
    }

    function stop() {
        running = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    function onResize() {
        resize();
        if (reduceMotion()) staticFrame();
    }

    host.addEventListener(
        'mousemove',
        (e) => {
            if (!glow) return;
            const rect = host.getBoundingClientRect();
            glow.style.setProperty('--ax', e.clientX - rect.left + 'px');
            glow.style.setProperty('--ay', e.clientY - rect.top + 'px');
        },
        { passive: true }
    );
    host.addEventListener('mouseleave', () => {
        if (glow) {
            glow.style.setProperty('--ax', '50%');
            glow.style.setProperty('--ay', '42%');
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            stop();
        } else if (!reduceMotion()) {
            start();
        }
    });

    new MutationObserver(() => {
        stop();
        start();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
        stop();
        start();
    });

    window.addEventListener('resize', onResize);
    start();
})();
