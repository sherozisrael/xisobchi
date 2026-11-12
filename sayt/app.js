'use strict';

/* ================= Ma'lumotlar ================= */
const KEY = 'xisobchi_v1';
const CUR_KEY = 'xisobchi_cur';

const TYPES = {
  kirim:  { label: 'Kirim',          sign:  1, icon: '+' },
  chiqim: { label: 'Chiqim',         sign: -1, icon: '−' },
  qarz:   { label: 'Qarzga berildi', sign: -1, icon: '↗' },
  qaytdi: { label: 'Qarz qaytdi',    sign:  1, icon: '↙' },
};
const KASSA_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/*
  Tuzilma:
  db = {
    version: 2,
    kassas:  [{ id, name, color, opening, openingDate, created, edited? }],
    entries: [{ id, kassa, type, amount, date, person?, note, category?, due?, debtId?, created, edited? }],
    deleted: { id: vaqt },   // boshqa qurilmalar bilan sinxronlash uchun
    updatedAt, lastBackup
  }
*/
function emptyDb() {
  return { version: 2, kassas: [], entries: [], deleted: {}, lastBackup: null, updatedAt: 0 };
}

// Eski (bitta kassali) formatni yangisiga o'tkazish
function migrate(d) {
  if (!d || !Array.isArray(d.entries)) return emptyDb();
  if (Array.isArray(d.kassas)) {
    return { version: 2, kassas: d.kassas, entries: d.entries, deleted: d.deleted || {},
      lastBackup: d.lastBackup || null, updatedAt: d.updatedAt || 0 };
  }
  const has = d.opening !== null && d.opening !== undefined;
  return {
    version: 2,
    kassas: has ? [{ id: 'main', name: 'Ishxona kassasi', color: KASSA_COLORS[0],
      opening: d.opening || 0, openingDate: d.openingDate || null, created: 0 }] : [],
    entries: has ? d.entries.map(e => ({ ...e, kassa: e.kassa || 'main' })) : [],
    deleted: d.deleted || {}, lastBackup: d.lastBackup || null, updatedAt: d.updatedAt || 0,
  };
}

function validData(d) {
  if (!d || !Array.isArray(d.entries)) return false;
  const m = migrate(d);
  const ids = new Set(m.kassas.map(k => k.id));
  return m.kassas.every(k => k && k.id && k.name) &&
    m.entries.every(x => x && x.id && TYPES[x.type] && x.amount > 0 && x.date && ids.has(x.kassa));
}

function load() {
  try { return migrate(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return emptyDb(); }
}

let db = load();
let curK = null;
try { curK = localStorage.getItem(CUR_KEY); } catch (e) { /* */ }
let curType = 'kirim';
let range = 'month';

const hasData = () => db.kassas.length > 0;
const K = () => db.kassas.find(k => k.id === curK) || null;

function ensureCur() {
  if (!db.kassas.find(k => k.id === curK)) curK = db.kassas[0] ? db.kassas[0].id : null;
  try { if (curK) localStorage.setItem(CUR_KEY, curK); } catch (e) { /* */ }
}

function persistLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Brauzerga saqlashda xatolik: ' + e.message, true); }
}

// Har bir o'zgarishdan keyin: brauzerga + Google Drive'ga
function save() {
  db.updatedAt = Date.now();
  persistLocal();
  cloudSave();
  render();
}

/* ================= Yordamchilar ================= */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const localStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const nowLocal = () => localStr(new Date());
const today = () => nowLocal().slice(0, 10);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return localStr(d).slice(0, 10); };

const fmtNum = n => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const fmtMoney = n => (n < 0 ? '−' : '') + fmtNum(n) + " so'm";
const parseMoney = s => { const d = String(s || '').replace(/\D/g, ''); return d ? Number(d) : 0; };

