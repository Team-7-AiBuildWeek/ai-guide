/**
 * The landing page's two moving parts: the "How it works" tabs, and the
 * dotted route looping between the floating hero cards.
 *
 * Plain JavaScript on purpose — it drives the DOM the page has already
 * rendered, and porting it to React state would change behaviour without
 * changing what a visitor sees.
 */

export function mountLandingScripts() {

  // "How it works" — selecting a step swaps the media beside it.
      (function () {
        var tabs = [].slice.call(document.querySelectorAll('.steps .step'));
        var panel = document.getElementById('how-panel');
        if (!tabs.length || !panel) return;

        var PIN = '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>';
        var CANS = '<svg viewBox="0 0 24 24"><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><path d="M20 15a2 2 0 0 1-2 2h-1v-4h1a2 2 0 0 1 2 2ZM4 15a2 2 0 0 0 2 2h1v-4H6a2 2 0 0 0-2 2Z"/></svg>';
        var MIC = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';

        var views = [
          {
            img: 'https://picsum.photos/seed/voxapickcity/1000/1100',
            alt: 'Rooftops of a city at first light',
            chip: '12 routes nearby',
            title: 'Rome',
            meta: '9 walks · from 45 min',
            icon: PIN
          },
          {
            img: 'https://picsum.photos/seed/walkingcity/1000/1100',
            alt: 'A traveller walking through a city with headphones',
            chip: 'Narrating · 02:14',
            title: 'Baroque Loop',
            meta: '12 stops · 2 hrs · hands-free',
            icon: CANS
          },
          {
            img: 'https://picsum.photos/seed/voxaaskaloud/1000/1100',
            alt: 'A traveller pausing to look up at a building',
            chip: 'Listening…',
            title: '“Who built this?”',
            meta: 'Answered in 2s, then resumed',
            icon: MIC
          }
        ];

        var photo = panel.querySelector('.how-photo');
        var chipText = panel.querySelector('.chip-text');
        var cardIcon = panel.querySelector('.chip-card-icon');
        var cardTitle = panel.querySelector('.chip-card-title');
        var cardMeta = panel.querySelector('.chip-card-meta');

        // Warm the cache so switching doesn't flash an empty frame.
        views.forEach(function (v) { new Image().src = v.img; });

        var current = 0;

        function select(i, focus) {
          if (i === current) return;
          var v = views[i];

          tabs.forEach(function (tab, n) {
            var on = n === i;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.tabIndex = on ? 0 : -1;
          });

          panel.setAttribute('aria-labelledby', tabs[i].id);
          panel.classList.add('is-swapping');

          photo.onload = photo.onerror = function () {
            panel.classList.remove('is-swapping');
          };
          photo.src = v.img;
          photo.alt = v.alt;

          chipText.textContent = v.chip;
          cardIcon.innerHTML = v.icon;
          cardTitle.textContent = v.title;
          cardMeta.textContent = v.meta;

          current = i;
          if (focus) tabs[i].focus();
        }

        tabs.forEach(function (tab, i) {
          tab.addEventListener('click', function () { select(i); });

          tab.addEventListener('keydown', function (e) {
            var k = e.key;
            if (k === 'Enter' || k === ' ') {
              e.preventDefault();
              select(i);
            } else if (k === 'ArrowDown' || k === 'ArrowRight') {
              e.preventDefault();
              select((i + 1) % tabs.length, true);
            } else if (k === 'ArrowUp' || k === 'ArrowLeft') {
              e.preventDefault();
              select((i - 1 + tabs.length) % tabs.length, true);
            } else if (k === 'Home') {
              e.preventDefault();
              select(0, true);
            } else if (k === 'End') {
              e.preventDefault();
              select(tabs.length - 1, true);
            }
          });
        });
      })();

      // Draws the dotted travel route connecting the floating hero cards.
      (function () {
        var wrap = document.querySelector('.hero-floats');
        if (!wrap) return;

        var svg = wrap.querySelector('.route-map');

        // A closed loop: Rome, Lisbon, along the bottom, then Porto, Tokyo,
        // and back over the top to Rome. Non-selector entries are open-space
        // waypoints.
        var order = [
          '.float-1', 'leftMid', '.float-2', 'bottom',
          '.float-4', 'rightMid', '.float-3', 'top'
        ];

        // Card centre from the layout box, so the cards' rotate/drift transforms
        // never move the route.
        function centre(sel) {
          var el = wrap.querySelector(sel);
          return {
            x: el.offsetLeft + el.offsetWidth / 2,
            y: el.offsetTop + el.offsetHeight / 2
          };
        }

        function draw() {
          var w = wrap.offsetWidth;
          var h = wrap.offsetHeight;

          if (!w || !h || getComputedStyle(wrap).display === 'none') {
            svg.innerHTML = '';
            return;
          }
          svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

          // The bottom waypoint sits in the clear span between the centred
          // hero copy and the bottom-right card.
          var f4 = wrap.querySelector('.float-4');
          var bottomX = (w * 0.62 + f4.offsetLeft) / 2;

          var c1c = centre('.float-1');
          var c2c = centre('.float-2');
          var c3c = centre('.float-3');
          var c4c = centre('.float-4');

          var pts = order.map(function (sel) {
            if (sel === 'bottom') return { x: bottomX, y: h - 6 };
            if (sel === 'top') return { x: w * 0.5, y: 16 };
            // Side waypoints bow the silhouette outward between the stacked
            // cards, so the loop reads as a round shape rather than a polygon.
            if (sel === 'leftMid') {
              return {
                x: Math.max(14, Math.min(c1c.x, c2c.x) - 64),
                y: (c1c.y + c2c.y) / 2
              };
            }
            if (sel === 'rightMid') {
              return {
                x: Math.min(w - 14, Math.max(c3c.x, c4c.x) + 64),
                y: (c3c.y + c4c.y) / 2
              };
            }
            return centre(sel);
          });

          // Closed Catmull-Rom through the points, converted to cubic beziers.
          var n = pts.length;
          var d = 'M' + pts[0].x + ' ' + pts[0].y;

          for (var i = 0; i < n; i++) {
            var p0 = pts[(i - 1 + n) % n];
            var p1 = pts[i];
            var p2 = pts[(i + 1) % n];
            var p3 = pts[(i + 2) % n];

            var c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
            var c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };

            d += ' C' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + p2.x + ' ' + p2.y;
          }

          d += ' Z';

          var markup = '<path id="narro-route" class="route-line" d="' + d + '"/>';

          // A marker that walks the loop, the way the guide walks with you.
          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            markup +=
              '<g class="route-runner">' +
                '<circle class="halo" r="9"/>' +
                '<circle class="core" r="4"/>' +
                '<animateMotion dur="44s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">' +
                  '<mpath href="#narro-route"/>' +
                '</animateMotion>' +
              '</g>';
          }

          svg.innerHTML = markup;
        }

        // Each badge plays its waveform through once per click.
        wrap.querySelectorAll('.audio-tag').forEach(function (tag) {
          var btn = tag.querySelector('.audio-play');
          if (!btn) return;

          btn.addEventListener('click', function () {
            if (tag.classList.contains('is-playing')) return;
            tag.classList.add('is-playing');
            setTimeout(function () {
              tag.classList.remove('is-playing');
            }, 1550);
          });
        });

        draw();
        window.addEventListener('load', draw);
        window.addEventListener('resize', draw);
        if (window.ResizeObserver) new ResizeObserver(draw).observe(wrap);
      })();

}
