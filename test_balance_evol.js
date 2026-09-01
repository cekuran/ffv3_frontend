// ponytail: self-check para el cálculo de balance por mes.
// Reproduce la lógica de obtenerResumen.calcularBalanceEvol_
// contra fixtures pequeñas y compara con el resultado esperado.

function calcBalanceEvol(txs, cuentas, anio, mes) {
  // últimos 12 meses
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(anio, mes - 1 - i, 1);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    meses.push(k);
  }
  const currentBalance = cuentas.reduce((s, c) => s + Number(c.saldo || 0), 0);
  const netByMonth = {};
  txs.forEach(t => {
    const k = String(t.fecha).slice(0, 7);
    let delta = 0;
    if (t.tipo === 'ingreso') delta = Number(t.importe);
    else if (t.tipo === 'gasto') delta = -Number(t.importe);
    else if (t.tipo === 'devolucion') delta = Number(t.importe);
    if (delta !== 0) netByMonth[k] = (netByMonth[k] || 0) + delta;
  });
  meses.forEach(k => { if (!(k in netByMonth)) netByMonth[k] = 0; });
  const allMonths = Object.keys(netByMonth).sort();
  const futureNet = {};
  let running = 0;
  for (let i = allMonths.length - 1; i >= 0; i--) {
    futureNet[allMonths[i]] = running;
    running += netByMonth[allMonths[i]];
  }
  return meses.map(k => ({ mes: k, balance: currentBalance - (futureNet[k] || 0) }));
}

// Test 1: cuentas vacías + sin txs → balance 0
{
  const r = calcBalanceEvol([], [], 2026, 9);
  if (r.every(m => m.balance === 0)) console.log('Test 1 OK');
  else { console.log('Test 1 FAIL', r); process.exit(1); }
}

// Test 2: cuenta con saldo 1000, sin txs → todos los meses en 1000
{
  const r = calcBalanceEvol([], [{ saldo: 1000 }], 2026, 9);
  if (r.every(m => m.balance === 1000)) console.log('Test 2 OK');
  else { console.log('Test 2 FAIL', r); process.exit(1); }
}

// Test 3: cuenta 1000, ingreso 200 en ago-2026, gasto 50 en sep-2026
//   → ene..jul = 850 (1000 - 200 - (-50) futuro neto ... wait, recompute)
// futuro neto para ago = netByMonth[sep] = -50
// futuro neto para jul = netByMonth[ago] + netByMonth[sep] = 200 + (-50) = 150
// → ene..jul balance = 1000 - 150 = 850
// → ago = 1000 - (-50) = 1050
// → sep = 1000 - 0 = 1000
{
  const r = calcBalanceEvol(
    [{ fecha: '2026-08-15', tipo: 'ingreso', importe: 200 },
     { fecha: '2026-09-10', tipo: 'gasto', importe: 50 }],
    [{ saldo: 1000 }],
    2026, 9
  );
  const byKey = Object.fromEntries(r.map(m => [m.mes, m.balance]));
  if (byKey['2026-01'] === 850 && byKey['2026-07'] === 850 &&
      byKey['2026-08'] === 1050 && byKey['2026-09'] === 1000) {
    console.log('Test 3 OK');
  } else {
    console.log('Test 3 FAIL', byKey); process.exit(1);
  }
}

// Test 4: transferencia NO afecta balance global
{
  const r = calcBalanceEvol(
    [{ fecha: '2026-09-01', tipo: 'transferencia', importe: 999 }],
    [{ saldo: 500 }],
    2026, 9
  );
  if (r.every(m => m.balance === 500)) console.log('Test 4 OK');
  else { console.log('Test 4 FAIL', r); process.exit(1); }
}

// Test 5: devolución (+) y gasto (-) netean
{
  const r = calcBalanceEvol(
    [{ fecha: '2026-09-01', tipo: 'gasto', importe: 100 },
     { fecha: '2026-09-15', tipo: 'devolucion', importe: 30 }],
    [{ saldo: 1000 }],
    2026, 9
  );
  // sep net = -100 + 30 = -70 → balance sep = 1000
  if (r.find(m => m.mes === '2026-09').balance === 1000) console.log('Test 5 OK');
  else { console.log('Test 5 FAIL', r); process.exit(1); }
}

console.log('All balance-evol tests passed.');
