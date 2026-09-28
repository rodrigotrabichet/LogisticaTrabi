/* ============================================================
   TR Express — Animación del hero
   GSAP: entrada del título, subtítulo y estela del camión.
   Respeta prefers-reduced-motion y, si la CDN de GSAP no carga,
   el hero queda en su estado final estático sin romper el layout.
   El timeline arranca cuando las fuentes están listas (o pasado
   un máximo de espera): así la geometría que GSAP mide al crear
   los tweens ya es la final y el camión no queda desplazado si
   las fuentes llegan tarde. Un resize posterior re-sincroniza el
   estado final sin re-animar.
   ============================================================ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!window.gsap || reduceMotion) return;

    /* Fracción (0–1) desde el borde izquierdo de la imagen de la camioneta
       donde está el centro de la rueda trasera. Medido en píxeles sobre
       el asset de 384px (arco inferior del neumático: x 55–101, centro 78
       → 78/384 ≈ 0.2031). La estela debe terminar justo en esa rueda. */
    var REAR_WHEEL_F = 0.2031;

    /* Desplazamiento final del camión en px: ubica la rueda trasera sobre
       el extremo derecho de la línea. Se evalúa al arrancar el tween, para
       que from y to recorran la misma distancia y la punta de la línea
       quede siempre oculta bajo el cuerpo del camión. */
    function heroEndOffset() {
        var truck = document.querySelector('.hero-stroke-truck');
        if (!truck) return 0;
        var rightPx = parseFloat(window.getComputedStyle(truck).right) || 0;
        return (1 - REAR_WHEEL_F) * truck.offsetWidth + rightPx;
    }

    /* Lleva la animación a su estado final correcto con la geometría
       actual (sin re-animar). Se usa si algo cambió el layout después
       de construida (fuentes tardías, rotación, resize). */
    function snapHeroEndState() {
        if (!window.gsap) return;
        gsap.set('.hero-stroke-line', { scaleX: 1 });
        // yPercent:-100 + y:0 re-afirma el translateY(-100%) del CSS en forma
        // proporcional: si el camión cambió de tamaño, el px congelado al
        // crear el tween quedaría desplazado.
        gsap.set('.hero-stroke-truck', { x: heroEndOffset(), yPercent: -100, y: 0, opacity: 1 });
        gsap.set(['.hero-title', '.hero-subtitle'], { clearProps: 'all' });
    }

    var heroStarted = false;
    var heroTl = null;

    // Hero: entrada inicial (arranca con fuentes listas, no al scrollear)
    function startHero() {
        if (heroStarted) return;
        heroStarted = true;
        heroTl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.9 } });
        heroTl
            .from('.hero-title', { y: 44, opacity: 0 }, 0.1)
            .from('.hero-subtitle', { y: 30, opacity: 0 }, 0.28);

        // Estela del camión: la línea se dibuja de izquierda a derecha mientras
        // el camión viaja en sintonía y "deja" el subrayado bajo "Express".
        heroTl.fromTo('.hero-stroke-line',
            { scaleX: 0 },
            { scaleX: 1, duration: 1.15, ease: 'power2.inOut' }, 0.4);
        heroTl.fromTo('.hero-stroke-truck',
            {
                x: function () {
                    var stroke = document.querySelector('.hero-stroke');
                    return heroEndOffset() - (stroke ? stroke.offsetWidth : 0);
                },
                opacity: 0
            },
            { x: function () { return heroEndOffset(); }, opacity: 1, duration: 1.15, ease: 'power2.inOut' }, 0.4);
    }

    if (document.fonts && document.fonts.ready) {
        var fontFallback = setTimeout(startHero, 1500);
        document.fonts.ready.then(function () {
            clearTimeout(fontFallback);
            if (!heroStarted) {
                startHero();
            } else if (heroTl && heroTl.progress() === 1) {
                // Las fuentes llegaron tarde (después del fallback):
                // re-sincronizar el estado final con la geometría nueva.
                snapHeroEndState();
            }
        });
    } else {
        startHero();
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
        if (!heroStarted) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if (heroTl) heroTl.kill();
            snapHeroEndState();
        }, 200);
    });
})();