const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
function fmtDate(s, withTime = true) {
  if (!s) return '';
  const [d, t] = s.split('T');
  const [y, m, dd] = d.split('-');
  const day = d === today() ? 'Bugun' : d === daysAgo(1) ? 'Kecha' : `${+dd} ${MONTHS[+m - 1]} ${y}`;
  return day + (withTime && t ? ', ' + t.slice(0, 5) : '');
}
const fmtDateFull = s => {
  if (!s) return '';
  const [d, t] = s.split('T'); const [y, m, dd] = d.split('-');
  return `${dd}.${m}.${y}` + (t ? ' ' + t.slice(0, 5) : '');
};
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kassa';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
function avatar(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ini = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<div class="avatar" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${esc(ini || '?')}</div>`;
}

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2600);
}

function download(name, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= Hisob-kitob ================= */
const entriesOf = (kid = curK) => db.entries.filter(e => e.kassa === kid);

function sortedAsc(list = entriesOf()) {
  return [...list].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created || 0) - (b.created || 0));
}

function computeBalances(kid = curK) {
  const k = db.kassas.find(x => x.id === kid);
  let bal = k ? k.opening || 0 : 0;
  const map = {};
  for (const e of sortedAsc(entriesOf(kid))) { bal += TYPES[e.type].sign * e.amount; map[e.id] = bal; }
  return { bal, map };
}
const balanceOf = kid => computeBalances(kid).bal;
function allBalanceMap() {
  const map = {};
  for (const k of db.kassas) Object.assign(map, computeBalances(k.id).map);
  return map;
}

const debtOf = e => db.entries.find(x => x.id === e.debtId);
const personOf = e => e.type === 'qaytdi' ? (debtOf(e)?.person || '—') : (e.person || '');
const kassaName = id => db.kassas.find(k => k.id === id)?.name || '';

function debtsInfo(kid = curK) {
  return entriesOf(kid).filter(e => e.type === 'qarz').map(d => {
    const reps = db.entries.filter(e => e.type === 'qaytdi' && e.debtId === d.id)
      .sort((a, b) => a.date < b.date ? -1 : 1);
    const repaid = reps.reduce((s, r) => s + r.amount, 0);
    return { ...d, reps, repaid, remaining: d.amount - repaid };
  });
}

/* ================= Forma maydonlari ================= */
const PERSON_LABEL = {
  kirim: 'Kimdan / qayerdan keldi',
  chiqim: 'Kimga / qayerga berildi',
  qarz: 'Kimga qarz berildi',
};
const NOTE_PH = {
  kirim: "Masalan: mijozdan to'lov",
  chiqim: 'Masalan: kanselyariya xaridi',
  qarz: 'Masalan: yo\'l kira uchun',
  qaytdi: 'Masalan: qismini qaytardi',
};

function fieldsHTML(type, v = {}) {
  let h = `<label>Summa
    <div class="money-wrap"><input name="amount" class="money big" inputmode="numeric" placeholder="0" value="${v.amount ? fmtNum(v.amount) : ''}" required></div>
  </label>`;
  if (type !== 'qaytdi') {
    h += `<label>${PERSON_LABEL[type]}<input name="person" list="dlPersons" value="${esc(v.person)}" placeholder="Ism yoki tashkilot"${type === 'qarz' ? ' required' : ''}></label>`;
  }
  h += `<label>${type === 'qaytdi' ? 'Izoh' : 'Nima uchun'}<input name="note" value="${esc(v.note)}" placeholder="${esc(NOTE_PH[type])}"></label>`;
  if (type === 'kirim' || type === 'chiqim') {
    h += `<label>Kategoriya <span class="muted">(ixtiyoriy)</span><input name="category" list="dlCats" value="${esc(v.category)}" placeholder="Ijara, maosh, xarid..."></label>`;
  }
  h += `<div class="row2"><label>Sana va vaqt<input name="date" type="datetime-local" value="${v.date || nowLocal()}" required></label>`;
  if (type === 'qarz') h += `<label>Qaytarish muddati<input name="due" type="date" value="${v.due || ''}"></label>`;
  h += `</div>`;
  return h;
}

function readForm(form, type) {
  const f = new FormData(form);
  const amount = parseMoney(f.get('amount'));
  if (!amount) return { error: 'Summani kiriting' };
  const date = f.get('date');
  if (!date) return { error: 'Sana va vaqtni kiriting' };
  const o = { amount, date, note: String(f.get('note') || '').trim() };
  if (type !== 'qaytdi') o.person = String(f.get('person') || '').trim();
  if (type === 'qarz' && !o.person) return { error: 'Kimga qarz berilganini yozing' };
  if (type === 'kirim' || type === 'chiqim') o.category = String(f.get('category') || '').trim();
  if (type === 'qarz') o.due = f.get('due') || '';
  return { data: o };
}

function kassaFields(v = {}) {
  return `<label>Kassa nomi<input name="kname" value="${esc(v.name)}" placeholder="Masalan: Bozorlik kassasi" required></label>
  <label>Boshlang'ich summa
    <div class="money-wrap"><input name="kopening" class="money big" inputmode="numeric" placeholder="0" value="${v.opening ? fmtNum(v.opening) : ''}"></div>
  </label>
  <label>Sana va vaqt<input name="kdate" type="datetime-local" value="${v.openingDate || nowLocal()}"></label>`;
}

function readKassa(form, exceptId) {
  const f = new FormData(form);
  const name = String(f.get('kname') || '').trim();
  if (!name) return { error: 'Kassa nomini yozing' };
  if (db.kassas.some(k => k.id !== exceptId && k.name.toLowerCase() === name.toLowerCase())) {
    return { error: 'Bu nomli kassa allaqachon bor' };
  }
  return { data: { name, opening: parseMoney(f.get('kopening')), openingDate: f.get('kdate') || nowLocal() } };
}

// Summani yozayotganda 1 000 000 ko'rinishida formatlash
document.addEventListener('input', e => {
  if (!e.target.classList.contains('money')) return;
  const el = e.target;
  const v = parseMoney(el.value);
  el.value = v ? fmtNum(v) : '';
});

/* ================= Render ================= */
function entryRow(e, balMap) {
  const t = TYPES[e.type];
  const who = personOf(e);
  const meta = [fmtDate(e.date)];
  if (e.type === 'qarz' && e.due) meta.push('muddat: ' + fmtDate(e.due, false));
  return `<div class="entry">
    <div class="e-icon ${e.type}">${t.icon}</div>
    <div class="e-main">
      <div class="e-top">
        <b>${esc(who || t.label)}</b>
        ${who ? `<span class="badge ${e.type}">${t.label}</span>` : ''}
        ${e.category ? `<span class="badge cat">${esc(e.category)}</span>` : ''}
      </div>
      ${e.note ? `<div class="e-note">${esc(e.note)}</div>` : ''}
      <div class="e-meta">${meta.join(' · ')}</div>
    </div>
    <div class="e-side">
      <div class="e-amt ${t.sign > 0 ? 'pos' : 'neg'}">${t.sign > 0 ? '+' : '−'}${fmtNum(e.amount)}</div>
      <div class="e-bal">qoldiq ${fmtNum(balMap[e.id] ?? 0)}</div>
      <div class="e-act">
        <button class="icon-btn" data-edit="${e.id}" title="Tahrirlash">${ICON_EDIT}</button>
        <button class="icon-btn del" data-del="${e.id}" title="O'chirish">${ICON_DEL}</button>
      </div>
    </div>
  </div>`;
}

const emptyHTML = msg => `<div class="empty">${msg}</div>`;

function renderKassaBar() {
  $('#kassaBar').innerHTML = db.kassas.map(k => `
    <button type="button" class="kchip ${k.id === curK ? 'active' : ''}" data-kassa="${k.id}">
      <span class="kdot" style="background:${k.color}"></span>
      <span>${esc(k.name)}</span>
      <span class="kbal">${fmtNum(balanceOf(k.id))}</span>
    </button>`).join('') +
    `<button type="button" class="kchip add" data-kadd="1">+ Kassa qo'shish</button>`;
}

function renderStats(bal) {
  const td = today();
  let inT = 0, outT = 0;
  for (const e of entriesOf()) {
    if (e.date.slice(0, 10) !== td) continue;
    if (TYPES[e.type].sign > 0) inT += e.amount; else outT += e.amount;
  }
  const open = debtsInfo().filter(d => d.remaining > 0);
  $('#sLabel').textContent = (K()?.name || 'Kassa') + ' — qoldiq';
  $('#sBalance').textContent = fmtMoney(bal);
  $('#sTodayIn').textContent = (inT ? '+' : '') + fmtNum(inT);
  $('#sTodayOut').textContent = (outT ? '−' : '') + fmtNum(outT);
  $('#sDebts').textContent = fmtNum(open.reduce((s, d) => s + d.remaining, 0)) + (open.length ? ` · ${open.length} ta` : '');
}

