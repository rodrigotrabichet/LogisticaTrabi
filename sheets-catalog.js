/**
 * Catálogo dinámico desde Google Sheets.
 *
 * Carga productos y categorías con una única request a Sheets API v4 y
 * reemplaza las pestañas y paneles de la sección "Nuestros Productos".
 * Si cualquier paso falla, el HTML estático queda intacto (fallback) y
 * solo se registra un warning en consola.
 */
(function () {
    'use strict';

    var SPREADSHEET_ID = '1SYoeNeFqcH2c5xXLGUW-Hbo4ywQNtuTi7kGDJOGmCkM';
    var API_KEY = 'AIzaSyAy2UHwlmqfUWNW4JwjMHF92TRidUMjcJ4';
    var PRODUCTS_RANGE = 'Productos!A2:J';
    var CATEGORIES_RANGE = 'Categorias!A2:A';
    var REQUEST_TIMEOUT_MS = 8000;
    var AVAILABILITY_LOGO_SRC = 'assets/images/LogoMordidaPequeña.png';
    var AVAILABILITY_LOGO_ALT = 'Logo Pet Shop Mordida Pequeña';
    // Valores de la columna "activo" que ocultan la fila (ya normalizados a minúsculas).
    var HIDDEN_ACTIVE_VALUES = ['false', 'no', '0', 'falso'];
    // Imágenes de Google Drive: thumbnail redimensionado como src primario y URL directa como respaldo.
    var DRIVE_THUMBNAIL_URL = 'https://drive.google.com/thumbnail?id=';
    var DRIVE_THUMBNAIL_SIZE = '&sz=w1200';
    var DRIVE_FALLBACK_URL = 'https://lh3.googleusercontent.com/d/';
    var DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

    // Marcador para tests: 'static' hasta que el render desde la planilla sea exitoso.
    document.body.dataset.catalog = 'static';

    function buildEndpoint() {
        return 'https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID + '/values:batchGet'
            + '?ranges=' + encodeURIComponent(PRODUCTS_RANGE)
            + '&ranges=' + encodeURIComponent(CATEGORIES_RANGE)
            + '&key=' + encodeURIComponent(API_KEY);
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
                availability: toText(row[9])
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

    function groupByCategory(products, categoryRows) {
        var sections = [];
        var sectionByKey = Object.create(null);

        function addSection(key, label) {
            var section = { key: key, label: label, products: [] };
            sections.push(section);
            sectionByKey[key] = section;
            return section;
        }

        // 1) Primero las categorías declaradas en la pestaña Categorias, en su orden.
        categoryRows.forEach(function (row) {
            var key = normalizeCategory(row[0]);
            if (!key || sectionByKey[key]) return;
            addSection(key, capitalizeFirst(toText(row[0])));
        });

        // 2) Las categorías no declaradas se agregan al final, por orden de aparición.
        products.forEach(function (product) {
            var section = sectionByKey[product.category] || addSection(product.category, product.categoryLabel);
            section.products.push(product);
        });

        // Solo categorías con al menos un producto visible.
        return sections.filter(function (section) {
            return section.products.length > 0;
        });
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

    function buildProductCard(product) {
        var card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-descriptions', product.description);

        var imageContainer = document.createElement('div');
        imageContainer.className = 'product-image-container';

        if (product.availability) {
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
            imageContainer.appendChild(availabilityInfo);
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

    function getRows(valueRanges, index) {
        var range = valueRanges && valueRanges[index];
        return (range && range.values) || [];
    }

    fetchCatalog()
        .then(function (data) {
            var valueRanges = data && data.valueRanges;
            if (!valueRanges || !valueRanges.length) {
                throw new Error('Respuesta de Sheets sin valueRanges');
            }

            var products = parseProducts(getRows(valueRanges, 0));
            var sections = groupByCategory(products, getRows(valueRanges, 1));

            if (!sections.length) {
                throw new Error('La planilla no tiene productos visibles');
            }

            renderCatalog(sections);
            document.body.dataset.catalog = 'sheet';
        })
        .catch(function (error) {
            console.warn(
                '[TR Express] No se pudo renderizar el catálogo desde Google Sheets; se mantiene el HTML estático.',
                error
            );
        });
})();
