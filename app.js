'use strict';

const STORE_KEY = 'tagesbericht.v1';
const MAX_ROWS = 19;
const FIELDS = ['desc', 'type', 'av', 'ab', 'fz', 'wv', 'wb', 'az', 'ausl'];
const DAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/* ---------- storage ---------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === 'object') return { monteur: '', days: {}, showWeekend: false, printEmpty: false, ...s };
  } catch (e) { /* ignore */ }
  return { monteur: '', days: {}, showWeekend: false, printEmpty: false };
}
function save(fromSync) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); }
  if (!fromSync) scheduleSync();
}
let state = load();

/* ---------- date helpers ---------- */
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDate = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((t - y0) / 864e5 + 1) / 7), year: t.getUTCFullYear() };
}

/* ---------- hours helpers ---------- */
function diffHours(from, to) {
  if (!from || !to) return '';
  const [h1, m1] = from.split(':').map(Number);
  const [h2, m2] = to.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60; // über Mitternacht
  return fmtHours(mins / 60);
}
function fmtHours(h) {
  if (h === '' || h == null || isNaN(h)) return '';
  return String(Math.round(h * 100) / 100).replace('.', ',');
}
const parseHours = s => {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

/* ---------- data access ---------- */
const emptyRow = () => ({ desc: '', type: '', av: '', ab: '', fz: '', wv: '', wb: '', az: '', ausl: '' });
const rowHasData = r => FIELDS.some(f => r[f]);
function getDay(iso) { return state.days[iso] || { rows: [] }; }
function ensureDay(iso) {
  if (!state.days[iso]) state.days[iso] = { rows: [] };
  return state.days[iso];
}
function touch(iso) { ensureDay(iso).u = Date.now(); }
const dayHasData = iso => (state.days[iso]?.rows || []).some(rowHasData);
function cleanupDay(iso) {
  const d = state.days[iso];
  if (d && !d.u && !d.rows.some(rowHasData)) delete state.days[iso];
}

/* ---------- UI state ---------- */
let curDate = toISO(new Date());
const $ = id => document.getElementById(id);
const rowsEl = $('rows');

function weekDates() {
  const mon = mondayOf(fromISO(curDate));
  const n = state.showWeekend ? 7 : 5;
  return Array.from({ length: n }, (_, i) => toISO(addDays(mon, i)));
}

function renderWeek() {
  const d = fromISO(curDate);
  const mon = mondayOf(d);
  const { week, year } = isoWeek(d);
  $('kwLabel').textContent = `KW ${week} / ${year}`;
  $('rangeLabel').textContent = `${fmtDate(mon)} – ${fmtDate(addDays(mon, 6))}`;

  // if weekend hidden but current is weekend, still show it
  const dates = weekDates();
  if (!dates.includes(curDate)) dates.push(curDate);

  const today = toISO(new Date());
  const tabs = $('dayTabs');
  tabs.innerHTML = '';
  for (const iso of dates) {
    const dd = fromISO(iso);
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="d">${DAY_SHORT[dd.getDay()]}</span><span class="n">${pad(dd.getDate())}.${pad(dd.getMonth() + 1)}.</span>`;
    if (iso === curDate) b.classList.add('active');
    if (iso === today) b.classList.add('today');
    if (dayHasData(iso)) b.classList.add('has');
    b.onclick = () => { curDate = iso; renderAll(); };
    tabs.appendChild(b);
  }
}

function renderTotals() {
  const rows = getDay(curDate).rows;
  const fz = rows.reduce((s, r) => s + parseHours(r.fz), 0);
  const az = rows.reduce((s, r) => s + parseHours(r.az), 0);
  const wk = weekDates().reduce((s, iso) => s + getDay(iso).rows.reduce((t, r) => t + parseHours(r.az), 0), 0);
  $('dayTotals').textContent = `FZ ${fmtHours(fz) || 0} h · AZ ${fmtHours(az) || 0} h · Woche AZ ${fmtHours(wk) || 0} h`;
}

function renderDay() {
  const d = fromISO(curDate);
  $('dayTitle').textContent = `${DAY_LONG[d.getDay()]}, ${fmtDate(d)}`;
  const day = getDay(curDate);
  if (!day.rows.length) {
    // start with one blank row for convenience (not saved until typed in)
    day.rows = [emptyRow()];
    if (!state.days[curDate]) state.days[curDate] = day;
  }
  rowsEl.innerHTML = '';
  day.rows.forEach((r, i) => rowsEl.appendChild(buildRow(r, i)));
  $('addRow').disabled = day.rows.length >= MAX_ROWS;
  renderTotals();
}

function buildRow(r, i) {
  const node = $('rowTpl').content.firstElementChild.cloneNode(true);
  node.querySelector('.num').textContent = i + 1;
  const inputs = {};
  node.querySelectorAll('[data-f]').forEach(el => {
    const f = el.dataset.f;
    inputs[f] = el;
    el.value = r[f] || '';
    el.addEventListener('input', () => {
      r[f] = el.value;
      if (f === 'fz') r.fzManual = !!el.value;
      if (f === 'az') r.azManual = !!el.value;
      if ((f === 'av' || f === 'ab') && !r.fzManual) { r.fz = diffHours(r.av, r.ab); inputs.fz.value = r.fz; }
      if ((f === 'wv' || f === 'wb') && !r.azManual) { r.az = diffHours(r.wv, r.wb); inputs.az.value = r.az; }
      touch(curDate);
      save();
      renderTotals();
      markTab();
    });
  });
  node.querySelector('.del').onclick = () => {
    const day = ensureDay(curDate);
    if (rowHasData(r) && !confirm('Zeile löschen?')) return;
    day.rows.splice(i, 1);
    touch(curDate);
    save();
    renderAll();
  };
  node.querySelector('.dup').onclick = () => {
    const day = ensureDay(curDate);
    if (day.rows.length >= MAX_ROWS) return alert(`Maximal ${MAX_ROWS} Zeilen pro Tag.`);
    day.rows.splice(i + 1, 0, { ...r });
    touch(curDate);
    save();
    renderAll();
  };
  return node;
}

function markTab() {
  const dates = [...$('dayTabs').children];
  const active = dates.find(b => b.classList.contains('active'));
  if (active) active.classList.toggle('has', dayHasData(curDate));
}

function renderAll() {
  renderWeek();
  renderDay();
}

/* ---------- paper sheet ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function sheetHTML(iso) {
  const d = fromISO(iso);
  const rows = getDay(iso).rows.filter(rowHasData);
  let body = '';
  for (let i = 0; i < MAX_ROWS; i++) {
    const r = rows[i] || {};
    body += `<tr><td class="desc"><div>${esc(r.desc)}</div></td><td>${esc(r.type)}</td>` +
      `<td>${esc(r.av)}</td><td>${esc(r.ab)}</td><td>${esc(r.fz)}</td>` +
      `<td>${esc(r.wv)}</td><td>${esc(r.wb)}</td><td>${esc(r.az)}</td><td>${esc(r.ausl)}</td></tr>`;
  }
  return `<div class="sheet">
  <div class="s-title">Tagesbericht</div>
  <div class="s-field s-datum"><span class="lbl">Datum:</span><span class="val">${fmtDate(d)}</span></div>
  <div class="s-field s-monteur"><span class="lbl">Monteur:</span><span class="val">${esc(state.monteur)}</span></div>
  <div class="s-field s-kw"><span class="lbl">Kalenderwoche:</span><span class="val">${isoWeek(d).week}</span></div>
  <table class="s-grid">
    <colgroup>
      <col style="width:46.1mm"><col style="width:9mm"><col style="width:17.8mm"><col style="width:17.3mm">
      <col style="width:12.5mm"><col style="width:14.6mm"><col style="width:15.4mm"><col style="width:11.7mm"><col style="width:20.6mm">
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2" class="dark"></th>
        <th rowspan="2" class="star">*</th>
        <th colspan="2" class="dark">Anfahrt</th>
        <th rowspan="2">FZ<br>h</th>
        <th colspan="2" class="dark">Arbeitszeit</th>
        <th rowspan="2">AZ in<br>h</th>
        <th rowspan="2">Auslöse</th>
      </tr>
      <tr><th>von</th><th>bis</th><th>von</th><th>bis</th></tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <div class="s-legend s-leg1">*<br>W = Wartung<br>R = Reparatur<br>M = Montage</div>
  <div class="s-legend s-leg2">A = Aufmaß<br>S= Schadensaufnahme<br>N= Neubau</div>
  <div class="s-legend s-leg3">WK = Werkstatt</div>
</div>`;
}

function weekPrintDates() {
  const mon = mondayOf(fromISO(curDate));
  const all = Array.from({ length: 7 }, (_, i) => toISO(addDays(mon, i)));
  return all.filter((iso, i) => dayHasData(iso) || (state.printEmpty && i < 5));
}

function doPrint(dates) {
  if (!dates.length) return alert('Keine Einträge in dieser Woche.');
  if (!state.monteur && !confirm('Monteur-Name ist leer. Trotzdem drucken?')) return;
  $('print-area').innerHTML = dates.map(sheetHTML).join('');
  const oldTitle = document.title;
  const { week, year } = isoWeek(fromISO(dates[0]));
  document.title = dates.length === 1
    ? `Tagesbericht ${dates[0]}`
    : `Tagesbericht KW${pad(week)}-${year}`;
  setTimeout(() => {
    window.print();
    setTimeout(() => { document.title = oldTitle; }, 500);
  }, 50);
}

/* ---------- preview ---------- */
let previewDates = [];
function openPreview(dates, title) {
  if (!dates.length) return alert('Keine Einträge in dieser Woche.');
  previewDates = dates;
  $('previewTitle').textContent = title;
  $('previewPages').innerHTML = dates.map(iso => `<div class="page-wrap">${sheetHTML(iso)}</div>`).join('');
  $('preview').hidden = false;
  document.body.style.overflow = 'hidden';
  scalePreview();
}
function scalePreview() {
  document.querySelectorAll('.page-wrap').forEach(w => {
    const sheet = w.firstElementChild;
    sheet.style.transform = `scale(${w.clientWidth / sheet.offsetWidth})`;
  });
}
function closePreview() {
  $('preview').hidden = true;
  document.body.style.overflow = '';
}

/* ---------- backup ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tagesbericht-backup-${toISO(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data.days !== 'object') throw new Error('Ungültige Datei');
      const n = Object.keys(data.days).length;
      if (!confirm(`${n} Tage importieren? Vorhandene Tage mit gleichem Datum werden überschrieben.`)) return;
      const now = Date.now();
      for (const [iso, day] of Object.entries(data.days)) state.days[iso] = { ...day, u: now };
      if (data.monteur && !state.monteur) state.monteur = data.monteur;
      save();
      $('monteur').value = state.monteur;
      renderAll();
      alert('Import erfolgreich.');
    } catch (e) { alert('Import fehlgeschlagen: ' + e.message); }
  };
  reader.readAsText(file);
}

/* ---------- wiring ---------- */
$('monteur').value = state.monteur;
$('monteur').addEventListener('input', e => { state.monteur = e.target.value; state.monteurU = Date.now(); save(); });
$('showWeekend').checked = state.showWeekend;
$('showWeekend').addEventListener('change', e => { state.showWeekend = e.target.checked; save(); renderAll(); });
$('printEmpty').checked = state.printEmpty;
$('printEmpty').addEventListener('change', e => { state.printEmpty = e.target.checked; save(); });

$('prevWeek').onclick = () => { curDate = toISO(addDays(mondayOf(fromISO(curDate)), -7)); renderAll(); };
$('nextWeek').onclick = () => { curDate = toISO(addDays(mondayOf(fromISO(curDate)), 7)); renderAll(); };
$('todayBtn').onclick = () => { curDate = toISO(new Date()); renderAll(); };

$('addRow').onclick = () => {
  const day = ensureDay(curDate);
  if (day.rows.length >= MAX_ROWS) return;
  day.rows.push(emptyRow());
  renderDay();
  rowsEl.lastElementChild?.querySelector('.f-desc')?.focus();
};
$('copyPrev').onclick = () => {
  let src = null;
  for (let i = 1; i <= 31; i++) {
    const iso = toISO(addDays(fromISO(curDate), -i));
    if (dayHasData(iso)) { src = iso; break; }
  }
  if (!src) return alert('Kein vorheriger Tag mit Einträgen gefunden.');
  if (dayHasData(curDate) && !confirm('Aktuelle Einträge durch die vom ' + fmtDate(fromISO(src)) + ' ersetzen?')) return;
  ensureDay(curDate).rows = getDay(src).rows.filter(rowHasData).map(r => ({ ...r }));
  touch(curDate);
  save();
  renderAll();
};
$('clearDay').onclick = () => {
  if (!dayHasData(curDate) || !confirm('Alle Einträge dieses Tages löschen?')) return;
  state.days[curDate] = { rows: [], u: Date.now() };
  save();
  renderAll();
};

const closeMenu = () => document.querySelector('.more').removeAttribute('open');
$('printDay').onclick = () => doPrint(dayHasData(curDate) ? [curDate] : (confirm('Tag ist leer. Leeres Blatt drucken?') ? [curDate] : []));
$('printWeek').onclick = () => doPrint(weekPrintDates());
$('previewDay').onclick = () => openPreview([curDate], 'Vorschau ' + fmtDate(fromISO(curDate)));
$('previewWeek').onclick = () => { closeMenu(); openPreview(weekPrintDates(), $('kwLabel').textContent); };
$('previewClose').onclick = closePreview;
$('previewPrint').onclick = () => doPrint(previewDates);
$('exportBtn').onclick = () => { closeMenu(); exportData(); };
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = e => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ''; closeMenu(); };

window.addEventListener('resize', scalePreview);
// Ctrl+P without using the buttons: print the current day
window.addEventListener('beforeprint', () => {
  if (!$('print-area').innerHTML) $('print-area').innerHTML = sheetHTML(curDate);
});
window.addEventListener('afterprint', () => { $('print-area').innerHTML = ''; });

// Remove blank placeholder rows from storage when leaving the page
window.addEventListener('pagehide', () => { Object.keys(state.days).forEach(cleanupDay); save(); });


/* ---------- sync via private GitHub Gist ---------- */
const SYNC_KEY = 'tagesbericht.sync';
const GIST_FILE = 'tagesbericht-data.json';
let syncCfg = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } })();
let syncTimer = null, syncing = false, syncAgain = false;
const saveSyncCfg = () => localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg));

function scheduleSync() {
  if (!syncCfg.token) return;
  clearTimeout(syncTimer);
  setSyncStatus('pending');
  syncTimer = setTimeout(sync, 1500);
}

async function gh(method, path, body) {
  const res = await fetch('https://api.github.com' + path, {
    method, cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + syncCfg.token,
      Accept: 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error('Token ungültig oder abgelaufen');
  if (res.status === 404) { const e = new Error('Gist nicht gefunden'); e.notFound = true; throw e; }
  if (res.status === 403) throw new Error('Kein Zugriff auf Gists (Token braucht „gist“-Berechtigung)');
  if (!res.ok) throw new Error('GitHub-Fehler ' + res.status);
  return res.json();
}

function syncPayload() {
  const days = {};
  for (const [iso, d] of Object.entries(state.days)) if (d.u || d.rows.some(rowHasData)) days[iso] = d;
  return JSON.stringify({ v: 1, monteur: state.monteur, monteurU: state.monteurU || 0, days });
}

async function findOrCreateGist() {
  for (let page = 1; page <= 10; page++) {
    const list = await gh('GET', `/gists?per_page=100&page=${page}`);
    const g = list.find(x => x.files && x.files[GIST_FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  const g = await gh('POST', '/gists', {
    description: 'Tagesbericht Sync (automatisch erstellt)',
    public: false,
    files: { [GIST_FILE]: { content: syncPayload() } },
  });
  return g.id;
}

function mergeRemote(remote) {
  let changedLocal = false, needPush = false, curChanged = false;
  const rdays = remote.days || {};
  const all = new Set([...Object.keys(state.days), ...Object.keys(rdays)]);
  for (const iso of all) {
    const l = state.days[iso], r = rdays[iso];
    const lu = l?.u || 0, ru = r?.u || 0;
    if (r && ru > lu) {
      state.days[iso] = r; changedLocal = true;
      if (iso === curDate) curChanged = true;
    } else if (l && lu > ru) needPush = true;
  }
  if ((remote.monteurU || 0) > (state.monteurU || 0)) {
    state.monteur = remote.monteur || ''; state.monteurU = remote.monteurU; changedLocal = true;
    $('monteur').value = state.monteur;
  } else if ((state.monteurU || 0) > (remote.monteurU || 0)) needPush = true;
  return { changedLocal, needPush, curChanged };
}

async function sync() {
  if (!syncCfg.token) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  clearTimeout(syncTimer); syncTimer = null;
  setSyncStatus('busy');
  try {
    if (!syncCfg.gistId) { syncCfg.gistId = await findOrCreateGist(); saveSyncCfg(); }
    const g = await gh('GET', `/gists/${syncCfg.gistId}`);
    const f = g.files[GIST_FILE];
    let remote = { days: {} };
    if (f) {
      const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
      try { remote = JSON.parse(text); } catch (e) { /* corrupt remote: overwrite with local */ }
    }
    const { changedLocal, needPush, curChanged } = mergeRemote(remote);
    if (changedLocal) {
      save(true);
      renderWeek();
      if (curChanged) {
        const el = document.activeElement;
        const card = rowsEl.contains(el) ? el.closest('.row-card') : null;
        const idx = card ? [...rowsEl.children].indexOf(card) : -1, f = el?.dataset?.f;
        renderDay();
        if (idx >= 0 && f) rowsEl.children[idx]?.querySelector(`[data-f="${f}"]`)?.focus();
      } else renderTotals();
    }
    if (needPush || !f) {
      await gh('PATCH', `/gists/${syncCfg.gistId}`, { files: { [GIST_FILE]: { content: syncPayload() } } });
    }
    syncCfg.last = Date.now(); saveSyncCfg();
    setSyncStatus('ok');
  } catch (e) {
    if (e.notFound && syncCfg.gistId) { syncCfg.gistId = null; saveSyncCfg(); syncAgain = true; }
    setSyncStatus('error', e.message);
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; sync(); }
  }
}

function setSyncStatus(st, msg) {
  const dot = $('syncDot'), txt = $('syncText');
  if (!syncCfg.token) {
    dot.className = 'sync-dot off'; dot.title = 'Sync aus';
    txt.textContent = 'Sync ist aus';
    $('syncSetup').hidden = false; $('syncNow').hidden = true; $('syncOff').hidden = true;
    return;
  }
  $('syncSetup').hidden = true; $('syncNow').hidden = false; $('syncOff').hidden = false;
  const last = syncCfg.last ? new Date(syncCfg.last) : null;
  const lastTxt = last ? `${pad(last.getHours())}:${pad(last.getMinutes())}` : '–';
  const map = {
    ok: ['ok', `Synchronisiert (${lastTxt})`],
    busy: ['busy', 'Synchronisiere …'],
    pending: ['busy', 'Änderungen warten …'],
    error: ['err', 'Sync-Fehler: ' + (msg || '')],
  };
  const [cls, label] = map[st] || map.ok;
  dot.className = 'sync-dot ' + cls; dot.title = label; txt.textContent = label;
}

function initSync() {
  $('syncSetup').onclick = () => { closeMenu(); $('tokenInput').value = ''; $('syncDialog').showModal(); };
  $('syncCancel').onclick = () => $('syncDialog').close();
  $('syncForm').onsubmit = async e => {
    e.preventDefault();
    const token = $('tokenInput').value.trim();
    if (!token) return;
    syncCfg = { token };
    saveSyncCfg();
    $('syncDialog').close();
    await sync();
    if ($('syncDot').classList.contains('err')) alert($('syncText').textContent);
  };
  $('syncNow').onclick = () => { closeMenu(); sync(); };
  $('syncOff').onclick = () => {
    if (!confirm('Sync auf diesem Gerät ausschalten? Die Daten bleiben erhalten.')) return;
    syncCfg = {}; saveSyncCfg(); closeMenu(); setSyncStatus();
  };
  $('syncDot').onclick = () => { if (syncCfg.token) sync(); else $('syncSetup').click(); };
  document.addEventListener('visibilitychange', () => {
    if (!syncCfg.token) return;
    if (document.visibilityState === 'visible') sync();
    else if (syncTimer) sync(); // push pending changes before the app goes to background
  });
  window.addEventListener('online', () => sync());
  setSyncStatus('ok');
  sync();
}

renderAll();
initSync();
