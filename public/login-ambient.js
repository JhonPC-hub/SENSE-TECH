/**
 * Fondo tecnológico animado para la vista de login (canvas + brillo cursor).
 * Respeta prefers-reduced-motion.
 */
(function () {
    'use strict';

    const loginPage = document.getElementById('loginPage');
    const canvas = document.getElementById('loginTechCanvas');
    const glow = document.getElementById('loginMouseGlow');
    if (!loginPage || !canvas) return;

    const ctx = canvas.getContext('2d');
    let rafId = null;
    let running = false;
    let w = 0;
    let h = 0;
    let t = 0;
    let dpr = 1;

    const reduceMotion = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** @type {{ x: number, y: number, vx: number, vy: number, r: number, a: number }[]} */
    let particles = [];
    /** @type {{ x: number, y: number }[]} */
    let nodes = [];
    /** @type {{ i: number, j: number, phase: number }[]} */
    let edges = [];

    function resize() {
        const rect = loginPage.getBoundingClientRect();
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
        const n = Math.min(48, Math.max(24, Math.floor((w * h) / 32000)));
        const pad = 40;
        for (let i = 0; i < n; i++) {
            nodes.push({
                x: pad + Math.random() * (w - pad * 2),
                y: pad + Math.random() * (h - pad * 2),
            });
        }
        const maxD = Math.min(w, h) * 0.14;
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
        const pCount = Math.min(42, Math.max(18, Math.floor(n * 0.8)));
        for (let i = 0; i < pCount; i++) {
            particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.28,
                vy: (Math.random() - 0.5) * 0.28,
                r: 0.6 + Math.random() * 1.8,
                a: 0.12 + Math.random() * 0.35,
            });
        }
    }

    function drawGrid(offset) {
        const step = 48;
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.045)';
        ctx.lineWidth = 1;
        const ox = ((offset * 0.02) % step) - step;
        const oy = ((offset * 0.015) % step) - step;
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

        t += 0.016;
        const breathe = 0.5 + 0.5 * Math.sin(t * 0.7);

        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#020617');
        g.addColorStop(0.45, '#0a1628');
        g.addColorStop(1, '#020c1a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        drawGrid(t * 8);

        // Aristas tipo red / PCB suave
        edges.forEach((e) => {
            const a = nodes[e.i];
            const b = nodes[e.j];
            const pulse = 0.22 + 0.18 * Math.sin(t * 1.2 + e.phase);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(34, 211, 238, ${pulse * breathe * 0.45})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();

            const midX = (a.x + b.x) * 0.5;
            const midY = (a.y + b.y) * 0.5;
            const glowPulse = 0.15 + 0.1 * Math.sin(t * 2 + e.phase);
            const rg = ctx.createRadialGradient(midX, midY, 0, midX, midY, 28);
            rg.addColorStop(0, `rgba(56, 189, 248, ${glowPulse})`);
            rg.addColorStop(1, 'rgba(56, 189, 248, 0)');
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.arc(midX, midY, 26, 0, Math.PI * 2);
            ctx.fill();
        });

        // Nodos
        nodes.forEach((n, idx) => {
            const pulse = 0.35 + 0.25 * Math.sin(t * 0.9 + idx * 0.4);
            const r = 2.2 + pulse * 0.8;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(56, 189, 248, ${0.06 * pulse})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(186, 230, 253, ${0.5 + 0.2 * pulse})`;
            ctx.fill();
        });

        // Partículas
        particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(165, 243, 252, ${p.a})`;
            ctx.fill();
        });

        rafId = requestAnimationFrame(draw);
    }

    function staticFrame() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#020617');
        g.addColorStop(1, '#0a1628');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        drawGrid(0);
        nodes.forEach((n) => {
            ctx.beginPath();
            ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.fill();
        });
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

    function onVisibilityChange() {
        const visible = !loginPage.classList.contains('hidden');
        if (visible) {
            start();
            window.addEventListener('resize', onResize);
        } else {
            stop();
            window.removeEventListener('resize', onResize);
        }
    }

    function onResize() {
        if (loginPage.classList.contains('hidden')) return;
        resize();
        if (reduceMotion()) staticFrame();
    }

    // Brillo que sigue al cursor (solo dentro del login)
    loginPage.addEventListener(
        'mousemove',
        (e) => {
            if (!glow) return;
            const rect = loginPage.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            glow.style.setProperty('--lx', x + 'px');
            glow.style.setProperty('--ly', y + 'px');
        },
        { passive: true }
    );

    loginPage.addEventListener('mouseleave', () => {
        if (glow) {
            glow.style.setProperty('--lx', '50%');
            glow.style.setProperty('--ly', '42%');
        }
    });

    const mo = new MutationObserver(onVisibilityChange);
    mo.observe(loginPage, { attributes: true, attributeFilter: ['class'] });

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
        stop();
        if (!loginPage.classList.contains('hidden')) start();
    });

    onVisibilityChange();
})();
