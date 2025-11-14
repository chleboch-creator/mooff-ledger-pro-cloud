const state = {
  apiBase: localStorage.getItem('mlp_api_base') || 'http://localhost:4000',
  investments: [],
  currentInvestment: null,
  operations: [],
  editingOperationId: null
};

function $(id) { return document.getElementById(id); }

function setApiBaseLabel() {
  $('apiBaseDisplay').textContent = state.apiBase;
  $('apiBaseInput').value = state.apiBase;
}

async function apiGet(path) {
  const res = await fetch(state.apiBase + path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(state.apiBase + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPut(path, body) {
  const res = await fetch(state.apiBase + path, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(state.apiBase + path, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

// NAV
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const viewName = btn.getAttribute('data-view');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      $('view-' + viewName).classList.add('active');
    });
  });
}

// INVESTMENTS
async function loadInvestments() {
  try {
    state.investments = await apiGet('/api/investments');
    renderInvestmentsTable();
  } catch (e) { alert('Błąd pobierania inwestycji: ' + e.message); }
}

function renderInvestmentsTable() {
  const tbody = document.querySelector('#investmentsTable tbody');
  tbody.innerHTML = '';
  state.investments.forEach(inv => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inv.name}</td>
      <td>${(inv.lender || '')} → ${(inv.borrower || '')}</td>
      <td>${Number(inv.baseRate).toFixed(2).replace('.', ',')}</td>
      <td>${inv.status || 'active'}</td>
      <td><button class="small-btn" data-action="open">Otwórz</button></td>
    `;
    tr.querySelector('button[data-action="open"]').addEventListener('click', () => openInvestment(inv.id));
    tbody.appendChild(tr);
  });
}

async function openInvestment(id) {
  try {
    const inv = await apiGet('/api/investments/' + id);
    state.currentInvestment = inv;
    $('investmentDetails').classList.remove('hidden');
    $('invDetailsName').textContent = inv.name;
    $('invDetailsParties').textContent = `${inv.lender || ''} → ${inv.borrower || ''} • ${inv.baseRate.toFixed(2).replace('.', ',')}% rocznie`;
    await loadOperationsForCurrent();
    await loadSummaryForCurrent();
  } catch (e) {
    alert('Błąd otwierania inwestycji: ' + e.message);
  }
}

async function addInvestment() {
  const name = $('invName').value.trim();
  const lender = $('invLender').value.trim();
  const borrower = $('invBorrower').value.trim();
  const rate = Number(String($('invRate').value).replace(',', '.'));
  if (!name) return alert('Podaj nazwę inwestycji.');
  if (isNaN(rate)) return alert('Podaj poprawną stopę procentową.');
  try {
    await apiPost('/api/investments', { name, lender, borrower, baseRate: rate });
    $('invName').value = '';
    $('invLender').value = '';
    $('invBorrower').value = '';
    await loadInvestments();
  } catch (e) { alert('Błąd dodawania inwestycji: ' + e.message); }
}

async function deleteCurrentInvestment() {
  if (!state.currentInvestment) return;
  if (!confirm('Usunąć inwestycję wraz z operacjami?')) return;
  try {
    await apiDelete('/api/investments/' + state.currentInvestment.id);
    state.currentInvestment = null;
    state.operations = [];
    $('investmentDetails').classList.add('hidden');
    await loadInvestments();
  } catch (e) { alert('Błąd usuwania inwestycji: ' + e.message); }
}

// OPERATIONS
function initOpRateMode() {
  $('opRateMode').addEventListener('change', () => {
    $('customRateLabel').style.display = $('opRateMode').value === 'custom' ? 'block' : 'none';
  });
}
function resetOperationForm() {
  $('opDate').value = '';
  $('opType').value = 'Wplata';
  $('opAmount').value = '';
  $('opRateMode').value = 'global';
  $('customRateLabel').style.display = 'none';
  $('opCustomRate').value = '';
  $('opNote').value = '';
  state.editingOperationId = null;
  $('opMainButton').textContent = 'Dodaj operację';
  $('cancelEditBtn').style.display = 'none';
}

async function addOrUpdateOperation() {
  if (!state.currentInvestment) return alert('Najpierw wybierz inwestycję.');
  const date = $('opDate').value;
  const type = $('opType').value;
  const amount = Number(String($('opAmount').value).replace(',', '.'));
  const rateMode = $('opRateMode').value;
  const customRateStr = $('opCustomRate').value;
  const note = $('opNote').value;
  if (!date) return alert('Podaj datę.');
  if (isNaN(amount) || amount <= 0) return alert('Podaj poprawną kwotę.');

  let body = { date, type, amount, rateMode, note };
  if (rateMode === 'custom') {
    const r = Number(String(customRateStr).replace(',', '.'));
    if (isNaN(r)) return alert('Podaj poprawną własną stopę.');
    body.customRate = r;
  }

  try {
    if (state.editingOperationId) {
      await apiPut('/api/operations/' + state.editingOperationId, body);
    } else {
      body.createdBy = 'demo-user';
      await apiPost(`/api/investments/${state.currentInvestment.id}/operations`, body);
    }
    resetOperationForm();
    await loadOperationsForCurrent();
    await loadSummaryForCurrent();
  } catch (e) { alert('Błąd zapisu operacji: ' + e.message); }
}

async function loadOperationsForCurrent() {
  if (!state.currentInvestment) return;
  try {
    state.operations = await apiGet('/api/investments/' + state.currentInvestment.id + '/operations');
    renderOperationsTable();
  } catch (e) { alert('Błąd pobierania operacji: ' + e.message); }
}

function renderOperationsTable() {
  const tbody = document.querySelector('#opsTable tbody');
  tbody.innerHTML = '';
  if (!state.currentInvestment) return;
  const inv = state.currentInvestment;
  const ops = [...state.operations].sort((a, b) => a.date.localeCompare(b.date));
  let saldo = 0;
  let lastDate = null;

  function diffDays(d1, d2) {
    const ms = d2.getTime() - d1.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  ops.forEach((op, idx) => {
    const tr = document.createElement('tr');
    const opDate = new Date(op.date + 'T00:00:00');
    let days = 0;
    if (lastDate) days = diffDays(lastDate, opDate);
    lastDate = opDate;

    const saldoBefore = saldo;
    const rate = op.rateMode === 'custom' && op.customRate != null ? op.customRate : inv.baseRate;
    const interest = saldoBefore > 0 ? saldoBefore * (rate / 100) * (days / 365) : 0;

    if (op.type === 'Wplata') saldo += op.amount;
    else if (op.type === 'Splata') {
      saldo -= op.amount;
      if (saldo < 0) saldo = 0;
    }

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${op.date}</td>
      <td>${op.type === 'Wplata' ? 'Wpłata' : 'Spłata'}</td>
      <td>${formatMoney(op.amount)}</td>
      <td>${formatMoney(saldoBefore)}</td>
      <td>${days}</td>
      <td>${rate.toFixed(2).replace('.', ',')}</td>
      <td>${formatMoney(interest)}</td>
      <td>${formatMoney(saldo)}</td>
      <td>${op.note || ''}</td>
      <td>
        <button class="small-btn" data-action="edit">Edytuj</button>
        <button class="small-btn" data-action="delete">Usuń</button>
      </td>
    `;
    tr.querySelector('[data-action="edit"]').addEventListener('click', () => startEditOperation(op.id));
    tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteOperation(op.id));
    tbody.appendChild(tr);
  });
}

