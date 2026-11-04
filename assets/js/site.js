/* Portfolio renderer: reads data/content.json and fills the page. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var previewFiles = {}; // path -> dataURL (used by the admin live preview)
  var data = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function src(p) {
    if (!p) return '';
    if (previewFiles[p]) return previewFiles[p];
    return p;
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^\s*javascript:/i.test(u)) return '#';
    return u;
  }
  function isExternal(u) { return /^https?:/i.test(u); }
  function linkAttrs(u) {
    return 'href="' + esc(safeUrl(u)) + '"' + (isExternal(u) ? ' target="_blank" rel="noopener"' : '');
  }
  function list(a) { return Array.isArray(a) ? a : []; }
  function filled(a) { return list(a).filter(function (x) { return x && (typeof x === 'string' ? x.trim() : true); }); }

  var SECTION_ORDER = ['about', 'projects', 'experience', 'publications', 'process', 'skills', 'education', 'leadership', 'references', 'contact'];
  var NAV_SKIP = ['leadership', 'references']; // reachable by scrolling; keeps the top bar short
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* number "1.5+", "<5 min", "82.9%" -> animated count-up */
  function countMarkup(value) {
    var m = String(value || '').match(/^(\D*?)(\d+(?:\.\d+)?)(.*)$/);
    if (!m) return esc(value);
    return esc(m[1]) + '<span class="count-up" data-to="' + m[2] + '">' + esc(m[2]) + '</span>' + esc(m[3]);
  }

  function head(num, label, title) {
    return '<div class="sec-head reveal"><span class="sec-num">' + num + ' / ' + esc(label) + '</span><h2>' + esc(title) + '</h2></div>';
  }

  /* ---------- hero ---------- */
  function renderHero(d) {
    var h = d.hero || {};
    var socials = filled(d.socials).filter(function (s) { return s.url; });
    var name = esc(h.firstName) + ' <span class="accent-text">' + esc(h.lastName) + '</span>';
    var html = '';
    if (h.showStatus && h.status) html += '<p class="status"><span class="dot"></span>' + esc(h.status) + '</p>';
    html += '<p class="greet mono">' + esc(h.greeting || '') + '</p>';
    html += '<h1 class="hero-name">' + name + '</h1>';
    html += '<p class="hero-role">' + esc(h.role) + '</p>';
    var focus = filled(h.focusAreas);
    if (focus.length) {
      html += '<p class="hero-focus mono"><span class="sr-only">' + esc((h.focusPrefix || '') + ' ' + focus.join(', ')) + '</span>' +
        '<span aria-hidden="true"><span class="fp">' + esc(h.focusPrefix || '') + '</span> <span class="rotator" data-words="' + esc(JSON.stringify(focus)) + '">' + esc(focus[0]) + '</span><span class="caret"></span></span></p>';
    }
    html += '<p class="hero-summary">' + esc(h.summary) + '</p>';
    html += '<div class="hero-cta">';
    html += '<a class="btn primary" href="#projects">View my work ' + icon('arrowRight') + '</a>';
    if (h.cvFile) html += '<a class="btn ghost" href="' + esc(src(h.cvFile)) + '" target="_blank" rel="noopener" download>' + icon('download') + ' ' + esc(h.cvLabel || 'Download CV') + '</a>';
    html += '</div>';
    if (socials.length) {
      html += '<div class="socials">' + socials.map(function (s) {
        return '<a class="icon-btn" ' + linkAttrs(s.url) + ' aria-label="' + esc(s.label) + '" title="' + esc(s.label) + '">' + icon(s.icon) + '</a>';
      }).join('') + '</div>';
    }
    $('#heroText').innerHTML = html;

    var v = '<div class="inspect"><span class="inspect-tag mono">locator(\'#' + esc(String(h.firstName || 'me').toLowerCase()) + '\') <b>' + icon('check') + 'visible</b></span><i class="hd tl"></i><i class="hd tr"></i><i class="hd bl"></i><i class="hd br"></i><div class="photo-frame">';
    if (h.profileImage) v += '<img src="' + esc(src(h.profileImage)) + '" alt="Photo of ' + esc((h.firstName || '') + ' ' + (h.lastName || '')) + '" width="420" height="420" fetchpriority="high" />';
    else v += '<div class="photo-ph">' + icon('user') + '</div>';
    v += '</div><span class="scanline" aria-hidden="true"></span></div>';
    var lines = filled(h.terminalLines);
    if (lines.length) {
      v += '<div class="terminal" aria-hidden="true"><div class="term-bar"><i></i><i></i><i></i><span>' + esc(h.terminalTitle || 'tests') + '</span></div><pre>';
      v += lines.map(function (l) {
        var cls = l.charAt(0) === '$' ? 'cmd' : (l.charAt(0) === '✓' ? 'ok' : (l.charAt(0) === '=' ? 'sum' : ''));
        return '<span class="' + cls + '">' + esc(l) + '</span>';
      }).join('\n');
      v += '</pre></div>';
    }
    if (h.location) v += '<p class="hero-loc">' + icon('pin') + esc(h.location) + '</p>';
    $('#heroVisual').innerHTML = v;

    /* QA snapshot strip: key numbers + toolchain */
    var stats = filled((d.about || {}).stats), tools = filled(h.tools);
    var s = '';
    if (stats.length || tools.length) {
      s += '<div class="snap-head mono"><span>' + icon('activity') + 'qa-snapshot</span><span class="pass">' + icon('check') + 'all checks passed</span></div>';
      if (stats.length) {
        s += '<div class="snap-grid">' + stats.map(function (st) {
          return '<div class="snap-cell"><b>' + countMarkup(st.value) + '</b><span>' + esc(st.label) + '</span></div>';
        }).join('') + '</div>';
      }
      if (tools.length) {
        s += '<div class="snap-tools mono"><span class="muted">stack:</span>' + tools.map(function (t) { return '<span class="tool">' + esc(t) + '</span>'; }).join('') + '</div>';
      }
    }
    var snap = $('#snapshot');
    snap.innerHTML = s;
    snap.hidden = !s;
  }

  /* ---------- sections ---------- */
  var R = {};

  R.about = function (d, n) {
    var a = d.about || {};
    var focus = filled((d.hero || {}).focusAreas);
    var langs = filled(a.languages);
    var html = '<div class="wrap">' + head(n, 'About', a.heading || 'About me');
    html += '<div class="about-grid"><div class="prose reveal">' + filled(a.paragraphs).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>';
    if (focus.length || langs.length) {
      html += '<aside class="card focus-card reveal">';
      if (focus.length) {
        html += '<p class="focus-title mono">what I test</p><ul class="checklist">' + focus.map(function (f, i) {
          return '<li style="--i:' + i + '"><span class="tick">' + icon('check') + '</span>' + esc(f.charAt(0).toUpperCase() + f.slice(1)) + '</li>';
        }).join('') + '</ul>';
      }
      if (langs.length) {
        html += '<div class="langs">' + icon('languages') + langs.map(function (l) { return '<span><b>' + esc(l.name) + '</b> ' + esc(l.level) + '</span>'; }).join('') + '</div>';
      }
      html += '</aside>';
    }
    return html + '</div></div>';
  };

  R.experience = function (d, n) {
    var items = filled(d.experience);
    var html = '<div class="wrap">' + head(n, 'Experience', 'Where I have worked') + '<ol class="timeline">';
    html += items.map(function (e) {
      return '<li class="tl-item reveal' + (e.current ? ' current' : '') + '"><div class="tl-dot"></div><div class="card tl-card">' +
        '<div class="tl-top"><div><h3>' + esc(e.role) + '</h3><p class="tl-co">' + esc(e.company) + (e.location ? ' <span class="muted">· ' + esc(e.location) + '</span>' : '') + '</p></div>' +
        '<span class="pill' + (e.current ? ' live' : '') + '">' + esc(e.period) + '</span></div>' +
        '<ul class="bullets">' + filled(e.bullets).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
        (filled(e.tags).length ? '<div class="tags">' + filled(e.tags).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        '</div></li>';
    }).join('');
    return html + '</ol></div>';
  };

  R.skills = function (d, n) {
    var groups = filled(d.skills);
    var html = '<div class="wrap">' + head(n, 'Skills', 'Test stack') + '<div class="skills-grid">';
    html += groups.map(function (g) {
      return '<div class="card skill-card reveal"><div class="skill-head"><span class="ic-box">' + icon(g.icon || 'check') + '</span><h3>' + esc(g.title) + '</h3></div>' +
        '<ul class="chips">' + filled(g.items).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    return html + '</div></div>';
  };

  R.projects = function (d, n) {
    var items = filled(d.projects);
    var cats = [];
    items.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
    var html = '<div class="wrap">' + head(n, 'Projects', 'Proof of work');
    if (cats.length > 1) {
      html += '<div class="filters reveal" role="tablist" aria-label="Filter projects"><button class="chip-btn active" data-filter="*" role="tab" aria-selected="true">All</button>' +
        cats.map(function (c) { return '<button class="chip-btn" data-filter="' + esc(c) + '" role="tab" aria-selected="false">' + esc(c) + '</button>'; }).join('') + '</div>';
    }
    html += '<div class="projects-grid">';
    html += items.map(function (p, i) {
      var links = filled(p.links).filter(function (l) { return l.url; });
      var metrics = filled(p.metrics).filter(function (m) { return m.value; });
      var id = 'PRJ-' + (i < 9 ? '0' : '') + (i + 1);
      var media = p.image
        ? '<img src="' + esc(src(p.image)) + '" alt="" loading="lazy" />'
        : '<div class="proj-ph">' + icon(p.category === 'API' ? 'database' : p.category === 'Performance' ? 'activity' : p.category === 'Manual' ? 'bug' : 'terminal') + '<span>' + esc(p.category || 'Project') + '</span></div>';
      return '<article class="card proj reveal" data-cat="' + esc(p.category || '') + '">' +
        '<div class="proj-media">' + media + (p.category ? '<span class="proj-cat">' + esc(p.category) + '</span>' : '') + '</div>' +
        '<div class="proj-body"><p class="proj-id mono">' + id + '<span class="ok">' + icon('check') + 'verified</span></p><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p>' +
        (metrics.length ? '<div class="proj-metrics">' + metrics.map(function (m) { return '<div><b>' + countMarkup(m.value) + '</b><span>' + esc(m.label) + '</span></div>'; }).join('') + '</div>' : '') +
        (filled(p.tags).length ? '<div class="tags">' + filled(p.tags).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        (links.length ? '<div class="proj-links">' + links.map(function (l) { return '<a ' + linkAttrs(l.url) + '>' + icon(l.icon || 'external') + esc(l.label) + '</a>'; }).join('') + '</div>' : '') +
        '</div></article>';
    }).join('');
    return html + '</div></div>';
  };

  R.publications = function (d, n) {
    var items = filled(d.publications);
    var html = '<div class="wrap">' + head(n, 'Research', 'Publications') + '<div class="pubs">';
    html += items.map(function (p) {
      return '<article class="card pub reveal"><span class="pill">' + esc(p.badge) + '</span><h3>' + esc(p.title) + '</h3>' +
        '<p class="muted">' + esc(p.authors) + '</p><p class="venue">' + esc(p.venue) + '</p>' +
        (p.url ? '<a class="text-link" ' + linkAttrs(p.url) + '>Read paper ' + icon('external') + '</a>' : '') + '</article>';
    }).join('');
    return html + '</div></div>';
  };

  R.process = function (d, n) {
    var steps = filled(d.process);
    var html = '<div class="wrap">' + head(n, 'Process', 'How I test') + '<ol class="pipeline reveal" style="--steps:' + steps.length + '">';
    html += steps.map(function (s, i) {
      return '<li class="stage" style="--i:' + i + '"><div class="stage-top"><span class="stage-ic">' + icon(s.icon || 'check') + '</span><span class="stage-n mono">' + (i < 9 ? '0' : '') + (i + 1) + '</span></div>' +
        '<h3>' + esc(s.title) + '</h3><p>' + esc(s.description) + '</p></li>';
    }).join('');
    return html + '</ol></div>';
  };

  R.education = function (d, n) {
    var ed = filled(d.education), ach = filled(d.achievements);
    var html = '<div class="wrap">' + head(n, 'Education', 'Education & achievements') + '<div class="edu-grid"><div class="edu-list">';
    html += ed.map(function (e) {
      return '<div class="card edu reveal"><span class="ic-box">' + icon('graduation') + '</span><div><h3>' + esc(e.degree) + '</h3><p>' + esc(e.institute) + '</p>' +
        '<div class="edu-meta"><span class="pill">' + esc(e.period) + '</span>' + (e.result ? '<span class="pill live">' + esc(e.result) + '</span>' : '') + '</div></div></div>';
    }).join('');
    html += '</div><div class="ach-list">';
    html += ach.map(function (a) {
      return '<div class="ach reveal"><span class="ic-box">' + icon(a.icon || 'award') + '</span><div><h4>' + esc(a.title) + '</h4><p>' + esc(a.description) + '</p></div></div>';
    }).join('');
    return html + '</div></div></div>';
  };

  R.leadership = function (d, n) {
    var items = filled(d.leadership), vol = filled(d.volunteering);
    var html = '<div class="wrap">' + head(n, 'Leadership', 'Leadership & community') + '<div class="lead-grid">';
    html += items.map(function (l) {
      return '<div class="card lead-card reveal"><span class="pill">' + esc(l.period) + '</span><h3>' + esc(l.title) + '</h3><p class="muted">' + esc(l.org) + '</p>' +
        '<ul class="bullets">' + filled(l.points).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    html += '</div>';
    if (vol.length) {
      html += '<div class="vol reveal"><h3>' + icon('heart') + 'Volunteering</h3><ul>' + vol.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul></div>';
    }
    return html + '</div>';
  };

  R.references = function (d, n) {
    var items = filled(d.references);
    var html = '<div class="wrap">' + head(n, 'References', 'References') + '<div class="ref-grid">';
    html += items.map(function (r) {
      return '<div class="card ref reveal"><h3>' + esc(r.name) + '</h3><p>' + esc(r.title) + '</p><p class="muted">' + esc(r.org) + '</p>' +
        (r.email ? '<a class="text-link" href="mailto:' + esc(r.email) + '">' + icon('mail') + esc(r.email) + '</a>' : '') +
        (r.phone ? '<a class="text-link" href="tel:' + esc(r.phone.replace(/[^+\d]/g, '')) + '">' + icon('phone') + esc(r.phone) + '</a>' : '') + '</div>';
    }).join('');
    return html + '</div></div>';
  };

  function renderContact(d, n) {
    var c = d.contact || {};
    $('#contactNum').textContent = n + ' / Contact';
    $('#contactHeading').textContent = c.heading || 'Get in touch';
    $('#contactDesc').textContent = c.description || '';
    var rows = [];
    if (c.email) rows.push(['mail', 'Email', c.email, 'mailto:' + c.email]);
    if (c.phone) rows.push(['phone', 'Phone', c.phone, 'tel:' + c.phone.replace(/[^+\d]/g, '')]);
    if (c.location) rows.push(['pin', 'Location', c.location, '']);
    $('#contactList').innerHTML = rows.map(function (r) {
      var val = r[3] ? '<a href="' + esc(r[3]) + '">' + esc(r[2]) + '</a>' : esc(r[2]);
      return '<li><span class="ic-box">' + icon(r[0]) + '</span><div><small>' + r[1] + '</small>' + val + '</div></li>';
    }).join('');
    $('#contactSocials').innerHTML = filled(d.socials).filter(function (s) { return s.url; }).map(function (s) {
      return '<a class="icon-btn" ' + linkAttrs(s.url) + ' aria-label="' + esc(s.label) + '" title="' + esc(s.label) + '">' + icon(s.icon) + '</a>';
    }).join('');
  }

  /* ---------- page ---------- */
  function render(d) {
    data = d;
    var site = d.site || {};
    var vis = site.sections || {};
    if (site.title) document.title = site.title;
    var md = document.querySelector('meta[name="description"]');
    if (md && site.description) md.setAttribute('content', site.description);
    if (site.favicon) $('#favicon').setAttribute('href', src(site.favicon));
    $('#brand').innerHTML = site.logoImage
      ? '<img src="' + esc(src(site.logoImage)) + '" alt="' + esc(site.logoText || 'Home') + '" />'
      : '<span class="brand-mark">' + icon('check') + '</span><span class="brand-text">' + esc(site.logoText || '') + '</span>';
    $('#footerText').textContent = '© ' + new Date().getFullYear() + ' ' + ((d.hero && (d.hero.firstName + ' ' + d.hero.lastName)) || '') + '. ' + (site.footerText || '');

    renderHero(d);

    var nav = [];
    var num = 0;
    SECTION_ORDER.forEach(function (key) {
      var el = document.getElementById(key);
      if (!el) return;
      var on = vis[key] !== false;
      el.hidden = !on;
      if (!on) return;
      num++;
      var n = (num < 10 ? '0' : '') + num;
      if (key === 'contact') renderContact(d, n);
      else el.innerHTML = R[key](d, n);
      if (NAV_SKIP.indexOf(key) < 0) nav.push('<a href="#' + key + '">' + esc(el.getAttribute('data-label')) + '</a>');
    });
    $('#navLinks').innerHTML = nav.join('');

    bindProjects();
    reveal();
    spy();
    countUps();
    rotate();
  }

  /* ---------- dynamic touches ---------- */
  var countObs = null;
  function runCount(el) {
    var to = parseFloat(el.getAttribute('data-to'));
    var dec = (el.getAttribute('data-to').split('.')[1] || '').length;
    var start = null, dur = 1200;
    function step(t) {
      if (start === null) start = t;
      var k = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * eased).toFixed(dec);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function countUps() {
    var els = document.querySelectorAll('.count-up:not(.counted)');
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    if (!countObs) {
      countObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add('counted');
          countObs.unobserve(en.target);
          runCount(en.target);
        });
      }, { threshold: 0.6 });
    }
    els.forEach(function (e) {
      e.textContent = (0).toFixed((e.getAttribute('data-to').split('.')[1] || '').length);
      countObs.observe(e);
    });
  }

  var rotTimer = null;
  function rotate() {
    clearTimeout(rotTimer);
    var el = document.querySelector('.rotator');
    if (!el || reduceMotion) return;
    var words;
    try { words = JSON.parse(el.getAttribute('data-words')); } catch (e) { return; }
    if (!words || words.length < 2) return;
    var w = 0, c = words[0].length, deleting = false;
    function tick() {
      var word = words[w];
      if (!deleting) {
        c++;
        el.textContent = word.slice(0, c);
        if (c >= word.length) { deleting = true; rotTimer = setTimeout(tick, 1800); return; }
        rotTimer = setTimeout(tick, 55);
      } else {
        c--;
        el.textContent = word.slice(0, c);
        if (c <= 0) { deleting = false; w = (w + 1) % words.length; rotTimer = setTimeout(tick, 250); return; }
        rotTimer = setTimeout(tick, 28);
      }
    }
    rotTimer = setTimeout(tick, 1800);
  }

  function bindProjects() {
    var wrap = document.getElementById('projects');
    if (!wrap) return;
    wrap.querySelectorAll('.chip-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter');
        wrap.querySelectorAll('.chip-btn').forEach(function (x) {
          x.classList.toggle('active', x === b);
          x.setAttribute('aria-selected', x === b ? 'true' : 'false');
        });
        wrap.querySelectorAll('.proj').forEach(function (p) {
          p.hidden = !(f === '*' || p.getAttribute('data-cat') === f);
        });
      });
    });
  }

  var revealObs = null;
  function reveal() {
    var els = document.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(function (e) { e.classList.add('in'); });
      return;
    }
    if (!revealObs) {
      revealObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); revealObs.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    }
    els.forEach(function (e) { revealObs.observe(e); });
  }

  var spyObs = null;
  function spy() {
    if (!('IntersectionObserver' in window)) return;
    if (spyObs) spyObs.disconnect();
    spyObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        document.querySelectorAll('#navLinks a').forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main > section').forEach(function (s) { spyObs.observe(s); });
  }

  /* ---------- chrome: theme, menu, nav shadow ---------- */
  function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function paintThemeBtn() {
    $('#themeBtn').innerHTML = icon(currentTheme() === 'dark' ? 'sun' : 'moon');
  }
  $('#themeBtn').addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    paintThemeBtn();
  });
  paintThemeBtn();

  var menuBtn = $('#menuBtn');
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menuBtn.innerHTML = icon(open ? 'x' : 'menu');
  }
  setMenu(false);
  menuBtn.addEventListener('click', function () { setMenu(!document.body.classList.contains('menu-open')); });
  $('#navLinks').addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  $('#toTop').innerHTML = icon('arrowUp');
  var bar = $('#progressBar');
  function onScroll() {
    $('#nav').classList.toggle('scrolled', window.scrollY > 10);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- contact form ---------- */
  $('#contactForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, st = $('#cfStatus'), btn = $('#cfSubmit');
    if (!f.checkValidity()) { st.textContent = 'Please fill in your name, a valid email and a message.'; st.className = 'form-status err'; return; }
    var c = (data && data.contact) || {};
    var name = f.name.value.trim(), email = f.email.value.trim(), msg = f.message.value.trim();
    if (!c.formEndpoint) {
      window.location.href = 'mailto:' + (c.email || '') + '?subject=' + encodeURIComponent('Portfolio message from ' + name) + '&body=' + encodeURIComponent(msg + '\n\n— ' + name + ' (' + email + ')');
      return;
    }
    btn.disabled = true; st.textContent = 'Sending…'; st.className = 'form-status';
    fetch(c.formEndpoint, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new FormData(f)
    }).then(function (r) {
      if (!r.ok) throw new Error('bad status');
      f.reset(); st.textContent = 'Thanks! Your message was sent. I will reply soon.'; st.className = 'form-status ok';
    }).catch(function () {
      st.innerHTML = 'Could not send right now. Please email me at <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>.'; st.className = 'form-status err';
    }).then(function () { btn.disabled = false; });
  });

  /* ---------- load ---------- */
  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin) return;
    var m = e.data;
    if (m && m.type === 'portfolio-preview' && m.content) {
      previewFiles = m.files || {};
      render(m.content);
    }
  });

  fetch('data/content.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { if (!data) render(d); })
    .catch(function (err) {
      $('#heroText').innerHTML = '<h1 class="hero-name">Content failed to load</h1><p class="hero-summary">Could not read data/content.json (' + esc(err.message) + '). If you opened index.html directly from your computer, run a local server instead (see README).</p>';
    });
})();
