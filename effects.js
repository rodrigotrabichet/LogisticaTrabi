/* ============================================================
   TR Express — Animación del hero
   GSAP: "TR" entra primero; después el camión recorre la estela,
   descubre "Express" a su paso (el clip de la palabra sigue la
   posición real de la rueda trasera) y deja el subrayado debajo.
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

    // Sin animación (o sin GSAP): liberar el estado inicial que oculta
    // piezas del hero y dejar el estado final estático.
    if (!window.gsap || reduceMotion) {
        document.documentElement.classList.remove('hero-anim');
        return;
    }

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

    /* Geometría del recorrido, toda en el mismo sistema de coordenadas:
       el camión arranca con la rueda trasera en el inicio de la estela y
       termina con la rueda en el extremo derecho. La estela está centrada
       bajo "Express" y mide ~74% del ancho de la palabra, así que el
       progreso del viaje (0→1) cubre la palabra exactamente de borde a
       borde: al empezar el borde del revelado pisa la primera letra y al
       terminar pisa la última. */
    function journeyGeometry() {
        var stroke = document.querySelector('.hero-stroke');
        if (!stroke) return null;

        var endX = heroEndOffset();
        var strokeRect = stroke.getBoundingClientRect();
        return {
            startX: endX - strokeRect.width,
            endX: endX,
            travel: strokeRect.width
        };
    }

    /* Lleva la animación a su estado final correcto con la geometría
       actual (sin re-animar). Se usa si algo cambió el layout después
       de construida (fuentes tardías, rotación, resize). */
    function snapHeroEndState() {
        if (!window.gsap) return;
        document.documentElement.classList.remove('hero-anim');
        gsap.set('.hero-stroke-line', { scaleX: 1 });
        // yPercent:-100 + y:0 re-afirma el translateY(-100%) del CSS en forma
        // proporcional: si el camión cambió de tamaño, el px congelado al
        // crear el tween quedaría desplazado.
        gsap.set('.hero-stroke-truck', { x: heroEndOffset(), yPercent: -100, y: 0, opacity: 1 });
        gsap.set('.hero-express', { clipPath: 'none' });
        gsap.set(['.hero-tr', '.hero-subtitle'], { clearProps: 'all' });
    }

    var heroStarted = false;
    var heroTl = null;

    // Hero: "TR" entra primero; el camión sale después y descubre "Express".
    function startHero() {
        if (heroStarted) return;
        heroStarted = true;

        heroTl = gsap.timeline({
            defaults: { ease: 'power3.out', duration: 0.9 },
            onComplete: function () {
                // Estado final limpio: sin clip, para que un reflow posterior
                // (fuentes, rotación) no recorte la palabra.
                document.documentElement.classList.remove('hero-anim');
                gsap.set('.hero-express', { clipPath: 'none' });
            }
        });
        heroTl
            // fromTo con valores explícitos: el estado inicial oculto vive en
            // CSS (clase hero-anim) y un .from() tomaría 0 como destino.
            .fromTo('.hero-tr', { y: 44, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 0.1)
            .fromTo('.hero-subtitle', { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, 0.45);

        var geo = journeyGeometry();
        if (!geo) return;

        // Arranque: camión fuera de escena (a la izquierda) y palabra oculta
        // (el clip inicial también vive en CSS para no flashear el estado final).
        gsap.set('.hero-stroke-truck', { yPercent: -100, y: 0, x: geo.startX, opacity: 0 });

        // Estela: la línea se dibuja de izquierda a derecha en sintonía con
        // el viaje del camión.
        heroTl.fromTo('.hero-stroke-line',
            { scaleX: 0 },
            { scaleX: 1, duration: 1.15, ease: 'power2.inOut' }, 0.85);

        // El camión es la única fuente de verdad del recorrido: en cada frame
        // se lee su x y con eso se calcula hasta dónde se reveló la palabra,
        // así el borde de la letra coincide siempre con la rueda trasera.
        var journey = { x: geo.startX, opacity: 0 };
        heroTl.to(journey, {
            x: geo.endX,
            opacity: 1,
            duration: 1.15,
            ease: 'power2.inOut',
            onUpdate: function () {
                var revealed = (journey.x - geo.startX) / geo.travel;
                revealed = revealed < 0 ? 0 : revealed > 1 ? 1 : revealed;
                gsap.set('.hero-stroke-truck', { x: journey.x, opacity: journey.opacity });
                gsap.set('.hero-express', {
                    clipPath: 'inset(0 ' + ((1 - revealed) * 100).toFixed(2) + '% 0 0)'
                });
            }
        }, 0.85);
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
