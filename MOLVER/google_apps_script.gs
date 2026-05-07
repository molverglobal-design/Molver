const CONFIG_SHEET = 'Settings';
const LEGACY_SHEET = 'StoreDB';
const BACKUP_SHEET = 'Backups';

const TABLES = {
  items: {
    sheet: 'Items',
    headers: ['code', 'barcode', 'name', 'cat', 'gender', 'size', 'color', 'fabric', 'qty', 'minQty', 'cost', 'price', 'notes']
  },
  customers: {
    sheet: 'Customers',
    headers: ['id', 'name', 'phone', 'phone2', 'addr', 'sourceType', 'lastSource', 'total', 'balance']
  },
  suppliers: {
    sheet: 'Suppliers',
    headers: ['id', 'name', 'phone', 'addr', 'total', 'balance']
  },
  sales: {
    sheet: 'Sales',
    headers: ['id', 'custId', 'party', 'phone', 'addr', 'date', 'items', 'lineItems', 'qtyTotal', 'total', 'paid', 'due', 'paymentStatus', 'profit', 'source', 'orderId']
  },
  purchases: {
    sheet: 'Purchases',
    headers: ['id', 'supId', 'party', 'date', 'items', 'lineItems', 'qtyTotal', 'total']
  },
  returns: {
    sheet: 'Returns',
    headers: ['id', 'code', 'type', 'invId', 'itemName', 'qty', 'price', 'total', 'reason', 'notes', 'date']
  },
  onlineOrders: {
    sheet: 'OnlineOrders',
    headers: ['id', 'custId', 'customerName', 'phone', 'phone2', 'address', 'source', 'paymentMethod', 'shippingCompany', 'trackingNo', 'shippingFee', 'discount', 'items', 'lineItems', 'qtyTotal', 'total', 'paid', 'due', 'profit', 'status', 'reserved', 'saleId', 'collectionStatus', 'collectedAmount', 'collectionDate', 'notes', 'date']
  },
  expenses: {
    sheet: 'Expenses',
    headers: ['id', 'name', 'cat', 'amount', 'date', 'notes']
  },
  activityLog: {
    sheet: 'ActivityLog',
    headers: ['id', 'user', 'action', 'target', 'details', 'date']
  },
  archivedRecords: {
    sheet: 'Archive',
    headers: ['id', 'type', 'refId', 'title', 'details', 'json', 'archivedAt']
  },
  brandSettings: {
    sheet: 'BrandSettings',
    headers: ['key', 'value']
  },
  users: {
    sheet: 'Users',
    headers: ['login', 'name', 'pin', 'role', 'pages', 'actions']
  }
};

function doGet(e) {
  const action = (e.parameter.action || '').trim();
  const callback = (e.parameter.callback || '').trim();
  const data = action === 'loadAll'
    ? loadAll_()
    : action === 'setup'
      ? setupAll_()
      : { ok: true, message: 'Apps Script is ready' };
  const body = callback ? `${callback}(${JSON.stringify(data)});` : JSON.stringify(data);
  return ContentService
    .createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = e.parameter && e.parameter.payload
    ? e.parameter.payload
    : e.postData && e.postData.contents ? e.postData.contents : '{}';
  const request = JSON.parse(body);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (request.action === 'saveAll') saveAll_(request.payload || {});
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: 'Saved to Google Sheets', savedAt: new Date().toISOString(), cloudVersion: getCloudVersion_() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function saveAll_(payload) {
  const db = payload.DB || {};
  const meta = payload.meta || {};
  const currentVersion = getCloudVersion_();
  if (meta.baseCloudVersion && currentVersion && String(meta.baseCloudVersion) !== String(currentVersion)) {
    db.activityLog = db.activityLog || [];
    db.activityLog.push({
      id: 'LOG-CONFLICT-' + Date.now(),
      user: 'Google Sheets',
      action: 'تحذير تعارض مزامنة',
      target: meta.clientId || '',
      details: 'تم الحفظ من جهاز بناء على نسخة أقدم. راجع آخر عمليات اليوم.',
      date: new Date().toISOString()
    });
  }
  Object.keys(TABLES).forEach(key => writeTable_(key, db[key] || []));
  writeTable_('users', payload.USERS || defaultUsers_());
  writeSettings_(payload.CNT || {});
  setCloudVersion_(String(Date.now()));
  createDailyBackup_(payload);
}

function setupAll_() {
  migrateLegacyStore_();
  Object.keys(TABLES).forEach(key => getSheet_(TABLES[key].sheet, TABLES[key].headers));
  getSheet_(CONFIG_SHEET, ['key', 'value']);
  getSheet_(BACKUP_SHEET, ['backupDate', 'part', 'json', 'createdAt']);
  return {
    ok: true,
    message: 'Sheets are ready',
    sheets: Object.keys(TABLES).map(key => TABLES[key].sheet).concat([CONFIG_SHEET, BACKUP_SHEET]),
    checkedAt: new Date().toISOString()
  };
}

function loadAll_() {
  migrateLegacyStore_();
  return {
    ok: true,
    message: 'Loaded from Google Sheets',
    DB: {
      items: readTable_('items'),
      customers: readTable_('customers'),
      suppliers: readTable_('suppliers'),
      sales: readTable_('sales'),
      purchases: readTable_('purchases'),
      returns: readTable_('returns'),
      onlineOrders: readTable_('onlineOrders'),
      expenses: readTable_('expenses'),
      activityLog: readTable_('activityLog'),
      archivedRecords: readTable_('archivedRecords'),
      brandSettings: readTable_('brandSettings')
    },
    CNT: readSettings_(),
    USERS: readTable_('users').length ? readTable_('users') : defaultUsers_(),
    meta: { cloudVersion: getCloudVersion_() }
  };
}

function getCloudVersion_() {
  return PropertiesService.getScriptProperties().getProperty('cloudVersion') || '';
}

function setCloudVersion_(value) {
  PropertiesService.getScriptProperties().setProperty('cloudVersion', value);
}

function defaultUsers_() {
  return [{ login: 'owner', name: 'MOLVER', pin: '1234', role: 'owner', pages: 'all', actions: 'all' }];
}

function createDailyBackup_(payload) {
  const sheet = getSheet_(BACKUP_SHEET, ['backupDate', 'part', 'json', 'createdAt']);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    if (dates.indexOf(today) !== -1) return;
  }
  const json = JSON.stringify(payload);
  const chunkSize = 45000;
  const rows = [];
  for (let i = 0; i < json.length; i += chunkSize) {
    rows.push([today, rows.length + 1, json.slice(i, i + chunkSize), new Date().toISOString()]);
  }
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  sheet.autoResizeColumns(1, 4);
}