function renderRecent(map) {
  const list = sortedAsc().reverse().slice(0, 8);
  $('#recent').innerHTML = list.length
    ? list.map(e => entryRow(e, map)).join('')
    : emptyHTML(`«${esc(K()?.name || '')}» da hali yozuv yo'q. Formadan birinchi kirim yoki chiqimni yozing.`);
}

function setRange(r) {
  range = r;
  $$('.quick button').forEach(b => b.classList.toggle('active', b.dataset.range === r));
  const td = today();
  if (r === 'today') { $('#fFrom').value = td; $('#fTo').value = td; }
  if (r === 'week') { $('#fFrom').value = daysAgo(6); $('#fTo').value = td; }
  if (r === 'month') { $('#fFrom').value = td.slice(0, 8) + '01'; $('#fTo').value = td; }
  if (r === 'all') { $('#fFrom').value = ''; $('#fTo').value = ''; }
  renderHistory();
}

function filtered() {
  const from = $('#fFrom').value, to = $('#fTo').value;
  const type = $('#fType').value, q = $('#fQ').value.trim().toLowerCase();
  return sortedAsc().filter(e => {
    const d = e.date.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (type && e.type !== type) return false;
    if (q) {
      const hay = [personOf(e), e.note, e.category].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderHistory(map = computeBalances().map) {
  if (!hasData()) return;
  const list = filtered();
  const sum = t => list.filter(e => e.type === t).reduce((s, e) => s + e.amount, 0);
  const k = sum('kirim'), c = sum('chiqim'), q = sum('qarz'), r = sum('qaytdi');
  const net = k + r - c - q;
  $('#hTotals').innerHTML = `
    <div><span>Kirim</span><b class="e-amt pos">+${fmtNum(k)}</b></div>
    <div><span>Chiqim</span><b class="e-amt neg">−${fmtNum(c)}</b></div>
    <div><span>Qarzga berildi</span><b class="e-amt neg">−${fmtNum(q)}</b></div>
    <div><span>Qarz qaytdi</span><b class="e-amt pos">+${fmtNum(r)}</b></div>
    <div><span>Sof o'zgarish</span><b class="e-amt ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${fmtNum(net)}</b></div>`;
  $('#historyList').innerHTML = list.length
    ? list.reverse().map(e => entryRow(e, map)).join('')
    : emptyHTML('Bu davr yoki filtr bo\'yicha yozuv topilmadi.');
}

function debtCard(d) {
  const td = today();
  const overdue = d.remaining > 0 && d.due && d.due < td;
  const pct = Math.min(100, (d.repaid / d.amount) * 100);
  const meta = ['Berildi: ' + fmtDate(d.date)];
  if (d.due) meta.push('Muddat: ' + fmtDate(d.due, false));
  return `<div class="debt ${d.remaining <= 0 ? 'closed' : ''} ${overdue ? 'overdue' : ''}">
    <div class="d-head">
      ${avatar(d.person)}
      <div class="e-main">
        <div class="e-top"><b>${esc(d.person)}</b>${overdue ? '<span class="badge red">Muddati o\'tgan</span>' : ''}</div>
        ${d.note ? `<div class="e-note">${esc(d.note)}</div>` : ''}
        <div class="e-meta">${meta.join(' · ')}</div>
      </div>
      <div class="d-amt">
        <div class="big num">${fmtNum(d.amount)}</div>
        <small>${d.remaining > 0 ? `qoldi: <b>${fmtNum(d.remaining)}</b>` : 'yopilgan'}</small>
      </div>
    </div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="bar-label"><span>Qaytdi: ${fmtNum(d.repaid)}</span><span>${Math.round(pct)}%</span></div>
    ${d.reps.length ? `<ul class="reps">${d.reps.map(r => `<li>
        <span>${fmtDate(r.date)}</span><span class="r-amt">+${fmtNum(r.amount)}</span>
        ${r.note ? `<span class="muted">· ${esc(r.note)}</span>` : ''}
        <span class="r-act">
          <button class="icon-btn" data-edit="${r.id}" title="Tahrirlash">${ICON_EDIT}</button>
          <button class="icon-btn del" data-del="${r.id}" title="O'chirish">${ICON_DEL}</button>
        </span></li>`).join('')}</ul>` : ''}
    <div class="d-act">
      ${d.remaining > 0
        ? `<button class="btn small primary t-kirim" data-repay="${d.id}">Qaytarildi deb belgilash</button>`
        : '<span class="ok">✓ To\'liq qaytarildi</span>'}
      <button class="btn small ghost" data-edit="${d.id}">Tahrirlash</button>
      <button class="btn small ghost" data-del="${d.id}">O'chirish</button>
    </div>
  </div>`;
}

function renderDebts() {
  const all = debtsInfo().sort((a, b) => a.date < b.date ? 1 : -1);
  const open = all.filter(d => d.remaining > 0);
  const closed = all.filter(d => d.remaining <= 0);

  const byPerson = {};
  for (const d of open) {
    const k = d.person;
    byPerson[k] = byPerson[k] || { sum: 0, n: 0 };
    byPerson[k].sum += d.remaining; byPerson[k].n++;
  }
  const people = Object.entries(byPerson).sort((a, b) => b[1].sum - a[1].sum);
  $('#debtSummary').innerHTML = people.length
    ? `<div class="people">${people.map(([n, v]) => `<div class="person">${avatar(n)}<div><b>${esc(n)}</b><small>${v.n} ta qarz</small></div><span class="amt">${fmtNum(v.sum)}</span></div>`).join('')}</div>`
    : emptyHTML('Bu kassadan hech kim qarzdor emas.');

  // muddati o'tganlar birinchi
  const td = today();
  open.sort((a, b) => {
    const ao = a.due && a.due < td ? 0 : 1, bo = b.due && b.due < td ? 0 : 1;
    return ao - bo || (a.date < b.date ? 1 : -1);
  });
  $('#debtOpen').innerHTML = open.length ? open.map(debtCard).join('')
    : emptyHTML("Ochiq qarz yo'q. Qarz berish uchun «Yangi yozuv» → «Qarzga berish».");
  $('#closedCount').textContent = closed.length ? `(${closed.length})` : '';
  $('#debtClosed').innerHTML = closed.length ? closed.map(debtCard).join('') : emptyHTML("Yopilgan qarz yo'q.");
}

function renderSettings() {
  $('#kassaList').innerHTML = db.kassas.map(k => `
    <div class="krow">
      <span class="kdot" style="background:${k.color}"></span>
      <div class="e-main">
        <b>${esc(k.name)}</b>${k.id === curK ? ' <span class="badge cat">hozirgi</span>' : ''}
        <div class="e-meta">Boshlang'ich: ${fmtNum(k.opening || 0)} so'm${k.openingDate ? ' · ' + fmtDate(k.openingDate) : ''} · ${entriesOf(k.id).length} ta yozuv</div>
      </div>
      <div class="e-side">
        <div class="e-amt">${fmtMoney(balanceOf(k.id))}</div>
        <div class="e-act">
          <button class="icon-btn" data-kedit="${k.id}" title="Tahrirlash">${ICON_EDIT}</button>
          <button class="icon-btn del" data-kdel="${k.id}" title="O'chirish">${ICON_DEL}</button>
        </div>
      </div>
    </div>`).join('');
  $('#lastBackup').textContent = db.lastBackup
    ? 'Oxirgi zaxira: ' + fmtDateFull(db.lastBackup) + '.'
    : '';
}

function renderDatalists() {
  const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $('#dlPersons').innerHTML = uniq(db.entries.map(e => e.person)).map(p => `<option value="${esc(p)}">`).join('');
  $('#dlCats').innerHTML = uniq(db.entries.map(e => e.category)).map(p => `<option value="${esc(p)}">`).join('');
}

function render() {
  if (!hasData()) return;
  ensureCur();
  const { bal, map } = computeBalances();
  renderKassaBar();
  renderStats(bal);
  renderRecent(map);
  renderHistory(map);
  renderDebts();
  renderSettings();
  renderDatalists();
}

function renderForm(keep = {}) {
  $('#formFields').innerHTML = fieldsHTML(curType, keep);
  $$('#typeSeg button').forEach(b => b.classList.toggle('active', b.dataset.type === curType));
  const btn = $('#entrySubmit');
  btn.textContent = { kirim: 'Kirimni saqlash', chiqim: 'Chiqimni saqlash', qarz: 'Qarzni saqlash' }[curType];
  btn.className = 'btn primary wide t-' + curType;
}

/* ================= Modal ================= */
let modalSave = null;
function openModal(title, html, onSave) {
  $('#mTitle').textContent = title;
  $('#mBody').innerHTML = html;
  modalSave = onSave;
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#mBody input')?.focus(), 30);
}
function closeModal() { $('#modal').classList.add('hidden'); modalSave = null; }
$('#mCancel').onclick = closeModal;
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('#mForm').addEventListener('submit', e => {
  e.preventDefault();
  if (modalSave && modalSave(e.target) !== false) closeModal();
});

/* ================= Yozuvlar bilan amallar ================= */
function editEntry(id) {
  const e = db.entries.find(x => x.id === id);
  if (!e) return;
  let info = '';
  if (e.type === 'qaytdi') {
    const d = debtOf(e);
    if (d) info = `<div class="m-info">${esc(d.person)} — qarz: <b>${fmtMoney(d.amount)}</b></div>`;
  }
  openModal(TYPES[e.type].label + ' — tahrirlash', info + fieldsHTML(e.type, e), form => {
    const r = readForm(form, e.type);
    if (r.error) { toast(r.error, true); return false; }
    if (e.type === 'qarz') {
      const rep = debtsInfo(e.kassa).find(d => d.id === e.id).repaid;
      if (r.data.amount < rep) { toast(`Bu qarzdan ${fmtMoney(rep)} qaytarilgan — summa undan kam bo'lolmaydi`, true); return false; }
    }
    if (e.type === 'qaytdi') {
      const d = debtsInfo(e.kassa).find(x => x.id === e.debtId);
      if (d && d.repaid - e.amount + r.data.amount > d.amount) { toast('Qaytgan summa qarz summasidan oshib ketdi', true); return false; }
    }
    Object.assign(e, r.data, { edited: Date.now() });
    save(); toast("O'zgartirildi");
  });
}

function deleteEntry(id) {
  const e = db.entries.find(x => x.id === id);
  if (!e) return;
  const who = personOf(e);
  let msg = `${TYPES[e.type].label}${who ? ' (' + who + ')' : ''}: ${fmtMoney(e.amount)}\n\nShu yozuv o'chirilsinmi?`;
  const reps = e.type === 'qarz' ? db.entries.filter(x => x.debtId === id) : [];
  if (reps.length) msg += `\nUnga tegishli ${reps.length} ta qaytarish yozuvi ham o'chadi.`;
  if (!confirm(msg)) return;
  for (const x of db.entries) if (x.id === id || x.debtId === id) db.deleted[x.id] = Date.now();
  db.entries = db.entries.filter(x => x.id !== id && x.debtId !== id);
  save(); toast("O'chirildi");
}

function repayDebt(id) {
  const d = debtsInfo().find(x => x.id === id);
  if (!d) return;
  const info = `<div class="m-info">Qarz: <b>${fmtMoney(d.amount)}</b> · Qaytgan: ${fmtMoney(d.repaid)} · Qolgan: <b>${fmtMoney(d.remaining)}</b><br><span class="muted">Qisman qaytargan bo'lsa, summani o'zgartiring.</span></div>`;
  openModal(`${d.person} — pul qaytardi`, info + fieldsHTML('qaytdi', { amount: d.remaining }), form => {
    const r = readForm(form, 'qaytdi');
    if (r.error) { toast(r.error, true); return false; }
    if (r.data.amount > d.remaining) { toast(`Qolgan qarz ${fmtMoney(d.remaining)} — undan ko'p yozib bo'lmaydi`, true); return false; }
    db.entries.push({ id: uid(), kassa: d.kassa, type: 'qaytdi', debtId: id, created: Date.now(), ...r.data });
    save();
    toast(r.data.amount === d.remaining ? 'Qarz to\'liq yopildi ✓' : 'Qaytarilgan summa yozildi');
  });
}

/* ================= Kassalar bilan amallar ================= */
function switchKassa(id) {
  if (id === curK) return;
  curK = id;
  ensureCur();
  $('#fQ').value = '';
  render();
  const k = K();
  if (k) toast(`«${k.name}» ochildi`);
}

function addKassa() {
  openModal('Yangi kassa', kassaFields() +
    '<p class="hint">Yangi kassaning qoldig\'i, tarixi va qarzlari boshqa kassalardan alohida yuritiladi.</p>', form => {
    const r = readKassa(form);
    if (r.error) { toast(r.error, true); return false; }
    const used = new Set(db.kassas.map(k => k.color));
    const color = KASSA_COLORS.find(c => !used.has(c)) || KASSA_COLORS[db.kassas.length % KASSA_COLORS.length];
    const k = { id: uid(), color, created: Date.now(), ...r.data };
    db.kassas.push(k);
    curK = k.id;
    ensureCur();
    save();
    toast(`«${k.name}» yaratildi`);
  });
}

function editKassa(id) {
  const k = db.kassas.find(x => x.id === id);
  if (!k) return;
  openModal('Kassani tahrirlash', kassaFields(k), form => {
    const r = readKassa(form, id);
    if (r.error) { toast(r.error, true); return false; }
    Object.assign(k, r.data, { edited: Date.now() });
    save(); toast("O'zgartirildi");
  });
}

function deleteKassa(id) {
  const k = db.kassas.find(x => x.id === id);
  if (!k) return;
  if (db.kassas.length === 1) { toast("Yagona kassani o'chirib bo'lmaydi", true); return; }
  const n = entriesOf(id).length;
  if (!confirm(`«${k.name}» kassasi${n ? ` va undagi ${n} ta yozuv` : ''} o'chirilsinmi?`)) return;
  if (n && prompt(`Tasdiqlash uchun kassa nomini yozing:\n${k.name}`) !== k.name) { toast('Bekor qilindi'); return; }
  const now = Date.now();
  db.deleted[id] = now;
  for (const e of entriesOf(id)) db.deleted[e.id] = now;
  db.entries = db.entries.filter(e => e.kassa !== id);
  db.kassas = db.kassas.filter(x => x.id !== id);
  ensureCur();
  save(); toast("Kassa o'chirildi");
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-edit],[data-del],[data-repay],[data-kassa],[data-kadd],[data-kedit],[data-kdel]');
  if (!b) return;
  const ds = b.dataset;
  if (ds.edit) editEntry(ds.edit);
  else if (ds.del) deleteEntry(ds.del);
  else if (ds.repay) repayDebt(ds.repay);
  else if (ds.kassa) switchKassa(ds.kassa);
  else if (ds.kadd) addKassa();
  else if (ds.kedit) editKassa(ds.kedit);
  else if (ds.kdel) deleteKassa(ds.kdel);
});
$('#kAddSettings').onclick = addKassa;

/* Yangi yozuv */
$('#typeSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-type]');
  if (!b || b.dataset.type === curType) return;
  const f = new FormData($('#entryForm'));
  curType = b.dataset.type;
  renderForm({ amount: parseMoney(f.get('amount')), note: f.get('note'), person: f.get('person'), date: f.get('date') });
  $('#entryForm [name=amount]').focus();
});

