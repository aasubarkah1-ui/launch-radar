// Token Radar's dashboard: reads window.RADAR (written beside dashboard/ as data.js by main.ts) and
// renders the board, the filters, a live-token tab and a per-protocol detail view with the model's
// own factors and the protocol's farm plan. No network, no framework: every byte it shows is in
// data.js, and every number is the board's own.
(function () {
  'use strict';

  var D = window.RADAR;
  var app = document.getElementById('app');
  if (!D || !app) {
    if (app) app.textContent = 'Token Radar: data.js is missing or empty.';
    return;
  }

  var S = { tab: 'board', q: '', cat: 'all', chain: 'all', risk: 'all', sort: 'implied', dir: -1, below: true, sel: null };

  // ── formatting ────────────────────────────────────────────────────────────
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 60) return Math.round(days / 30) + 'mo';
    return Math.round(days) + 'd';
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function riskLabel(r) { return r === 'low' ? 'LOW RISK' : r === 'medium' ? 'MID RISK' : 'HIGH RISK'; }

  // ── shell ─────────────────────────────────────────────────────────────────
  var head = el('header', 'head');
  var brand = el('div', 'brand');
  var mark = el('div', 'mark');
  var titles = el('div');
  var word = el('div', 'wordmark');
  word.innerHTML = 'TOKEN <span>RADAR</span>';
  titles.append(word, el('div', 'sub', 'Protocols with no token yet, ranked by what their launch could be worth.'));
  brand.append(mark, titles);
  var headMeta = el('div', 'head-meta');
  var snapCell = el('div', null, 'SNAPSHOT');
  snapCell.append(el('b', null, D.as_of));
  var modelCell = el('div', null, 'MODEL');
  modelCell.append(el('b', null, D.model_version.toUpperCase()));
  var floorCell = el('div', null, 'FLOOR');
  floorCell.append(el('b', null, fmtUsd(D.floor_usd) + ' TVL'));
  headMeta.append(snapCell, modelCell, floorCell);
  head.append(brand, headMeta);

  var stats = el('section', 'stats');
  function stat(k, v, unit, cls) {
    var b = el('div', 'stat' + (cls ? ' ' + cls : ''));
    b.append(el('div', 'k', k));
    var val = el('div', 'v', v);
    if (unit) val.append(el('small', null, unit));
    b.append(val);
    return b;
  }
  var statWatch = stat('ON THE WATCHLIST', D.watchlist_size, 'no token yet');
  var statBoard = stat('BOARD ROWS', D.board_size, 'watchlist + early', 'value');
  var statEarly = stat('EARLY FINDS', D.early_size, 'below the floor');
  var statLive = stat('ALREADY TRADING', D.live_size, 'set aside');
  var statTop = stat('TOP IMPLIED VALUE', fmtUsd(D.rows.length ? D.rows[0].implied_value_usd : 0), '', 'value');
  stats.append(statWatch, statBoard, statEarly, statLive, statTop);

  var bar = el('section', 'toolbar');
  var tabs = el('div', 'tabs');
  var tabBoard = el('button', 'tab on', 'PRE-TOKEN BOARD');
  var tabLive = el('button', 'tab', 'ALREADY TRADING');
  tabBoard.type = 'button'; tabLive.type = 'button';
  tabs.append(tabBoard, tabLive);

  var searchWrap = el('div', 'search');
  var search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search a protocol or a slug…';
  search.setAttribute('aria-label', 'Search a protocol');
  searchWrap.append(search);

  function field(label, options, value) {
    var l = el('label', 'field', label);
    var sel = document.createElement('select');
    options.forEach(function (o) {
      var opt = el('option', null, o.label);
      opt.value = o.value;
      if (o.value === value) opt.selected = true;
      sel.append(opt);
    });
    l.append(sel);
    return { label: l, select: sel };
  }

  var cats = ['all'].concat(Object.keys(D.category_multiple).sort(), ['(none)']);
  var catField = field('CATEGORY', cats.map(function (c) { return { value: c, label: c === 'all' ? 'All categories' : c }; }), 'all');
  var chainSet = {};
  D.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainSet[c] = (chainSet[c] || 0) + 1; }); });
  var chainList = Object.keys(chainSet).sort(function (a, b) { return chainSet[b] - chainSet[a]; }).slice(0, 40);
  var chainField = field('CHAIN', [{ value: 'all', label: 'All chains' }].concat(chainList.map(function (c) { return { value: c, label: c }; })), 'all');
  var riskField = field('RISK', [
    { value: 'all', label: 'Any risk' }, { value: 'low', label: 'Low only' },
    { value: 'medium', label: 'Medium and up' }, { value: 'high', label: 'High only' }
  ], 'all');

  var belowLabel = el('label', 'toggle');
  var below = document.createElement('input');
  below.type = 'checkbox'; below.checked = true;
  belowLabel.append(below, el('span', null, 'Include below-floor rows'));

  var countLine = el('div', 'count');
  bar.append(tabs, searchWrap, catField.label, chainField.label, riskField.label, belowLabel, countLine);

  var main = el('div', 'main');
  var boardWrap = el('div', 'board-wrap');
  var table = el('table');
  var thead = el('thead');
  var headRow = el('tr');
  var columns = [
    { key: 'rank', label: '#', num: false },
    { key: 'name', label: 'PROTOCOL', num: false },
    { key: 'category', label: 'CATEGORY', num: false },
    { key: 'chains', label: 'CHAINS', num: false },
    { key: 'tvl', label: 'TVL', num: true },
    { key: 'growth', label: '7D', num: true },
    { key: 'implied', label: 'IMPLIED VALUE', num: true },
    { key: 'risk', label: 'RISK', num: false }
  ];
  columns.forEach(function (c) {
    var th = el('th', c.num ? 'num' : '', c.label);
    th.dataset.sort = c.key;
    if (c.key === 'implied') th.classList.add('on');
    headRow.append(th);
  });
  thead.append(headRow);
  var tbody = el('tbody');
  table.append(thead, tbody);
  boardWrap.append(table);
  var drawer = el('aside', 'drawer');
  main.append(boardWrap, drawer);

  var foot = el('footer', 'foot');
  var footL = el('div');
  footL.innerHTML = 'IMPLIED = TVL × category multiple × growth × launch premium × depth — every factor shown on every row.';
  var footR = el('div', 'right', D.source + ' · ' + D.board_size + ' rows · model ' + D.model_version);
  foot.append(footL, footR);

  app.append(head, stats, bar, main, foot);

  // ── filtering and sorting ─────────────────────────────────────────────────
  function rowsFor() {
    var q = S.q.trim().toLowerCase();
    var list = D.rows.filter(function (r) {
      if (!S.below && r.below_floor) return false;
      if (S.cat !== 'all') { if (S.cat === '(none)' ? r.category !== null : r.category !== S.cat) return false; }
      if (S.chain !== 'all' && (r.chains || []).indexOf(S.chain) < 0) return false;
      if (S.risk === 'low' && r.risk !== 'low') return false;
      if (S.risk === 'medium' && r.risk === 'low') return false;
      if (S.risk === 'high' && r.risk !== 'high') return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = S.sort;
    list.sort(function (a, b) {
      var x, y;
      if (key === 'name') { x = a.name.toLowerCase(); y = b.name.toLowerCase(); }
      else if (key === 'category') { x = (a.category || '').toLowerCase(); y = (b.category || '').toLowerCase(); }
      else if (key === 'tvl') { x = a.tvl_usd; y = b.tvl_usd; }
      else if (key === 'growth') { x = a.change_7d === null ? -999 : a.change_7d; y = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { x = a.age_days === null ? 1e9 : a.age_days; y = b.age_days === null ? 1e9 : b.age_days; }
      else if (key === 'risk') { x = a.risk; y = b.risk; }
      else if (key === 'rank') { x = a.rank; y = b.rank; }
      else { x = a.implied_value_usd; y = b.implied_value_usd; }
      if (x < y) return -S.dir;
      if (x > y) return S.dir;
      return a.rank - b.rank;
    });
    return list;
  }

  function renderBoard() {
    var list = rowsFor();
    var max = D.rows.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    tbody.textContent = '';
    list.forEach(function (r) {
      var tr = el('tr');
      if (S.sel && S.sel.slug === r.slug) tr.className = 'sel';
      tr.dataset.slug = r.slug;
      tr.append(el('td', 'rank', r.rank));

      var nameTd = el('td');
      var nameBox = el('div', 'name');
      nameBox.append(el('b', null, r.name), el('span', null, r.slug + (r.below_floor ? ' · below floor' : '')));
      nameTd.append(nameBox);
      tr.append(nameTd);

      var catTd = el('td');
      catTd.append(el('span', 'chip', r.category || 'unclassified'));
      tr.append(catTd);

      var chains = r.chains || [];
      tr.append(el('td', 'chains', chains.length ? chains.slice(0, 2).join(', ') + (chains.length > 2 ? ' +' + (chains.length - 2) : '') : '—'));

      tr.append(el('td', 'num', fmtUsd(r.tvl_usd)));

      var g = el('td', 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), fmtPct(r.change_7d));
      tr.append(g);

      var vTd = el('td', 'num');
      vTd.append(el('div', 'val', fmtUsd(r.implied_value_usd)));
      var barEl = el('div', 'bar');
      var inner = el('i');
      inner.style.width = Math.max(4, Math.round((r.implied_value_usd / max) * 100)) + '%';
      barEl.append(inner);
      vTd.append(barEl);
      tr.append(vTd);

      var riskTd = el('td');
      var riskBox = el('span', 'risk');
      riskBox.append(el('i', 'dot ' + r.risk), el('span', null, riskLabel(r.risk)));
      riskTd.append(riskBox);
      tr.append(riskTd);

      tbody.append(tr);
    });
    countLine.textContent = list.length + ' of ' + D.rows.length + ' rows';
  }

  function renderLive() {
    var max = D.live.reduce(function (m, r) { return Math.max(m, r.tvl_usd); }, 1);
    tbody.textContent = '';
    D.live.forEach(function (r) {
      var tr = el('tr');
      var nameTd = el('td');
      var box = el('div', 'name');
      box.append(el('b', null, r.name), el('span', null, r.slug));
      nameTd.append(box);
      tr.append(nameTd);
      var catTd = el('td'); catTd.append(el('span', 'chip', r.category || 'unclassified')); tr.append(catTd);
      tr.append(el('td', 'chains', (r.chains || []).slice(0, 2).join(', ') || '—'));
      tr.append(el('td', 'num', fmtUsd(r.tvl_usd)));
      var ratio = el('td', 'num', r.mcap_to_tvl === null ? 'n/a' : r.mcap_to_tvl.toFixed(2) + '×');
      tr.append(ratio);
      tr.append(el('td', 'num', fmtUsd(r.mcap_usd)));
      tr.append(el('td', 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), fmtPct(r.change_7d)));
      tbody.append(tr);
    });
    countLine.textContent = D.live.length + ' protocols whose token already trades';
  }

  // ── detail view ───────────────────────────────────────────────────────────
  function splitStep(text) {
    var body = text;
    var cost = '';
    var time = '';
    var at = body.lastIndexOf(' Cost: ');
    if (at >= 0) { cost = body.slice(at + 7); body = body.slice(0, at); }
    var tAt = cost.lastIndexOf('. Time: ');
    if (tAt >= 0) { time = cost.slice(tAt + 8); cost = cost.slice(0, tAt); }
    if (time.slice(-1) === '.') time = time.slice(0, -1);
    return { body: body, cost: cost.replace(/\.$/, ''), time: time };
  }

  function renderDrawer() {
    drawer.textContent = '';
    if (S.tab === 'live') {
      drawer.append(el('div', 'empty', 'This tab lists protocols whose token already trades, with the market\'s own numbers: market cap, TVL and the market-cap-to-TVL ratio. They are kept apart from the board because their value is quoted, not implied — the radar\'s rankings never mix the two.'));
      return;
    }
    var row = S.sel;
    if (!row) {
      var intro = el('div', 'empty');
      intro.textContent = 'Pick a protocol on the left. Its detail view shows the four factors behind its implied value — the category multiple, the seven-day growth, the launch premium for its age and the depth factor for its size — then the farm plan the board carries for it: each step with what it costs and how long it takes.';
      drawer.append(intro);
      return;
    }
    var focusBtn = el('button', 'focus-btn', document.querySelector('.main').classList.contains('focus') ? 'CLOSE FOCUS' : 'FOCUS');
    focusBtn.type = 'button';
    focusBtn.addEventListener('click', function () {
      var mainEl = document.querySelector('.main');
      mainEl.classList.toggle('focus');
      renderDrawer();
    });
    drawer.append(focusBtn);

    var wrap = el('div', 'd-wrap');
    var left = el('div', 'd-left');
    var right = el('div', 'd-right');
    wrap.append(left, right);
    drawer.append(wrap);

    left.append(el('h2', null, row.name));
    left.append(el('div', 'slug', row.slug + ' · ' + (row.category || 'unclassified') + ' · ' + ((row.chains || [])[0] || 'chain unknown')));

    var why = el('div', 'why');
    why.textContent = '#' + row.rank + ' of ' + D.board_size + ': ' + fmtUsd(row.tvl_usd) + ' TVL × ' +
      (row.base_usd / Math.max(row.tvl_usd, 1)).toFixed(2) + ' category × ' + row.growth_multiplier.toFixed(2) +
      ' growth × ' + row.premium_multiplier.toFixed(2) + ' premium × ' + row.size_multiplier.toFixed(2) + ' depth';
    left.append(why);

    var big = el('div', 'big');
    big.append(el('div', 'k', 'IMPLIED LAUNCH VALUE'));
    big.append(el('div', 'v', fmtUsd(row.implied_value_usd)));
    left.append(big);

    var bd = el('div', 'breakdown');
    [['TVL', fmtUsd(row.tvl_usd)], ['BASE', fmtUsd(row.base_usd)],
     ['GROW', '×' + row.growth_multiplier.toFixed(2)], ['PREM', '×' + row.premium_multiplier.toFixed(2)],
     ['DEPTH', '×' + row.size_multiplier.toFixed(2)], ['AGE', fmtAge(row.age_days)],
     ['7D', fmtPct(row.change_7d)], ['CONF', row.confidence + '%']
    ].forEach(function (pair) {
      var cell = el('div');
      cell.append(el('div', 'k', pair[0]), el('div', 'v', pair[1]));
      bd.append(cell);
    });
    left.append(bd);

    var meta = el('div', 'meta');
    [['LISTED', row.listed_at || 'unknown'], ['RISK', riskLabel(row.risk)],
     ['BELOW FLOOR', row.below_floor ? 'yes — an early find' : 'no — on the watchlist'],
     ['RANK', '#' + row.rank + ' of ' + D.board_size]
    ].forEach(function (pair) {
      var cell = el('div', null, pair[0]);
      cell.append(el('b', null, pair[1]));
      meta.append(cell);
    });
    left.append(meta);

    right.append(el('p', 'plan-h', 'FARM PLAN'));
    var plan = el('ol', 'plan');
    (row.farm_steps || []).forEach(function (step, i) {
      var parts = splitStep(step);
      var li = el('li');
      li.append(el('span', 'n', String(i + 1).padStart(2, '0')));
      var body = el('div');
      body.append(el('div', null, parts.body));
      var cost = el('div', 'cost');
      if (parts.cost) cost.append(el('span', null, parts.cost));
      if (parts.time) cost.append(el('span', null, parts.time));
      body.append(cost);
      li.append(body);
      plan.append(li);
    });
    right.append(plan);
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  function render() {
    if (S.tab === 'board') {
      table.style.display = '';
      thead.style.display = '';
      columns.forEach(function (c, i) {
        var th = headRow.children[i];
        th.classList.toggle('on', c.key === S.sort);
      });
      renderBoard();
    } else {
      table.style.display = '';
      thead.style.display = 'none';
      renderLive();
    }
    renderDrawer();
  }

  search.addEventListener('input', function () { S.q = search.value; renderBoard(); });
  catField.select.addEventListener('change', function () { S.cat = catField.select.value; renderBoard(); });
  chainField.select.addEventListener('change', function () { S.chain = chainField.select.value; renderBoard(); });
  riskField.select.addEventListener('change', function () { S.risk = riskField.select.value; renderBoard(); });
  below.addEventListener('change', function () { S.below = below.checked; renderBoard(); });

  headRow.addEventListener('click', function (event) {
    var th = event.target.closest('th');
    if (!th || S.tab !== 'board') return;
    var key = th.dataset.sort;
    if (S.sort === key) S.dir = -S.dir;
    else { S.sort = key; S.dir = key === 'name' || key === 'category' ? 1 : -1; }
    render();
  });

  tbody.addEventListener('click', function (event) {
    var tr = event.target.closest('tr');
    if (!tr || S.tab !== 'board') return;
    var slug = tr.dataset.slug;
    S.sel = D.rows.filter(function (r) { return r.slug === slug; })[0] || null;
    render();
  });

  tabBoard.addEventListener('click', function () {
    S.tab = 'board'; tabBoard.classList.add('on'); tabLive.classList.remove('on');
    S.sel = null; render();
  });
  tabLive.addEventListener('click', function () {
    S.tab = 'live'; tabLive.classList.add('on'); tabBoard.classList.remove('on');
    S.sel = null; render();
  });

  // Start on the strongest row, so the first paint shows both the board and a filled detail view.
  S.sel = D.rows.length ? D.rows[0] : null;
  render();
})();