function migrateLegacyStore_() {
  const ss = SpreadsheetApp.getActive();
  const legacy = ss.getSheetByName(LEGACY_SHEET);
  if (!legacy) return;

  const hasNewTables = Object.keys(TABLES).some(key => {
    const sheet = ss.getSheetByName(TABLES[key].sheet);
    return sheet && sheet.getLastRow() > 1;
  });
  if (hasNewTables) return;

  const json = legacy.getRange(2, 2).getValue();
  if (!json) return;

  try {
    const payload = JSON.parse(json);
    saveAll_({
      DB: payload.DB || {},
      CNT: payload.CNT || {},
      USERS: payload.USERS || defaultUsers_()
    });
    legacy.setName('StoreDB_OLD');
  } catch (e) {
    legacy.getRange(1, 5).setValue('Migration error');
    legacy.getRange(2, 5).setValue(String(e));
  }
}

function writeTable_(key, rows) {
  const cfg = TABLES[key];
  const sheet = getSheet_(cfg.sheet, cfg.headers);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
  sheet.setFrozenRows(1);
  if (!rows.length) return;

  const values = rows.map(row => cfg.headers.map(header => serializeCell_(row[header])));
  sheet.getRange(2, 1, values.length, cfg.headers.length).setValues(values);
  sheet.autoResizeColumns(1, cfg.headers.length);
}

function readTable_(key) {
  const cfg = TABLES[key];
  const sheet = getSheet_(cfg.sheet, cfg.headers);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, cfg.headers.length).getValues();
  return values
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      cfg.headers.forEach((header, index) => obj[header] = parseCell_(row[index]));
      return obj;
    });
}

function writeSettings_(cnt) {
  const headers = ['key', 'value'];
  const sheet = getSheet_(CONFIG_SHEET, headers);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([headers]);
  const defaults = { item: 1, sale: 1, pur: 1, ret: 1, cust: 1, sup: 1, online: 1, exp: 1 };
  const merged = Object.assign(defaults, cnt || {});
  const values = Object.keys(merged).map(key => [key, merged[key]]);
  sheet.getRange(2, 1, values.length, 2).setValues(values);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 2);
}

function readSettings_() {
  const defaults = { item: 1, sale: 1, pur: 1, ret: 1, cust: 1, sup: 1, online: 1, exp: 1 };
  const sheet = getSheet_(CONFIG_SHEET, ['key', 'value']);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return defaults;

  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  values.forEach(([key, value]) => {
    if (key) defaults[key] = Number(value) || 1;
  });
  return defaults;
}

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function serializeCell_(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return value;
}

function parseCell_(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { return JSON.parse(trimmed); } catch (e) {}
  }
  return value;
}