$('#entryForm').addEventListener('submit', e => {
  e.preventDefault();
  const r = readForm(e.target, curType);
  if (r.error) { toast(r.error, true); return; }
  if (curType !== 'kirim') {
    const bal = computeBalances().bal;
    if (r.data.amount > bal && !confirm(`«${K().name}» da ${fmtMoney(bal)} bor, siz ${fmtMoney(r.data.amount)} yozyapsiz.\nBaribir saqlansinmi?`)) return;
  }
  db.entries.push({ id: uid(), kassa: curK, type: curType, created: Date.now(), ...r.data });
  save();
  renderForm();
  toast({ kirim: 'Kirim saqlandi', chiqim: 'Chiqim saqlandi', qarz: 'Qarz yozildi' }[curType] + ` · ${K().name}`);
  $('#entryForm [name=amount]').focus();
});

/* Tablar va sozlamalar */
let lastTab = 'add';
function showTab(name) {
  $$('.tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $('#settingsBtn').classList.toggle('active', name === 'settings');
  if (name !== 'settings') lastTab = name;
}
$$('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
$('#settingsBtn').onclick = () => {
  const open = $('#tab-settings').classList.contains('active');
  showTab(open ? lastTab : 'settings');
  if (!open) window.scrollTo({ top: 0, behavior: 'smooth' });
};
$('#settingsBack').onclick = () => showTab(lastTab);

// Sana maydonining istalgan joyini bosganda kalendar ochilsin
document.addEventListener('click', e => {
  const el = e.target;
  if (el.tagName === 'INPUT' && (el.type === 'date' || el.type === 'datetime-local') && el.showPicker) {
    try { el.showPicker(); } catch (err) { /* ba'zi brauzerlarda ruxsat yo'q */ }
  }
});

/* Tarix filtrlari */
$$('.quick button').forEach(b => b.onclick = () => setRange(b.dataset.range));
['#fFrom', '#fTo'].forEach(s => $(s).addEventListener('change', () => {
  $$('.quick button').forEach(b => b.classList.remove('active'));
  renderHistory();
}));
$('#fType').addEventListener('change', () => renderHistory());
$('#fQ').addEventListener('input', () => renderHistory());

/* CSV (Excel) */
function toCSV(list) {
  const map = allBalanceMap();
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Kassa', 'Sana', 'Turi', 'Summa', 'Kim', 'Nima uchun', 'Kategoriya', 'Qarz muddati', 'Kassadagi qoldiq']];
  for (const e of list) {
    rows.push([kassaName(e.kassa), fmtDateFull(e.date), TYPES[e.type].label, TYPES[e.type].sign * e.amount,
      personOf(e), e.note, e.category, e.due ? fmtDateFull(e.due) : '', map[e.id]]);
  }
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
}
$('#csvBtn').onclick = () => {
  const list = filtered();
  if (!list.length) return toast("Yuklab olish uchun yozuv yo'q", true);
  download(`xisobchi-${slug(K().name)}-${today()}.csv`, toCSV(list), 'text/csv;charset=utf-8');
};
$('#exportAllCsv').onclick = () => {
  const list = db.kassas.flatMap(k => sortedAsc(entriesOf(k.id)));
  download(`xisobchi-hammasi-${today()}.csv`, toCSV(list), 'text/csv;charset=utf-8');
};

/* Zaxira */
$('#exportJson').onclick = () => {
  db.lastBackup = nowLocal();
  save();
  download(`xisobchi-zaxira-${today()}.json`, JSON.stringify(db, null, 2), 'application/json');
};

$('#importJson').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    if (!validData(raw)) throw new Error('fayl formati noto\'g\'ri');
    const d = migrate(raw);
    if (!d.kassas.length) throw new Error("faylda kassa yo'q");
    if (!confirm(`Zaxirada ${d.kassas.length} ta kassa va ${d.entries.length} ta yozuv bor.\nHozirgi ma'lumotlar shu zaxira bilan almashtirilsinmi?`)) return;
    const now = Date.now();
    const keep = new Set([...d.kassas, ...d.entries].map(x => x.id));
    const deleted = { ...(d.deleted || {}) };
    for (const x of [...db.kassas, ...db.entries]) if (!keep.has(x.id)) deleted[x.id] = now;
    for (const id of keep) delete deleted[id];
    db = { ...d, deleted,
      kassas: d.kassas.map(x => ({ ...x, edited: now })),
      entries: d.entries.map(x => ({ ...x, edited: now })) };
    ensureCur();
    save(); toast('Zaxiradan tiklandi');
  } catch (err) {
    toast('Tiklab bo\'lmadi: ' + err.message, true);
  }
});

