// ponytail: benchmark del cálculo de resumen. Compara la versión vieja
// (multi-pass filter) contra la nueva (single-pass bucketing). Mismo input,
// ambos algoritmos deben producir el mismo balance por mes.

function txEnMes_(t, anio, mes) {
  const f = new Date(t.fecha);
  return f.getFullYear() === anio && (f.getMonth() + 1) === mes;
}
function tipoTransferenciaPresupuestoLocal_(t, cuentasById) {
  if (!t || t.tipo !== 'transferencia') return 'neutro';
  const origen = cuentasById[String(t.cuenta_id || '')];
  const destino = cuentasById[String(t.cuenta_destino_id || '')];
  if (!origen || !destino) return 'neutro';
  if (origen.tipo === 'activo' && destino.tipo === 'pasivo') return 'gasto';
  if (origen.tipo === 'pasivo' && destino.tipo === 'activo') return 'ingreso';
  return 'neutro';
}
function impDefLocal_(t) {
  const v = t.importe_en_defecto;
  if (v != null && v !== '' && !isNaN(Number(v))) return Number(v);
  return Number(t.importe || 0);
}

// === VERSIÓN VIEJA (multi-pass) ===
function calcularResumenLocal_VIEJO(anio, mes, txs, cuentasById, cuentasAll) {
  const a = Number(anio || new Date().getFullYear());
  const m = Number(mes || (new Date().getMonth() + 1));
  const enMes = txs.filter(t => txEnMes_(t, a, m));
  const ingresos = enMes.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + impDefLocal_(t), 0);
  const gastos = enMes.filter(t => t.tipo === 'gasto').reduce((s, t) => s + impDefLocal_(t), 0);
  const devoluciones = enMes.filter(t => t.tipo === 'devolucion').reduce((s, t) => s + impDefLocal_(t), 0);
  const transferenciasGasto = enMes
    .filter(t => t.tipo === 'transferencia' && tipoTransferenciaPresupuestoLocal_(t, cuentasById) === 'gasto')
    .reduce((s, t) => s + impDefLocal_(t), 0);
  const transferenciasIngreso = enMes
    .filter(t => t.tipo === 'transferencia' && tipoTransferenciaPresupuestoLocal_(t, cuentasById) === 'ingreso')
    .reduce((s, t) => s + impDefLocal_(t), 0);
  const pendiente = enMes.filter(t => t.estado === 'pendiente').length;
  const vencido = enMes.filter(t => t.estado === 'vencido').length;
  const evol = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(a, m - 1 - i, 1);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const en = txs.filter(t => String(t.fecha).slice(0, 7) === k);
    evol.push({
      mes: k,
      ingresos: en.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + impDefLocal_(t), 0),
      gastos: en.filter(t => t.tipo === 'gasto').reduce((s, t) => s + impDefLocal_(t), 0)
              - en.filter(t => t.tipo === 'devolucion').reduce((s, t) => s + impDefLocal_(t), 0)
    });
  }
  const currentBalance = cuentasAll.reduce((s, c) => s + Number(c.saldo || 0), 0);
  const netByMonth = {};
  txs.forEach(t => {
    const k = String(t.fecha).slice(0, 7);
    let delta = 0;
    if (t.tipo === 'ingreso') delta = impDefLocal_(t);
    else if (t.tipo === 'gasto') delta = -impDefLocal_(t);
    else if (t.tipo === 'devolucion') delta = impDefLocal_(t);
    if (delta !== 0) netByMonth[k] = (netByMonth[k] || 0) + delta;
  });
  evol.forEach(e => { if (!(e.mes in netByMonth)) netByMonth[e.mes] = 0; });
  const allMonths = Object.keys(netByMonth).sort();
  const futureNet = {};
  let running = 0;
  for (let i = allMonths.length - 1; i >= 0; i--) {
    futureNet[allMonths[i]] = running;
    running += netByMonth[allMonths[i]];
  }
  evol.forEach(e => { e.balance = currentBalance - (futureNet[e.mes] || 0); });
  return { ingresos, gastos, devoluciones, transferenciasGasto, transferenciasIngreso, pendiente, vencido, evol };
}

