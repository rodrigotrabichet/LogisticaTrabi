/* ============================================================
   TR Express — Contact segment switcher (retail vs. store)
   Standalone IIFE on purpose: effects.js owns the hero intro only.
   Tabs (role=tablist) reveal one panel at a time with a GSAP
   fade/slide timeline; falls back to an instant swap when GSAP
   is unavailable or the user prefers reduced motion.
   The visual deck (.contact-deck) holds one card per segment and
   swaps them like playing cards on every tab change.
   Default state: retail ("minorista") selected, set instantly.
   ============================================================ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var tabs = Array.prototype.slice.call(document.querySelectorAll('.contact-seg-tab'));
    if (!tabs.length) return;

    var deckCards = Array.prototype.slice.call(document.querySelectorAll('.contact-deck-card'));
    var deckTl = null;
    var panelTl = null;
    // Fuente única de la verdad: qué segmento está vigente. El DOM (clases,
    // timelines a medio correr) puede mentir durante clicks rápidos; esta
    // variable, no. Se actualiza en cada select, anime o no.
    var activeSegment = null;

    function segmentFor(tab) {
        return tab.id === 'tab-comercio' ? 'comercio' : 'minorista';
    }

    function cardFor(segment) {
        for (var i = 0; i < deckCards.length; i++) {
            if (deckCards[i].getAttribute('data-segment') === segment) return deckCards[i];
        }
        return null;
    }

    /* Mata el timeline del deck a medio correr y limpia los estilos inline
       que dejó (opacidades, rotaciones): sin esto, un click rápido deja
       restos que traban la card. No toca clases; es solo higiene. */
    function resetDeckFlight() {
        if (deckTl) {
            deckTl.kill();
            deckTl = null;
        }
        if (window.gsap) {
            deckCards.forEach(function (card) {
                gsap.set(card, { clearProps: 'all' });
            });
        }
    }

    function swapDeckInstant(segment) {
        resetDeckFlight();
        deckCards.forEach(function (card) {
            var active = card.getAttribute('data-segment') === segment;
            card.classList.toggle('is-active', active);
        });
        activeSegment = segment;
    }

    function animateDeck(segment) {
        // Instant path: no GSAP, reduced motion, or no deck in the DOM.
        if (!window.gsap || reduceMotion || !deckCards.length) {
            swapDeckInstant(segment);
            return;
        }
        // El segmento previo sale de la variable, no del DOM: con clicks
        // rápidos puede haber dos cards con is-active a la vez y el
        // querySelector devolvería cualquiera.
        var previous = activeSegment;
        // Se mata primero y se ordena después: ningún timeline viejo puede
        // sobrevivir para corromper el estado al completarse.
        resetDeckFlight();
        var next = cardFor(segment);
        var current = previous ? cardFor(previous) : null;
        deckCards.forEach(function (card) {
            card.classList.toggle('is-active', card === next);
        });
        activeSegment = segment;
        // Mismo segmento (o sin cards): estado ya correcto y limpio, nada
        // que animar y —clave— ningún timeline vivo que trabe nada.
        if (!next || current === next) return;
        gsap.set(current, { zIndex: 1 });
        gsap.set(next, { zIndex: 2 });
        deckTl = gsap.timeline({
            onComplete: function () {
                if (current) {
                    current.classList.remove('is-active');
                    gsap.set(current, { clearProps: 'all' });
                }
                gsap.set(next, { clearProps: 'transform,opacity' });
                deckTl = null;
            }
        });
        // Outgoing card folds away to the left…
        deckTl.to(current, { rotationY: -12, x: -30, opacity: 0, duration: 0.35, ease: 'power2.in' }, 0);
        // Incoming card unfolds from the right on top.
        deckTl.fromTo(next,
            { rotationY: 12, x: 30, opacity: 0 },
            { rotationY: 0, x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' },
            0.3);
    }

    function panelFor(tab) {
        var id = tab.getAttribute('aria-controls');
        return id ? document.getElementById(id) : null;
    }

    function animatePanel(panel) {
        if (!window.gsap || reduceMotion) return;
        var items = panel.querySelectorAll('h3, li, .contact-seg-cta');
        if (!items.length) return;
        // Se mata el stagger anterior: con clicks rápidos se encimaban
        // varios timelines peleando por las mismas propiedades (flicker).
        // fromTo con finales explícitos: si el anterior murió a mitad de
        // fade, el "destino" heredado sería opacity 0 y el item quedaría
        // invisible. Así siempre termina en su estado real.
        if (panelTl) panelTl.kill();
        panelTl = gsap.timeline({
            defaults: { ease: 'power3.out', duration: 0.45 },
            onComplete: function () { panelTl = null; }
        });
        panelTl.fromTo(panel, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 })
          .fromTo(items, { y: 14, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.07 }, '-=0.15');
    }

    function select(tab, animate) {
        tabs.forEach(function (other) {
            var active = other === tab;
            other.classList.toggle('is-active', active);
            other.setAttribute('aria-selected', active ? 'true' : 'false');
            other.tabIndex = active ? 0 : -1;
            var panel = panelFor(other);
            if (panel) {
                if (active) {
                    panel.hidden = false;
                } else {
                    panel.hidden = true;
                }
            }
        });
        var segment = segmentFor(tab);
        if (animate) {
            var panel = panelFor(tab);
            if (panel) animatePanel(panel);
            animateDeck(segment);
        } else {
            swapDeckInstant(segment);
        }
    }

    tabs.forEach(function (tab, index) {
        tab.addEventListener('click', function () {
            select(tab, true);
        });
        tab.addEventListener('keydown', function (event) {
            var next = null;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                next = tabs[(index + 1) % tabs.length];
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                next = tabs[(index - 1 + tabs.length) % tabs.length];
            } else if (event.key === 'Home') {
                next = tabs[0];
            } else if (event.key === 'End') {
                next = tabs[tabs.length - 1];
            }
            if (next) {
                event.preventDefault();
                next.focus();
                select(next, true);
            }
        });
    });

    // Default: retail selected, shown instantly (no animation on load).
    var initial = document.querySelector('.contact-seg-tab.is-active') || tabs[0];
    select(initial, false);
})();