$('#wipe').onclick = () => {
  if (!confirm("Shu brauzerdagi barcha kassalar va yozuvlar o'chadi, Google Drive uziladi.\n(Xavfsizlik uchun Google Drive'dagi fayllar o'chirilmaydi.)\n\nDavom etasizmi?")) return;
  if (prompt("Tasdiqlash uchun O'CHIRISH deb yozing") !== "O'CHIRISH") return toast('Bekor qilindi');
  localStorage.removeItem(KEY);
  localStorage.removeItem(CLOUD_KEY);
  localStorage.removeItem(CUR_KEY);
  location.reload();
};

/* ================= Google Drive'ga saqlash ================= */
const CLIENT_ID = String((window.XISOBCHI_CONFIG && window.XISOBCHI_CONFIG.GOOGLE_CLIENT_ID) || '').trim();
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = DRIVE_SCOPE + ' email';
const CLOUD_KEY = 'xisobchi_cloud';
const API = 'https://www.googleapis.com';

let cloud = loadCloud();      // { connected, email, folderId, fileId, backupDirId, dailyId, dailyDay, dirty, lastSync }
let cloudReady = false;       // shu seansda token bor va ulangan
let token = null, tokenExp = 0, tokenClient = null, pendingExplicit = false;
let cloudState = 'none', cloudMsg = '';
let pushTimer = null, pushChain = Promise.resolve(), lastPull = 0;

