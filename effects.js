/* ============================================================
   TR Express — Animación del hero
   GSAP: "TR" entra primero; después el camión cruza LITERALMENTE por
   delante de "Express" (elevado a la altura de la palabra, por encima
   de las letras gracias al z-index) y descubre la palabra a su paso
   (el clip sigue la posición real de la rueda trasera). Si hay pantalla
   de sobra sigue de largo en ese mismo carril hasta despejar la palabra;
   en pantallas angostas baja a estacionar sobre la estela. El subrayado
   queda dibujado debajo en todos los casos.
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

    /* `lift`: desplazamiento vertical (px, negativo = subir) que centra
       el camión sobre "Express" durante el cruce para que tape las letras
       de verdad. En reposo la base del camión apoya en la línea: ocupa
       [lineC - H, lineC]; centrado sobre Express debe ocupar
       [expressC - H/2, expressC + H/2]. */
    function heroLift() {
        var stroke = document.querySelector('.hero-stroke');
        var express = document.querySelector('.hero-express');
        var truckEl = document.querySelector('.hero-stroke-truck');
        if (!stroke || !express || !truckEl) return 0;
        var expressRect = express.getBoundingClientRect();
        var strokeRect = stroke.getBoundingClientRect();
        var truckH = truckEl.getBoundingClientRect().height || truckEl.offsetHeight || 0;
        var expressCenterY = expressRect.top + expressRect.height / 2;
        var strokeCenterY = strokeRect.top + strokeRect.height / 2;
        return expressCenterY - strokeCenterY + truckH / 2;
    }

    /* Respiro (px) entre la palabra y el camión estacionado en modo pase. */
    var HERO_PASS_GAP = 20;

    /* Distancia extra (px) para que el camión siga en su carril a la altura
       de "Express" hasta despejar la palabra por completo + respiro, en vez
       de bajar a la línea. Normaliza la posición actual del camión (puede
       tener un x viejo tras un resize) para medir desde su anclaje natural. */
    function heroPassExtra(baseEndX) {
        var express = document.querySelector('.hero-express');
        var truck = document.querySelector('.hero-stroke-truck');
        if (!express || !truck) return 0;
        var expressRect = express.getBoundingClientRect();
        var truckRect = truck.getBoundingClientRect();
        var currentX = 0;
        if (window.gsap && gsap.getProperty) {
            currentX = gsap.getProperty(truck, 'x') || 0;
        }
        var naturalLeft = truckRect.left - currentX;
        var extra = expressRect.right + HERO_PASS_GAP - (naturalLeft + baseEndX);
        return extra > 0 ? extra : 0;
    }

    /* ¿Hay pantalla de sobra para que el camión siga de largo en su carril?
       Si el camión despejado (palabra + respiro + su propio ancho) entra en
       el viewport, modo pase; si no (móviles angostos), baja a estacionar
       sobre la línea como antes. */
    function heroWantsPass() {
        var express = document.querySelector('.hero-express');
        var truck = document.querySelector('.hero-stroke-truck');
        if (!express || !truck) return false;
        var truckW = truck.getBoundingClientRect().width || truck.offsetWidth || 0;
        var extendedRight = express.getBoundingClientRect().right + HERO_PASS_GAP + truckW;
        var vw = document.documentElement.clientWidth || window.innerWidth || 0;
        return extendedRight <= vw - 8;
    }

    /* Geometría del recorrido, toda en el mismo sistema de coordenadas:
       el camión arranca con la rueda trasera en el inicio de la estela.
       En pantallas con lugar (modo pase) el final se estira para que siga
       en su carril a la altura de "Express" hasta despejar la palabra, sin
       bajar; en pantallas angostas termina con la rueda en el extremo
       derecho y baja a estacionar sobre la línea. El progreso del viaje
       (0→1) cubre la palabra exactamente de borde a borde: al empezar el
       borde del revelado pisa la primera letra y al terminar pisa la última. */
    function journeyGeometry() {
        var stroke = document.querySelector('.hero-stroke');
        if (!stroke) return null;

        var baseEndX = heroEndOffset();
        var extra = 0;
        var settleDown = true;
        if (heroWantsPass()) {
            extra = heroPassExtra(baseEndX);
            settleDown = false;
        }
        var endX = baseEndX + extra;
        var strokeRect = stroke.getBoundingClientRect();
        return {
            startX: endX - strokeRect.width,
            endX: endX,
            travel: strokeRect.width,
            lift: heroLift(),
            settleDown: settleDown
        };
    }

    /* Lleva la animación a su estado final correcto con la geometría
       actual (sin re-animar). Se usa si algo cambió el layout después
       de construida (fuentes tardías, rotación, resize). */
    function snapHeroEndState() {
        if (!window.gsap) return;
        document.documentElement.classList.remove('hero-anim');
        gsap.set('.hero-stroke-line', { scaleX: 1 });
        // yPercent:-100 re-afirma el translateY(-100%) del CSS en forma
        // proporcional: si el camión cambió de tamaño, el px congelado al
        // crear el tween quedaría desplazado. En modo pase queda elevado
        // (y = lift) a la altura de "Express"; si no, apoyado en la línea.
        var baseEndX = heroEndOffset();
        var finalX = baseEndX;
        var finalY = 0;
        if (heroWantsPass()) {
            finalX = baseEndX + heroPassExtra(baseEndX);
            finalY = heroLift();
        }
        gsap.set('.hero-stroke-truck', { x: finalX, yPercent: -100, y: finalY, opacity: 1 });
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

        // Arranque: camión fuera de escena (a la izquierda, ya elevado a la
        // altura de "Express") y palabra oculta (el clip inicial también
        // vive en CSS para no flashear el estado final).
        gsap.set('.hero-stroke-truck', { yPercent: -100, y: geo.lift, x: geo.startX, opacity: 0 });

        // Estela: la línea se dibuja de izquierda a derecha en sintonía con
        // el viaje del camión.
        heroTl.fromTo('.hero-stroke-line',
            { scaleX: 0 },
            { scaleX: 1, duration: 1.15, ease: 'power2.inOut' }, 0.85);

        // El camión es la única fuente de verdad del recorrido: en cada frame
        // se lee su x y con eso se calcula hasta dónde se reveló la palabra,
        // así el borde de la letra coincide siempre con la rueda trasera.
        // Viaja ELEVADO a la altura de "Express" (y = lift) tapando las
        // letras de verdad. En pantallas con lugar sigue de largo en ese
        // mismo carril hasta despejar la palabra (modo pase); en pantallas
        // angostas baja a la línea solo al estacionar: en el último 20%
        // del recorrido `settle` (smoothstep) lo lleva de vuelta a y = 0,
        // donde queda apoyado sobre la estela como antes.
        var journey = { x: geo.startX, opacity: 0 };
        heroTl.to(journey, {
            x: geo.endX,
            opacity: 1,
            duration: 1.15,
            ease: 'power2.inOut',
            onUpdate: function () {
                var revealed = (journey.x - geo.startX) / geo.travel;
                revealed = revealed < 0 ? 0 : revealed > 1 ? 1 : revealed;
                var y = geo.lift;
                if (geo.settleDown) {
                    var t = (revealed - 0.8) / 0.2;
                    t = t < 0 ? 0 : t > 1 ? 1 : t;
                    y = geo.lift * (1 - t * t * (3 - 2 * t));
                }
                gsap.set('.hero-stroke-truck', { x: journey.x, y: y, opacity: journey.opacity });
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
