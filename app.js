// Fácil: pantallas. Usa las funciones puras de logic.js (global `L`).
// Todo se pinta con plantillas de texto; los clics se atienden con data-a="acción" y los campos con data-in="campo".
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = L.fmt;
const now = () => new Date();
const moneyVal = n => (n ? '$ ' + L.fmtNum(n) : '');

const BUCKET = {
  need: { name: 'Necesidades', c: 'var(--need)' },
  want: { name: 'Gustos', c: 'var(--want)' },
  save: { name: 'Ahorro', c: 'var(--save)' },
};
const KIND_LABEL = { mesada: 'Mesada', sueldo: 'Sueldo', otros: 'Otros ingresos' };
const FREQ3 = { semanal: 'Cada semana', quincenal: 'Cada quincena', mensual: 'Cada mes' };
const FREQ4 = { ...FREQ3, anual: 'Cada año' };
const FREQ_SHORT = { semanal: 'a la semana', quincenal: 'a la quincena', mensual: 'al mes', anual: 'al año' };
const WDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const svg = (d, w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  plus: svg('<path d="M12 5v14M5 12h14"/>', 20),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 20),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 20),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 20),
  back: svg('<path d="M15 5l-7 7 7 7"/>', 20),
  chev: svg('<path d="M9 5l7 7-7 7"/>', 20),
  hoy: svg('<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', 24),
  plan: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v9l7 4"/>', 24),
  metas: svg('<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>', 24),
  mas: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', 24),
};
const LOGO = '<svg width="52" height="52" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#12241F"/><rect x="14" y="30" width="9" height="20" rx="4.5" fill="#2F5BEA"/><rect x="27.5" y="18" width="9" height="32" rx="4.5" fill="#F28C1B"/><rect x="41" y="24" width="9" height="26" rx="4.5" fill="#12A150"/></svg>';

// ---------- Datos (localStorage siempre dentro de try/catch; si falla, sigue en memoria) ----------
function load() {
  let raw = null;
  try { raw = localStorage.getItem(L.STORE_KEY); } catch (e) { /* sin almacenamiento: trabaja en memoria */ }
  if (!raw) return L.defaults();
  const r = L.validateBackup(raw);
  if (r.data) return r.data;
  // Datos dañados: se guardan aparte para no perderlos y la app arranca limpia.
  try { localStorage.setItem(L.STORE_KEY + '-danado-' + Date.now(), raw); } catch (e) { }
  return L.defaults();
}
function save() { try { localStorage.setItem(L.STORE_KEY, JSON.stringify(S)); } catch (e) { } }

let S = L.takeSnapshot(load(), now());
save();

const ui = { tab: 'hoy', more: null, histMonth: null, fijosHint: false, ob: { kind: 'mesada', amount: 0, freq: 'mensual' }, obErr: '', sh: null, undo: null, adj: {} };

// Cambia el estado, guarda y repinta. Con `msg` muestra un aviso con Deshacer que vuelve todo como estaba.
function mutate(fn, msg) {
  const prev = JSON.stringify(S);
  fn();
  save();
  render();
  if (msg) toast(msg, () => { S = JSON.parse(prev); save(); render(); });
  else hideToast();
}