function loadCloud() { try { return JSON.parse(localStorage.getItem(CLOUD_KEY)) || {}; } catch (e) { return {}; } }
function saveCloud() { try { localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud)); } catch (e) { /* */ } }

// Ikki qurilmadagi ma'lumotni birlashtirish: hech bir yozuv yo'qolmaydi,
// tahrirlanganning eng yangisi olinadi, o'chirilganlar o'chiriladi.
function mergeData(a, b) {
  a = migrate(a); b = migrate(b);
  const t = x => x.edited || x.created || 0;
  const deleted = { ...a.deleted };
  for (const [id, ts] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] || 0, ts);
  const pick = (A, B) => {
    const m = new Map();
    for (const x of [...B, ...A]) { const c = m.get(x.id); if (!c || t(x) > t(c)) m.set(x.id, x); }
    return [...m.values()].filter(x => !(deleted[x.id] && deleted[x.id] >= t(x)));
  };
  const kassas = pick(a.kassas, b.kassas);
  const kids = new Set(kassas.map(k => k.id));
  const entries = pick(a.entries, b.entries).filter(e => kids.has(e.kassa));
  return { version: 2, kassas, entries, deleted,
    lastBackup: a.lastBackup || b.lastBackup || null,
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
}
const sortById = arr => [...arr].sort((x, y) => x.id < y.id ? -1 : 1);
function sameData(a, b) {
  a = migrate(a); b = migrate(b);
  return JSON.stringify(sortById(a.kassas)) === JSON.stringify(sortById(b.kassas)) &&
    JSON.stringify(sortById(a.entries)) === JSON.stringify(sortById(b.entries));
}

