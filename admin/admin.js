/* Portfolio Admin: edits data/content.json and uploads files by committing to GitHub. */
(function () {
  'use strict';

  /* ================= config & state ================= */
  var CFG = Object.assign({ owner: '', repo: '', branch: 'main', contentPath: 'data/content.json', uploadDir: 'uploads' }, window.ADMIN_CONFIG || {});
  (function detectPages() {
    var host = location.hostname;
    if (/\.github\.io$/i.test(host)) {
      var seg = location.pathname.split('/').filter(Boolean);
      CFG.owner = host.split('.')[0];
      CFG.repo = seg.length > 1 && seg[0] !== 'admin' ? seg[0] : host;
    }
  })();

  var STORE = 'pf-admin-auth';
  var S = {
    owner: '', repo: '', branch: '', token: '',
    content: null,
    fileSha: null,        // blob sha of content.json when loaded
    pending: {},          // path -> base64 (files waiting to be committed)
    previewMap: {},       // path -> dataURL (so new files show before the site redeploys)
    dirty: false,
    tab: 'hero'
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ================= small helpers ================= */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'icon') el.innerHTML = window.icon(v);
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function paintIcons(root) {
    (root || document).querySelectorAll('[data-ic]').forEach(function (el) { el.innerHTML = window.icon(el.getAttribute('data-ic')); });
  }
  function toast(msg, kind, ms) {
    var t = h('div', { class: 'toast ' + (kind || '') }, [msg]);
    $('#toasts').appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, ms || 3500);
    return t;
  }
  function readAsDataURL(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function b64ToText(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  function slug(s) {
    return String(s).toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
  }
  function safeName(s) {
    return String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+/, '') || 'file';
  }
  function assetSrc(p) {
    if (!p) return '';
    if (S.previewMap[p]) return S.previewMap[p];
    if (/^(https?:|data:|blob:)/i.test(p)) return p;
    return '../' + p.replace(/^\/+/, '');
  }

  /* ================= GitHub API ================= */
  function gh(path, opts) {
    opts = opts || {};
    var headers = {
      'Authorization': 'Bearer ' + S.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      if (r.ok) return r.status === 204 ? null : r.json();
      return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error(j.message || ('HTTP ' + r.status));
        e.status = r.status;
        throw e;
      });
    });
  }
  function repoPath() { return '/repos/' + encodeURIComponent(S.owner) + '/' + encodeURIComponent(S.repo); }
  function encPath(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  function friendly(e) {
    if (e.status === 401) return 'Your token is invalid or expired. Sign out and sign in with a new token.';
    if (e.status === 403) return 'GitHub refused this request. Make sure the token has "Contents: Read and write" for this repository. (' + e.message + ')';
    if (e.status === 404) return 'Not found. Check the repository name and branch, and that the token can access this repository.';
    if (e.status === 409 || e.status === 422) return 'The repository changed while you were editing. Download a backup, reload, then import it and publish again. (' + e.message + ')';
    return e.message || String(e);
  }

  function fetchContent() {
    return gh(repoPath() + '/branches/' + encodeURIComponent(S.branch)).then(function (b) {
      return gh(repoPath() + '/contents/' + encPath(CFG.contentPath) + '?ref=' + b.commit.sha);
    }).then(function (f) {
      var text = f.content ? b64ToText(f.content) : null;
      if (text == null) throw new Error('content.json is too large to load through the API.');
      S.fileSha = f.sha;
      S.content = JSON.parse(text);
    });
  }

  function publish() {
    var btn = $('#publishBtn');
    btn.disabled = true;
    var files = Object.keys(S.pending);
    var note = toast('Publishing' + (files.length ? ' and uploading ' + files.length + ' file' + (files.length > 1 ? 's' : '') : '') + '…', 'info', 60000);
    var ref = repoPath() + '/git/ref/heads/' + encodeURIComponent(S.branch);
    var headSha, baseTree;

    gh(ref).then(function (r) {
      headSha = r.object.sha;
      return gh(repoPath() + '/git/commits/' + headSha);
    }).then(function (c) {
      baseTree = c.tree.sha;
      return gh(repoPath() + '/contents/' + encPath(CFG.contentPath) + '?ref=' + headSha).catch(function () { return null; });
    }).then(function (cur) {
      if (cur && S.fileSha && cur.sha !== S.fileSha) {
        if (!confirm('content.json was changed on GitHub after you opened the admin (maybe from another device). Publish anyway and overwrite those changes?')) {
          throw Object.assign(new Error('Publish cancelled.'), { cancelled: true });
        }
      }
      var blobs = files.map(function (p) {
        return gh(repoPath() + '/git/blobs', { method: 'POST', body: { content: S.pending[p], encoding: 'base64' } })
          .then(function (b) { return { path: p, mode: '100644', type: 'blob', sha: b.sha }; });
      });
      var json = JSON.stringify(S.content, null, 2) + '\n';
      blobs.push(gh(repoPath() + '/git/blobs', { method: 'POST', body: { content: json, encoding: 'utf-8' } })
        .then(function (b) { S._newSha = b.sha; return { path: CFG.contentPath, mode: '100644', type: 'blob', sha: b.sha }; }));
      return Promise.all(blobs);
    }).then(function (tree) {
      return gh(repoPath() + '/git/trees', { method: 'POST', body: { base_tree: baseTree, tree: tree } });
    }).then(function (t) {
      var msg = 'Update portfolio content via admin' + (files.length ? ' (+' + files.length + ' file' + (files.length > 1 ? 's' : '') + ')' : '');
      return gh(repoPath() + '/git/commits', { method: 'POST', body: { message: msg, tree: t.sha, parents: [headSha] } });
    }).then(function (c) {
      return gh(repoPath() + '/git/refs/heads/' + encodeURIComponent(S.branch), { method: 'PATCH', body: { sha: c.sha } });
    }).then(function () {
      S.pending = {};
      S.fileSha = S._newSha;
      setDirty(false);
      note.remove();
      toast('Published! Your live site updates in about 1–2 minutes.', 'ok', 6000);
    }).catch(function (e) {
      note.remove();
      if (!e.cancelled) toast('Publish failed: ' + friendly(e), 'err', 9000);
      btn.disabled = !S.dirty;
    });
  }

  /* ================= dirty state & preview ================= */
  function setDirty(v) {
    S.dirty = v;
    $('#publishBtn').disabled = !v;
    var lab = $('#stateLabel');
    lab.textContent = v ? 'Unpublished changes' : 'All changes published';
    lab.classList.toggle('warn', v);
  }
  var pvTimer = null;
  function changed() {
    if (!S.dirty) setDirty(true);
    clearTimeout(pvTimer);
    pvTimer = setTimeout(sendPreview, 350);
  }
  window.addEventListener('beforeunload', function (e) {
    if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  function sendPreview() {
    var f = $('#pvFrame');
    if ($('#preview').hidden || !f.contentWindow) return;
    try {
      f.contentWindow.postMessage({ type: 'portfolio-preview', content: S.content, files: S.previewMap }, location.origin);
    } catch (e) { /* ignore */ }
  }

  /* ================= schema ================= */
  var ICON_NAMES = Object.keys(window.ICONS).sort();
  var SECTION_LABELS = { about: 'About', experience: 'Experience', skills: 'Skills', projects: 'Projects', publications: 'Publications / Research', education: 'Education & achievements', leadership: 'Leadership & volunteering', references: 'References', contact: 'Contact' };

  var T = {
    hero: { label: 'Intro', icon: 'user', blocks: [
      { k: 'hero', t: 'group', fields: [
        { k: 'profileImage', t: 'image', l: 'Profile photo', max: 1000, hint: 'Square photos look best.' },
        { k: 'greeting', t: 'text', l: 'Greeting', hint: 'Small line above your name.' },
        { k: 'firstName', t: 'text', l: 'First name', half: true },
        { k: 'lastName', t: 'text', l: 'Last name', half: true, hint: 'Shown in the accent colour.' },
        { k: 'role', t: 'text', l: 'Job title' },
        { k: 'summary', t: 'textarea', l: 'Short summary' },
        { k: 'showStatus', t: 'bool', l: 'Show availability badge' },
        { k: 'status', t: 'text', l: 'Availability text' },
        { k: 'location', t: 'text', l: 'Location' },
        { k: 'cvFile', t: 'file', l: 'CV / Resume (PDF)', accept: 'application/pdf,.pdf' },
        { k: 'cvLabel', t: 'text', l: 'CV button text' },
        { k: 'terminalTitle', t: 'text', l: 'Terminal card title' },
        { k: 'terminalLines', t: 'list', l: 'Terminal card lines', short: true, hint: 'Start a line with $ for a command, ✓ for a green check, = for a summary line. Remove all lines to hide the card.' }
      ] },
      { k: 'socials', t: 'array', l: 'Social links', title: 'label', single: 'link', newItem: { label: '', icon: 'link', url: '' }, fields: [
        { k: 'label', t: 'text', l: 'Label', half: true },
        { k: 'icon', t: 'icon', l: 'Icon', half: true },
        { k: 'url', t: 'url', l: 'URL', hint: 'Use https://… for websites, mailto:you@mail.com for email.' }
      ] }
    ] },
    about: { label: 'About', icon: 'book', blocks: [
      { k: 'about', t: 'group', fields: [
        { k: 'heading', t: 'text', l: 'Heading' },
        { k: 'paragraphs', t: 'list', l: 'Paragraphs' },
        { k: 'stats', t: 'array', l: 'Stats', title: 'label', single: 'stat', newItem: { value: '', label: '' }, fields: [
          { k: 'value', t: 'text', l: 'Value', half: true }, { k: 'label', t: 'text', l: 'Label', half: true }
        ] },
        { k: 'languages', t: 'array', l: 'Languages', title: 'name', single: 'language', newItem: { name: '', level: '' }, fields: [
          { k: 'name', t: 'text', l: 'Language', half: true }, { k: 'level', t: 'text', l: 'Level', half: true }
        ] }
      ] }
    ] },
    experience: { label: 'Experience', icon: 'briefcase', blocks: [
      { k: 'experience', t: 'array', l: 'Jobs', title: 'company', sub: 'role', single: 'job', newItem: { company: '', role: '', period: '', location: '', current: false, bullets: [], tags: [] }, fields: [
        { k: 'company', t: 'text', l: 'Company', half: true }, { k: 'role', t: 'text', l: 'Role', half: true },
        { k: 'period', t: 'text', l: 'Period', half: true, hint: 'e.g. July 2026 – Present' }, { k: 'location', t: 'text', l: 'Location', half: true },
        { k: 'current', t: 'bool', l: 'Current job (highlighted on the timeline)' },
        { k: 'bullets', t: 'list', l: 'What you did' },
        { k: 'tags', t: 'tags', l: 'Tags' }
      ] }
    ] },
    skills: { label: 'Skills', icon: 'wrench', blocks: [
      { k: 'skills', t: 'array', l: 'Skill groups', title: 'title', single: 'group', newItem: { title: '', icon: 'check', items: [] }, fields: [
        { k: 'title', t: 'text', l: 'Group name', half: true }, { k: 'icon', t: 'icon', l: 'Icon', half: true },
        { k: 'items', t: 'tags', l: 'Skills' }
      ] }
    ] },
    projects: { label: 'Projects', icon: 'code', blocks: [
      { k: 'projects', t: 'array', l: 'Projects', title: 'title', sub: 'category', single: 'project', newItem: { title: '', category: '', featured: false, image: '', description: '', tags: [], links: [] }, fields: [
        { k: 'title', t: 'text', l: 'Title' },
        { k: 'category', t: 'text', l: 'Category', hint: 'Creates filter buttons, e.g. Automation, API, Performance, Manual.' },
        { k: 'image', t: 'image', l: 'Screenshot', max: 1600, hint: 'Leave empty to show a placeholder graphic.' },
        { k: 'description', t: 'textarea', l: 'Description' },
        { k: 'tags', t: 'tags', l: 'Tags' },
        { k: 'links', t: 'array', l: 'Links', title: 'label', single: 'link', newItem: { label: '', icon: 'external', url: '' }, fields: [
          { k: 'label', t: 'text', l: 'Label', half: true }, { k: 'icon', t: 'icon', l: 'Icon', half: true },
          { k: 'url', t: 'url', l: 'URL', hint: 'Links with an empty URL are hidden.' }
        ] }
      ] }
    ] },
    publications: { label: 'Research', icon: 'file', blocks: [
      { k: 'publications', t: 'array', l: 'Publications', title: 'title', sub: 'badge', single: 'publication', newItem: { badge: '', title: '', authors: '', venue: '', url: '' }, fields: [
        { k: 'badge', t: 'text', l: 'Badge', hint: 'e.g. IEEE SMC 2025 or Under Review' },
        { k: 'title', t: 'textarea', l: 'Title', rows: 2 },
        { k: 'authors', t: 'text', l: 'Authors' },
        { k: 'venue', t: 'text', l: 'Venue' },
        { k: 'url', t: 'url', l: 'Link' }
      ] }
    ] },
    education: { label: 'Education', icon: 'graduation', blocks: [
      { k: 'education', t: 'array', l: 'Education', title: 'degree', sub: 'institute', single: 'degree', newItem: { degree: '', institute: '', period: '', result: '' }, fields: [
        { k: 'degree', t: 'text', l: 'Degree' }, { k: 'institute', t: 'text', l: 'Institute' },
        { k: 'period', t: 'text', l: 'Period', half: true }, { k: 'result', t: 'text', l: 'Result', half: true }
      ] },
      { k: 'achievements', t: 'array', l: 'Achievements', title: 'title', single: 'achievement', newItem: { icon: 'award', title: '', description: '' }, fields: [
        { k: 'title', t: 'text', l: 'Title', half: true }, { k: 'icon', t: 'icon', l: 'Icon', half: true },
        { k: 'description', t: 'textarea', l: 'Description', rows: 2 }
      ] }
    ] },
    leadership: { label: 'Leadership', icon: 'users', blocks: [
      { k: 'leadership', t: 'array', l: 'Leadership roles', title: 'title', sub: 'period', single: 'role', newItem: { title: '', org: '', period: '', points: [] }, fields: [
        { k: 'title', t: 'text', l: 'Role' }, { k: 'org', t: 'text', l: 'Organization', half: true }, { k: 'period', t: 'text', l: 'Period', half: true },
        { k: 'points', t: 'list', l: 'Highlights' }
      ] },
      { k: 'volunteering', t: 'list', l: 'Volunteering', short: true }
    ] },
    references: { label: 'References', icon: 'users', note: 'This section is hidden by default. Turn it on under Settings → Visible sections.', blocks: [
      { k: 'references', t: 'array', l: 'References', title: 'name', single: 'reference', newItem: { name: '', title: '', org: '', email: '', phone: '' }, fields: [
        { k: 'name', t: 'text', l: 'Name' }, { k: 'title', t: 'text', l: 'Title', half: true }, { k: 'org', t: 'text', l: 'Organization', half: true },
        { k: 'email', t: 'text', l: 'Email', half: true }, { k: 'phone', t: 'text', l: 'Phone (optional)', half: true }
      ] }
    ] },
    contact: { label: 'Contact', icon: 'mail', blocks: [
      { k: 'contact', t: 'group', fields: [
        { k: 'heading', t: 'text', l: 'Heading' },
        { k: 'description', t: 'textarea', l: 'Description' },
        { k: 'email', t: 'text', l: 'Email', half: true }, { k: 'phone', t: 'text', l: 'Phone', half: true },
        { k: 'location', t: 'text', l: 'Address' },
        { k: 'formEndpoint', t: 'url', l: 'Contact form endpoint', hint: 'Free Formspree form URL (formspree.io). Leave empty to open the visitor\'s email app instead.' }
      ] }
    ] },
    site: { label: 'Settings', icon: 'globe', blocks: [
      { k: 'site', t: 'group', fields: [
        { k: 'sections', t: 'group', l: 'Visible sections', fields: Object.keys(SECTION_LABELS).map(function (s) { return { k: s, t: 'bool', l: SECTION_LABELS[s], half: true }; }) },
        { k: 'title', t: 'text', l: 'Browser tab title' },
        { k: 'description', t: 'textarea', l: 'Search engine description', rows: 2 },
        { k: 'logoText', t: 'text', l: 'Logo text', hint: 'Shown in the top-left corner next to a check mark.' },
        { k: 'logoImage', t: 'image', l: 'Logo image (optional)', max: 600, hint: 'Replaces the text logo. Use an image that is readable on both light and dark backgrounds.' },
        { k: 'favicon', t: 'image', l: 'Favicon', max: 256, half: true },
        { k: 'footerText', t: 'text', l: 'Footer text' }
      ] }
    ] }
  };
  var TAB_ORDER = ['hero', 'about', 'experience', 'skills', 'projects', 'publications', 'education', 'leadership', 'references', 'contact', 'site'];

  /* ================= field renderers ================= */
  function fieldWrap(f, control) {
    return h('div', { class: 'f' + (f.half ? ' half' : '') + (f.t === 'bool' ? ' f-bool' : '') }, [
      f.t === 'bool' ? null : h('label', { class: 'f-label', text: f.l }),
      control,
      f.hint ? h('p', { class: 'f-hint', text: f.hint }) : null
    ]);
  }

  function renderField(obj, f) {
    switch (f.t) {
      case 'text':
      case 'url': {
        var inp = h('input', { type: f.t === 'url' ? 'url' : 'text', value: obj[f.k] || '', spellcheck: f.t === 'url' ? 'false' : 'true' });
        inp.addEventListener('input', function () { obj[f.k] = inp.value; changed(); });
        return fieldWrap(f, inp);
      }
      case 'textarea': {
        var ta = h('textarea', { rows: f.rows || 4, value: obj[f.k] || '' });
        ta.addEventListener('input', function () { obj[f.k] = ta.value; changed(); });
        return fieldWrap(f, ta);
      }
      case 'bool': {
        var cb = h('input', { type: 'checkbox', checked: !!obj[f.k] });
        cb.addEventListener('change', function () { obj[f.k] = cb.checked; changed(); });
        return fieldWrap(f, h('label', { class: 'switch' }, [cb, h('span', { class: 'track' }), h('span', { text: f.l })]));
      }
      case 'icon': {
        var prev = h('span', { class: 'icon-prev', icon: obj[f.k] || 'link' });
        var sel = h('select', {}, ICON_NAMES.map(function (n) { return h('option', { value: n, text: n }); }));
        sel.value = obj[f.k] || 'link';
        sel.addEventListener('change', function () { obj[f.k] = sel.value; prev.innerHTML = window.icon(sel.value); changed(); });
        return fieldWrap(f, h('div', { class: 'icon-pick' }, [prev, sel]));
      }
      case 'tags': {
        var tg = h('input', { type: 'text', value: (obj[f.k] || []).join(', ') });
        tg.addEventListener('input', function () {
          obj[f.k] = tg.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          changed();
        });
        return fieldWrap(Object.assign({ hint: 'Separate with commas.' }, f), tg);
      }
      case 'list': {
        if (!Array.isArray(obj[f.k])) obj[f.k] = [];
        return fieldWrap(f, renderList(obj[f.k], f));
      }
      case 'image':
      case 'file':
        return fieldWrap(f, renderMedia(obj, f));
      case 'group': {
        if (!obj[f.k] || typeof obj[f.k] !== 'object') obj[f.k] = {};
        var g = h('div', { class: 'grid' }, f.fields.map(function (sf) { return renderField(obj[f.k], sf); }));
        if (!f.l) return g;
        return h('fieldset', { class: 'group' }, [h('legend', { text: f.l }), g]);
      }
      case 'array': {
        if (!Array.isArray(obj[f.k])) obj[f.k] = [];
        return h('div', { class: 'f' }, [renderArray(obj[f.k], f)]);
      }
    }
    return h('div');
  }

  function moveBtns(arr, i, redraw) {
    return [
      h('button', { type: 'button', class: 'mini', title: 'Move up', disabled: i === 0, icon: 'arrowUp', onclick: function (e) { e.preventDefault(); var x = arr.splice(i, 1)[0]; arr.splice(i - 1, 0, x); changed(); redraw(); } }),
      h('button', { type: 'button', class: 'mini flip', title: 'Move down', disabled: i === arr.length - 1, icon: 'arrowUp', onclick: function (e) { e.preventDefault(); var x = arr.splice(i, 1)[0]; arr.splice(i + 1, 0, x); changed(); redraw(); } })
    ];
  }

  function renderList(arr, f) {
    var box = h('div', { class: 'list' });
    function draw(focusLast) {
      box.innerHTML = '';
      arr.forEach(function (val, i) {
        var input = f.short
          ? h('input', { type: 'text', value: val })
          : h('textarea', { rows: 2, value: val, class: 'auto' });
        input.addEventListener('input', function () { arr[i] = input.value; changed(); autosize(input); });
        box.appendChild(h('div', { class: 'list-row' }, [
          input,
          h('div', { class: 'row-actions' }, moveBtns(arr, i, draw).concat([
            h('button', { type: 'button', class: 'mini danger', title: 'Remove', icon: 'x', onclick: function () { arr.splice(i, 1); changed(); draw(); } })
          ]))
        ]));
        requestAnimationFrame(function () { autosize(input); });
        if (focusLast && i === arr.length - 1) setTimeout(function () { input.focus(); }, 0);
      });
      box.appendChild(h('button', { type: 'button', class: 'add', onclick: function () { arr.push(''); changed(); draw(true); } }, ['+ Add line']));
    }
    draw();
    return box;
  }

  function autosize(el) {
    if (el.tagName !== 'TEXTAREA' || !el.classList.contains('auto')) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 400) + 'px';
  }

  var openItems = new WeakSet();
  function renderArray(arr, f) {
    var box = h('div', { class: 'arr' });
    function title(item) {
      var t = (item[f.title] || '').trim() || 'Untitled ' + (f.single || 'item');
      return t.length > 70 ? t.slice(0, 70) + '…' : t;
    }
    function draw() {
      box.innerHTML = '';
      box.appendChild(h('div', { class: 'arr-head' }, [h('h3', { text: f.l }), h('span', { class: 'count', text: String(arr.length) })]));
      arr.forEach(function (item, i) {
        var tEl = h('span', { class: 'it-title', text: title(item) });
        var sEl = f.sub ? h('span', { class: 'it-sub', text: item[f.sub] || '' }) : null;
        var body = h('div', { class: 'it-body grid' }, f.fields.map(function (sf) { return renderField(item, sf); }));
        body.addEventListener('input', function () { tEl.textContent = title(item); if (sEl) sEl.textContent = item[f.sub] || ''; });
        var det = h('details', { class: 'item', open: openItems.has(item) }, [
          h('summary', {}, [
            h('span', { class: 'chev', icon: 'arrowRight' }),
            h('span', { class: 'it-text' }, [tEl, sEl]),
            h('span', { class: 'row-actions', onclick: function (e) { e.preventDefault(); } }, moveBtns(arr, i, draw).concat([
              h('button', { type: 'button', class: 'mini', title: 'Duplicate', icon: 'file', onclick: function () { var c = clone(item); arr.splice(i + 1, 0, c); openItems.add(c); changed(); draw(); } }),
              h('button', { type: 'button', class: 'mini danger', title: 'Delete', icon: 'x', onclick: function () { if (confirm('Delete "' + title(item) + '"?')) { arr.splice(i, 1); changed(); draw(); } } })
            ]))
          ]),
          body
        ]);
        det.addEventListener('toggle', function () { if (det.open) openItems.add(item); else openItems.delete(item); });
        box.appendChild(det);
      });
      box.appendChild(h('button', { type: 'button', class: 'add', onclick: function () {
        var n = clone(f.newItem || {});
        arr.push(n); openItems.add(n); changed(); draw();
        var last = box.querySelectorAll('details.item');
        last = last[last.length - 1];
        if (last) { last.scrollIntoView({ block: 'center', behavior: 'smooth' }); var fi = last.querySelector('input,textarea'); if (fi) setTimeout(function () { fi.focus({ preventScroll: true }); }, 250); }
      } }, ['+ Add ' + (f.single || 'item')]));
    }
    draw();
    return box;
  }

  /* ---------- images & files ---------- */
  function processImage(file, max) {
    if (/svg|gif|icon/.test(file.type)) return Promise.resolve({ blob: file, ext: (file.name.split('.').pop() || 'img').toLowerCase() });
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, (max || 1600) / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale), hgt = Math.round(img.naturalHeight * scale);
        var c = document.createElement('canvas');
        c.width = w; c.height = hgt;
        c.getContext('2d').drawImage(img, 0, 0, w, hgt);
        c.toBlob(function (b) {
          if (b && b.type === 'image/webp') return res({ blob: b, ext: 'webp' });
          c.toBlob(function (j) { j ? res({ blob: j, ext: 'jpg' }) : rej(new Error('Could not process image')); }, 'image/jpeg', 0.86);
        }, 'image/webp', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('This file is not a readable image.')); };
      img.src = url;
    });
  }

  function renderMedia(obj, f) {
    var isImg = f.t === 'image';
    var wrap = h('div', { class: 'media' });
    var picker = h('input', { type: 'file', accept: isImg ? 'image/*' : (f.accept || '*/*'), hidden: true });
    function draw() {
      var v = obj[f.k] || '';
      wrap.innerHTML = '';
      var thumb;
      if (isImg) {
        thumb = h('div', { class: 'thumb' }, [v ? h('img', { src: assetSrc(v), alt: '' }) : h('span', { icon: 'user' })]);
      } else {
        thumb = h('div', { class: 'thumb file' }, [h('span', { icon: 'file' })]);
      }
      var path = h('input', { type: 'text', value: v, placeholder: isImg ? 'No image' : 'No file', spellcheck: 'false' });
      path.addEventListener('change', function () { obj[f.k] = path.value.trim(); changed(); draw(); });
      wrap.appendChild(thumb);
      wrap.appendChild(h('div', { class: 'media-side' }, [
        path,
        h('div', { class: 'media-btns' }, [
          h('button', { type: 'button', class: 'btn ghost sm', onclick: function () { picker.click(); } }, [isImg ? 'Upload image' : 'Upload file']),
          v && !isImg ? h('a', { class: 'btn ghost sm', href: assetSrc(v), target: '_blank', rel: 'noopener' }, ['Open']) : null,
          v ? h('button', { type: 'button', class: 'btn ghost sm danger', onclick: function () { obj[f.k] = ''; changed(); draw(); } }, ['Remove']) : null
        ]),
        S.pending[v] ? h('p', { class: 'f-hint pending', text: 'New file. It uploads when you press Publish.' }) : null
      ]));
      wrap.appendChild(picker);
    }
    picker.addEventListener('change', function () {
      var file = picker.files && picker.files[0];
      picker.value = '';
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) { toast('That file is larger than 25 MB. Please choose a smaller one.', 'err'); return; }
      var job = isImg
        ? processImage(file, f.max).then(function (r) { return { blob: r.blob, name: slug(file.name) + '-' + Date.now().toString(36) + '.' + r.ext }; })
        : Promise.resolve({ blob: file, name: safeName(file.name) });
      job.then(function (r) {
        if (r.blob.size > 15 * 1024 * 1024) throw new Error('File is still larger than 15 MB after processing.');
        return readAsDataURL(r.blob).then(function (dataUrl) {
          var p = CFG.uploadDir.replace(/\/+$/, '') + '/' + r.name;
          S.pending[p] = dataUrl.split(',')[1];
          S.previewMap[p] = dataUrl;
          obj[f.k] = p;
          changed();
          draw();
          toast((isImg ? 'Image' : 'File') + ' ready (' + Math.round(r.blob.size / 1024) + ' KB). Press Publish to upload it.', 'ok');
        });
      }).catch(function (e) { toast(e.message, 'err', 6000); });
    });
    draw();
    return wrap;
  }

  /* ================= views ================= */
  function renderTabs() {
    var nav = $('#tabs');
    nav.innerHTML = '';
    TAB_ORDER.forEach(function (id) {
      var t = T[id];
      nav.appendChild(h('button', {
        class: 'tab' + (S.tab === id ? ' on' : ''), type: 'button', 'aria-current': S.tab === id ? 'page' : null,
        onclick: function () { S.tab = id; renderTabs(); renderEditor(); $('#editor').scrollTop = 0; window.scrollTo(0, 0); }
      }, [h('span', { icon: t.icon }), h('span', { text: t.label })]));
    });
    var on = nav.querySelector('.on');
    if (on && on.scrollIntoView && window.innerWidth < 760) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function renderEditor() {
    var t = T[S.tab];
    var ed = $('#editor');
    ed.innerHTML = '';
    ed.appendChild(h('div', { class: 'ed-head' }, [h('h2', { text: t.label }), t.note ? h('p', { class: 'note', text: t.note }) : null]));
    t.blocks.forEach(function (b) {
      ed.appendChild(h('div', { class: 'block' + (b.t === 'group' ? ' card' : '') }, [renderField(S.content, b)]));
    });
  }

  function showApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    $('#repoLabel').textContent = S.owner + '/' + S.repo + ' · ' + S.branch;
    paintIcons($('#appView'));
    renderTabs();
    renderEditor();
    setDirty(false);
  }

  function showLogin(msg) {
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    var saved = loadAuth() || {};
    $('#lgRepo').value = saved.owner ? saved.owner + '/' + saved.repo : (CFG.owner && CFG.repo ? CFG.owner + '/' + CFG.repo : '');
    $('#lgBranch').value = saved.branch || CFG.branch || 'main';
    $('#lgErr').textContent = msg || '';
  }

  /* ================= auth persistence ================= */
  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(STORE) || sessionStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  }
  function saveAuth(remember) {
    var v = JSON.stringify({ owner: S.owner, repo: S.repo, branch: S.branch, token: S.token });
    try {
      localStorage.removeItem(STORE); sessionStorage.removeItem(STORE);
      (remember ? localStorage : sessionStorage).setItem(STORE, v);
    } catch (e) { /* storage blocked: stay signed in for this page only */ }
  }
  function clearAuth() {
    try { localStorage.removeItem(STORE); sessionStorage.removeItem(STORE); } catch (e) {}
  }

  function signIn(auth, remember) {
    S.owner = auth.owner; S.repo = auth.repo; S.branch = auth.branch; S.token = auth.token;
    return gh(repoPath()).then(function (r) {
      if (r.permissions && r.permissions.push === false) throw new Error('This token can read the repository but cannot write to it.');
      return fetchContent();
    }).then(function () {
      if (remember != null) saveAuth(remember);
      showApp();
    });
  }

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var parts = $('#lgRepo').value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) { $('#lgErr').textContent = 'Enter the repository as username/repository.'; return; }
    var btn = $('#lgBtn');
    btn.disabled = true; btn.textContent = 'Signing in…'; $('#lgErr').textContent = '';
    signIn({ owner: parts[0], repo: parts[1], branch: $('#lgBranch').value.trim() || 'main', token: $('#lgToken').value.trim() }, $('#lgRemember').checked)
      .catch(function (err) { $('#lgErr').textContent = friendly(err); })
      .then(function () { btn.disabled = false; btn.textContent = 'Sign in'; });
  });

  /* ================= top bar actions ================= */
  $('#publishBtn').addEventListener('click', publish);

  var moreBtn = $('#moreBtn'), moreMenu = $('#moreMenu');
  moreBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    moreMenu.hidden = !moreMenu.hidden;
    moreBtn.setAttribute('aria-expanded', String(!moreMenu.hidden));
  });
  document.addEventListener('click', function () { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); });

  $('#backupBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(S.content, null, 2)], { type: 'application/json' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'content-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
    document.body.appendChild(a); a.click(); a.remove();
  });
  $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then(function (txt) {
      var d = JSON.parse(txt);
      if (!d || typeof d !== 'object' || !d.hero) throw new Error('This does not look like a portfolio content file.');
      S.content = d; renderEditor(); changed();
      toast('Imported. Review it, then press Publish.', 'ok');
    }).catch(function (err) { toast('Import failed: ' + err.message, 'err'); });
  });
  $('#reloadBtn').addEventListener('click', function () {
    if (S.dirty && !confirm('Discard all unpublished changes?')) return;
    fetchContent().then(function () { S.pending = {}; renderEditor(); setDirty(false); sendPreview(); toast('Reloaded from GitHub.', 'ok'); })
      .catch(function (e) { toast(friendly(e), 'err'); });
  });
  $('#logoutBtn').addEventListener('click', function () {
    if (S.dirty && !confirm('You have unpublished changes. Sign out anyway?')) return;
    clearAuth(); S.dirty = false; S.token = ''; S.content = null; S.pending = {};
    $('#lgToken').value = '';
    showLogin();
  });

  /* ---------- preview panel ---------- */
  var frame = $('#pvFrame');
  frame.addEventListener('load', sendPreview);
  function togglePreview(force) {
    var pv = $('#preview');
    var open = typeof force === 'boolean' ? force : pv.hidden;
    pv.hidden = !open;
    $('#layout').classList.toggle('with-preview', open);
    $('#previewBtn').classList.toggle('on', open);
    document.body.classList.toggle('pv-open', open);
    if (open) {
      if (!frame.getAttribute('src')) frame.setAttribute('src', '../index.html?preview=1');
      else sendPreview();
    }
  }
  $('#previewBtn').addEventListener('click', function () { togglePreview(); });
  $('#pvClose').addEventListener('click', function () { togglePreview(false); });
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.seg button').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#preview').classList.toggle('mobile', b.getAttribute('data-w') === 'mobile');
    });
  });

  /* ================= boot ================= */
  paintIcons();
  var saved = loadAuth();
  if (saved && saved.token) {
    var remembered = false;
    try { remembered = !!localStorage.getItem(STORE); } catch (e) {}
    signIn(saved, remembered).catch(function (e) { showLogin(friendly(e)); });
  } else {
    showLogin();
  }
})();
