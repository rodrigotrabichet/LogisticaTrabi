/**
 * Catálogo dinámico desde Google Sheets.
 *
 * Lee la hoja "Productos" con una única request a Sheets API v4 y reemplaza
 * las pestañas y paneles de la sección "Nuestros Productos". Las categorías
 * salen de la propia columna "categoria" de esa hoja: para agregar una
 * categoría nueva alcanza con escribirla en la columna, sin pestañas aparte.
 * Si cualquier paso falla, el HTML estático queda intacto (fallback) y solo se
 * registra un warning en consola.
 */
(function () {
    'use strict';

    var SPREADSHEET_ID = '1SYoeNeFqcH2c5xXLGUW-Hbo4ywQNtuTi7kGDJOGmCkM';
    var API_KEY = 'AIzaSyAy2UHwlmqfUWNW4JwjMHF92TRidUMjcJ4';
    var PRODUCTS_RANGE = 'Productos!A2:J';
    var REQUEST_TIMEOUT_MS = 8000;
    var AVAILABILITY_LOGO_SRC = 'assets/images/LogoMordidaPequeña.png';
    var AVAILABILITY_LOGO_ALT = 'Logo Pet Shop Mordida Pequeña';
    // Valores de la columna "activo" que ocultan la fila (ya normalizados a minúsculas).
    var HIDDEN_ACTIVE_VALUES = ['false', 'no', '0', 'falso'];
    // Tokens canónicos de la columna "especial" y variantes de escritura aceptadas.
    // Todos los textos están normalizados: minúsculas, sin diacríticos y con espacios simples.
    var SPECIAL_MORDIDA = 'mordida pequena';
    var SPECIAL_OFERTA = 'oferta';
    // Separadores admitidos entre tokens de una misma celda.
    var SPECIAL_TOKEN_SEPARATOR = /[,|]/;
    var SPECIAL_VARIANTS = [
        { token: SPECIAL_MORDIDA, variants: ['mordida pequena', 'mordida peq'] },
        { token: SPECIAL_OFERTA, variants: ['oferta'] }
    ];
    // Índice variante -> token canónico. Se crea sin prototipo para que un texto
    // desconocido como "constructor" no colisione con Object.prototype.
    var SPECIAL_BY_VARIANT = (function () {
        var index = Object.create(null);
        SPECIAL_VARIANTS.forEach(function (entry) {
            entry.variants.forEach(function (variant) {
                index[variant] = entry.token;
            });
        });
        return index;
    })();
    // Imágenes de Google Drive: thumbnail redimensionado como src primario y URL directa como respaldo.
    var DRIVE_THUMBNAIL_URL = 'https://drive.google.com/thumbnail?id=';
    var DRIVE_THUMBNAIL_SIZE = '&sz=w1200';
    var DRIVE_FALLBACK_URL = 'https://lh3.googleusercontent.com/d/';
    var DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

    // Marcador para tests: 'static' hasta que el render desde la planilla sea exitoso.
    document.body.dataset.catalog = 'static';

    function buildEndpoint() {
        return 'https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID + '/values/'
            + encodeURIComponent(PRODUCTS_RANGE)
            + '?key=' + encodeURIComponent(API_KEY);
    }

    function fetchCatalog() {
        var controller = new AbortController();
        var timeoutId = setTimeout(function () {
            controller.abort();
        }, REQUEST_TIMEOUT_MS);

        return fetch(buildEndpoint(), { signal: controller.signal })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Sheets API respondió HTTP ' + response.status);
                }
                return response.json();
            })
            .finally(function () {
                clearTimeout(timeoutId);
            });
    }

    function toText(value) {
        return value == null ? '' : String(value).trim();
    }

    function normalizeCategory(value) {
        return toText(value).toLowerCase();
    }

    // Normaliza texto de entrada para comparar tokens: minúsculas, sin diacríticos
    // y con espacios simples. Así "Mordida Pequeña", "mordida pequena" y
    // "Mordida Pequena" terminan siendo la misma clave.
    function normalizeKey(value) {
        return toText(value)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');
    }

    // Interpreta la columna "especial": texto libre que puede traer uno o varios
    // tokens separados por coma o pipe. Los valores no reconocidos se descartan
    // en silencio para no romper el render.
    function parseSpecial(value) {
        var flags = { mordidaPequena: false, oferta: false };

        toText(value).split(SPECIAL_TOKEN_SEPARATOR).forEach(function (rawToken) {
            var token = SPECIAL_BY_VARIANT[normalizeKey(rawToken)];
            if (token === SPECIAL_MORDIDA) flags.mordidaPequena = true;
            if (token === SPECIAL_OFERTA) flags.oferta = true;
        });

        return flags;
    }

    function capitalizeFirst(text) {
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
    }

    function parseOrder(value) {
        if (value === '') return null;
        var order = Number(value);
        return Number.isFinite(order) ? order : null;
    }

    // Extrae el file ID de un link de Drive; devuelve null si la entrada no es de Drive.
    function extractDriveId(value) {
        // ID pelado: sin separadores de URL (la regex ya excluye "/", "." y ":").
        if (DRIVE_ID_PATTERN.test(value)) return value;

        var url;
        try {
            url = new URL(value);
        } catch (error) {
            return null;
        }

        // https://lh3.googleusercontent.com/d/{ID}
        if (url.hostname === 'lh3.googleusercontent.com') {
            var directMatch = url.pathname.match(/^\/d\/([A-Za-z0-9_-]+)/);
            return directMatch ? directMatch[1] : null;
        }

        if (url.hostname !== 'drive.google.com') return null;

        // https://drive.google.com/file/d/{ID}/view?usp=sharing
        var fileMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/);
        if (fileMatch) return fileMatch[1];

        // open?id={ID}, uc?id={ID}, uc?export=view&id={ID}, thumbnail?id={ID}
        var queryId = url.searchParams.get('id');
        return queryId && DRIVE_ID_PATTERN.test(queryId) ? queryId : null;
    }

    // Normaliza la columna "imagen": { driveId } para Drive, { src } para URL/ruta, null si está vacía.
    function resolveImageSource(raw) {
        var value = toText(raw);
        if (!value) return null;

        var driveId = extractDriveId(value);
        if (driveId) return { driveId: driveId };

        return { src: value };
    }

    function parseProducts(rows) {
        var products = [];

        rows.forEach(function (row) {
            var name = toText(row[1]);
            if (!name) return;

            var activeValue = toText(row[7]).toLowerCase();
            if (HIDDEN_ACTIVE_VALUES.indexOf(activeValue) !== -1) return;

            var categoryText = toText(row[0]);
            products.push({
                category: normalizeCategory(categoryText),
                categoryLabel: capitalizeFirst(categoryText),
                name: name,
                brand: toText(row[2]),
                flavor: toText(row[3]),
                presentation: toText(row[4]),
                image: toText(row[5]),
                description: toText(row[6]),
                order: parseOrder(toText(row[8])),
                especial: parseSpecial(row[9])
            });
        });

        // Sort estable: las filas sin orden válido van al final conservando el orden de la planilla.
        products.sort(function (a, b) {
            if (a.order === null && b.order === null) return 0;
            if (a.order === null) return 1;
            if (b.order === null) return -1;
            return a.order - b.order;
        });

        return products;
    }

    // Arma las secciones a partir de la columna "categoria" de la propia hoja de
    // productos: cada categoría nueva que se escriba ahí aparece como una pestaña
    // más. El orden de las pestañas es el de primera aparición en la planilla, así
    // que para mover una categoría al principio hay que subir sus filas.
    function groupByCategory(products) {
        var sections = [];
        var sectionByKey = Object.create(null);

        products.forEach(function (product) {
            var section = sectionByKey[product.category];

            if (!section) {
                section = { key: product.category, label: product.categoryLabel, products: [] };
                sections.push(section);
                sectionByKey[product.category] = section;
            }

            section.products.push(product);
        });

        return sections;
    }

    function buildPill(modifier, text) {
        var pill = document.createElement('span');
        pill.className = 'quick-pill ' + modifier;
        pill.textContent = text;
        return pill;
    }

    function buildImageAlt(product) {
        return [product.name, product.brand, product.flavor, product.presentation]
            .filter(function (value) { return value; })
            .join(' ');
    }

    function buildProductImage(imageSource, product) {
        // Debe ser hijo directo de .product-image-container: el modal lo busca así.
        var image = document.createElement('img');
        image.setAttribute('loading', 'lazy');
        image.alt = buildImageAlt(product);

        if (imageSource.driveId) {
            var driveId = imageSource.driveId;
            var fallbackUsed = false;

            // Primer fallo: un único reintento con la URL de tamaño completo.
            // Segundo fallo: se quita la imagen para no dejar el ícono roto.
            image.onerror = function () {
                if (!fallbackUsed) {
                    fallbackUsed = true;
                    image.src = DRIVE_FALLBACK_URL + driveId;
                    return;
                }
                image.remove();
                console.warn('[TR Express] No se pudo cargar la imagen de Drive del producto "' + product.name + '".');
            };

            image.src = DRIVE_THUMBNAIL_URL + driveId + DRIVE_THUMBNAIL_SIZE;
        } else {
            image.src = imageSource.src;
        }

        return image;
    }

    // Ribbon "Oferta" de esquina a 45° sobre la card. Va como hijo directo de
    // la card (no del image-container): el modal exige que la foto sea hija
    // directa de .product-image-container y el ribbon es position absolute,
    // así que no altera el layout.
    function buildOfferRibbon() {
        var ribbon = document.createElement('div');
        ribbon.className = 'offer-ribbon';
        ribbon.setAttribute('role', 'img');
        ribbon.setAttribute('aria-label', 'Oferta');

        var band = document.createElement('span');
        band.className = 'offer-ribbon-band';

        var label = document.createElement('span');
        label.className = 'offer-ribbon-label';
        label.textContent = 'OFERTA';

        band.appendChild(label);
        ribbon.appendChild(band);
        return ribbon;
    }

    function buildProductCard(product) {
        var card = document.createElement('div');
        card.className = product.especial.oferta ? 'product-card is-offer' : 'product-card';
        card.setAttribute('data-descriptions', product.description);

        var imageContainer = document.createElement('div');
        imageContainer.className = 'product-image-container';

        // Franja de disponibilidad, arriba de la foto y sobre el fondo claro.
        // Solo se crea si hay disponibilidad (Mordida Pequeña): la oferta va
        // en el ribbon de esquina sobre la card, no en la franja. Sin
        // disponibilidad, el DOM de la card queda igual que antes.
        var specialStrip = null;
        if (product.especial.mordidaPequena) {
            specialStrip = document.createElement('div');
            specialStrip.className = 'special-strip';
        }

        // Bloque Mordida Pequeña: mismo DOM y mismas clases que en el HTML estático.
        if (product.especial.mordidaPequena) {
            var availabilityInfo = document.createElement('div');
            availabilityInfo.className = 'availability-info';

            var availabilityText = document.createElement('span');
            availabilityText.textContent = 'También disponible en';

            var availabilityLogo = document.createElement('img');
            availabilityLogo.src = AVAILABILITY_LOGO_SRC;
            availabilityLogo.alt = AVAILABILITY_LOGO_ALT;
            availabilityLogo.className = 'availability-logo';

            availabilityInfo.appendChild(availabilityText);
            availabilityInfo.appendChild(availabilityLogo);
            specialStrip.appendChild(availabilityInfo);
        }

        if (specialStrip) {
            imageContainer.appendChild(specialStrip);
        }

        var imageSource = resolveImageSource(product.image);
        if (imageSource) {
            imageContainer.appendChild(buildProductImage(imageSource, product));
        }

        card.appendChild(imageContainer);

        var infoContainer = document.createElement('div');
        infoContainer.className = 'product-info-container';

        var title = document.createElement('h3');
        title.textContent = product.name;
        infoContainer.appendChild(title);

        var quickInfo = document.createElement('div');
        quickInfo.className = 'product-quick-info';

        if (product.brand) {
            quickInfo.appendChild(buildPill('brand', product.brand));
        }
        if (product.flavor) {
            // En piedras el modal muestra "Aromas" en lugar de "Sabor".
            var flavorClass = product.category === 'piedras' ? 'aroma' : 'flavor';
            quickInfo.appendChild(buildPill(flavorClass, product.flavor));
        }
        if (product.presentation) {
            quickInfo.appendChild(buildPill('presentation', product.presentation));
        }
        infoContainer.appendChild(quickInfo);

        var detailsButton = document.createElement('button');
        detailsButton.className = 'btn-ver-detalles';
        detailsButton.type = 'button';
        detailsButton.textContent = 'Ver detalles';
        infoContainer.appendChild(detailsButton);

        card.appendChild(infoContainer);

        // Ribbon de esquina: hijo directo de la card, fuera del
        // image-container para no romper el modal.
        if (product.especial.oferta) {
            card.appendChild(buildOfferRibbon());
        }
        return card;
    }

    function buildPanel(section, isActive) {
        var panel = document.createElement('div');
        panel.className = isActive ? 'products-panel active' : 'products-panel';
        panel.setAttribute('data-panel', section.key);

        var container = document.createElement('div');
        container.className = 'product-container';

        section.products.forEach(function (product) {
            container.appendChild(buildProductCard(product));
        });

        panel.appendChild(container);
        return panel;
    }

    function buildTab(section, isActive) {
        var tab = document.createElement('button');
        tab.className = isActive ? 'product-tab active' : 'product-tab';
        tab.type = 'button';
        tab.setAttribute('data-target', section.key);
        tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        tab.textContent = section.label;
        return tab;
    }

    function renderCatalog(sections) {
        var switcher = document.querySelector('.product-switcher');
        if (!switcher) {
            throw new Error('No se encontró .product-switcher');
        }

        var tabs = sections.map(function (section, index) {
            return buildTab(section, index === 0);
        });
        var panels = sections.map(function (section, index) {
            return buildPanel(section, index === 0);
        });

        var oldPanels = Array.prototype.slice.call(document.querySelectorAll('.products-panel'));
        var firstOldPanel = oldPanels[0] || null;
        var lastOldPanel = oldPanels[oldPanels.length - 1] || null;
        var panelParent = firstOldPanel ? firstOldPanel.parentNode : switcher.parentNode;
        var sameParent = panelParent === switcher.parentNode;
        // Si los paneles viejos no comparten padre con el switcher, se conserva su posición original.
        var fallbackReference = lastOldPanel ? lastOldPanel.nextSibling : null;

        oldPanels.forEach(function (panel) { panel.remove(); });

        // Solo se reemplazan los botones: el contenedor conserva role="tablist" y aria-label.
        switcher.replaceChildren.apply(switcher, tabs);

        if (sameParent) {
            // Los paneles nuevos van justo después del switcher.
            var reference = switcher.nextSibling;
            panels.forEach(function (panel) {
                switcher.parentNode.insertBefore(panel, reference);
            });
        } else {
            panels.forEach(function (panel) {
                panelParent.insertBefore(panel, fallbackReference);
            });
        }
    }

    fetchCatalog()
        .then(function (data) {
            var products = parseProducts((data && data.values) || []);

            if (!products.length) {
                throw new Error('La planilla no tiene productos visibles');
            }

            renderCatalog(groupByCategory(products));
            document.body.dataset.catalog = 'sheet';
        })
        .catch(function (error) {
            console.warn(
                '[TR Express] No se pudo renderizar el catálogo desde Google Sheets; se mantiene el HTML estático.',
                error
            );
        });
})();
