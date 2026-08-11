/* ============================================================
   TR Express — Efectos visuales
   GSAP + ScrollTrigger · vanilla-tilt · tsParticles confetti
   Todos los efectos respetan prefers-reduced-motion y se
   desactivan en táctil cuando corresponda. Si una CDN falla,
   el efecto se saltea sin romper el layout.
   ============================================================ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia('(pointer: fine)').matches;

    /* ============================================================
       GSAP + ScrollTrigger
       ============================================================ */
    if (window.gsap && window.ScrollTrigger && !reduceMotion) {
        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({ ignoreMobileResize: true });

        // Hero: entrada inicial (arranca al cargar, no al scrollear)
        var heroTl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.9 } });
        heroTl
            .from('.hero-title', { y: 44, opacity: 0 }, 0.1)
            .from('.hero-subtitle', { y: 30, opacity: 0 }, 0.28);

        // Estela del camión: la línea se dibuja de izquierda a derecha mientras
        // el camión viaja en sintonía y "deja" el subrayado bajo "Express".
        // El camión recorre EXACTAMENTE el ancho de la línea con el mismo ease
        // y duración, así la punta de la línea queda siempre oculta bajo el
        // cuerpo del camión y la estela visible termina justo en su paragolpes.
        // Los valores funcionales se evalúan al arrancar el tween (layout estable).
        heroTl.fromTo('.hero-stroke-line',
            { scaleX: 0 },
            { scaleX: 1, duration: 1.15, ease: 'power2.inOut' }, 0.4);
        heroTl.fromTo('.hero-stroke-truck',
            {
                x: function () {
                    var stroke = document.querySelector('.hero-stroke');
                    return -stroke.offsetWidth;
                },
                opacity: 0
            },
            { x: 0, opacity: 1, duration: 1.15, ease: 'power2.inOut' }, 0.4);
        window.__heroAnimated = true;

        // Quiénes somos: imagen desde la izquierda + texto escalonado
        gsap.from('.ft-QS', {
            x: -36,
            opacity: 0,
            duration: 1,
            ease: 'power2.out',
            scrollTrigger: { trigger: '.quienes-somos', start: 'top 80%', once: true }
        });
        gsap.from('.quienes-somos-section-container > *', {
            y: 28,
            opacity: 0,
            duration: 0.7,
            stagger: 0.12,
            ease: 'power2.out',
            scrollTrigger: { trigger: '.quienes-somos', start: 'top 78%', once: true }
        });

        // Nuevo local: copy escalonado + fachada que se eleva
        gsap.from('.nueva-tienda-copy > *', {
            y: 26,
            opacity: 0,
            duration: 0.7,
            stagger: 0.1,
            ease: 'power2.out',
            scrollTrigger: { trigger: '.nueva-tienda-grid', start: 'top 82%', once: true }
        });
        gsap.from('.nueva-tienda-visual', {
            y: 44,
            opacity: 0,
            scale: 0.97,
            duration: 0.9,
            ease: 'power2.out',
            scrollTrigger: { trigger: '.nueva-tienda-grid', start: 'top 82%', once: true }
        });

        // Productos: stagger de tarjetas (al revelarse limpia los estilos
        // para no pisar el hover ni vanilla-tilt)
        gsap.utils.toArray('.product-card').forEach(function (card) {
            gsap.fromTo(card,
                { y: 32, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 0.65,
                    ease: 'power2.out',
                    clearProps: 'transform,opacity',
                    scrollTrigger: { trigger: card, start: 'top 90%', once: true }
                }
            );
        });

        // Contacto: stagger de tarjetas
        gsap.utils.toArray('.cards-container .card').forEach(function (card) {
            gsap.fromTo(card,
                { y: 28, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 0.65,
                    ease: 'power2.out',
                    clearProps: 'transform,opacity',
                    scrollTrigger: { trigger: card, start: 'top 90%', once: true }
                }
            );
        });

        // Cobertura: títulos de la sección
        gsap.from('.trabajo, .locations-note', {
            y: 24,
            opacity: 0,
            duration: 0.8,
            stagger: 0.15,
            ease: 'power2.out',
            scrollTrigger: { trigger: '.locations-section', start: 'top 80%', once: true }
        });

        // Al cambiar de tab (Alimentos/Piedras) el panel oculto cambia de
        // layout: refrescar posiciones para que el stagger funcione ahí también
        var origActivate = window.activateProductPanel;
        if (typeof origActivate === 'function') {
            window.activateProductPanel = function (target) {
                origActivate(target);
                requestAnimationFrame(function () { ScrollTrigger.refresh(); });
            };
        }
        window.addEventListener('load', function () { ScrollTrigger.refresh(); });
    }

    /* ============================================================
       vanilla-tilt — solo desktop con mouse, sin motion reducido
       ============================================================ */
    if (window.VanillaTilt && !reduceMotion && finePointer) {
        VanillaTilt.init(document.querySelectorAll('.product-card, .cards-container .card'), {
            max: 7,
            speed: 500,
            scale: 1.02,
            glare: true,
            'max-glare': 0.1,
            gyroscope: false
        });
    }

    /* ============================================================
       Confetti (tsParticles) — ráfagas puntuales, escala por viewport
       ============================================================ */
    function confettiCount(base) {
        var w = window.innerWidth;
        if (w < 480) return Math.round(base * 0.3);
        if (w < 900) return Math.round(base * 0.55);
        return base;
    }

    function fireConfetti(opts) {
        if (reduceMotion || typeof confetti !== 'function') return;
        confetti({
            particleCount: opts.count,
            spread: opts.spread !== undefined ? opts.spread : 75,
            startVelocity: opts.startVelocity !== undefined ? opts.startVelocity : 38,
            origin: opts.origin || { y: 0.7 },
            zIndex: opts.zIndex !== undefined ? opts.zIndex : 60,
            colors: ['#ff9d3d', '#e27b21', '#c45d00', '#ffffff', '#f5f5f4'],
            disableForReducedMotion: true
        });
    }

    // Celebración del nuevo local: una sola vez al entrar en vista
    if (window.gsap && window.ScrollTrigger && !reduceMotion) {
        ScrollTrigger.create({
            trigger: '#nueva-tienda',
            start: 'top 65%',
            once: true,
            onEnter: function () {
                fireConfetti({ count: confettiCount(70), spread: 95, origin: { y: 0.3 }, zIndex: 60 });
            }
        });
    }

    // Confetti al abrir el modal de producto: solo la primera vez
    var modalCelebrated = false;
    document.querySelectorAll('.product-card').forEach(function (card) {
        card.addEventListener('click', function () {
            if (modalCelebrated) return;
            modalCelebrated = true;
            setTimeout(function () {
                fireConfetti({ count: confettiCount(48), spread: 80, origin: { y: 0.85 }, zIndex: 1100 });
            }, 220);
        });
    });
})();