// === VERSIÓN NUEVA (single-pass) ===
function calcularResumenLocal_NUEVO(anio, mes, txs, cuentasById, cuentasAll) {
  const a = Number(anio || new Date().getFullYear());
  const m = Number(mes || (new Date().getMonth() + 1));
  const mesActualKey = a + '-' + String(m).padStart(2, '0');
  const porMes = Object.create(null);
  let ingresos = 0, gastos = 0, devoluciones = 0;
  let transferenciasGasto = 0, transferenciasIngreso = 0;
  let pendiente = 0, vencido = 0;
  for (let i = 0; i < txs.length; i++) {
    const t = txs[i];
    const fechaStr = String(t.fecha || '');
    if (!fechaStr) continue;
    const k = fechaStr.slice(0, 7);
    let bucket = porMes[k];
    if (!bucket) bucket = porMes[k] = { ingresos: 0, gastos: 0, devoluciones: 0, tGasto: 0, tIngreso: 0 };
    const v = impDefLocal_(t);
    if (t.tipo === 'ingreso') { bucket.ingresos += v; if (k === mesActualKey) ingresos += v; }
    else if (t.tipo === 'gasto') { bucket.gastos += v; if (k === mesActualKey) gastos += v; }
    else if (t.tipo === 'devolucion') { bucket.devoluciones += v; if (k === mesActualKey) devoluciones += v; }
    else if (t.tipo === 'transferencia') {
      const tipo = tipoTransferenciaPresupuestoLocal_(t, cuentasById);
      if (tipo === 'gasto') { bucket.tGasto += v; if (k === mesActualKey) transferenciasGasto += v; }
      else if (tipo === 'ingreso') { bucket.tIngreso += v; if (k === mesActualKey) transferenciasIngreso += v; }
    }
    if (k === mesActualKey) {
      if (t.estado === 'pendiente') pendiente++;
      else if (t.estado === 'vencido') vencido++;
    }
  }
  const evol = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(a, m - 1 - i, 1);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const b = porMes[k];
    evol.push({ mes: k, ingresos: b ? b.ingresos : 0, gastos: (b ? b.gastos : 0) - (b ? b.devoluciones : 0) });
  }
  const currentBalance = cuentasAll.reduce((s, c) => s + Number(c.saldo || 0), 0);
  const netByMonth = Object.create(null);
  for (const k in porMes) { const b = porMes[k]; netByMonth[k] = b.ingresos - b.gastos + b.devoluciones; }
  for (let i = 0; i < evol.length; i++) {
    const k = evol[i].mes;
    if (!(k in netByMonth)) netByMonth[k] = 0;
  }
  const sortedKeys = Object.keys(netByMonth).sort();
  const futureNet = Object.create(null);
  let running = 0;
  for (let i = sortedKeys.length - 1; i >= 0; i--) {
    futureNet[sortedKeys[i]] = running;
    running += netByMonth[sortedKeys[i]];
  }
  for (let i = 0; i < evol.length; i++) {
    evol[i].balance = currentBalance - (futureNet[evol[i].mes] || 0);
  }
  return { ingresos, gastos, devoluciones, transferenciasGasto, transferenciasIngreso, pendiente, vencido, evol };
}

// === FIXTURES ===
function buildFixture(n) {
  const cuentasById = {};
  cuentasById['c1'] = { id: 'c1', tipo: 'activo', saldo: 0 };
  cuentasById['c2'] = { id: 'c2', tipo: 'pasivo', saldo: 0 };
  const cuentasAll = [
    { id: 'c1', tipo: 'activo', saldo: 12345.67 },
    { id: 'c2', tipo: 'pasivo', saldo: -2345.67 }
  ];
  const tipos = ['ingreso', 'gasto', 'transferencia', 'devolucion'];
  const txs = [];
  const start = new Date(2025, 8, 1).getTime(); // sep 2025
  for (let i = 0; i < n; i++) {
    const dayOffset = Math.floor(Math.random() * 365);
    const fecha = new Date(start + dayOffset * 86400000);
    const fechaStr = fecha.toISOString().slice(0, 10);
    const tipo = tipos[Math.floor(Math.random() * tipos.length)];
    const cuenta_id = Math.random() < 0.5 ? 'c1' : 'c2';
    const cuenta_destino_id = tipo === 'transferencia' ? (cuenta_id === 'c1' ? 'c2' : 'c1') : '';
    txs.push({
      id: 't' + i, fecha: fechaStr, tipo,
      cuenta_id, cuenta_destino_id,
      importe: Math.round(Math.random() * 50000) / 100,
      importe_en_defecto: Math.round(Math.random() * 50000) / 100,
      estado: Math.random() < 0.1 ? 'pendiente' : (Math.random() < 0.05 ? 'vencido' : 'confirmado')
    });
  }
  return { txs, cuentasById, cuentasAll };
}

// === BENCHMARK ===
const { txs, cuentasById, cuentasAll } = buildFixture(5000);

const t0 = Date.now();
for (let i = 0; i < 5; i++) calcularResumenLocal_VIEJO(2026, 9, txs, cuentasById, cuentasAll);
const tViejo = Date.now() - t0;

const t1 = Date.now();
for (let i = 0; i < 5; i++) calcularResumenLocal_NUEVO(2026, 9, txs, cuentasById, cuentasAll);
const tNuevo = Date.now() - t1;

console.log('5000 txs, 5 corridas:');
console.log('  viejo:', tViejo, 'ms');
console.log('  nuevo:', tNuevo, 'ms');
console.log('  speedup:', (tViejo / tNuevo).toFixed(2) + 'x');

// === EQUIVALENCIA ===
const rViejo = calcularResumenLocal_VIEJO(2026, 9, txs, cuentasById, cuentasAll);
const rNuevo = calcularResumenLocal_NUEVO(2026, 9, txs, cuentasById, cuentasAll);
let eqOk = true;
['ingresos', 'gastos', 'devoluciones', 'transferenciasGasto', 'transferenciasIngreso', 'pendiente', 'vencido'].forEach(k => {
  if (Math.abs(rViejo[k] - rNuevo[k]) > 0.001) { console.log('MISMATCH', k, rViejo[k], rNuevo[k]); eqOk = false; }
});
for (let i = 0; i < rViejo.evol.length; i++) {
  const a = rViejo.evol[i], b = rNuevo.evol[i];
  if (a.mes !== b.mes) { console.log('MISMATCH mes', i); eqOk = false; }
  if (Math.abs(a.ingresos - b.ingresos) > 0.001) { console.log('MISMATCH ingresos', i); eqOk = false; }
  if (Math.abs(a.gastos - b.gastos) > 0.001) { console.log('MISMATCH gastos', i); eqOk = false; }
  if (Math.abs(a.balance - b.balance) > 0.001) { console.log('MISMATCH balance', i, a.balance, b.balance); eqOk = false; }
}
console.log(eqOk ? 'Outputs match' : 'OUTPUTS DIFFER');
