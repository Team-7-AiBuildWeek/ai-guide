/**
 * The trip planner: five questions, then a day-by-day itinerary built from
 * live weather (Open-Meteo) and real sights (Wikipedia). Each day hands off
 * to the tour player with a written brief.
 *
 * Plain JavaScript, mounted into markup React renders — see Planner.tsx.
 */

export function mountPlanner(SITE_CITIES, findSiteCity) {

    (function () {
      var CITIES = SITE_CITIES;
      var card = document.getElementById('card');
      var progress = document.getElementById('progress');

      /* ============ STATE ============ */
      // Arriving from a city page (city.html?…) pre-selects the city and
      // skips straight to the dates step.
      var preset = new URLSearchParams(window.location.search).get('city');
      if (preset && !findSiteCity(preset)) preset = null;

      var moreOpen = false; // "somewhere else" input visibility

      var state = {
        city: preset,        // slug, or '__custom__' for a typed-in city
        customCity: null,    // free-text city name when city === '__custom__'
        start: null,         // ISO date
        days: 3,
        travelers: 2,
        group: 'couple',     // solo | couple | family | friends
        budget: 'balanced',  // saver | balanced | plush
        interests: []        // keys of ACTIVITIES
      };

      var INTERESTS = [
        { key: 'history', label: 'History' },
        { key: 'food', label: 'Food & markets' },
        { key: 'architecture', label: 'Architecture' },
        { key: 'art', label: 'Art & museums' },
        { key: 'nature', label: 'Parks & views' },
        { key: 'hidden', label: 'Hidden corners' }
      ];

      /* Pools the generator draws from. indoor:true items are preferred on
         rainy days, outdoor ones on clear days. */
      var ACTIVITIES = {
        history: [
          { t: 'Old-town listening walk', d: 'Narro narrates the streets the guidebooks skip.', indoor: false },
          { t: 'City history museum deep-dive', d: 'A room-by-room audio thread through the collection.', indoor: true },
          { t: 'Fortress & ramparts loop', d: 'Sieges, escapes, and one very stubborn gate.', indoor: false }
        ],
        food: [
          { t: 'Market tasting stroll', d: 'Eat where the stallholders eat — Narro knows which queue is worth it.', indoor: true },
          { t: 'Neighbourhood food crawl', d: 'Four stops, four stories, one very full afternoon.', indoor: false },
          { t: 'Coffeehouse circuit', d: 'The tables where revolutions and novels were plotted.', indoor: true }
        ],
        architecture: [
          { t: 'Facades & doorways walk', d: 'Why that balcony is illegal and other architectural gossip.', indoor: false },
          { t: 'Cathedral & crypt visit', d: 'From spire to cellar with the whole story in your ear.', indoor: true },
          { t: 'Modernism detour', d: 'The buildings locals argued about for fifty years.', indoor: false }
        ],
        art: [
          { t: 'Gallery highlights hour', d: 'The twelve works worth your feet, narrated.', indoor: true },
          { t: 'Street-art side streets', d: 'Walls that answer back.', indoor: false },
          { t: 'Studio quarter wander', d: 'Where the city makes things — ateliers, print shops, foundries.', indoor: true }
        ],
        nature: [
          { t: 'Park & viewpoint climb', d: 'The skyline earned slowly, story by story.', indoor: false },
          { t: 'Riverside golden-hour walk', d: 'Bridges in order of scandal.', indoor: false },
          { t: 'Botanical garden hour', d: 'A quiet green chapter between louder ones.', indoor: false }
        ],
        hidden: [
          { t: 'Courtyards nobody enters', d: 'Doors that look private but aren’t.', indoor: false },
          { t: 'The wrong side of the tracks', d: 'The neighbourhood guidebooks skip, and why they’re wrong.', indoor: false },
          { t: 'Passages & arcades crawl', d: 'A dry route for a wet day — the city under glass.', indoor: true }
        ]
      };

      var BUDGETS = {
        saver:    { label: 'Saver',        perDay: 45,  routes: 1 },
        balanced: { label: 'Balanced',     perDay: 95,  routes: 2 },
        plush:    { label: 'Treat myself', perDay: 190, routes: 3 }
      };
      var ROUTE_PRICE = 9; // beyond the free one

      /* ============ WEATHER ============ */
      /* Primary source: Open-Meteo (free, keyless, ~16-day range) fetched in
         showLoading(). The deterministic simulation below is the fallback
         for offline use or dates beyond the forecast horizon. */
      function mapWmo(code) {
        if (code === 0) return 'sunny';
        if (code === 1 || code === 2) return 'partly';
        if (code === 3 || code === 45 || code === 48) return 'cloudy';
        return 'rainy';
      }

      function fetchWeather(cityName, startISO, days) {
        var end = new Date(startISO + 'T12:00:00');
        end.setDate(end.getDate() + days - 1);
        var endISO = end.toISOString().slice(0, 10);
        return fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(cityName))
          .then(function (r) { return r.json(); })
          .then(function (g) {
            if (!g.results || !g.results.length) throw new Error('city not found');
            var loc = g.results[0];
            geocoded = { lat: loc.latitude, lng: loc.longitude };
            return fetch('https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude + '&longitude=' + loc.longitude +
              '&daily=weather_code,temperature_2m_max&timezone=auto&start_date=' + startISO + '&end_date=' + endISO);
          })
          .then(function (r) { return r.json(); })
          .then(function (f) {
            if (!f.daily || !f.daily.time || !f.daily.time.length) throw new Error('no forecast');
            return f.daily.time.map(function (t, i) {
              return { cond: mapWmo(f.daily.weather_code[i]), temp: Math.round(f.daily.temperature_2m_max[i]), real: true };
            });
          })
          .catch(function () { return null; });
      }
      function hash(str) {
        var h = 0;
        for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
        return h;
      }
      function weatherFor(citySlug, iso) {
        var h = hash(citySlug + iso);
        var conds = ['sunny', 'sunny', 'partly', 'partly', 'cloudy', 'rainy'];
        var cond = conds[h % conds.length];
        var temp = 17 + (h % 13); // 17–29 °C
        return { cond: cond, temp: temp };
      }
      var W_ICON = {
        sunny: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>',
        partly: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8.5" cy="9" r="3.4"/><path d="M8.5 2.8v1.9M2.7 9h1.9M4.4 4.9l1.3 1.3"/><path d="M9 19h8.5a3.2 3.2 0 0 0 .6-6.3 4.6 4.6 0 0 0-9-1"/></svg>',
        cloudy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.5 18h10.7a3.6 3.6 0 0 0 .7-7.1 5.2 5.2 0 0 0-10.2-1.1A4.1 4.1 0 0 0 6.5 18Z"/></svg>',
        rainy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.5 15h10.7a3.6 3.6 0 0 0 .7-7.1 5.2 5.2 0 0 0-10.2-1.1A4.1 4.1 0 0 0 6.5 15Z"/><path d="M8.5 18.5v2M12 18.5v2M15.5 18.5v2"/></svg>'
      };
      var W_LABEL = { sunny: 'Sunny', partly: 'Partly sunny', cloudy: 'Overcast', rainy: 'Rain likely' };

      /* ============ WIZARD ============ */
      var step = preset ? 1 : 0;
      var STEPS = 5;

      function renderProgress() {
        var html = '';
        for (var i = 0; i < STEPS; i++) html += '<i class="' + (i <= step ? 'on' : '') + '"></i>';
        progress.innerHTML = html;
      }

      function chipRow(options, selected, attr, multi) {
        return '<div class="chips">' + options.map(function (o) {
          var on = multi ? selected.indexOf(o.key) !== -1 : selected === o.key;
          return '<button type="button" class="chip-opt ' + (on ? 'on' : '') + '" data-' + attr + '="' + o.key + '">' +
                 o.label + (o.sub ? '<span class="sub">' + o.sub + '</span>' : '') + '</button>';
        }).join('') + '</div>';
      }

      function navRow(nextLabel, backable) {
        return '<div class="plan-nav">' +
          (backable ? '<button type="button" class="plan-back" id="back">&larr; Back</button>' : '<span></span>') +
          '<button type="button" class="btn btn-primary plan-next" id="next">' + (nextLabel || 'Continue') + '</button>' +
        '</div>';
      }

      function tomorrowISO() {
        var d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
      }

      var stepRender = [
        function whereTo() {
          var isCustom = state.city === '__custom__';
          return '<div class="plan-step"><h2>Where are you headed?</h2>' +
            '<p class="hint">Pick a narrated city — or name any city on Earth and the guide writes it fresh.</p>' +
            '<div class="city-grid">' + CITIES.map(function (c) {
              return '<button type="button" class="city-pick ' + (state.city === c.slug ? 'on' : '') + '" data-city="' + c.slug + '">' +
                '<img src="' + c.image + '" alt="" loading="lazy" />' +
                '<span><strong>' + c.name + '</strong>' + c.country + '</span>' +
              '</button>';
            }).join('') +
            '<button type="button" class="city-pick city-more ' + (isCustom ? 'on' : '') + '" data-more="1">' +
              '<span class="plus" aria-hidden="true">+</span>' +
              '<span class="label"><strong>Somewhere else</strong>Every city on Earth</span>' +
            '</button>' +
            '</div>' +
            ((moreOpen || isCustom) ?
              '<div class="plan-row custom-city-row"><div class="plan-field">' +
                '<label for="customCity">Your city</label>' +
                '<input type="text" id="customCity" placeholder="e.g. Košice, Oaxaca, Tbilisi…" value="' + (state.customCity || '') + '" /></div>' +
                '<div class="plan-field custom-city-use">' +
                '<button type="button" class="btn btn-primary" id="useCustom">Use this city</button></div></div>'
              : '') +
            navRow() + '</div>';
        },
        function when() {
          return '<div class="plan-step"><h2>When, and for how long?</h2>' +
            '<p class="hint">The forecast shapes each day — rainy afternoons go indoors.</p>' +
            '<div class="plan-row">' +
              '<div class="plan-field"><label for="start">First day</label>' +
              '<input type="date" id="start" value="' + (state.start || tomorrowISO()) + '" min="' + tomorrowISO() + '" /></div>' +
              '<div class="plan-field"><label>Days</label><span class="counter">' +
                '<button type="button" data-cnt="days" data-d="-1">−</button><strong id="daysN">' + state.days + '</strong>' +
                '<button type="button" data-cnt="days" data-d="1">+</button></span></div>' +
            '</div>' + navRow(null, true) + '</div>';
        },
        function who() {
          return '<div class="plan-step"><h2>Who’s walking?</h2>' +
            '<p class="hint">Narro is one voice in every pair of ears — no group rates, no umbrellas.</p>' +
            '<div class="plan-row" style="align-items:center">' +
              '<div class="plan-field"><label>Travellers</label><span class="counter">' +
                '<button type="button" data-cnt="travelers" data-d="-1">−</button><strong id="travelersN">' + state.travelers + '</strong>' +
                '<button type="button" data-cnt="travelers" data-d="1">+</button></span></div>' +
            '</div><br />' +
            chipRow([
              { key: 'solo', label: 'Just me' },
              { key: 'couple', label: 'The two of us' },
              { key: 'family', label: 'Family with kids' },
              { key: 'friends', label: 'Friends trip' }
            ], state.group, 'group') +
            navRow(null, true) + '</div>';
        },
        function budget() {
          return '<div class="plan-step"><h2>What’s the budget?</h2>' +
            '<p class="hint">Per person and day — walks, food, and tickets. The first route in every city is free.</p>' +
            chipRow([
              { key: 'saver', label: 'Saver', sub: '~€45 / day' },
              { key: 'balanced', label: 'Balanced', sub: '~€95 / day' },
              { key: 'plush', label: 'Treat myself', sub: '~€190 / day' }
            ], state.budget, 'budget') +
            navRow(null, true) + '</div>';
        },
        function interests() {
          return '<div class="plan-step"><h2>What should the city talk about?</h2>' +
            '<p class="hint">Pick as many as you like — the guide weaves them together.</p>' +
            chipRow(INTERESTS, state.interests, 'interest', true) +
            navRow('Build my itinerary', true) + '</div>';
        }
      ];

      function renderStep() {
        renderProgress();
        card.innerHTML = stepRender[step]();
      }

      /* Each wizard step is a history entry, so the browser Back button steps
         back through the questionnaire instead of leaving the page. Answers
         and the finished plan also go to sessionStorage, keyed to the history
         entry, so leaving for the app and coming back resumes where you were
         rather than starting over. */
      var SESSION_KEY = 'narro-planner';
      var sessionId = String(Date.now());

      function persist(view) {
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            id: sessionId, view: view, step: step, state: state, plan: plan
          }));
        } catch (e) { /* private mode — the wizard still works, just not resumable */ }
      }

      function readSaved() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
        catch (e) { return null; }
      }

      function gotoStep(n) {
        step = n;
        renderStep();
        persist('step');
        history.pushState({ v: 'step', step: n, id: sessionId }, '');
      }

      window.addEventListener('popstate', function (e) {
        var s = e.state;
        if (s && s.v === 'result') {
          if (!plan) { var saved = readSaved(); if (saved && saved.plan) plan = saved.plan; }
          if (plan) { renderItinerary(); return; }
        }
        if (s && s.v === 'step') { step = s.step; renderStep(); return; }
        step = preset ? 1 : 0;
        renderStep();
      });

      /* ============ HANDOFF TO THE TOUR PLAYER ============ */
      /* A day in the itinerary becomes a brief for the real generator: what
         to see, for how long, and where to start. The player picks these up
         from the URL and starts generating without asking again. */
      var geocoded = null;

      var INTEREST_TO_APP = {
        history: 'history', architecture: 'architecture', food: 'food',
        art: 'art', hidden: 'hidden', nature: 'hidden'
      };

      function walkHref(title, note) {
        var cityName = plan && plan.city ? plan.city.name : '';
        var brief = title + (note ? ' — ' + note : '') +
          (cityName ? '. In ' + cityName + '.' : '');
        var interests = (plan ? plan.wanted : []).map(function (k) {
          return INTEREST_TO_APP[k] || 'history';
        }).filter(function (v, i, a) { return a.indexOf(v) === i; });

        var q = '/walk?brief=' + encodeURIComponent(brief) +
          '&minutes=60&interests=' + encodeURIComponent(interests.join(',')) +
          '&autostart=1';
        if (geocoded) q += '&lat=' + geocoded.lat + '&lng=' + geocoded.lng;
        if (cityName) q += '&label=' + encodeURIComponent(cityName);
        return q;
      }

      /* ============ GENERATOR ============ */
      function fmtDate(iso) {
        var d = new Date(iso + 'T12:00:00');
        return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
      }

      /* The itinerary lives as data so it can be edited (reorder, swap)
         and re-rendered. */
      var plan = null;

      function pickIdx(pool, seed, wantIndoor) {
        var cand = [];
        for (var i = 0; i < pool.length; i++) {
          if (wantIndoor === null || pool[i].indoor === wantIndoor) cand.push(i);
        }
        if (!cand.length) for (var j = 0; j < pool.length; j++) cand.push(j);
        return cand[seed % cand.length];
      }

      /* A typed-in city gets a synthetic catalogue entry — two generated
         routes and a placeholder photo — so the rest of the flow is
         identical to a curated city. */
      function customCityObj() {
        var name = state.customCity;
        var seed = encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'));
        return {
          slug: '__custom__',
          name: name,
          country: '',
          tagline: 'Never narrated before — your guide writes it the day you arrive',
          image: 'https://picsum.photos/seed/narro-' + seed + '/1200/800',
          hours: 6,
          routes: [
            { id: 'custom-first', name: name + ' Essentials', stops: 10, minutes: 100, blurb: 'The essential first loop — squares, side streets, and the stories between them.', free: true },
            { id: 'custom-hidden', name: 'Hidden ' + name, stops: 9, minutes: 90, blurb: 'The corners locals keep to themselves.', free: false }
          ]
        };
      }

      function generate(realWx, sights) {
        var city = state.city === '__custom__' ? customCityObj() : findSiteCity(state.city);
        var tier = BUDGETS[state.budget];
        var wanted = state.interests.length ? state.interests : ['history', 'hidden'];
        var allowed = Math.min(tier.routes, city.routes.length);
        var start = new Date(state.start + 'T12:00:00');

        // The questionnaire drives the order: sights matching the chosen
        // interests schedule first, the rest follow by popularity.
        var pool = (sights || []).slice();
        pool.forEach(function (s) {
          s.matched = (s.cats || []).some(function (c) { return wanted.indexOf(c) !== -1; });
        });
        pool.sort(function (a, b) {
          if (a.matched !== b.matched) return a.matched ? -1 : 1;
          return b.monthly - a.monthly;
        });

        plan = {
          city: city, tier: tier, wanted: wanted, days: [],
          liveWeather: !!(realWx && realWx.length),
          sights: pool
        };

        var wxKey = state.city === '__custom__' ? state.customCity : state.city;

        for (var d = 0; d < state.days; d++) {
          var date = new Date(start); date.setDate(start.getDate() + d);
          var iso = date.toISOString().slice(0, 10);
          var wx = (realWx && realWx[d]) ? realWx[d] : weatherFor(wxKey, iso);
          var rainy = wx.cond === 'rainy';
          var seed = hash(wxKey + iso + d);

          // Morning: a narrated route. Afternoon: interest-driven. Evening:
          // food or golden hour. All weather-aware, all editable afterwards.
          var key1 = wanted[(d + seed) % wanted.length];
          var evKey = rainy ? 'food' : (wanted.indexOf('nature') !== -1 ? 'nature' : 'food');

          plan.days.push({
            iso: iso,
            wx: wx,
            slots: [
              { kind: 'route', idx: d % allowed },
              // Afternoons and evenings visit real sights, best-matched
              // first; the generic pools are the offline fallback.
              plan.sights.length
                ? { kind: 'sight', idx: (2 * d) % plan.sights.length }
                : { kind: 'act', pool: key1, idx: pickIdx(ACTIVITIES[key1], seed, rainy ? true : null) },
              plan.sights.length > 1
                ? { kind: 'sight', idx: (2 * d + 1) % plan.sights.length }
                : { kind: 'act', pool: evKey, idx: pickIdx(ACTIVITIES[evKey], seed + 7, rainy ? true : false) }
            ]
          });
        }
        renderItinerary();
      }

      var SLOT_TIMES = ['Morning', 'Afternoon', 'Evening'];
      var UP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 14 6-6 6 6"/></svg>';
      var DOWN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 10 6 6 6-6"/></svg>';
      var SWAP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10a8 8 0 0 1 14-4l2 2"/><path d="M20 4v4h-4"/><path d="M20 14a8 8 0 0 1-14 4l-2-2"/><path d="M4 20v-4h4"/></svg>';

      function slotHtml(day, di, slot, si) {
        var rainy = day.wx.cond === 'rainy';
        var body, startBtn = '';
        var walkTitle = null; // set for non-route slots so the day can start with them

        if (slot.kind === 'route') {
          var r = plan.city.routes[slot.idx];
          body = '<strong>' + r.name + '</strong>' +
            '<p>' + r.blurb + ' · ' + r.stops + ' stops · ~' + Math.round(r.minutes / 60 * 10) / 10 + ' hrs</p>' +
            (rainy ? '<span class="slot-note">' + W_ICON.rainy + ' Rain plan: the guide reroutes through arcades and porticoes</span>' : '');
          if (si === 0) startBtn = '<a class="btn btn-dark" href="' + walkHref(r.name, r.blurb) + '">Start</a>';
        } else if (slot.kind === 'sight') {
          var sg = plan.sights[slot.idx];
          var matchCat = null;
          if (sg.matched) {
            for (var ci = 0; ci < sg.cats.length; ci++) {
              if (plan.wanted.indexOf(sg.cats[ci]) !== -1) { matchCat = sg.cats[ci]; break; }
            }
          }
          var matchLabel = null;
          if (matchCat) {
            for (var ii = 0; ii < INTERESTS.length; ii++) {
              if (INTERESTS[ii].key === matchCat) { matchLabel = INTERESTS[ii].label; break; }
            }
          }
          body = '<strong>' + sg.title + ' — narrated visit' +
            (matchLabel ? '<span class="route-free">' + matchLabel + '</span>' : '') + '</strong>' +
            '<p>' + (sg.desc ? sg.desc + ' · ' : '') + sightRating(sg) + '</p>' +
            (rainy ? '<span class="slot-note">' + W_ICON.rainy + ' Rainy slot — the guide favours the interiors</span>' : '');
          walkTitle = sg.title;
        } else {
          var a = ACTIVITIES[slot.pool][slot.idx];
          body = '<strong>' + a.t + '</strong><p>' + a.d + '</p>' +
            (rainy && a.indoor ? '<span class="slot-note">' + W_ICON.rainy + ' Indoors — picked for the forecast</span>' : '');
          walkTitle = a.t;
        }

        // Whatever sits on top of the day is where the day starts.
        if (!startBtn && si === 0 && walkTitle) {
          startBtn = '<a class="btn btn-dark" href="' + walkHref(walkTitle) + '">Start</a>';
        }

        var tools = '<span class="slot-tools">' +
          (si > 0 ? '<button type="button" data-move="' + di + ':' + si + ':-1" aria-label="Move earlier" title="Move earlier">' + UP_ICON + '</button>' : '') +
          '<button type="button" data-swap="' + di + ':' + si + '" aria-label="Swap for another option" title="Swap for another option">' + SWAP_ICON + '</button>' +
          (si < day.slots.length - 1 ? '<button type="button" data-move="' + di + ':' + si + ':1" aria-label="Move later" title="Move later">' + DOWN_ICON + '</button>' : '') +
          '</span>';

        return '<div class="slot"><span class="slot-time">' + SLOT_TIMES[si] + '</span>' +
          '<div class="slot-body">' + body + '</div>' + tools + startBtn + '</div>';
      }

      function renderItinerary() {
        var city = plan.city, tier = plan.tier;
        var daysHtml = '', rainDays = 0, firstRoute = null;

        for (var d = 0; d < plan.days.length; d++) {
          var day = plan.days[d];
          if (day.wx.cond === 'rainy') rainDays++;
          var slots = '';
          for (var s = 0; s < day.slots.length; s++) {
            if (!firstRoute && day.slots[s].kind === 'route') firstRoute = city.routes[day.slots[s].idx];
            slots += slotHtml(day, d, day.slots[s], s);
          }
          daysHtml += '<article class="day-card">' +
            '<div class="day-head"><h3>Day ' + (d + 1) + '</h3><span class="date">' + fmtDate(day.iso) + '</span>' +
            '<span class="weather ' + day.wx.cond + '">' + W_ICON[day.wx.cond] + ' ' + W_LABEL[day.wx.cond] + ' · ' + day.wx.temp + '°C</span></div>' +
            slots + '</article>';
        }

        // Price follows the routes actually in the plan — swaps update it.
        var used = {};
        plan.days.forEach(function (day) {
          day.slots.forEach(function (s) { if (s.kind === 'route') used[s.idx] = true; });
        });
        var routeCount = Object.keys(used).length;
        var routeCost = Math.max(0, routeCount - 1) * ROUTE_PRICE * state.travelers;
        var total = tier.perDay * plan.days.length * state.travelers + routeCost;

        var interestNames = plan.wanted.map(function (k) {
          for (var i = 0; i < INTERESTS.length; i++) if (INTERESTS[i].key === k) return INTERESTS[i].label;
          return k;
        });

        card.innerHTML =
          '<div class="itin-hero"><img src="' + city.image + '" alt="' + city.name + '" />' +
            '<span class="itin-hero-name">' + city.name + '</span></div>' +
          '<div class="itin-head">' +
            '<h2>' + plan.days.length + ' days in ' + city.name + '</h2>' +
            '<p>' + city.tagline + '</p>' +
            '<div class="badges">' +
              '<span class="itin-badge">' + state.travelers + (state.travelers === 1 ? ' traveller' : ' travellers') + '</span>' +
              '<span class="itin-badge">' + tier.label + ' budget</span>' +
              '<span class="itin-badge">' + interestNames.join(' · ') + '</span>' +
              (rainDays ? '<span class="itin-badge">' + rainDays + (rainDays === 1 ? ' rainy day rerouted' : ' rainy days rerouted') + '</span>' : '') +
              '<span class="itin-badge">' + (plan.liveWeather ? 'Live forecast · Open-Meteo' : 'Forecast preview') + '</span>' +
            '</div>' +
          '</div>' +
          '<p class="itin-hint">Not quite right? Use the arrows to reorder a day, or the swap button for a different pick.</p>' +
          daysHtml +
          '<div id="sightsBox">' + sightsSectionHtml(plan.sights) + '</div>' +
          '<div class="itin-total"><strong>~€' + total.toLocaleString('en') + '</strong>' +
            '<span>Estimated for ' + state.travelers + (state.travelers === 1 ? ' person' : ' people') + ' × ' + plan.days.length +
            ' days, incl. ' + routeCount + (routeCount === 1 ? ' route (free)' : ' routes') + '. First route is on us.</span></div>' +
          '<div class="itin-actions">' +
            '<a class="btn btn-primary" href="' + walkHref(firstRoute.name, firstRoute.blurb) + '">Start day 1 in the app</a>' +
            '<button type="button" class="btn btn-dark" id="restart">Plan another trip</button>' +
          '</div>';

        progress.innerHTML = '';
      }

      /* ============ TOP SIGHTS (live from Wikipedia — no API key) ============ */
      /* Finds the city's coordinates, geosearches Wikipedia pages around
         them, and ranks by 60-day pageviews. The star score is derived from
         that readership and labelled as such — no fake review counts. */
      var lastSightsData = null; // {city, items} — cached per city

      function sightScore(monthly) {
        var s = 3.8 + 0.22 * Math.log(monthly + 1) / Math.LN10;
        return Math.min(4.9, Math.max(4.0, s)).toFixed(1);
      }

      /* Articles that rank high but aren't places you can stand in front of
         (historical states, wars, districts…) get filtered out. */
      var SIGHT_BAD_DESC = /(monarchy|kingdom|empire|dynasty|country|historical region|former state|battle|war|revolution|uprising|city in|capital of|metropolitan|municipality|district)/i;
      var SIGHT_BAD_TITLE = /^(kingdom|history|timeline|list|geography|demographics) of/i;
      // Keep the default itinerary family-friendly; these stay findable in
      // the app, just not auto-scheduled.
      var SIGHT_NSFW = /(sex|erotic|torture)/i;

      /* Rough interest classification from the Wikipedia short description,
         so the questionnaire answers can rank what gets scheduled. */
      function classifySight(text) {
        var t = text.toLowerCase();
        var cats = [];
        if (/(castle|fortress|memorial|monument|historic|ruin|gate |wall|column|cemetery|clock|square)/.test(t)) cats.push('history');
        if (/(church|cathedral|basilica|synagogue|mosque|temple|bridge|palace|tower|building|house)/.test(t)) cats.push('architecture');
        if (/(museum|gallery|theatre|theater|opera|art)/.test(t)) cats.push('art');
        if (/(park|garden|hill|island|river|lake|zoo|botanic|view)/.test(t)) cats.push('nature');
        if (/(market|food|brewery|caf)/.test(t)) cats.push('food');
        if (/(street|lane|passage|courtyard|alley|quarter|arcade)/.test(t)) cats.push('hidden');
        return cats;
      }

      function fetchSightsData(cityName) {
        if (lastSightsData && lastSightsData.city === cityName) {
          return Promise.resolve(lastSightsData.items);
        }
        var api = 'https://en.wikipedia.org/w/api.php?format=json&origin=*&action=query&';

        return fetch(api + 'redirects=1&prop=coordinates&titles=' + encodeURIComponent(cityName))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var pages = data.query.pages;
            var page = pages[Object.keys(pages)[0]];
            if (!page || !page.coordinates) throw new Error('city not found');
            var c = page.coordinates[0];
            return fetch(api + 'list=geosearch&gscoord=' + c.lat + '%7C' + c.lon + '&gsradius=5000&gslimit=30');
          })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var ids = data.query.geosearch.map(function (g) { return g.pageid; });
            if (!ids.length) throw new Error('no sights');
            return fetch(api + 'pageids=' + ids.join('%7C') +
              '&prop=pageimages%7Cdescription%7Cpageviews&piprop=thumbnail&pithumbsize=200');
          })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var pages = data.query.pages;
            var items = Object.keys(pages).map(function (k) {
              var p = pages[k];
              var views = 0;
              if (p.pageviews) {
                for (var day in p.pageviews) views += p.pageviews[day] || 0;
              }
              return {
                id: p.pageid,
                title: p.title,
                desc: p.description || '',
                thumb: p.thumbnail ? p.thumbnail.source : null,
                monthly: Math.round(views / 2)
              };
            }).filter(function (p) {
              return p.title !== cityName && p.monthly > 0 &&
                     !SIGHT_BAD_DESC.test(p.desc) && !SIGHT_BAD_TITLE.test(p.title) &&
                     !SIGHT_NSFW.test(p.title);
            });

            items.forEach(function (p) { p.cats = classifySight(p.title + ' ' + p.desc); });
            items.sort(function (a, b) { return b.monthly - a.monthly; });
            var top = items.slice(0, 14);
            if (!top.length) throw new Error('no sights');
            return addRealRatings(top, cityName);
          })
          .then(function (top) {
            lastSightsData = { city: cityName, items: top };
            return top;
          })
          .catch(function () { return null; });
      }

      /* Real visitor ratings come from our own /api/ratings proxy (the
         provider key lives on the server). Static hosting has no such
         endpoint, so this quietly leaves the readership signal in place. */
      function addRealRatings(items, cityName) {
        return fetch('/api/ratings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ city: cityName, names: items.map(function (p) { return p.title; }) })
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (!data || !data.configured) return items;
            items.forEach(function (p) {
              var hit = data.results[p.title];
              if (hit) {
                p.rating = hit.rating;
                p.reviews = hit.reviews;
                p.url = hit.url;
                p.provider = data.provider;
              }
            });
            return items;
          })
          .catch(function () { return items; });
      }

      /* Either real reviews or, without a provider, honest readership. */
      function sightRating(p) {
        if (p.rating) {
          return '★ ' + p.rating.toFixed(1) + ' · ' + p.reviews.toLocaleString('en') + ' reviews';
        }
        return '★ ' + sightScore(p.monthly) + ' · ' + p.monthly.toLocaleString('en') + ' readers/mo';
      }

      function sightsSectionHtml(items) {
        if (!items || !items.length) return '';
        var rated = items.some(function (p) { return p.rating; });
        return '<div class="sights"><h3>More sights worth a detour</h3>' +
          '<p>' + (rated
            ? 'Visitor ratings from ' + (items[0].provider === 'google' ? 'Google Places' : 'TripAdvisor') + ', places from Wikipedia.'
            : 'Pulled live from Wikipedia and ranked by real-world readership.') +
          ' The ones matching your interests are already scheduled across your days.</p>' +
          '<div class="sights-grid">' + items.slice(0, 6).map(function (p) {
            return '<a class="sight" target="_blank" rel="noopener" href="' +
              (p.url || 'https://en.wikipedia.org/?curid=' + p.id) + '">' +
              (p.thumb ? '<img src="' + p.thumb + '" alt="" loading="lazy" />' : '<span class="sight-ph"></span>') +
              '<span class="sight-body"><strong>' + p.title + '</strong>' +
              '<em>' + sightRating(p) + '</em>' +
              (p.desc ? '<small>' + p.desc + '</small>' : '') +
              '</span></a>';
          }).join('') + '</div></div>';
      }

      function showLoading() {
        card.innerHTML = '<div class="plan-loading"><div class="orbit"></div>' +
          '<p>Reading the live forecast, pacing the days, picking the stories…</p></div>';
        var cityName = state.city === '__custom__' ? state.customCity : findSiteCity(state.city).name;
        var minDelay = new Promise(function (res) { setTimeout(res, 1200); });
        Promise.all([fetchWeather(cityName, state.start, state.days), fetchSightsData(cityName), minDelay])
          .then(function (out) {
            generate(out[0], out[1]);
            persist('result');
            history.pushState({ v: 'result', id: sessionId }, '');
          });
      }

      /* ============ EVENTS ============ */
      card.addEventListener('click', function (e) {
        var t = e.target.closest('button, a');
        if (!t) return;

        // Itinerary editing: reorder within a day, or swap for an alternative.
        if (t.dataset.move) {
          var m = t.dataset.move.split(':');
          var arr = plan.days[+m[0]].slots, si = +m[1], dir = +m[2];
          var tmp = arr[si]; arr[si] = arr[si + dir]; arr[si + dir] = tmp;
          renderItinerary();
          persist('result');
          return;
        }
        if (t.dataset.swap) {
          var w = t.dataset.swap.split(':');
          var slot = plan.days[+w[0]].slots[+w[1]];
          if (slot.kind === 'route') slot.idx = (slot.idx + 1) % plan.city.routes.length;
          else if (slot.kind === 'sight') slot.idx = (slot.idx + 1) % plan.sights.length;
          else slot.idx = (slot.idx + 1) % ACTIVITIES[slot.pool].length;
          renderItinerary();
          persist('result');
          return;
        }

        if (t.dataset.more) { moreOpen = true; renderStep(); var ci = document.getElementById('customCity'); if (ci) ci.focus(); return; }
        if (t.id === 'useCustom') {
          var input = document.getElementById('customCity');
          var name = input ? input.value.trim() : '';
          if (name) { state.city = '__custom__'; state.customCity = name; moreOpen = false; }
          renderStep();
          return;
        }
        if (t.dataset.city) { state.city = t.dataset.city; moreOpen = false; renderStep(); }
        if (t.dataset.group) { state.group = t.dataset.group; renderStep(); }
        if (t.dataset.budget) { state.budget = t.dataset.budget; renderStep(); }
        if (t.dataset.interest) {
          var k = t.dataset.interest, i = state.interests.indexOf(k);
          if (i === -1) state.interests.push(k); else state.interests.splice(i, 1);
          renderStep();
        }
        if (t.dataset.cnt) {
          var delta = Number(t.dataset.d);
          if (t.dataset.cnt === 'days') state.days = Math.max(1, Math.min(7, state.days + delta));
          if (t.dataset.cnt === 'travelers') state.travelers = Math.max(1, Math.min(9, state.travelers + delta));
          renderStep();
        }
        if (t.id === 'back') { history.back(); return; }
        if (t.id === 'restart') { gotoStep(0); return; }
        if (t.id === 'next') {
          var startInput = document.getElementById('start');
          if (startInput) state.start = startInput.value || tomorrowISO();
          // A typed city counts even without pressing "Use this city".
          var customInput = document.getElementById('customCity');
          if (step === 0 && customInput && customInput.value.trim()) {
            state.city = '__custom__';
            state.customCity = customInput.value.trim();
            moreOpen = false;
          }
          if (step === 0 && !state.city) { t.textContent = 'Pick a city first'; return; }
          if (step < STEPS - 1) { gotoStep(step + 1); }
          else { if (!state.start) state.start = tomorrowISO(); showLoading(); }
        }
      });

      /* Resume when this history entry already had a plan on it — coming back
         from the app, or a reload. A fresh visit starts clean. */
      (function boot() {
        var hs = history.state;
        var saved = readSaved();

        if (hs && hs.id && saved && saved.id === hs.id) {
          sessionId = saved.id;
          state = saved.state;
          step = hs.v === 'step' ? hs.step : saved.step;
          if (hs.v === 'result' && saved.plan) {
            plan = saved.plan;
            renderItinerary();
            return;
          }
          renderStep();
          return;
        }

        renderStep();
        persist('step');
        history.replaceState({ v: 'step', step: step, id: sessionId }, '');
      })();
    })();

}