// ---------- Aviso con Deshacer ----------
let toastTimer;
function toast(msg, undo) {
  clearTimeout(toastTimer);
  ui.undo = undo || null;
  $('#toast-slot').innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${undo ? '<button data-a="undo">Deshacer</button>' : ''}</div>`;
  toastTimer = setTimeout(hideToast, 6000);
}
function hideToast() { clearTimeout(toastTimer); ui.undo = null; $('#toast-slot').innerHTML = ''; }

// ---------- Utilidades de pintado ----------
function focusSel() {
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  if (a.id) return '#' + CSS.escape(a.id);
  const k = a.dataset.a ? `[data-a="${a.dataset.a}"]` : a.dataset.in ? `[data-in="${a.dataset.in}"]` : null;
  return k && (a.dataset.v != null ? `${k}[data-v="${CSS.escape(a.dataset.v)}"]` : k);
}
// Repinta un contenedor sin perder el foco del teclado.
function paint(el, html) {
  const sel = el.contains(document.activeElement) ? focusSel() : null;
  el.innerHTML = html;
  if (sel) { const f = el.querySelector(sel); if (f) f.focus({ preventScroll: true }); }
}
const chips = (action, current, labels, aria = {}) => Object.entries(labels).map(([v, t]) =>
  `<button class="chip" data-a="${action}" data-v="${esc(v)}" aria-pressed="${String(current) === v}"${aria[v] ? ` aria-label="${esc(aria[v])}"` : ''}>${esc(t)}</button>`).join('');
const hd = (title, small) => `<header class="hd">${small ? `<small>${esc(small)}</small>` : ''}<h1>${esc(title)}</h1></header>`;
const sheetHead = t => `<div class="sheet-h"><h2 id="sheet-title">${esc(t)}</h2><button class="icon" data-a="close" aria-label="Cerrar">${I.x}</button></div>`;
const backBtn = to => `<button class="back" data-a="moreBack" data-v="${to || ''}">${I.back}Volver</button>`;
const dayLabel = ts => {
  const d = new Date(ts), diff = L.daysBetween(d, now());
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return `${d.getDate()} ${L.MONTHS[d.getMonth()].slice(0, 3)}`;
};
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0);
function fmtInput(el) { const v = L.parseAmount(el.value); el.value = moneyVal(v); return v; }
const parseRate = s => { const v = parseFloat(String(s || '').replace(',', '.')); return v > 0 ? v / 100 : 0; };

// ---------- Pintado general ----------
function render() {
  const app = $('#app');
  if (!S.setup) {
    $('#tabs').hidden = true; $('#fab-slot').innerHTML = '';
    paint(app, viewWelcome());
    return;
  }
  const views = { hoy: viewHoy, plan: viewPlan, metas: viewMetas, mas: viewMas };
  paint(app, views[ui.tab]());
  const tabs = $('#tabs');
  tabs.hidden = false;
  paint(tabs, `<nav aria-label="Secciones">${[['hoy', 'Hoy'], ['plan', 'Plan'], ['metas', 'Metas'], ['mas', 'Más']].map(([k, t]) =>
    `<button data-a="tab" data-v="${k}"${ui.tab === k ? ' aria-current="page"' : ''}>${I[k]}${t}</button>`).join('')}</nav>`);
  $('#fab-slot').innerHTML = ui.tab === 'hoy' ? `<button class="fab" data-a="anotar">${I.plus}Anotar</button>` : '';
}

// Zonas que se actualizan mientras la persona escribe o mueve un deslizador (sin repintar todo).
const LIVE = {
  'ob-preview': () => obPreview(),
  'plan-month': () => planMonth(),
  'split-box': () => splitBox(),
  'need-pct': () => S.split[0] + '%',
  'want-pct': () => S.split[1] + '%',
  'fijos-sum': () => fijosSum(),
  'alcanza-out': () => alcanzaOut(),
};
function refreshLive() { for (const id in LIVE) { const el = document.getElementById(id); if (el) paint(el, LIVE[id]()); } }

// ---------- 4.0 Inicio ----------
function viewWelcome() {
  const o = ui.ob;
  return `<div class="welcome">
    <div class="brand">${LOGO}<h1>Fácil</h1></div>
    <p class="muted" style="margin:0">Tu plan de plata en un minuto. Gratis, sin cuenta y sin anuncios. Tus datos se quedan en tu celular.</p>
    <section class="card">
      <h3 class="q" id="q-kind">¿Qué recibes?</h3>
      <div class="chips" role="group" aria-labelledby="q-kind">${chips('obKind', o.kind, KIND_LABEL)}</div>
      <label class="q" for="ob-amt">¿Cuánto recibes?</label>
      <input class="amount" id="ob-amt" data-in="obAmt" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${moneyVal(o.amount)}">
      <h3 class="q" id="q-freq">¿Cada cuánto?</h3>
      <div class="chips" role="group" aria-labelledby="q-freq">${chips('obFreq', o.freq, FREQ3)}</div>
      <div id="ob-preview" class="preview" aria-live="polite">${obPreview()}</div>
    </section>
    <p class="err" role="alert">${esc(ui.obErr)}</p>
    <button class="btn big full" data-a="create" style="margin-top:8px">Crear mi plan</button>
    <p class="muted" style="text-align:center">Lo puedes cambiar después. Tus gastos fijos los agregas en Plan.</p>
  </div>`;
}
function obPreview() {
  const o = ui.ob, inc = L.monthly(o.amount, o.freq), split = L.KIND_DEFAULTS[o.kind].split;
  return `<p style="margin:0">Al mes te entran</p><div class="big">${fmt(inc)}</div>${splitBars(L.splitIncome(inc, split), split)}`;
}
function splitBars(s, split) {
  return `<div class="bars" style="margin-top:12px">${['need', 'want', 'save'].map((k, i) => `<div class="row" style="--c:${BUCKET[k].c}">
    <div class="rt"><b><i class="dot" style="background:${BUCKET[k].c}"></i>${BUCKET[k].name} · ${split[i]}%</b><span class="num">${fmt(s[k])}</span></div>
    <div class="bar" aria-hidden="true"><i class="vr" style="width:${split[i]}%"></i></div></div>`).join('')}</div>`;
}

// ---------- 4.1 Hoy ----------
function bucketRow(key, fixed, used, total) {
  const B = BUCKET[key], all = fixed + used, red = key !== 'save' && all > total, max = Math.max(total, all, 1);
  const label = `${B.name}: ${key === 'save' ? 'ahorrado' : 'usado'} ${fmt(all)} de ${fmt(total)}${fixed ? `, de eso ${fmt(fixed)} son fijos` : ''}${red ? '. Te pasaste' : ''}`;
  return `<div class="row${red ? ' red' : ''}" style="--c:${B.c}">
    <div class="rt"><b><i class="dot" style="background:${B.c}"></i>${B.name}</b><span class="num">${fmt(all)} de ${fmt(total)}${red ? ' · te pasaste' : ''}</span></div>
    <div class="bar" role="img" aria-label="${esc(label)}">${fixed ? `<i class="fx" style="width:${fixed / max * 100}%"></i>` : ''}<i class="vr" style="width:${used / max * 100}%"></i></div>
  </div>`;
}
function txRow(t) {
  let c, title, sign = '';
  if (t.t === 'gasto') {
    const cat = L.catById(t.cat); c = BUCKET[cat.bucket].c; title = cat.name; sign = '− ';
    const d = t.debt && S.deudas.find(x => x.id === t.debt);
    if (d) title += ': ' + d.name;
  } else if (t.t === 'ahorro') {
    const g = S.goals.find(x => x.id === t.goal); c = BUCKET.save.c; title = g ? 'Ahorro: ' + g.name : 'Ahorro libre';
  } else { c = 'var(--ink)'; title = t.mode === 'ahorro' ? 'Me entró (todo a ahorro)' : 'Me entró'; sign = '+ '; }
  return `<li class="li"><i class="dot" style="background:${c}"></i>
    <div class="t">${esc(title)}<small>${dayLabel(t.ts)}${t.note ? ' · ' + esc(t.note) : ''}</small></div>
    <span class="a">${sign}${fmt(t.amt)}</span>
    <button class="icon" data-a="delTx" data-v="${esc(t.id)}" aria-label="Borrar ${esc(title)} de ${fmt(t.amt)}">${I.trash}</button></li>`;
}
function viewHoy() {
  const n = now(), b = L.budget(S, n);
  const hero = b.over
    ? `<div class="hero"><div class="l">Este mes</div><div class="over num">Te pasaste ${fmt(-b.queda)}</div>
        <div class="s">Mira cuál barra está roja y baja ahí primero. Lo que sigue sale de tu ahorro.</div></div>`
    : `<div class="hero"><div class="l">Para llegar a fin de mes puedes gastar</div>
        <div class="n">${fmt(b.perDay)}</div>
        <div class="s">por día · ${b.daysLeft === 1 ? 'queda 1 día (hoy)' : `quedan ${b.daysLeft} días`}</div>
        <div class="trk" aria-hidden="true"><i style="width:${pct(b.spent, b.libre)}%"></i></div>
        <div class="u num">Llevas ${fmt(b.spent)} de ${fmt(b.libre)} para gastar este mes</div></div>`;
  const ups = L.upcoming(S.fijos, n, 7);
  const today = L.dateKey(n), active = L.activeDays(S).has(today), st = L.streak(S, n);
  const recent = S.tx.slice().sort((a, c) => c.ts - a.ts).slice(0, 6);
  return hd('Tu plan de este mes', L.monthName(L.monthKey(n))) + hero +
    (b.alertCritical ? `<div class="alert" role="alert">Tus fijos ya son más de lo que te queda para gastar. Revisa en Plan si puedes pausar alguna suscripción o subir tus ingresos.</div>` : '') +
    `<section class="card" aria-label="Cómo vas en cada parte"><div class="bars">
      ${bucketRow('need', b.Fn, b.spentNeed, b.need)}${bucketRow('want', b.Fg, b.spentWant, b.want)}${bucketRow('save', 0, b.saved, b.save)}
    </div>${b.Fn + b.Fg ? '<div class="legend" style="margin-top:10px">La parte rayada son tus gastos fijos. Se descuentan desde el día 1.</div>' : ''}</section>` +
    (ups.length ? `<section class="card"><h2>Próximos pagos</h2><p class="sub">Tus fijos de los próximos 7 días. Ya están descontados; esto es para que no se te olviden.</p><ul class="list">${ups.map(u => {
      const paid = S.paid[u.fijo.id] === u.date;
      const when = u.inDays === 0 ? 'Hoy' : u.inDays === 1 ? 'Mañana' : `En ${u.inDays} días`;
      return `<li class="li"><i class="dot" style="background:${BUCKET[u.fijo.bucket].c}"></i><div class="t">${esc(u.fijo.name)}<small>${when} · ${fmt(u.fijo.amt)}</small></div>
        <button class="chip" data-a="paid" data-v="${esc(u.fijo.id)}|${u.date}" aria-pressed="${paid}">${paid ? 'Pagado ✓' : 'Pagado'}</button></li>`;
    }).join('')}</ul></section>` : '') +
    `<section class="card"><h2>${st ? `Llevas ${st} ${st === 1 ? 'día' : 'días'} anotando` : 'Empieza tu racha hoy'}</h2>
      <p class="sub">Cuenta cada día que anotas algo. Si hoy no gastaste, también cuenta.</p>
      ${active ? '<p class="ok" style="margin:0">Hoy ya cuenta para tu racha.</p>' : '<button class="btn ghost full" data-a="noSpend">Hoy no gasté nada</button>'}
    </section>` +
    `<div class="tip"><b>Consejo</b>${esc(L.tip(S, b, n))}</div>` +
    `<section class="card"><h2>Últimos movimientos</h2>${recent.length ? `<ul class="list">${recent.map(txRow).join('')}</ul>` : '<p class="empty">Todavía no has anotado nada. Toca <b>+ Anotar</b> cuando gastes.</p>'}</section>`;
}

// ---------- 4.2 Anotar ----------
function openSheet(sh, focusId) {
  ui.sh = sh;
  renderSheet();
  const dlg = $('#sheet');
  if (!dlg.open) dlg.showModal();
  const f = focusId && document.getElementById(focusId);
  if (f) f.focus();
}
function renderSheet() { if (ui.sh) paint($('#sheet-in'), SHEETS[ui.sh.type](ui.sh)); }
function closeSheet() { const d = $('#sheet'); if (d.open) d.close(); ui.sh = null; }

const SHEETS = {
  anotar: sh => sheetHead('Anotar') +
    `<div class="seg" role="group" aria-label="Tipo de movimiento">${[['gasto', 'Gasté'], ['ahorro', 'Ahorré'], ['ingreso', 'Me entró']].map(([v, t]) =>
      `<button data-a="shT" data-v="${v}" aria-pressed="${sh.t === v}">${t}</button>`).join('')}</div>
    <label class="q" for="sh-amt">¿Cuánto?</label>
    <input class="amount" id="sh-amt" data-in="shAmt" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${moneyVal(sh.amt)}">
    <div class="chips" style="margin-top:12px">${[5000, 10000, 20000, 50000].map(v => `<button class="chip" data-a="shAdd" data-v="${v}" aria-label="Sumar ${L.fmtNum(v)}">+ ${L.fmtNum(v)}</button>`).join('')}</div>
    ${sh.t === 'gasto' ? `<h3 class="q" id="q-cat">¿En qué?</h3><div class="grid" role="group" aria-labelledby="q-cat">${L.CATS.map(c =>
      `<button data-a="shCat" data-v="${c.id}" aria-pressed="${sh.cat === c.id}"><i class="dot" style="background:${BUCKET[c.bucket].c}"></i>${c.name}</button>`).join('')}</div>`
      : sh.t === 'ahorro' ? `<h3 class="q" id="q-goal">¿A qué meta va?</h3><div class="chips" role="group" aria-labelledby="q-goal">${chips('shGoal', sh.goal || '', Object.fromEntries([['', 'Ahorro libre'], ...S.goals.map(g => [g.id, g.name])]))}</div>`
      : `<h3 class="q" id="q-mode">¿Qué hago con esta plata?</h3><p class="muted" style="margin:-4px 0 8px">Propina, rebusque, un trabajo suelto…</p><div class="chips" role="group" aria-labelledby="q-mode">${chips('shMode', sh.mode, { plan: 'Repartir como mi plan', ahorro: 'Guardarlo todo en ahorro' })}</div>`}
    <label class="q" for="sh-note">Nota (opcional)</label>
    <input class="field" id="sh-note" data-in="shNote" maxlength="60" autocomplete="off" value="${esc(sh.note)}">
    <p class="err" role="alert">${esc(sh.err)}</p>
    <button class="btn big full" data-a="shSave" style="margin-top:8px">Guardar</button>`,

  fijo: sh => {
    const dayField = `<label class="q" for="f-day">¿Qué día se paga?</label>
      <input class="field" id="f-day" data-in="fDay" type="number" inputmode="numeric" min="1" max="31" value="${sh.day}" style="max-width:120px">
      <p class="muted" style="margin:6px 0 0">Del 1 al 31. Si el mes no tiene ese día, se paga el último día del mes.</p>`;
    return sheetHead(sh.id ? 'Editar gasto fijo' : 'Nuevo gasto fijo') +
      `<p class="muted" style="margin:0">Un pago que se repite. No lo tienes que anotar: se descuenta solo desde el día 1 del mes.</p>
      <h3 class="q" id="q-fp">¿Qué es?</h3>
      <div class="chips" role="group" aria-labelledby="q-fp">${chips('fPreset', sh.preset, Object.fromEntries(L.FIJO_PRESETS.map(p => [p.id, p.label])))}</div>
      <label class="q" for="f-name">Nombre</label>
      <input class="field" id="f-name" data-in="fName" maxlength="40" autocomplete="off" placeholder="Por ejemplo: Spotify" value="${esc(sh.name)}">
      <label class="q" for="f-amt">Monto</label>
      <input class="amount" id="f-amt" data-in="fAmt" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${moneyVal(sh.amt)}">
      <h3 class="q" id="q-ff">¿Cada cuánto?</h3>
      <div class="chips" role="group" aria-labelledby="q-ff">${chips('fFreq', sh.freq, FREQ4)}</div>
      ${sh.freq === 'mensual' ? dayField
        : sh.freq === 'anual' ? `<label class="q" for="f-month">¿En qué mes?</label><select class="field" id="f-month" data-in="fMonth">${L.MONTHS.map((m, i) => `<option value="${i + 1}"${sh.month === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select>${dayField}`
        : sh.freq === 'semanal' ? `<h3 class="q" id="q-wd">¿Qué día de la semana?</h3><div class="chips" role="group" aria-labelledby="q-wd">${chips('fWday', sh.wday, { 1: 'L', 2: 'M', 3: 'M', 4: 'J', 5: 'V', 6: 'S', 0: 'D' }, Object.fromEntries(WDAYS.map((d, i) => [i, d])))}</div>`
        : '<p class="muted" style="margin:12px 0 0">Se paga el 15 y el último día de cada mes.</p>'}
      <h3 class="q" id="q-fb">¿Cuenta como?</h3>
      <div class="chips" role="group" aria-labelledby="q-fb">${chips('fBucket', sh.bucket, { need: 'Necesidades', want: 'Gustos' })}</div>
      <p class="muted" style="margin:6px 0 0">Necesidades: lo que no puedes dejar de pagar. Gustos: lo que podrías pausar.</p>
      <label class="switch" style="margin-top:12px">Activo<input type="checkbox" data-in="fActive"${sh.active ? ' checked' : ''}></label>
      <p class="muted" style="margin:0">Si lo pausas, deja de descontarse pero no se borra.</p>
      <p class="err" role="alert">${esc(sh.err)}</p>
      <button class="btn big full" data-a="fSave" style="margin-top:8px">Guardar</button>
      ${sh.id ? `<button class="btn full ghost" data-a="fDel" style="margin-top:8px">${I.trash}Borrar este gasto fijo</button>` : ''}`;
  },

  goal: sh => sheetHead(sh.id ? 'Editar meta' : 'Nueva meta') +
    `<label class="q" for="g-name">¿Para qué ahorras?</label>
    <input class="field" id="g-name" data-in="gName" maxlength="40" autocomplete="off" placeholder="Por ejemplo: Celular nuevo" value="${esc(sh.name)}">
    <label class="q" for="g-amt">¿Cuánto cuesta?</label>
    <input class="amount" id="g-amt" data-in="gAmt" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${moneyVal(sh.target)}">
    <p class="err" role="alert">${esc(sh.err)}</p>
    <button class="btn big full" data-a="gSave" style="margin-top:8px">Guardar meta</button>`,

  deuda: sh => sheetHead(sh.id ? 'Editar deuda' : 'Nueva deuda') +
    `<label class="q" for="d-name">¿Qué es?</label>
    <input class="field" id="d-name" data-in="dName" maxlength="40" autocomplete="off" placeholder="Por ejemplo: Moto" value="${esc(sh.name)}">
    <label class="q" for="d-to">¿A quién le debes?</label>
    <input class="field" id="d-to" data-in="dTo" maxlength="40" autocomplete="off" placeholder="Banco, tienda, un amigo…" value="${esc(sh.to)}">
    <label class="q" for="d-bal">¿Cuánto debes hoy?</label>
    <input class="amount" id="d-bal" data-in="dBal" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${moneyVal(sh.balance)}">
    <label class="q" for="d-pay">¿Cuánto pagas cada mes?</label>
    <input class="amount" id="d-pay" data-in="dPay" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${moneyVal(sh.payment)}">
    <label class="q" for="d-rate">Interés mensual en % (opcional)</label>
    <input class="field" id="d-rate" data-in="dRate" inputmode="decimal" autocomplete="off" placeholder="Por ejemplo: 2" value="${esc(sh.rateTxt)}" style="max-width:160px">
    <p class="muted" style="margin:6px 0 0">El interés es lo que te cobran cada mes por prestarte. Si no sabes, déjalo vacío.</p>
    <p class="err" role="alert">${esc(sh.err)}</p>
    <button class="btn big full" data-a="dSave" style="margin-top:8px">Guardar deuda</button>`,

  pago: sh => sheetHead('Anoté un pago') +
    `<p class="muted" style="margin:0">Se resta de lo que debes en <b>${esc(sh.name)}</b> y cuenta como gasto en Necesidades.</p>
    <label class="q" for="p-amt2">¿Cuánto pagaste?</label>
    <input class="amount" id="p-amt2" data-in="pAmt" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${moneyVal(sh.amt)}">
    <p class="err" role="alert">${esc(sh.err)}</p>
    <button class="btn big full" data-a="pSave" style="margin-top:8px">Guardar pago</button>`,
};

// ---------- 4.3 Plan ----------
function planMonth() { const b = L.budget(S, now()); return `Al mes: <b class="num">${fmt(b.base)}</b>${b.extras ? ` · con ingresos extra: <b class="num">${fmt(b.income)}</b>` : ''}`; }
function splitBox() {
  const b = L.budget(S, now());
  const preset = L.PRESETS.find(p => p.split.join() === S.split.join());
  return `<div class="chips" role="group" aria-label="Repartos listos">${L.PRESETS.map(p =>
    `<button class="chip" data-a="preset" data-v="${p.id}" aria-pressed="${preset === p}">${p.name} ${p.split.join('·')}</button>`).join('')}</div>
    <div class="split3">${[['need', b.need, S.split[0]], ['want', b.want, S.split[1]], ['save', b.save, S.split[2]]].map(([k, v, p]) =>
      `<div style="border-top:4px solid ${BUCKET[k].c}"><b>${BUCKET[k].name} ${p}%</b><span>${fmt(v)}</span></div>`).join('')}</div>`;
}
function fijosSum() {
  const b = L.budget(S, now()), tot = b.Fn + b.Fg;
  if (!S.fijos.length) return '<p class="empty">Todavía no tienes gastos fijos.</p>';
  return `<p style="margin:0 0 8px">Tus fijos suman <b class="num">${fmt(tot)}</b> al mes (${b.income ? Math.round(tot / b.income * 100) : 0}% de lo que te entra).</p>` +
    (b.alertCritical ? '<div class="alert" role="alert">Tus fijos ya son más de lo que te queda para gastar. Revisa si puedes pausar alguna suscripción o subir tus ingresos.</div>'
      : b.alertNeed ? '<div class="alert" role="alert">Tus fijos ya son más de lo que le asignaste a necesidades.<br><button class="btn sm" data-a="adjust">Ajustar reparto</button></div>' : '');
}
const dueText = f => f.freq === 'semanal' ? `los ${WDAYS[f.wday ?? 1]}` : f.freq === 'quincenal' ? 'el 15 y el último día'
  : f.freq === 'anual' ? `${f.day} de ${L.MONTHS[(f.month || 1) - 1]}` : `día ${f.day}`;
function viewPlan() {
  const b = L.budget(S, now());
  const extras = L.txOfMonth(S.tx, b.key).filter(t => t.t === 'ingreso').sort((a, c) => c.ts - a.ts);
  return hd('Tu plan', 'Plan') +
    `<section class="card"><h2>Lo que te entra</h2>
      <h3 class="q" id="p-kind">¿Qué recibes?</h3><div class="chips" role="group" aria-labelledby="p-kind">${chips('kind', S.kind, KIND_LABEL)}</div>
      <label class="q" for="p-amt">¿Cuánto?</label>
      <input class="amount" id="p-amt" data-in="planAmt" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${moneyVal(S.amount)}">
      <h3 class="q" id="p-freq">¿Cada cuánto?</h3><div class="chips" role="group" aria-labelledby="p-freq">${chips('freq', S.freq, FREQ3)}</div>
      <p id="plan-month" style="margin:14px 0 0">${planMonth()}</p>
    </section>
    <section class="card"><h2>Cómo repartirlo</h2>
      <p class="sub">Necesidades es lo que no puedes dejar de pagar. Gustos, lo que te das. El ahorro es lo que sobra hasta 100%.</p>
      <div id="split-box">${splitBox()}</div>
      <label class="q" for="r-need">Necesidades: <span id="need-pct">${S.split[0]}%</span></label>
      <input type="range" id="r-need" data-in="need" min="0" max="100" step="5" value="${S.split[0]}" style="--c:var(--need)">
      <label class="q" for="r-want">Gustos: <span id="want-pct">${S.split[1]}%</span></label>
      <input type="range" id="r-want" data-in="want" min="0" max="100" step="5" value="${S.split[1]}" style="--c:var(--want)">
    </section>
    <section class="card" id="fijos"><h2>Mis gastos fijos</h2>
      ${ui.fijosHint ? `<div class="tip" style="margin:4px 0 12px"><b>Siguiente paso</b>¿Pagas arriendo, internet o alguna suscripción? Agrégalos para que tu número diario sea real.
        <div class="btns"><button class="btn sm" data-a="addFijo">+ Agregar gasto fijo</button><button class="btn sm ghost" data-a="noHint">Ahora no</button></div></div>` : ''}
      <div id="fijos-sum">${fijosSum()}</div>
      ${S.fijos.length ? `<ul class="list">${S.fijos.map(f => `<li class="li${f.active ? '' : ' off'}"><i class="dot" style="background:${BUCKET[f.bucket].c}"></i>
        <div class="t">${esc(f.name)}<small>${fmt(f.amt)} ${FREQ_SHORT[f.freq]} · ${dueText(f)}${f.freq !== 'mensual' ? ` · ${fmt(L.monthly(f.amt, f.freq))} al mes` : ''}${f.active ? '' : ' · Pausado'}</small></div>
        <input type="checkbox" data-in="fToggle" data-v="${esc(f.id)}"${f.active ? ' checked' : ''} aria-label="Activo: ${esc(f.name)}" style="width:28px;height:28px;accent-color:var(--save)">
        <button class="icon" data-a="editFijo" data-v="${esc(f.id)}" aria-label="Editar ${esc(f.name)}">${I.edit}</button></li>`).join('')}</ul>` : ''}
      <button class="btn full ghost" data-a="addFijo" style="margin-top:12px">${I.plus}Agregar gasto fijo</button>
    </section>
    <section class="card"><h2>Ingresos extra de este mes</h2><p class="sub">Lo que anotaste con "Me entró".</p>
      ${extras.length ? `<ul class="list">${extras.map(txRow).join('')}</ul>` : '<p class="empty">Este mes no has anotado ingresos extra.</p>'}
    </section>`;
}

// ---------- 4.4 Metas ----------
function viewMetas() {
  const b = L.budget(S, now()), free = L.freeSaved(S.tx, S.goals), planSave = L.splitIncome(b.base, S.split).save;
  const emergency = Math.round(3 * b.need / 1000) * 1000;
  const goals = S.goals.map(g => {
    const saved = L.goalSaved(S.tx, g.id), m = L.monthsToGoal(g.target, saved, planSave), done = saved >= g.target;
    return `<section class="card"><h2>${esc(g.name)}</h2>
      <div class="prog" role="img" aria-label="${fmt(saved)} de ${fmt(g.target)}"><i style="width:${pct(saved, g.target)}%"></i></div>
      <p class="num" style="margin:0"><b>${fmt(saved)}</b> de ${fmt(g.target)}</p>
      <p class="muted" style="margin:6px 0 0">${done ? '¡Lo lograste! Ya tienes lo de esta meta.'
        : m == null ? 'Tu plan no tiene ahorro mensual. Súbelo en Plan para ver cuándo llegas.'
          : `Si ahorras ${fmt(planSave)} al mes, llegas en ${m} ${m === 1 ? 'mes' : 'meses'}. (Supone que todo tu ahorro va a esta meta.)`}</p>
      <div class="btns"><button class="btn sm" data-a="saveTo" data-v="${esc(g.id)}">${I.plus}Ahorrar</button>
        <button class="btn sm ghost" data-a="editGoal" data-v="${esc(g.id)}">${I.edit}Editar</button>
        <button class="btn sm ghost" data-a="delGoal" data-v="${esc(g.id)}" aria-label="Borrar meta ${esc(g.name)}">${I.trash}Borrar</button></div>
    </section>`;
  }).join('');
  return hd('Tus metas', 'Metas') +
    (S.goals.length ? goals : `<section class="card"><h2>Empieza por un fondo de emergencia</h2>
      <p class="sub">Es plata guardada solo para imprevistos: se daña el celular, te enfermas, te quedas sin trabajo. La meta sugerida es 3 veces lo que asignas a necesidades al mes.</p>
      <button class="btn full" data-a="emergency" data-v="${emergency}">Crear Fondo de emergencia de ${fmt(emergency)}</button></section>`) +
    (free ? `<section class="card"><h2>Ahorro libre</h2><p class="sub">Lo que ahorraste sin meta (o de metas que borraste).</p><p class="num" style="margin:0;font-size:22px;font-weight:800">${fmt(free)}</p></section>` : '') +
    `<button class="btn full ghost" data-a="addGoal" style="margin-top:12px">${I.plus}Nueva meta</button>`;
}

// ---------- 4.5 Más ----------
const MORE = [
  ['historial', 'Historial', '¿En qué se me fue la plata cada mes?'],
  ['retos', 'Retos', 'Rachas y retos para ahorrar'],
  ['deudas', 'Deudas', 'Cuánto debes y cuándo terminas'],
  ['alcanza', '¿Me alcanza?', 'Calcula antes de comprar'],
  ['aprende', 'Aprende', '12 lecciones cortas de plata'],
  ['ajustes', 'Ajustes', 'Respaldo, recordatorios y empezar de nuevo'],
];
function viewMas() {
  if (ui.more === 'historial') return viewHistorial();
  if (ui.more === 'retos') return viewRetos();
  if (ui.more === 'deudas') return viewDeudas();
  if (ui.more === 'alcanza') return viewAlcanza();
  if (ui.more === 'aprende') return viewAprende();
  if (ui.more === 'ajustes') return viewAjustes();
  return hd('Más') + `<section class="card menu"><div class="list">${MORE.map(([k, t, d]) =>
    `<button class="li" data-a="more" data-v="${k}"><div class="t">${t}<small>${d}</small></div>${I.chev}</button>`).join('')}</div></section>`;
}

// 4.5.1 Historial
function viewHistorial() {
  if (ui.histMonth) {
    const m = L.monthSummary(S, ui.histMonth), max = Math.max(1, ...m.cats.map(c => c.amt));
    return backBtn('historial') + hd(L.monthName(m.key), 'Historial') +
      `<section class="card"><div class="split3" style="margin:0;grid-template-columns:1fr 1fr">
        <div><b>Te entró</b><span>${fmt(m.income)}</span></div><div><b>Gastaste</b><span>${fmt(m.gastado)}</span></div>
        <div><b>Ahorraste</b><span>${fmt(m.saved)}</span></div><div><b>${m.sobro < 0 ? 'Te pasaste' : 'Sobró'}</b><span${m.sobro < 0 ? ' style="color:var(--alert)"' : ''}>${fmt(Math.abs(m.sobro))}</span></div></div></section>
      <section class="card"><h2>¿En qué se me fue la plata?</h2>
        <p class="sub">Gastos fijos de ese mes: <b class="num">${fmt(m.fijos)}</b></p>
        ${m.cats.length ? m.cats.map(c => `<div class="hbar"><span>${esc(c.name)}</span><b class="num">${fmt(c.amt)}</b>
          <div class="prog" aria-hidden="true" style="--c:${BUCKET[c.bucket].c}"><i style="width:${c.amt / max * 100}%"></i></div></div>`).join('') : '<p class="empty">Ese mes no anotaste gastos.</p>'}
      </section>`;
  }
  return backBtn() + hd('Historial', 'Más') + `<section class="card menu"><div class="list">${L.historyMonths(S, now()).map(k => {
    const m = L.monthSummary(S, k);
    return `<button class="li" data-a="histMonth" data-v="${k}"><div class="t">${L.monthName(k)}<small class="num">Entró ${fmt(m.income)} · Gastaste ${fmt(m.gastado)} · Ahorraste ${fmt(m.saved)}</small></div>
      <span class="a"${m.sobro < 0 ? ' style="color:var(--alert)"' : ''}>${m.sobro < 0 ? 'Te pasaste ' + fmt(-m.sobro) : 'Sobró ' + fmt(m.sobro)}</span></button>`;
  }).join('')}</div></section>`;
}

// 4.5.2 Retos
function viewRetos() {
  const n = now(), st = L.streak(S, n), p = L.challengeProgress(S, n);
  const valTxt = p && (p.def.id === 'sem52' ? `${fmt(p.value)} de ${fmt(p.goal)}` : `${p.value} de ${p.goal} días`);
  return backBtn() + hd('Retos', 'Más') +
    `<section class="card"><h2>Racha: ${st} ${st === 1 ? 'día' : 'días'}</h2><p class="sub" style="margin:0">Días seguidos anotando algo o tocando "Hoy no gasté nada" en Hoy. Si hoy todavía no anotas, la racha no se rompe hasta que termine el día.</p></section>` +
    (p ? `<section class="card"><h2>${esc(p.def.name)}</h2><p class="sub">${esc(p.def.desc)}</p>
      <div class="prog" role="img" aria-label="${valTxt}"><i style="width:${pct(p.value, p.goal)}%"></i></div>
      <p class="num" style="margin:0"><b>${valTxt}</b></p>
      ${p.done ? '<p class="ok">¡Lo lograste! Completaste el reto. Bien hecho.</p>' : p.failed ? `<p class="err">${esc(p.extra)} Puedes intentarlo otra vez.</p>` : p.extra ? `<p class="muted" style="margin:6px 0 0">${esc(p.extra)}</p>` : ''}
      <div class="btns"><button class="btn sm ghost" data-a="quitCh">${p.done ? 'Terminar' : 'Dejar este reto'}</button></div></section>` : '') +
    `<section class="card"><h2>${p ? 'Otros retos' : 'Elige un reto'}</h2><p class="sub">Uno a la vez.</p><ul class="list">${L.CHALLENGES.filter(c => !p || c.id !== p.def.id).map(c =>
      `<li class="li"><div class="t">${esc(c.name)}<small>${esc(c.desc)}</small></div><button class="btn sm" data-a="startCh" data-v="${c.id}"${p && !p.done && !p.failed ? ' disabled' : ''}>Empezar</button></li>`).join('')}</ul>
      ${p && !p.done && !p.failed ? '<p class="muted" style="margin:8px 0 0">Para empezar otro, primero deja el reto actual.</p>' : ''}</section>`;
}

// 4.5.3 Deudas
function viewDeudas() {
  const list = S.deudas.map(d => {
    const m = L.debtMonths(d.balance, d.payment, d.rate || 0), orig = Math.max(d.original || d.balance, d.balance);
    return `<section class="card"><h2>${esc(d.name)}</h2><p class="sub" style="margin:0">Le debes a ${esc(d.to || '—')}${d.rate ? ` · interés ${String(+(d.rate * 100).toFixed(2)).replace('.', ',')}% mensual` : ''}</p>
      <div class="prog" role="img" aria-label="Pagado ${fmt(orig - d.balance)} de ${fmt(orig)}"><i style="width:${pct(orig - d.balance, orig)}%"></i></div>
      <p class="num" style="margin:0">Debes <b>${fmt(d.balance)}</b> · cuota ${fmt(d.payment)} al mes</p>
      ${d.balance <= 0 ? '<p class="ok">¡Terminaste de pagar esta deuda!</p>'
        : m == null ? '<p class="err">Con esa cuota nunca terminas de pagar. Sube la cuota o busca una tasa menor.</p>'
          : `<p style="margin:6px 0 0">Te faltan <b>${m} ${m === 1 ? 'mes' : 'meses'}</b> para terminar de pagar.</p>`}
      <div class="btns">${d.balance > 0 ? `<button class="btn sm" data-a="payDebt" data-v="${esc(d.id)}">Anoté un pago</button>` : ''}
        <button class="btn sm ghost" data-a="editDebt" data-v="${esc(d.id)}">${I.edit}Editar</button>
        <button class="btn sm ghost" data-a="delDebt" data-v="${esc(d.id)}" aria-label="Borrar deuda ${esc(d.name)}">${I.trash}Borrar</button></div></section>`;
  }).join('');
  return backBtn() + hd('Deudas', 'Más') +
    '<div class="tip"><b>Ojo</b>Pagar solo el mínimo de una deuda sale carísimo.</div>' +
    (list || '<section class="card"><p class="empty" style="margin:0">No tienes deudas anotadas. ¡Bien!</p></section>') +
    `<button class="btn full ghost" data-a="addDebt" style="margin-top:12px">${I.plus}Agregar deuda</button>`;
}

// 4.5.4 ¿Me alcanza? (solo calcula; no guarda nada)
function alcanzaOut() {
  const a = ui.adj, b = L.budget(S, now()), price = a.price || 0, n = parseInt(a.n, 10) || 0, r = parseRate(a.rate);
  if (!price) return '<p class="muted" style="margin:0">Escribe el precio para ver si te alcanza.</p>';
  if (n > 1) {
    const q = L.installment(price, n, r), share = b.libre > 0 ? Math.round(q.cuota / b.libre * 100) : null;
    return `<p style="margin:0">Pagarías <b class="num">${fmt(q.cuota)}</b> al mes durante ${n} meses.</p>
      <p style="margin:6px 0 0">En total: <b class="num">${fmt(q.total)}</b>.</p>
      ${q.extra >= 1 ? `<p class="err">Pagas ${fmt(q.extra)} más por comprar a cuotas.</p>` : '<p class="ok">Sin interés: no pagas nada de más.</p>'}
      <p style="margin:10px 0 0">${share == null || q.cuota > b.libre ? `<b>La cuota es más de lo que te queda para gastar cada mes</b> (${fmt(Math.max(0, b.libre))}).`
        : `La cuota es el <b>${share}%</b> de lo que te queda para gastar cada mes (${fmt(b.libre)}).`}</p>`;
  }
  if (price <= b.queda) return `<p class="ok" style="margin:0;font-size:18px">Te alcanza. Te quedarían ${fmt(b.queda - price)}.</p><p class="muted" style="margin:6px 0 0">Comparado con lo que te queda para gastar este mes.</p>`;
  const planSave = L.splitIncome(b.base, S.split).save, months = planSave > 0 ? Math.ceil(price / planSave) : null;
  return `<p class="err" style="margin:0;font-size:18px">No te alcanza este mes. Te faltan ${fmt(price - Math.max(0, b.queda))}.</p>
    <p style="margin:6px 0 0">${months ? `Si ahorras ${fmt(planSave)} al mes, lo compras en ${months} ${months === 1 ? 'mes' : 'meses'}.` : 'Si separas algo de ahorro cada mes en tu plan, te decimos en cuánto lo compras.'}</p>`;
}
function viewAlcanza() {
  const a = ui.adj;
  return backBtn() + hd('¿Me alcanza?', 'Más') +
    `<section class="card"><p class="sub">Una calculadora: no anota ni guarda nada.</p>
      <label class="q" for="a-price">¿Cuánto cuesta?</label>
      <input class="amount" id="a-price" data-in="aPrice" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${moneyVal(a.price)}">
      <label class="q" for="a-n">¿En cuántas cuotas? (opcional)</label>
      <input class="field" id="a-n" data-in="aN" type="number" inputmode="numeric" min="1" max="120" placeholder="De contado" value="${esc(a.n || '')}" style="max-width:160px">
      <label class="q" for="a-rate">Interés mensual en % (opcional)</label>
      <input class="field" id="a-rate" data-in="aRate" inputmode="decimal" autocomplete="off" placeholder="Por ejemplo: 2" value="${esc(a.rate || '')}" style="max-width:160px">
      <p class="muted" style="margin:6px 0 0">El interés es lo que te cobran cada mes por pagar a cuotas.</p>
    </section>
    <section class="card" id="alcanza-out" aria-live="polite">${alcanzaOut()}</section>`;
}

// 4.5.5 Aprende. Datos legales sin cifras (sección 4.5.5: si no se verifican, se dejan generales).
const LESSONS = [
  ['presupuesto', 'Qué es un presupuesto', 'Un presupuesto es decidir antes a dónde va tu plata, en vez de preguntarte después a dónde se fue. Si recibes $ 200.000 al mes, puedes decidir: $ 80.000 para lo que necesitas, $ 60.000 para gustos y $ 60.000 para ahorrar. Fácil hace esa cuenta por ti y te dice cuánto puedes gastar cada día.'],
  ['503020', 'La regla 50/30/20', 'Es una forma sencilla de repartir: 50% para necesidades (comida, transporte, arriendo), 30% para gustos (salidas, ropa, apps) y 20% para ahorro. Con un sueldo de $ 1.500.000 serían $ 750.000, $ 450.000 y $ 300.000. No es una ley: si recibes mesada y tus papás pagan lo básico, puedes darle más a gustos y a ahorro.'],
  ['hormiga', 'Gastos hormiga', 'Son gastos pequeños que casi no se notan: un tinto, unas papas, una app de $ 5.000. Uno solo no hace daño, pero $ 6.000 diarios son unos $ 180.000 al mes. No se trata de prohibirlos, sino de verlos. Por eso conviene anotar todo, hasta lo más pequeño.'],
  ['emergencia', 'Fondo de emergencia', 'Es plata guardada solo para imprevistos: se daña el celular, te enfermas o te quedas sin trabajo. La meta ideal son 3 meses de tus gastos necesarios. Si tus necesidades son $ 500.000 al mes, la meta es $ 1.500.000. Suena mucho, pero se empieza con poco: $ 10.000 a la semana ya es un comienzo.'],
  ['interes', 'Qué es el interés', 'El interés es lo que cuesta usar plata ajena. Si te prestan $ 1.000.000 con un interés de 2% mensual, el primer mes debes $ 20.000 más solo por el préstamo. Al revés también funciona: cuando ahorras en una cuenta que paga interés, el banco te paga a ti. Mira siempre la tasa antes de firmar.'],
  ['tarjeta', 'Tarjeta de crédito y pago mínimo', 'La tarjeta de crédito es un préstamo: el banco paga por ti y tú le pagas después. El pago mínimo es lo menos que puedes pagar ese mes sin quedar atrasado, pero lo que no pagas sigue cobrando interés. Si debes $ 1.000.000 y solo pagas el mínimo, puedes tardar años y pagar mucho más. Lo mejor es pagar el total cada mes.'],
  ['cuotas', 'Cuotas: cuánto pagas de más', 'Comprar a cuotas parece barato porque cada pago es pequeño, pero con interés terminas pagando más que el precio. Un celular de $ 600.000 a 6 cuotas con 2% mensual queda en unos $ 642.700: pagas $ 42.700 de más. Si puedes, ahorra primero y compra de contado. En Más, ¿Me alcanza? hace la cuenta por ti.'],
  ['invertir', 'Ahorrar vs. invertir', 'Ahorrar es guardar plata para usarla pronto y sin riesgo, como tu fondo de emergencia. Invertir es poner plata a crecer por más tiempo, aceptando que puede subir o bajar. Primero arma tu fondo de emergencia. Después, si quieres invertir, infórmate solo con entidades vigiladas por la Superintendencia Financiera. Fácil no da consejos de inversión.'],
  ['estafas', 'Estafas comunes', 'Desconfía si te prometen plata fácil: "mete $ 100.000 y recibe $ 300.000 en una semana" casi siempre es estafa. También hay falsos préstamos que piden pagar un "estudio" antes de darte la plata; una entidad seria no hace eso. Nunca compartas tus claves ni los códigos que te llegan por mensaje. Si dudas, revisa que la entidad esté vigilada por la Superintendencia Financiera.'],
  ['sueldo', 'Tu primer sueldo', 'Antes de gastar, reparte: separa primero el ahorro y los pagos fijos, y vive con lo que queda. Revisa tu desprendible de pago: al sueldo le descuentan salud y pensión, así que a tu cuenta llega menos de lo pactado. Si te pagan cada quincena, Fácil convierte tu ingreso a mensual: $ 900.000 quincenales son $ 1.800.000 al mes.'],
  ['prima', 'Prima y cesantías en Colombia', 'Si tienes contrato laboral, además del sueldo tienes derecho a la prima de servicios, que se paga en dos partes al año, y a las cesantías, un ahorro que tu empleador consigna en un fondo y que sirve, por ejemplo, si te quedas sin trabajo, para vivienda o para estudiar. Los montos y fechas exactos están en la página del Ministerio del Trabajo. Cuando te llegue la prima, repártela como tu plan.'],
  ['mesada', 'Cómo pedir una mesada más alta', 'Llega con un plan, no con una queja. Muestra en Fácil cuánto recibes, en qué se te va y cuánto ahorras. Propón algo concreto: "con $ 30.000 más al mes cubro mi transporte y ya no te pido plata extra". Ofrece algo a cambio, como anotar todo durante un mes. Un plan claro demuestra que sabes manejar la plata.'],
];
function viewAprende() {
  const read = new Set(S.lessonsRead);
  return backBtn() + hd('Aprende', 'Más') + `<p class="muted" style="margin:0 4px">${read.size} de ${LESSONS.length} leídas. Toca una para abrirla.</p>
    <section class="card">${LESSONS.map(([id, t, body]) => `<details class="lesson" data-lesson="${id}"><summary>${read.has(id) ? '<span class="check" aria-label="Leída">✓</span>' : '<span class="dot" style="background:var(--line)" aria-hidden="true"></span>'}${esc(t)}</summary><p>${esc(body)}</p></details>`).join('')}</section>`;
}

// 4.5.6 Ajustes
function viewAjustes() {
  const a = ui.adj;
  return backBtn() + hd('Ajustes', 'Más') +
    `<section class="card"><h2>Respaldo</h2><p class="sub">Tus datos solo viven en este celular. Copia tus datos y guárdalos en tus notas o mándatelos por chat: es la única forma de recuperarlos si pierdes el celular.</p>
      <button class="btn full" data-a="copy">Copiar mis datos</button>
      ${a.copyMsg ? `<p class="ok" role="status">${esc(a.copyMsg)}</p>` : ''}
      ${a.showJson ? `<label class="q" for="json-out">Copia este texto:</label><textarea class="field" id="json-out" readonly>${esc(JSON.stringify(S))}</textarea>` : ''}
      <label class="q" for="restore-in">Restaurar</label>
      <textarea class="field" id="restore-in" data-in="restore" placeholder="Pega aquí el texto de tu respaldo">${esc(a.restore || '')}</textarea>
      <p class="err" role="alert">${esc(a.restoreErr || '')}</p>
      ${a.restoreOk ? `<div class="alert">Esto reemplaza todos tus datos actuales por los del respaldo.<div class="btns"><button class="btn sm danger" data-a="restoreYes">Sí, restaurar</button><button class="btn sm ghost" data-a="restoreNo">Cancelar</button></div></div>`
        : '<button class="btn full ghost" data-a="restoreCheck" style="margin-top:8px">Restaurar</button>'}
    </section>
    <section class="card"><h2>Recordatorios</h2><p class="sub" style="margin:0">Disponible en la app de las tiendas.</p></section>
    <section class="card"><h2>Empezar de nuevo</h2>
      ${a.reset ? `<div class="alert" style="margin-top:4px">Se borran tus gastos, fijos, metas y deudas. Esto no se puede deshacer.<div class="btns"><button class="btn sm danger" data-a="resetYes">Sí, borrar todo</button><button class="btn sm ghost" data-a="resetNo">Cancelar</button></div></div>`
        : '<p class="sub">Borra todo y vuelve a la pantalla de inicio.</p><button class="btn full ghost" data-a="reset">Empezar de nuevo</button>'}
    </section>
    <p class="muted" style="text-align:center">Fácil: planeador financiero · gratis, sin cuenta, sin anuncios</p>`;
}

// ---------- Acciones (clics) ----------
const findId = (arr, id) => arr.find(x => x.id === id);
const A = {
  tab: el => { ui.tab = el.dataset.v; if (ui.tab === 'mas') { ui.more = null; ui.histMonth = null; } ui.adj = {}; render(); window.scrollTo(0, 0); },
  undo: () => { const u = ui.undo; hideToast(); if (u) u(); },
  close: () => closeSheet(),

  // Inicio
  obKind: el => { ui.ob.kind = el.dataset.v; ui.ob.freq = L.KIND_DEFAULTS[ui.ob.kind].freq; render(); },
  obFreq: el => { ui.ob.freq = el.dataset.v; render(); },
  create: () => {
    const o = ui.ob;
    if (!(o.amount > 0)) { ui.obErr = 'Escribe cuánto recibes (un número mayor que cero).'; render(); $('#ob-amt').focus(); return; }
    S = { ...L.defaults(), setup: true, kind: o.kind, amount: o.amount, freq: o.freq, split: L.KIND_DEFAULTS[o.kind].split.slice(), lastMonth: L.monthKey(now()) };
    save(); ui.obErr = ''; ui.tab = 'plan'; ui.fijosHint = true; render();
    const f = document.getElementById('fijos'); if (f) f.scrollIntoView({ block: 'start' });
  },

  // Hoy
  anotar: () => openSheet({ type: 'anotar', t: 'gasto', amt: 0, cat: null, goal: null, mode: 'plan', note: '', err: '' }, 'sh-amt'),
  delTx: el => mutate(() => {
    const t = findId(S.tx, el.dataset.v); if (!t) return;
    const d = t.debt && findId(S.deudas, t.debt); if (d) d.balance += t.amt;
    S.tx = S.tx.filter(x => x !== t);
  }, 'Movimiento borrado'),
  paid: el => mutate(() => { const [id, date] = el.dataset.v.split('|'); if (S.paid[id] === date) delete S.paid[id]; else S.paid[id] = date; }),
  noSpend: () => mutate(() => { S.noSpendDays = [...new Set([...S.noSpendDays, L.dateKey(now())])]; }, '¡Bien! Hoy cuenta para tu racha'),

  // Anotar
  shT: el => { ui.sh.t = el.dataset.v; ui.sh.err = ''; renderSheet(); },
  shAdd: el => { ui.sh.amt = (ui.sh.amt || 0) + Number(el.dataset.v); ui.sh.err = ''; renderSheet(); },
  shCat: el => { ui.sh.cat = el.dataset.v; ui.sh.err = ''; renderSheet(); },
  shGoal: el => { ui.sh.goal = el.dataset.v || null; renderSheet(); },
  shMode: el => { ui.sh.mode = el.dataset.v; renderSheet(); },
  shSave: () => {
    const sh = ui.sh;
    if (!(sh.amt > 0)) { sh.err = 'Escribe un monto mayor que cero.'; renderSheet(); $('#sh-amt').focus(); return; }
    if (sh.t === 'gasto' && !sh.cat) { sh.err = 'Elige en qué gastaste.'; renderSheet(); return; }
    const t = { id: L.uid('t'), t: sh.t, amt: sh.amt, note: sh.note.trim(), ts: Date.now() };
    if (sh.t === 'gasto') t.cat = sh.cat;
    if (sh.t === 'ahorro') t.goal = sh.goal || null;
    if (sh.t === 'ingreso') t.mode = sh.mode;
    closeSheet();
    mutate(() => S.tx.push(t), sh.t === 'gasto' ? `Anotado: ${fmt(t.amt)} en ${L.catById(t.cat).name}` : sh.t === 'ahorro' ? `Ahorraste ${fmt(t.amt)}` : `Te entraron ${fmt(t.amt)}`);
  },

  // Plan
  kind: el => mutate(() => { S.kind = el.dataset.v; }),
  freq: el => mutate(() => { S.freq = el.dataset.v; }),
  preset: el => mutate(() => { S.split = L.PRESETS.find(p => p.id === el.dataset.v).split.slice(); }),
  adjust: () => { const b = L.budget(S, now()); mutate(() => { S.split = L.suggestSplit(S.split, b.Fn, b.incomePlan); }, 'Reparto ajustado'); },
  noHint: () => { ui.fijosHint = false; render(); },
  addFijo: () => {
    const d = now();
    openSheet({ type: 'fijo', id: null, preset: null, name: '', amt: 0, freq: 'mensual', day: d.getDate(), wday: d.getDay(), month: d.getMonth() + 1, bucket: 'need', active: true, err: '' }, 'f-name');
  },
  editFijo: el => { const f = findId(S.fijos, el.dataset.v); if (f) openSheet({ type: 'fijo', wday: 1, month: 1, day: 1, ...f, err: '' }, 'f-name'); },
  fPreset: el => {
    const sh = ui.sh, p = L.FIJO_PRESETS.find(x => x.id === el.dataset.v), old = L.FIJO_PRESETS.find(x => x.id === sh.preset);
    if (!sh.name.trim() || (old && sh.name === old.name)) sh.name = p.name;
    sh.preset = p.id; sh.bucket = p.bucket; sh.err = ''; renderSheet();
  },
  fFreq: el => { ui.sh.freq = el.dataset.v; renderSheet(); },
  fWday: el => { ui.sh.wday = Number(el.dataset.v); renderSheet(); },
  fBucket: el => { ui.sh.bucket = el.dataset.v; renderSheet(); },
  fSave: () => {
    const sh = ui.sh;
    const err = !sh.name.trim() ? 'Ponle un nombre, por ejemplo "Arriendo".' : !(sh.amt > 0) ? 'Escribe un monto mayor que cero.'
      : (sh.freq === 'mensual' || sh.freq === 'anual') && !(sh.day >= 1 && sh.day <= 31) ? 'El día debe estar entre 1 y 31.' : '';
    if (err) { sh.err = err; renderSheet(); return; }
    const f = { id: sh.id || L.uid('f'), name: sh.name.trim(), preset: sh.preset || 'otro', amt: sh.amt, freq: sh.freq, day: sh.day, bucket: sh.bucket, active: sh.active };
    if (sh.freq === 'semanal') f.wday = sh.wday;
    if (sh.freq === 'anual') f.month = sh.month;
    closeSheet(); ui.fijosHint = false;
    mutate(() => { const i = S.fijos.findIndex(x => x.id === f.id); if (i >= 0) S.fijos[i] = f; else S.fijos.push(f); }, sh.id ? 'Gasto fijo actualizado' : `Agregado: ${f.name}`);
  },
  fDel: () => { const id = ui.sh.id; closeSheet(); mutate(() => { S.fijos = S.fijos.filter(x => x.id !== id); delete S.paid[id]; }, 'Gasto fijo borrado'); },

  // Metas
  addGoal: () => openSheet({ type: 'goal', id: null, name: '', target: 0, err: '' }, 'g-name'),
  editGoal: el => { const g = findId(S.goals, el.dataset.v); if (g) openSheet({ type: 'goal', ...g, err: '' }, 'g-name'); },
  emergency: el => mutate(() => S.goals.push({ id: L.uid('g'), name: 'Fondo de emergencia', target: Number(el.dataset.v) || 100000 }), 'Meta creada'),
  gSave: () => {
    const sh = ui.sh;
    if (!sh.name.trim()) { sh.err = 'Ponle un nombre a tu meta.'; renderSheet(); return; }
    if (!(sh.target > 0)) { sh.err = 'Escribe cuánto cuesta (mayor que cero).'; renderSheet(); return; }
    closeSheet();
    mutate(() => { const g = findId(S.goals, sh.id); if (g) { g.name = sh.name.trim(); g.target = sh.target; } else S.goals.push({ id: L.uid('g'), name: sh.name.trim(), target: sh.target }); }, sh.id ? 'Meta actualizada' : 'Meta creada');
  },
  // Los aportes quedan con el id de la meta borrada y por eso cuentan como Ahorro libre.
  delGoal: el => mutate(() => { S.goals = S.goals.filter(g => g.id !== el.dataset.v); }, 'Meta borrada. Sus aportes pasaron a Ahorro libre'),
  saveTo: el => openSheet({ type: 'anotar', t: 'ahorro', amt: 0, cat: null, goal: el.dataset.v, mode: 'plan', note: '', err: '' }, 'sh-amt'),

  // Más
  more: el => { ui.more = el.dataset.v; ui.adj = {}; render(); window.scrollTo(0, 0); },
  moreBack: el => { if (el.dataset.v === 'historial') ui.histMonth = null; else ui.more = null; ui.adj = {}; render(); window.scrollTo(0, 0); },
  histMonth: el => { ui.histMonth = el.dataset.v; render(); window.scrollTo(0, 0); },
  startCh: el => mutate(() => { S.challenge = { id: el.dataset.v, startedAt: L.dateKey(now()) }; }),
  quitCh: () => mutate(() => { S.challenge = null; }, 'Dejaste el reto'),
  addDebt: () => openSheet({ type: 'deuda', id: null, name: '', to: '', balance: 0, payment: 0, rateTxt: '', err: '' }, 'd-name'),
  editDebt: el => { const d = findId(S.deudas, el.dataset.v); if (d) openSheet({ type: 'deuda', ...d, rateTxt: d.rate ? String(+(d.rate * 100).toFixed(4)).replace('.', ',') : '', err: '' }, 'd-name'); },
  dSave: () => {
    const sh = ui.sh;
    const err = !sh.name.trim() ? 'Ponle un nombre a la deuda.' : !(sh.balance > 0) ? 'Escribe cuánto debes (mayor que cero).' : !(sh.payment > 0) ? 'Escribe cuánto pagas cada mes.' : '';
    if (err) { sh.err = err; renderSheet(); return; }
    const rate = parseRate(sh.rateTxt);
    closeSheet();
    mutate(() => {
      const d = findId(S.deudas, sh.id);
      const v = { name: sh.name.trim(), to: sh.to.trim(), balance: sh.balance, payment: sh.payment, rate };
      if (d) Object.assign(d, v, { original: Math.max(d.original || 0, sh.balance) });
      else S.deudas.push({ id: L.uid('d'), ...v, original: sh.balance });
    }, sh.id ? 'Deuda actualizada' : 'Deuda agregada');
  },
  delDebt: el => mutate(() => { S.deudas = S.deudas.filter(d => d.id !== el.dataset.v); }, 'Deuda borrada'),
  payDebt: el => { const d = findId(S.deudas, el.dataset.v); if (d) openSheet({ type: 'pago', id: d.id, name: d.name, amt: Math.min(d.payment, d.balance), err: '' }, 'p-amt2'); },
  pSave: () => {
    const sh = ui.sh;
    if (!(sh.amt > 0)) { sh.err = 'Escribe un monto mayor que cero.'; renderSheet(); return; }
    closeSheet();
    mutate(() => {
      const d = findId(S.deudas, sh.id); if (!d) return;
      const amt = Math.min(sh.amt, d.balance); // no se paga más de lo que se debe
      d.balance -= amt;
      S.tx.push({ id: L.uid('t'), t: 'gasto', amt, cat: 'deudas', debt: d.id, note: '', ts: Date.now() });
    }, 'Pago anotado');
  },
  copy: async () => {
    const text = JSON.stringify(S);
    try { await navigator.clipboard.writeText(text); ui.adj.copyMsg = 'Copiado. Pégalo en tus notas o mándatelo por chat.'; ui.adj.showJson = false; }
    catch (e) { ui.adj.copyMsg = ''; ui.adj.showJson = true; }
    render();
    const ta = $('#json-out'); if (ta) { ta.focus(); ta.select(); }
  },
  restoreCheck: () => {
    const r = L.validateBackup(ui.adj.restore || '');
    if (!String(ui.adj.restore || '').trim()) { ui.adj.restoreErr = 'Primero pega el texto de tu respaldo.'; ui.adj.restoreOk = null; }
    else if (r.error) { ui.adj.restoreErr = r.error; ui.adj.restoreOk = null; }
    else { ui.adj.restoreErr = ''; ui.adj.restoreOk = r.data; }
    render();
  },
  restoreNo: () => { ui.adj.restoreOk = null; render(); },
  restoreYes: () => { const d = ui.adj.restoreOk; if (!d) return; S = L.takeSnapshot(d, now()); save(); ui.adj = {}; ui.more = null; ui.tab = 'hoy'; render(); toast('Listo. Tus datos se restauraron.'); },
  reset: () => { ui.adj.reset = true; render(); },
  resetNo: () => { ui.adj.reset = false; render(); },
  resetYes: () => { S = L.defaults(); save(); ui.adj = {}; ui.more = null; ui.tab = 'hoy'; ui.ob = { kind: 'mesada', amount: 0, freq: 'mensual' }; hideToast(); render(); window.scrollTo(0, 0); },
};

// ---------- Campos (mientras escribe) ----------
const IN = {
  obAmt: el => { ui.ob.amount = fmtInput(el); ui.obErr = ''; refreshLive(); },
  shAmt: el => { ui.sh.amt = fmtInput(el); },
  shNote: el => { ui.sh.note = el.value; },
  planAmt: el => { S.amount = fmtInput(el); save(); hideToast(); refreshLive(); },
  need: el => {
    const v = Number(el.value); S.split[0] = v;
    if (v + S.split[1] > 100) { S.split[1] = 100 - v; $('#r-want').value = S.split[1]; }
    S.split[2] = 100 - S.split[0] - S.split[1]; save(); hideToast(); refreshLive();
  },
  want: el => {
    let v = Number(el.value);
    if (v + S.split[0] > 100) { v = 100 - S.split[0]; el.value = v; }
    S.split[1] = v; S.split[2] = 100 - S.split[0] - v; save(); hideToast(); refreshLive();
  },
  fToggle: el => mutate(() => { const f = findId(S.fijos, el.dataset.v); if (f) f.active = el.checked; }),
  fName: el => { ui.sh.name = el.value; },
  fAmt: el => { ui.sh.amt = fmtInput(el); },
  fDay: el => { ui.sh.day = parseInt(el.value, 10) || 0; },
  fMonth: el => { ui.sh.month = Number(el.value); },
  fActive: el => { ui.sh.active = el.checked; },
  gName: el => { ui.sh.name = el.value; },
  gAmt: el => { ui.sh.target = fmtInput(el); },
  dName: el => { ui.sh.name = el.value; },
  dTo: el => { ui.sh.to = el.value; },
  dBal: el => { ui.sh.balance = fmtInput(el); },
  dPay: el => { ui.sh.payment = fmtInput(el); },
  dRate: el => { ui.sh.rateTxt = el.value; },
  pAmt: el => { ui.sh.amt = fmtInput(el); },
  aPrice: el => { ui.adj.price = fmtInput(el); refreshLive(); },
  aN: el => { ui.adj.n = el.value; refreshLive(); },
  aRate: el => { ui.adj.rate = el.value; refreshLive(); },
  restore: el => { ui.adj.restore = el.value; },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && A[el.dataset.a] && !el.disabled) A[el.dataset.a](el, e);
});
document.addEventListener('input', e => { const el = e.target.closest('[data-in]'); if (el && IN[el.dataset.in]) IN[el.dataset.in](el, e); });
// Enter en un campo de la hoja = Guardar (anotar en menos de 5 segundos).
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !ui.sh) return;
  const btn = $('#sheet-in .btn.big'); if (btn) { e.preventDefault(); btn.click(); }
});
// Marcar una lección como leída al abrirla.
document.addEventListener('toggle', e => {
  const d = e.target;
  if (d.matches?.('details[data-lesson]') && d.open && !S.lessonsRead.includes(d.dataset.lesson)) {
    S.lessonsRead.push(d.dataset.lesson); save();
    const s = d.querySelector('summary > :first-child'); if (s) s.outerHTML = '<span class="check" aria-label="Leída">✓</span>';
  }
}, true);
const dlg = $('#sheet');
dlg.addEventListener('close', () => { ui.sh = null; });
dlg.addEventListener('click', e => { if (e.target === dlg) closeSheet(); }); // tocar fuera cierra la hoja
// Si la app queda abierta y cambia el día o el mes, se recalcula al volver.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || ui.sh) return;
  const before = S.lastMonth; S = L.takeSnapshot(S, now()); if (S.lastMonth !== before) save();
  render();
});

render();