/* --- Drive API --- */
class GErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function gfetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token } });
  if (!r.ok) {
    let m = r.statusText;
    try { m = (await r.json()).error.message || m; } catch (e) { /* */ }
    throw new GErr(r.status, m);
  }
  return (r.headers.get('content-type') || '').includes('json') ? r.json() : r.text();
}
async function gFind(tag) {
  const q = `appProperties has { key='xisobchi' and value='${tag}' } and trashed=false`;
  const r = await gfetch(`${API}/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&pageSize=1&fields=files(id)`);
  return r.files && r.files[0] ? r.files[0].id : null;
}
async function gCreate(meta, text) {
  if (text === undefined) {
    return gfetch(`${API}/drive/v3/files?fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) });
  }
  const b = 'xisobchi' + Math.random().toString(36).slice(2);
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
               `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${b}--`;
  return gfetch(`${API}/upload/drive/v3/files?uploadType=multipart&fields=id`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
}
const gUpdate = (id, text) => gfetch(`${API}/upload/drive/v3/files/${id}?uploadType=media&fields=id`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: text });
const gDownload = id => gfetch(`${API}/drive/v3/files/${id}?alt=media`);

async function ensureFolder(tag, name, parent) {
  const id = await gFind(tag);
  if (id) return id;
  return (await gCreate({ name, mimeType: 'application/vnd.google-apps.folder',
    appProperties: { xisobchi: tag }, ...(parent ? { parents: [parent] } : {}) })).id;
}
async function writeOrCreate(idKey, tag, name, parent, text) {
  if (cloud[idKey]) {
    try { await gUpdate(cloud[idKey], text); return; }
    catch (e) { if (e.status !== 404) throw e; cloud[idKey] = null; }
  }
  cloud[idKey] = (await gFind(tag)) || null;
  if (cloud[idKey]) { await gUpdate(cloud[idKey], text); return; }
  cloud[idKey] = (await gCreate({ name, mimeType: 'application/json', parents: [parent],
    appProperties: { xisobchi: tag } }, text)).id;
}

/* --- Kirish (token) --- */
const gisReady = () => !!(window.google && google.accounts && google.accounts.oauth2);
const tokenValid = () => token && Date.now() < tokenExp;

function signIn(explicit) {
  if (!CLIENT_ID) { toast('Google ulanishi hali sozlanmagan (config.js)', true); return; }
  if (!gisReady()) { toast('Google xizmati yuklanmadi — internetni tekshirib, sahifani yangilang', true); return; }
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPES, callback: onToken,
      error_callback: e => {
        setCloud(cloud.connected ? 'need' : 'none');
        if (e && e.type === 'popup_failed_to_open') toast("Brauzer Google oynasini to'sdi — tepadagi tugmani bosing", true);
      },
    });
  }
  pendingExplicit = explicit;
  setCloud('busy');
  const cfg = { prompt: cloud.connected ? '' : 'select_account' };
  if (cloud.email) cfg.login_hint = cloud.email;
  tokenClient.requestAccessToken(cfg);
}

async function onToken(r) {
  if (r.error) { setCloud(cloud.connected ? 'need' : 'none'); toast('Google: ' + r.error, true); return; }
  if (!google.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
    setCloud(cloud.connected ? 'need' : 'none');
    toast("Google Drive'ga ruxsat berilmadi. Qayta ulaning va Drive katagini belgilang.", true);
    return;
  }
  token = r.access_token;
  tokenExp = Date.now() + (Number(r.expires_in || 3600) - 120) * 1000;
  await connectCloud(pendingExplicit);
}

async function connectCloud(explicit) {
  setCloud('busy');
  try {
    const u = await gfetch(`${API}/oauth2/v3/userinfo`).catch(() => ({}));
    if (u.email && cloud.email && u.email !== cloud.email) cloud = {};   // boshqa akkaunt
    if (u.email) cloud.email = u.email;
    cloud.folderId = await ensureFolder('root', 'Xisobchi', null);
    cloud.fileId = await gFind('main');
    cloud.connected = true;
    cloudReady = true;
    saveCloud();
    await pushNow();
    if (explicit && !hasData()) toast("Bu Google akkauntda Xisobchi ma'lumoti topilmadi — birinchi kassani yarating");
    else if (explicit) toast('Google Drive ulandi ✓');
  } catch (e) { handleCloudErr(e); }
}

/* --- Saqlash va sinxronlash --- */
function cloudSave() {
  if (!hasData()) return;
  cloud.dirty = true; saveCloud();
  if (!cloud.connected) { setCloud(CLIENT_ID ? 'none' : 'unconfigured'); return; }
  if (!cloudReady || !tokenValid()) { cloudReady = false; signIn(false); return; }  // foydalanuvchi bosgan paytda
  setCloud('busy');
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushChain = pushChain.then(pushNow); }, 500);
}

async function pushNow() {
  if (!cloudReady) return;
  if (!tokenValid()) { cloudReady = false; setCloud('need'); return; }
  setCloud('busy');
  try {
    // 1) Drive'dagi so'nggi holatni olib, shu yerdagisi bilan birlashtirish
    let remote = null;
    if (cloud.fileId) {
      try { remote = await gDownload(cloud.fileId); }
      catch (e) { if (e.status === 404) cloud.fileId = null; else throw e; }
      if (typeof remote === 'string') { try { remote = JSON.parse(remote); } catch (e) { remote = null; } }
      if (remote && !validData(remote)) { toast("Drive'dagi fayl buzilgan — shu yerdagi ma'lumot bilan yangilanadi", true); remote = null; }
    }
    lastPull = Date.now();
    if (remote) {
      const merged = !hasData() ? migrate(remote) : mergeData(db, remote);
      const changedHere = !hasData() || !sameData(merged, db);
      db = merged;
      persistLocal();
      if (changedHere) afterLoad();
      if (!cloud.dirty && sameData(merged, remote)) { cloud.lastSync = nowLocal(); saveCloud(); setCloud('ok'); return; }
    }
    if (!hasData()) { setCloud('ok'); return; }

    // 2) Natijani Drive'ga yozish: asosiy fayl + bugungi zaxira
    const json = JSON.stringify(db);
    await writeOrCreate('fileId', 'main', 'xisobchi.json', cloud.folderId, json);
    const day = today();
    if (cloud.dailyDay !== day) { cloud.dailyId = null; cloud.dailyDay = day; }
    if (!cloud.backupDirId) cloud.backupDirId = await ensureFolder('backups', 'zaxira', cloud.folderId);
    await writeOrCreate('dailyId', 'daily-' + day, `kunlik-${day}.json`, cloud.backupDirId, json);

    cloud.dirty = false;
    cloud.lastSync = nowLocal();
    saveCloud();
    setCloud('ok');
  } catch (e) { handleCloudErr(e); }
}

function handleCloudErr(e) {
  if (e && e.status === 401) { token = null; cloudReady = false; setCloud('need'); return; }
  if (!navigator.onLine || e instanceof TypeError) { setCloud('offline'); return; }
  setCloud('err', (e && e.message) || String(e));
}

function pullIfStale() {
  if (cloudReady && tokenValid() && Date.now() - lastPull > 30000) pushChain = pushChain.then(pushNow);
}
window.addEventListener('online', () => {
  if (!cloud.connected) return;
  if (cloudReady && tokenValid()) pushChain = pushChain.then(pushNow); else setCloud('need');
});
window.addEventListener('focus', pullIfStale);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pullIfStale(); });
window.addEventListener('beforeunload', e => {
  if (cloud.connected && cloud.dirty) { e.preventDefault(); e.returnValue = ''; }
});

/* --- Holat ko'rsatkichlari --- */
function setCloud(state, msg = '') { cloudState = state; cloudMsg = msg; renderCloud(); }

function renderCloud() {
  const em = cloud.email ? `${cloud.email}` : 'Google akkaunt';
  const last = cloud.lastSync ? ` Oxirgi saqlash: ${fmtDate(cloud.lastSync)}.` : '';
  const M = {
    unconfigured: ['warn', 'Google sozlanmagan', "Google Drive ulanishi hali sozlanmagan (config.js faylida Client ID yo'q). Ma'lumotlar faqat shu brauzerda turibdi."],
    none: ['warn', "Drive'ga ulanmagan", "Ma'lumotlar hozircha faqat shu brauzerda turibdi. Yo'qolmasligi uchun Google Drive'ni ulang."],
    need: ['warn', cloud.dirty ? 'Saqlanmagan — bosing' : 'Ulanish uchun bosing', `${em} bilan qayta ulanish kerak — bir marta bosing.${cloud.dirty ? " Oxirgi yozuvlar hali Drive'ga yuborilmagan." : ''}`],
    busy: ['ok busy', 'Saqlanmoqda…', `${em} Google Drive'iga saqlanmoqda…`],
    ok: ['ok', 'Drive\'ga saqlandi' + (cloud.lastSync ? ' · ' + cloud.lastSync.slice(11, 16) : ''), `${em} Google Drive'iga avtomatik saqlanmoqda. Barcha kassalar bitta joyda.${last}`],
    offline: ['warn', "Internet yo'q", "Internet yo'q. Yozuvlar shu brauzerda turibdi, internet qaytganda Drive'ga yuboriladi."],
    err: ['err', 'Saqlashda xato!', `Drive'ga saqlab bo'lmadi (${cloudMsg}). Bosib, qayta urinib ko'ring.`],
  };
  const [cls, short, long] = M[cloudState];
  const pill = $('#syncPill');
  pill.className = 'sync ' + cls;
  pill.textContent = short;
  pill.title = long;
  $('#cloudStatus').className = 'disk-status ' + cls.split(' ')[0];
  $('#cloudStatus').innerHTML = `<span class="dot"></span><div>${esc(long)}</div>`;

  const actionable = ['none', 'need', 'err', 'offline'].includes(cloudState);
  $('#gConnect').classList.toggle('hidden', !CLIENT_ID || !actionable);
  $('#gConnect').innerHTML = '<span class="g-logo"></span>' + (cloud.connected ? 'Qayta ulash' : 'Google bilan ulash');
  $('#gOpen').classList.toggle('hidden', !cloud.folderId || !cloud.connected);
  if (cloud.folderId) $('#gOpen').href = 'https://drive.google.com/drive/folders/' + cloud.folderId;
  $('#gDisconnect').classList.toggle('hidden', !cloud.connected);

  const showBanner = CLIENT_ID && ['none', 'need', 'err'].includes(cloudState) && hasData();
  $('#cloudBanner').classList.toggle('hidden', !showBanner);
  $('#cloudBanner').classList.toggle('err', cloudState === 'err');
  if (showBanner) {
    $('#cbTitle').textContent = cloudState === 'none' ? "Ma'lumotlar hali Google Drive'ga saqlanmayapti"
      : cloudState === 'need' ? 'Google Drive bilan qayta ulaning' : 'Google Drive\'ga saqlashda xato';
    $('#cbText').textContent = cloudState === 'none'
      ? "Kompyuter buzilsa yoki brauzer tozalansa yo'qolmasligi uchun bir marta ulang."
      : 'Bitta bosish kifoya — yozuvlar avtomatik yuboriladi.';
    $('#cbBtn').innerHTML = '<span class="g-logo"></span>' + (cloud.connected ? 'Ulanish' : 'Google bilan ulash');
  }
}

$('#gConnect').onclick = () => signIn(!cloud.connected);
$('#cbBtn').onclick = () => signIn(!cloud.connected);
$('#gDisconnect').onclick = () => {
  if (!confirm("Google Drive uzilsinmi? Shundan keyin ma'lumotlar faqat shu brauzerda saqlanadi.\n(Drive'dagi fayllar o'chirilmaydi.)")) return;
  if (token && gisReady()) google.accounts.oauth2.revoke(token, () => {});
  cloud = {}; saveCloud(); token = null; cloudReady = false;
  setCloud('none');
};
$('#syncPill').onclick = () => {
  if (CLIENT_ID && ['none', 'need', 'err', 'offline'].includes(cloudState)) return signIn(!cloud.connected);
  showTab('settings');
  $('#cloudCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

/* ================= Ishga tushirish ================= */
function start() {
  ensureCur();
  $('#setup').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderForm();
  setRange(range);
  render();
  renderCloud();
}

function afterLoad() {
  if (!hasData()) return;
  ensureCur();
  if ($('#app').classList.contains('hidden')) start(); else render();
}

$('#setupBtn').onclick = () => {
  const name = $('#setupName').value.trim() || 'Ishxona kassasi';
  // Birinchi kassa doim 'main' — ikki qurilmada alohida boshlansa ham bitta kassa bo'lib birlashadi
  db.kassas.push({ id: 'main', name, color: KASSA_COLORS[0], created: Date.now(),
    opening: parseMoney($('#setupAmount').value), openingDate: $('#setupDate').value || nowLocal() });
  curK = 'main';
  ensureCur();
  save();
  start();
};
$('#setupGoogle').onclick = () => signIn(true);
$('#setupGoogle').classList.toggle('hidden', !CLIENT_ID);

if (!hasData()) {
  $('#setup').classList.remove('hidden');
  $('#setupDate').value = nowLocal();
  $('#setupAmount').focus();
} else {
  start();
}
navigator.storage?.persist?.().catch(() => {});
setCloud(!CLIENT_ID ? 'unconfigured' : cloud.connected ? 'need' : 'none');
