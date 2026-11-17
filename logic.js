// Fácil: funciones puras (sección 5 de GUIA.md). Sin dependencias ni acceso a la pantalla.
// En el navegador queda como la global `L`; en Node se exporta con module.exports.

const L = (() => {
  const FACTOR = { semanal: 52 / 12, quincenal: 2, mensual: 1, anual: 1 / 12 };
  const SCHEMA = 2;
  const STORE_KEY = 'facil-v1';

  const CATS = [
    { id: 'comida', name: 'Comida', bucket: 'need' },
    { id: 'transporte', name: 'Transporte', bucket: 'need' },
    { id: 'hogar', name: 'Hogar y cuentas', bucket: 'need' },
    { id: 'estudio', name: 'Estudio', bucket: 'need' },
    { id: 'salud', name: 'Salud', bucket: 'need' },
    { id: 'deudas', name: 'Deudas', bucket: 'need' },
    { id: 'salidas', name: 'Salidas', bucket: 'want' },
    { id: 'compras', name: 'Compras', bucket: 'want' },
    { id: 'juegos', name: 'Juegos y apps', bucket: 'want' },
    { id: 'otro', name: 'Otro', bucket: 'want' },
  ];
  const catById = id => CATS.find(c => c.id === id) || CATS[CATS.length - 1];

  const FIJO_PRESETS = [
    { id: 'arriendo', label: 'Arriendo', name: 'Arriendo', bucket: 'need' },
    { id: 'servicios', label: 'Servicios (agua, luz, gas)', name: 'Servicios', bucket: 'need' },
    { id: 'internet', label: 'Internet y celular', name: 'Internet y celular', bucket: 'need' },
    { id: 'transporte', label: 'Transporte', name: 'Transporte', bucket: 'need' },
    { id: 'estudio', label: 'Estudio', name: 'Estudio', bucket: 'need' },
    { id: 'deuda', label: 'Cuota de deuda', name: 'Cuota de deuda', bucket: 'need' },
    { id: 'suscripcion', label: 'Suscripción (Netflix, Spotify…)', name: 'Suscripción', bucket: 'want' },
    { id: 'otro', label: 'Otro', name: 'Otro', bucket: 'need' },
  ];

  const KIND_DEFAULTS = {
    mesada: { split: [30, 40, 30], freq: 'mensual' },
    sueldo: { split: [50, 30, 20], freq: 'quincenal' },
    otros: { split: [50, 30, 20], freq: 'mensual' },
  };

  const PRESETS = [
    { id: 'mesada', name: 'Mesada', split: [30, 40, 30] },
    { id: 'equilibrado', name: 'Equilibrado', split: [50, 30, 20] },
    { id: 'ahorrador', name: 'Ahorrador', split: [50, 20, 30] },
  ];

  // ---------- Fechas (siempre hora local del celular) ----------
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();
  const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const daysBetween = (a, b) => Math.round((parseDay(dateKey(b)) - parseDay(dateKey(a))) / 864e5);
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const monthName = key => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
  const prevMonthKey = key => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 2, 1)); };

  // ---------- Dinero ----------
  const fmt = n => {
    const v = Math.round(n);
    const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '−$ ' : '$ ') + s;
  };
  const fmtNum = n => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const parseAmount = s => { const d = String(s ?? '').replace(/\D/g, ''); return d ? Math.min(Number(d), 999999999999) : 0; };

  // ---------- Ingreso, reparto y fijos ----------
  const monthly = (amt, freq) => Math.round((Number(amt) || 0) * (FACTOR[freq] ?? 1));

  // Reparte un ingreso en tres cubetas; ahorro = lo que sobra, así nunca se pierden pesos.
  const splitIncome = (income, split) => {
    const need = Math.round(income * split[0] / 100);
    const want = Math.round(income * split[1] / 100);
    return { need, want, save: income - need - want };
  };

  const fijosTotals = fijos => {
    let Fn = 0, Fg = 0;
    for (const f of fijos || []) {
      if (!f.active) continue;
      const m = monthly(f.amt, f.freq);
      if (f.bucket === 'want') Fg += m; else Fn += m;
    }
    return { Fn, Fg };
  };

  const txOfMonth = (tx, key) => (tx || []).filter(t => monthKey(new Date(t.ts)) === key);

  // Presupuesto completo del mes. `plan` = {amount, freq, split, fijos} (estado actual o foto del mes).
  const budget = (state, now, plan = state) => {
    const key = monthKey(now);
    const txs = txOfMonth(state.tx, key);
    const base = monthly(plan.amount, plan.freq);
    let extrasPlan = 0, extrasSave = 0, spent = 0, spentNeed = 0, spentWant = 0, saved = 0;
    for (const t of txs) {
      if (t.t === 'ingreso') { if (t.mode === 'ahorro') extrasSave += t.amt; else extrasPlan += t.amt; }
      else if (t.t === 'gasto') { spent += t.amt; if (catById(t.cat).bucket === 'need') spentNeed += t.amt; else spentWant += t.amt; }
      else if (t.t === 'ahorro') saved += t.amt;
    }
    const incomePlan = base + extrasPlan;
    const s = splitIncome(incomePlan, plan.split);
    const save = s.save + extrasSave;
    const { Fn, Fg } = plan.fijosNeed != null ? { Fn: plan.fijosNeed, Fg: plan.fijosWant } : fijosTotals(plan.fijos);
    const gastable = s.need + s.want;
    const queda = gastable - (Fn + Fg) - spent;
    const daysLeft = daysInMonth(now.getFullYear(), now.getMonth()) - now.getDate() + 1;
    const perDay = queda > 0 ? Math.floor(Math.floor(queda / daysLeft) / 100) * 100 : 0;
    return {
      key, base, extras: extrasPlan + extrasSave, extrasPlan, extrasSave, income: base + extrasPlan + extrasSave, incomePlan,
      need: s.need, want: s.want, save, Fn, Fg, gastable, libre: gastable - Fn - Fg,
      spent, spentNeed, spentWant, saved, queda, daysLeft, perDay, over: queda < 0,
      alertNeed: Fn > s.need, alertCritical: Fn + Fg > gastable,
    };
  };

  // Sube %necesidades al múltiplo de 5 que cubra los fijos; lo que sube sale de gustos y luego de ahorro.
  const suggestSplit = (split, Fn, incomePlan) => {
    if (incomePlan <= 0) return split.slice();
    const pn = Math.min(100, Math.ceil(Fn * 20 / incomePlan - 1e-9) * 5);
    if (pn <= split[0]) return split.slice();
    let delta = pn - split[0];
    const pw = Math.max(0, split[1] - delta); delta -= split[1] - pw;
    const ps = Math.max(0, split[2] - delta);
    return [pn, pw, ps];
  };

  // ---------- Fijos: vencimientos ----------
  const isDue = (f, d) => {
    const dim = daysInMonth(d.getFullYear(), d.getMonth());
    if (f.freq === 'semanal') return d.getDay() === (f.wday ?? 1);
    if (f.freq === 'quincenal') return d.getDate() === 15 || d.getDate() === dim;
    const due = Math.min(f.day || 1, dim);
    if (f.freq === 'anual' && d.getMonth() + 1 !== (f.month || 1)) return false;
    return d.getDate() === due;
  };
  // Fijos activos que vencen hoy o en los próximos `days - 1` días.
  const upcoming = (fijos, now, days = 7) => {
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(now, i);
      for (const f of fijos || []) if (f.active && isDue(f, d)) out.push({ fijo: f, date: dateKey(d), inDays: i });
    }
    return out;
  };

  // ---------- Metas ----------
  const goalSaved = (tx, goalId) => (tx || []).reduce((s, t) => s + (t.t === 'ahorro' && t.goal === goalId ? t.amt : 0), 0);
  const freeSaved = (tx, goals) => {
    const ids = new Set((goals || []).map(g => g.id));
    return (tx || []).reduce((s, t) => s + (t.t === 'ahorro' && !ids.has(t.goal) ? t.amt : 0), 0);
  };
  const monthsToGoal = (target, saved, monthlySave) => {
    if (!(monthlySave > 0)) return null;
    return Math.max(0, Math.ceil((target - saved) / monthlySave));
  };

  // ---------- Deudas y compras ----------
  // Devuelve meses restantes o null si la cuota no alcanza ni para el interés.
  const debtMonths = (B, P, r = 0) => {
    if (B <= 0) return 0;
    if (!(P > 0)) return null;
    if (!r) return Math.ceil(B / P);
    if (P <= r * B) return null;
    return Math.ceil(-Math.log(1 - r * B / P) / Math.log(1 + r) - 1e-9);
  };
  const installment = (C, n, r = 0) => {
    const cuota = r ? C * r / (1 - Math.pow(1 + r, -n)) : C / n;
    const total = cuota * n;
    return { cuota, total, extra: total - C };
  };

  // ---------- Rachas y retos ----------
  const activeDays = state => {
    const s = new Set(state.noSpendDays || []);
    for (const t of state.tx || []) s.add(dateKey(new Date(t.ts)));
    return s;
  };
  // Si hoy no hay nada, muestra la racha de ayer (no se rompe hasta que termine el día).
  const streak = (state, now, since) => {
    const days = activeDays(state);
    let d = days.has(dateKey(now)) ? now : addDays(now, -1);
    let n = 0;
    while (days.has(dateKey(d)) && (!since || dateKey(d) >= since)) { n++; d = addDays(d, -1); }
    return n;
  };

  const CHALLENGES = [
    { id: 'anotar7', name: '7 días anotando', desc: '7 días seguidos anotando algo (o tocando "Hoy no gasté nada").', goal: 7 },
    { id: 'singustos', name: 'Semana sin gustos', desc: '7 días sin gastos en salidas, compras, juegos u otros gustos.', goal: 7 },
    { id: 'ahorro21', name: '21 días de ahorro', desc: 'Ahorra cualquier monto en 21 días distintos, dentro de 30 días.', goal: 21 },
    { id: 'sem52', name: '52 semanas', desc: 'En la semana 1 ahorras $ 1.000, en la 2 $ 2.000… y así. Al final juntas $ 1.378.000.', goal: 1378000 },
  ];
  const sem52Total = () => { let s = 0; for (let n = 1; n <= 52; n++) s += n * 1000; return s; };

  const challengeProgress = (state, now) => {
    const ch = state.challenge;
    if (!ch) return null;
    const def = CHALLENGES.find(c => c.id === ch.id);
    const start = ch.startedAt;
    const txSince = (state.tx || []).filter(t => dateKey(new Date(t.ts)) >= start);
    let value = 0, failed = false, extra = '';
    if (ch.id === 'anotar7') value = streak(state, now, start);
    else if (ch.id === 'singustos') {
      // Cuenta días desde el último gasto en gustos (o desde que empezó), incluyendo hoy.
      let from = parseDay(start);
      for (const t of txSince) if (t.t === 'gasto' && catById(t.cat).bucket === 'want') {
        const next = addDays(new Date(t.ts), 1);
        if (next > from) from = next;
      }
      value = Math.max(0, daysBetween(from, now) + 1);
    } else if (ch.id === 'ahorro21') {
      const end = dateKey(addDays(parseDay(start), 29));
      value = new Set(txSince.filter(t => t.t === 'ahorro' && dateKey(new Date(t.ts)) <= end).map(t => dateKey(new Date(t.ts)))).size;
      const left = daysBetween(now, parseDay(end));
      failed = value < 21 && left < 0;
      extra = failed ? 'Se acabaron los 30 días.' : `Te quedan ${Math.max(0, left + 1)} días.`;
    } else if (ch.id === 'sem52') {
      value = txSince.reduce((s, t) => s + (t.t === 'ahorro' ? t.amt : 0), 0);
      const week = Math.min(52, Math.floor(daysBetween(parseDay(start), now) / 7) + 1);
      extra = `Semana ${week}: esta semana toca ahorrar ${fmt(week * 1000)}.`;
    }
    value = Math.min(value, def.goal);
    return { def, value, goal: def.goal, done: value >= def.goal, failed, extra };
  };

  // ---------- Consejos (sección 7) ----------
  const ROTATING = [
    'Ahorra primero, gasta lo que sobra. Si esperas a fin de mes, casi nunca sobra.',
    'Antes de comprar algo grande, espera 48 horas. Si todavía lo quieres, cómpralo.',
    'Un fondo de emergencia son 3 meses de gastos. Empieza con uno pequeño.',
    'Las suscripciones pequeñas suman. Revisa cuáles usas de verdad.',
    'Pagar solo el mínimo de una deuda sale carísimo. Paga más cuando puedas.',
  ];
  const tip = (state, b, now) => {
    const hasFijos = (state.fijos || []).some(f => f.active);
    if (!(state.tx || []).length && !hasFijos) return 'Anota cada gasto apenas lo hagas. Si lo dejas para después, se te olvida.';
    if (b.alertCritical) return 'Tus fijos ya son más de lo que te queda para gastar. Revisa si puedes pausar alguna suscripción.';
    if (b.over) return 'Te pasaste. Mira cuál barra está roja y baja ahí primero.';
    if (b.want > 0 && b.Fg + b.spentWant >= b.want) return 'Tus gustos ya se acabaron este mes. Lo que sigue sale de necesidades o de ahorro.';
    if (b.save > 0 && b.saved >= b.save) return 'Cumpliste tu ahorro del mes. Repite lo mismo el mes que viene.';
    return ROTATING[(now.getDate() - 1) % ROTATING.length];
  };

  // ---------- Historial ----------
  const monthSummary = (state, key) => {
    const [y, m] = key.split('-').map(Number);
    const plan = state.snapshots?.[key]
      ? { amount: state.snapshots[key].income, freq: 'mensual', split: state.snapshots[key].split, fijosNeed: state.snapshots[key].fijosNeed, fijosWant: state.snapshots[key].fijosWant }
      : state;
    const b = budget(state, new Date(y, m - 1, 1), plan);
    const fijos = b.Fn + b.Fg;
    const byCat = {};
    for (const t of txOfMonth(state.tx, key)) if (t.t === 'gasto') byCat[t.cat] = (byCat[t.cat] || 0) + t.amt;
    const cats = Object.entries(byCat).map(([id, amt]) => ({ id, name: catById(id).name, bucket: catById(id).bucket, amt })).sort((a, b2) => b2.amt - a.amt);
    const gastado = fijos + b.spent;
    return { key, income: b.income, gastado, fijos, saved: b.saved, sobro: b.income - gastado - b.saved, cats };
  };
  const historyMonths = (state, now) => {
    const keys = new Set([monthKey(now), ...Object.keys(state.snapshots || {})]);
    for (const t of state.tx || []) keys.add(monthKey(new Date(t.ts)));
    return [...keys].filter(k => k <= monthKey(now)).sort().reverse();
  };
  // Al abrir en un mes nuevo, guarda la foto del mes anterior (con el plan tal como estaba).
  const takeSnapshot = (state, now) => {
    const cur = monthKey(now);
    if (!state.setup || !state.lastMonth || state.lastMonth >= cur) return { ...state, lastMonth: state.setup ? cur : state.lastMonth };
    const snaps = { ...(state.snapshots || {}) };
    if (!snaps[state.lastMonth]) {
      const { Fn, Fg } = fijosTotals(state.fijos);
      snaps[state.lastMonth] = { income: monthly(state.amount, state.freq), split: state.split.slice(), fijosNeed: Fn, fijosWant: Fg };
    }
    return { ...state, snapshots: snaps, lastMonth: cur };
  };

  // ---------- Datos: estado inicial, migración y respaldo ----------
  const defaults = () => ({
    schema: SCHEMA, setup: false, kind: 'mesada', amount: 0, freq: 'mensual', split: [30, 40, 30],
    fijos: [], paid: {}, goals: [], deudas: [], tx: [], noSpendDays: [], challenge: null,
    lessonsRead: [], snapshots: {}, reminders: { daily: false, hour: 20, fijos: false }, lastMonth: null,
  });
  const migrate = data => {
    const d = { ...defaults(), ...data };
    // schema 1 no tenía fijos, deudas, retos ni fotos: los defaults los llenan.
    d.schema = SCHEMA;
    return d;
  };
  const isArr = Array.isArray;
  const validateBackup = text => {
    let data;
    try { data = JSON.parse(String(text).trim()); } catch { return { error: 'Ese texto no es un respaldo de Fácil. Copia todo el texto, sin cambiarle nada.' }; }
    if (!data || typeof data !== 'object' || isArr(data)) return { error: 'Ese texto no es un respaldo de Fácil.' };
    if (typeof data.schema !== 'number' || data.schema < 1) return { error: 'A ese respaldo le falta la versión. No parece de Fácil.' };
    if (data.schema > SCHEMA) return { error: 'Ese respaldo es de una versión más nueva de Fácil. Actualiza la app primero.' };
    for (const k of ['fijos', 'goals', 'deudas', 'tx', 'noSpendDays', 'lessonsRead']) if (data[k] != null && !isArr(data[k])) return { error: 'El respaldo está dañado. No se cambió nada.' };
    if (data.split != null && !(isArr(data.split) && data.split.length === 3 && data.split.every(n => typeof n === 'number'))) return { error: 'El respaldo está dañado. No se cambió nada.' };
    if ((data.tx || []).some(t => !t || typeof t.amt !== 'number' || typeof t.ts !== 'number')) return { error: 'El respaldo tiene movimientos dañados. No se cambió nada.' };
    return { data: migrate(data) };
  };

  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  return {
    FACTOR, SCHEMA, STORE_KEY, CATS, catById, FIJO_PRESETS, KIND_DEFAULTS, PRESETS, CHALLENGES, ROTATING,
    dateKey, monthKey, daysInMonth, parseDay, addDays, daysBetween, monthName, prevMonthKey, MONTHS,
    fmt, fmtNum, parseAmount, monthly, splitIncome, fijosTotals, txOfMonth, budget, suggestSplit,
    isDue, upcoming, goalSaved, freeSaved, monthsToGoal, debtMonths, installment,
    activeDays, streak, sem52Total, challengeProgress, tip, monthSummary, historyMonths, takeSnapshot,
    defaults, migrate, validateBackup, uid,
  };
})();

if (typeof module !== 'undefined') module.exports = L;