function startEditOperation(opId) {
  const op = state.operations.find(o => o.id === opId);
  if (!op) return;
  state.editingOperationId = opId;
  $('opDate').value = op.date;
  $('opType').value = op.type;
  $('opAmount').value = op.amount;
  $('opRateMode').value = op.rateMode || 'global';
  if (op.rateMode === 'custom') {
    $('customRateLabel').style.display = 'block';
    $('opCustomRate').value = op.customRate != null ? op.customRate : '';
  } else {
    $('customRateLabel').style.display = 'none';
    $('opCustomRate').value = '';
  }
  $('opNote').value = op.note || '';
  $('opMainButton').textContent = 'Zapisz zmiany';
  $('cancelEditBtn').style.display = 'inline-block';
}

async function deleteOperation(opId) {
  if (!confirm('Usunąć tę operację?')) return;
  try {
    await apiDelete('/api/operations/' + opId);
    await loadOperationsForCurrent();
    await loadSummaryForCurrent();
  } catch (e) { alert('Błąd usuwania operacji: ' + e.message); }
}

// SUMMARY
async function loadSummaryForCurrent() {
  if (!state.currentInvestment) return;
  try {
    const data = await apiGet('/api/investments/' + state.currentInvestment.id + '/summary');
    renderSummary(data);
  } catch (e) {
    $('summaryBox').textContent = 'Błąd pobierania podsumowania: ' + e.message;
  }
}
function renderSummary(summary) {
  const inv = summary.investment;
  const box = $('summaryBox');
  const period = summary.period || 'brak';
  box.innerHTML = `
    <div><strong>${inv.name}</strong></div>
    <div>Strony: ${(inv.lender || '')} → ${(inv.borrower || '')}</div>
    <div>Stopa bazowa: <strong>${inv.baseRate.toFixed(2).replace('.', ',')}%</strong></div>
    <div>Łączna kwota wpłat (transze): <strong>${formatMoney(summary.totalIn)}</strong></div>
    <div>Łączna kwota spłat: <strong>${formatMoney(summary.totalOut)}</strong></div>
    <div>Saldo końcowe kapitału: <strong>${formatMoney(summary.saldo)}</strong></div>
    <div>Łączne odsetki narosłe: <strong>${formatMoney(summary.totalInterest)}</strong></div>
    <div>Okres operacji: <strong>${period}</strong></div>
    <div class="small">Operacji: ${summary.operationsCount}</div>
  `;
}

// SETTINGS
function initSettings() {
  $('saveApiBaseBtn').addEventListener('click', () => {
    const v = $('apiBaseInput').value.trim();
    if (!v) return alert('Podaj poprawny adres API.');
    state.apiBase = v;
    localStorage.setItem('mlp_api_base', v);
    setApiBaseLabel();
    loadInvestments();
  });
}

// UTILS
function formatMoney(value) {
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

// INIT
function initButtons() {
  $('addInvestmentBtn').addEventListener('click', addInvestment);
  $('deleteInvestmentBtn').addEventListener('click', deleteCurrentInvestment);
  $('opMainButton').addEventListener('click', addOrUpdateOperation);
  $('cancelEditBtn').addEventListener('click', () => {
    state.editingOperationId = null;
    resetOperationForm();
  });
  $('refreshDetailsBtn').addEventListener('click', async () => {
    if (!state.currentInvestment) return;
    await loadOperationsForCurrent();
    await loadSummaryForCurrent();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSettings();
  initButtons();
  initOpRateMode();
  setApiBaseLabel();
  loadInvestments();
});
