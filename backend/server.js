const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const DB_FILE = path.join(__dirname, 'db.json');

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { investments: [], operations: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse db.json, resetting.', e);
    const initial = { investments: [], operations: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function newId(prefix) {
  return prefix + '_' + Math.random().toString(36).substring(2, 10);
}

// health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', module: 'Mooff Ledger PRO backend', time: new Date().toISOString() });
});

// list investments
app.get('/api/investments', (req, res) => {
  const db = loadDb();
  res.json(db.investments);
});

// create investment
app.post('/api/investments', (req, res) => {
  const db = loadDb();
  const { name, lender, borrower, baseRate } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  const rateNum = Number(baseRate);
  if (isNaN(rateNum)) {
    return res.status(400).json({ error: 'baseRate must be a number' });
  }

  const inv = {
    id: newId('inv'),
    name,
    lender: lender || '',
    borrower: borrower || '',
    baseRate: rateNum,
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  db.investments.push(inv);
  saveDb(db);
  res.status(201).json(inv);
});

// get single investment
app.get('/api/investments/:id', (req, res) => {
  const db = loadDb();
  const inv = db.investments.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  res.json(inv);
});

// update investment
app.put('/api/investments/:id', (req, res) => {
  const db = loadDb();
  const inv = db.investments.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });

  const { name, lender, borrower, baseRate, status } = req.body;
  if (name !== undefined) inv.name = name;
  if (lender !== undefined) inv.lender = lender;
  if (borrower !== undefined) inv.borrower = borrower;
  if (baseRate !== undefined) {
    const rateNum = Number(baseRate);
    if (isNaN(rateNum)) {
      return res.status(400).json({ error: 'baseRate must be a number' });
    }
    inv.baseRate = rateNum;
  }
  if (status !== undefined) inv.status = status;

  saveDb(db);
  res.json(inv);
});

// delete investment + its operations
app.delete('/api/investments/:id', (req, res) => {
  const db = loadDb();
  const idx = db.investments.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  db.investments.splice(idx, 1);
  db.operations = db.operations.filter(o => o.investmentId !== req.params.id);
  saveDb(db);
  res.status(204).send();
});

// list operations for investment
app.get('/api/investments/:id/operations', (req, res) => {
  const db = loadDb();
  const inv = db.investments.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Investment not found' });

  const ops = db.operations
    .filter(o => o.investmentId === inv.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  res.json(ops);
});

// add operation
app.post('/api/investments/:id/operations', (req, res) => {
  const db = loadDb();
  const inv = db.investments.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Investment not found' });

  const { date, type, amount, rateMode, customRate, note, createdBy } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });
  if (!type || !['Wplata', 'Splata'].includes(type)) {
    return res.status(400).json({ error: 'type must be Wplata or Splata' });
  }
  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'amount must be positive number' });
  }

  let rateModeVal = rateMode === 'custom' ? 'custom' : 'global';
  let customRateVal = null;
  if (rateModeVal === 'custom') {
    const r = Number(customRate);
    if (isNaN(r)) {
      return res.status(400).json({ error: 'customRate must be a number when rateMode is custom' });
    }
    customRateVal = r;
  }

  const op = {
    id: newId('op'),
    investmentId: inv.id,
    date,
    type,
    amount: amountNum,
    rateMode: rateModeVal,
    customRate: customRateVal,
    note: note || '',
    createdBy: createdBy || 'system',
    createdAt: new Date().toISOString()
  };

  db.operations.push(op);
  saveDb(db);
  res.status(201).json(op);
});

// update operation
app.put('/api/operations/:id', (req, res) => {
  const db = loadDb();
  const op = db.operations.find(o => o.id === req.params.id);
  if (!op) return res.status(404).json({ error: 'Not found' });

  const { date, type, amount, rateMode, customRate, note } = req.body;

  if (date !== undefined) op.date = date;
  if (type !== undefined) {
    if (!['Wplata', 'Splata'].includes(type)) {
      return res.status(400).json({ error: 'type must be Wplata or Splata' });
    }
    op.type = type;
  }
  if (amount !== undefined) {
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'amount must be positive number' });
    }
    op.amount = amountNum;
  }
  if (rateMode !== undefined) {
    op.rateMode = rateMode === 'custom' ? 'custom' : 'global';
  }
  if (customRate !== undefined) {
    if (op.rateMode === 'custom') {
      const r = Number(customRate);
      if (isNaN(r)) {
        return res.status(400).json({ error: 'customRate must be a number when rateMode is custom' });
      }
      op.customRate = r;
    } else {
      op.customRate = null;
    }
  }
  if (note !== undefined) op.note = note;

  saveDb(db);
  res.json(op);
});

// delete operation
app.delete('/api/operations/:id', (req, res) => {
  const db = loadDb();
  const idx = db.operations.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.operations.splice(idx, 1);
  saveDb(db);
  res.status(204).send();
});

// summary endpoint
app.get('/api/investments/:id/summary', (req, res) => {
  const db = loadDb();
  const inv = db.investments.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Investment not found' });

  const ops = db.operations
    .filter(o => o.investmentId === inv.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  let saldo = 0;
  let lastDate = null;
  let totalInterest = 0;
  let totalIn = 0;
  let totalOut = 0;
  let firstDate = null;
  let lastOpDate = null;

  function diffDays(d1, d2) {
    const ms = d2.getTime() - d1.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  ops.forEach(op => {
    const opDate = new Date(op.date + 'T00:00:00');
    if (!firstDate) firstDate = opDate;
    lastOpDate = opDate;

    let days = 0;
    if (lastDate) {
      days = diffDays(lastDate, opDate);
    }
    lastDate = opDate;

    const saldoBefore = saldo;
    const rate = op.rateMode === 'custom' && op.customRate != null
      ? op.customRate
      : inv.baseRate;

    const interest = saldoBefore > 0
      ? saldoBefore * (rate / 100) * (days / 365)
      : 0;

    totalInterest += interest;

    if (op.type === 'Wplata') {
      saldo += op.amount;
      totalIn += op.amount;
    } else if (op.type === 'Splata') {
      saldo -= op.amount;
      if (saldo < 0) saldo = 0;
      totalOut += op.amount;
    }
  });

  const period =
    firstDate && lastOpDate
      ? `${firstDate.toISOString().slice(0,10)} → ${lastOpDate.toISOString().slice(0,10)}`
      : null;

  res.json({
    investment: inv,
    totalIn,
    totalOut,
    saldo,
    totalInterest,
    period,
    operationsCount: ops.length
  });
});

app.listen(PORT, () => {
  console.log(`Mooff Ledger PRO backend listening on port ${PORT}`);
});
