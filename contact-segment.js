/* ============================================================
   TR Express — Contact segment switcher (retail vs. store)
   Standalone IIFE on purpose: effects.js owns the hero intro only.
   Tabs (role=tablist) reveal one panel at a time with a GSAP
   fade/slide timeline; falls back to an instant swap when GSAP
   is unavailable or the user prefers reduced motion.
   The visual deck (.contact-deck) holds one card per segment and
   swaps them like playing cards on every tab change, with the
   figcaption following the active segment.
   Default state: retail ("minorista") selected, set instantly.
   ============================================================ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var tabs = Array.prototype.slice.call(document.querySelectorAll('.contact-seg-tab'));
    if (!tabs.length) return;

    var CAPTIONS = {
        minorista: 'Para tu mascota, directo a tu casa',
        comercio: 'Pasá por el local o escribinos por WhatsApp'
    };

    var deckCards = Array.prototype.slice.call(document.querySelectorAll('.contact-deck-card'));
    var deckCaption = document.querySelector('.contact-deck-caption');
    var deckTl = null;

    function segmentFor(tab) {
        return tab.id === 'tab-comercio' ? 'comercio' : 'minorista';
    }

    function cardFor(segment) {
        for (var i = 0; i < deckCards.length; i++) {
            if (deckCards[i].getAttribute('data-segment') === segment) return deckCards[i];
        }
        return null;
    }

    function swapDeckInstant(segment) {
        if (deckTl) {
            deckTl.kill();
            deckTl = null;
        }
        deckCards.forEach(function (card) {
            var active = card.getAttribute('data-segment') === segment;
            card.classList.toggle('is-active', active);
            if (window.gsap) gsap.set(card, { clearProps: 'all' });
        });
        if (deckCaption) {
            deckCaption.textContent = CAPTIONS[segment] || '';
            if (window.gsap) gsap.set(deckCaption, { clearProps: 'all' });
        }
    }

    function animateDeck(segment) {
        // Instant path: no GSAP, reduced motion, or no deck in the DOM.
        if (!window.gsap || reduceMotion || !deckCards.length) {
            swapDeckInstant(segment);
            return;
        }
        var current = document.querySelector('.contact-deck-card.is-active');
        var next = cardFor(segment);
        if (!next || current === next) {
            if (deckCaption && deckCaption.textContent !== (CAPTIONS[segment] || '')) {
                deckCaption.textContent = CAPTIONS[segment] || '';
            }
            return;
        }
        if (deckTl) deckTl.kill();
        gsap.set(current, { zIndex: 1 });
        gsap.set(next, { zIndex: 2 });
        next.classList.add('is-active');
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
        // …while the caption dips out, swaps text mid-flight, and rises back.
        if (deckCaption) {
            deckTl.to(deckCaption, {
                y: 8,
                opacity: 0,
                duration: 0.2,
                ease: 'power2.in',
                onComplete: function () {
                    deckCaption.textContent = CAPTIONS[segment] || '';
                }
            }, 0);
        }
        // Incoming card unfolds from the right on top.
        deckTl.fromTo(next,
            { rotationY: 12, x: 30, opacity: 0 },
            { rotationY: 0, x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' },
            0.3);
        if (deckCaption) {
            deckTl.to(deckCaption, { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }, 0.45);
        }
    }

    function panelFor(tab) {
        var id = tab.getAttribute('aria-controls');
        return id ? document.getElementById(id) : null;
    }

    function animatePanel(panel) {
        if (!window.gsap || reduceMotion) return;
        var items = panel.querySelectorAll('h3, li, .contact-seg-cta');
        if (!items.length) return;
        var tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.45 } });
        tl.from(panel, { y: 18, opacity: 0, duration: 0.35 })
          .from(items, { y: 14, opacity: 0, stagger: 0.07 }, '-=0.15');
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
