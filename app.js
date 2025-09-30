/* ================= ASTRA POS — app.js (Bootstrap + SweetAlert2) =================
   Quick highlights:
   • Subtotal fixed (no VAT); always visible
   • Credit pane refreshes instantly after payments
   • PAYMENT_MODE for credit: 'FIFO' | 'LIFO' (default FIFO)
   • INV_DEPLETION_MODE for product stock depletion: 'FIFO' | 'LIFO'
   • Upload removed; SweetAlert2 for dialogs; icon action buttons
=============================================================================== */

/* ------------------ CONFIG ------------------ */
const PAYMENT_MODE = 'FIFO';       // 'FIFO' | 'LIFO' — order to settle credit transactions
const INV_DEPLETION_MODE = 'FIFO'; // 'FIFO' | 'LIFO' — order to deplete stock lots (prepped for per-batch restocks)

/* ------------------ DOM ELEMENTS ------------------ */
const outputLog = byId('output-log');

/* Process a New Sale */
const customerNameInput    = byId('customerName');
const productSearchInput   = byId('itemsSoldName');
const productDropdown      = byId('product-dropdown');
const productQuantityInput = byId('itemsSoldQuantity');
const orderSummaryTable    = byId('order-summary-items');
const subtotalSpan         = byId('subtotal');
const cashReceivedInput    = byId('cashReceived');
const changeSpan           = byId('change');
const selectedUnitBadge    = byId('selectedUnit');

/* Store Management & Inventory */
const productNameInput     = byId('productName');
const productUnitInput     = byId('productUnit');
const productStockInput    = byId('productStock');
const productPriceInput    = byId('productPrice');
const addProductButton     = byId('addProductButton');
const cancelEditButton     = byId('cancelEditButton');
const inventoryDisplay     = byId('inventory-display');

/* Daily Sales & Credit */
const salesDisplay               = byId('sales-display');
const creditSearchInput          = byId('creditCustomerSearch');
const creditHistoryDisplay       = byId('creditHistoryDetails');
const creditTotalDisplay         = byId('creditTotal');
const paymentCustomerDropdown    = byId('paymentCustomerName');
const pendingTransactionDropdown = byId('pendingTransactionId');
const amountPaidInput            = byId('amountPaid');

/* ------------------ DATA MODELS ------------------ */
let inventory = {};
// Optional: prepared structure for per-batch depletion (for future restocks with different prices)
let inventoryLots = {}; // { [productName]: [{qty, unitPrice, ts}] }

let customerCredit = {};
let dailySales = [];
let currentSaleItems = [];
let editingProduct = null;

/* ------------------ UTILITIES ------------------ */
function byId(id){ return document.getElementById(id); }
function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(w => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');
}
function formatTimestamp(isoString) {
  const d = new Date(isoString);
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  const dd = d.getDate();
  const yy = d.getFullYear();
  let hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${day}-${mon} ${dd}, ${yy} at ${String(hh).padStart(2,'0')}:${mm}${ampm}`;
}

/* -------- SweetAlert helpers -------- */
async function swalConfirm({ title='Are you sure?', text='', icon='warning', confirm='Yes', cancel='Cancel' }={}) {
  const res = await Swal.fire({ title, text, icon, showCancelButton:true, confirmButtonText:confirm, cancelButtonText:cancel, reverseButtons:true });
  return res.isConfirmed;
}
function toastSuccess(text){ Swal.fire({icon:'success', title:'Success', text, timer:1700, showConfirmButton:false}); }
function toastError(text){ Swal.fire({icon:'error', title:'Oops!', text}); }
function toastWarn(text){ Swal.fire({icon:'warning', title:'Heads up', text}); }

/* ------------------ STORAGE ------------------ */
function invToCSV(){
  let csv = 'ProductName,Unit,Stock,Price\n';
  for (const n in inventory){
    const esc = n.includes(',') ? `"${n.replace(/"/g,'""')}"` : n;
    csv += `${esc},${inventory[n].unit},${inventory[n].stock},${inventory[n].price.toFixed(2)}\n`;
  }
  return csv.trim();
}
function csvToInv(csv){
  const out = {};
  const lines = csv.trim().split('\n');
  for (let i=1;i<lines.length;i++){
    const parts = lines[i].split(',');
    if (parts.length < 3) continue;
    const name = toTitleCase(parts[0].trim().replace(/^"|"$/g,'').replace(/""/g,'"'));
    const unit = (parts.length===4?parts[1]:'pc').trim();
    const stock= parseFloat(parts[parts.length-2]);
    const price= parseFloat(parts[parts.length-1]);
    if (!name || isNaN(stock) || isNaN(price)) continue;
    out[name] = { unit, stock, price };
  }
  return out;
}
function saveAll(){
  localStorage.setItem('astraInventoryCSV', invToCSV());
  localStorage.setItem('astraCreditJSON', JSON.stringify(customerCredit));
  localStorage.setItem('astraSalesJSON', JSON.stringify(dailySales));
  log('Data saved.');
}
function loadAll(){
  const invCSV  = localStorage.getItem('astraInventoryCSV');
  const credStr = localStorage.getItem('astraCreditJSON');
  const salesStr= localStorage.getItem('astraSalesJSON');

  if (invCSV) inventory = csvToInv(invCSV);
  if (credStr) { try { customerCredit = JSON.parse(credStr) || {}; } catch { customerCredit = {}; } }
  if (salesStr) { try { dailySales = JSON.parse(salesStr) || []; } catch { dailySales = []; } }

  if (Object.keys(inventory).length === 0){
    inventory = {
      'Sardines'      : { unit:'pc',  stock:50,  price:21.5 },
      'Ground Coffee' : { unit:'kg',  stock:1.5, price:350 },
      'Bottled Water' : { unit:'doz', stock:24,  price:250 },
    };
    customerCredit = {
      'Josie'  : [
        { timestamp:new Date(Date.now()-86400000*5).toISOString(), amount:50,  status:'Paid' },
        { timestamp:new Date(Date.now()-86400000).toISOString(),   amount:100, status:'Pending' }
      ],
      'Raymart': [
        { timestamp:new Date().toISOString(), amount:75, status:'Pending' }
      ]
    };
    log('Loaded defaults.');
    saveAll();
  } else {
    log('Loaded from LocalStorage.');
  }

  // initialize single-lot snapshot for each product (so INV_DEPLETION_MODE can work later)
  inventoryLots = {};
  for (const n in inventory){
    inventoryLots[n] = [{ qty: inventory[n].stock, unitPrice: inventory[n].price, ts: Date.now() }];
  }
}

/* ------------------ LOGGING ------------------ */
function log(message){
  if (!outputLog) return;
  outputLog.textContent = `[${new Date().toLocaleTimeString()}] ${message}\n` + outputLog.textContent;
}

/* =======================================================================
   INVENTORY CRUD
======================================================================== */
async function deleteProduct(name){
  const ok = await swalConfirm({ title:'Delete Product?', text:`Remove "${name}" permanently.`, icon:'warning', confirm:'Delete' });
  if (!ok) return;
  if (!inventory[name]) return toastError('Product not found.');
  delete inventory[name];
  delete inventoryLots[name];
  toastSuccess(`"${name}" deleted.`);
  log(`Product deleted: ${name}`);
  updateAllViews();
  saveAll();
}
function editProduct(name){
  const p = inventory[name];
  if (!p) return toastError('Product not found.');
  editingProduct = name;
  productNameInput.value  = name;
  productUnitInput.value  = p.unit || 'pc';
  productStockInput.value = p.stock;
  productPriceInput.value = p.price.toFixed(2);
  addProductButton.innerHTML = '<i class="bi bi-check2-square me-1"></i>SAVE UPDATE';
  cancelEditButton.classList.remove('d-none');
  log(`Editing product: ${name}`);
}
function cancelEdit(){
  editingProduct = null;
  productNameInput.value  = '';
  productUnitInput.value  = 'pc';
  productStockInput.value = '';
  productPriceInput.value = '';
  addProductButton.innerHTML = '<i class="bi bi-save2 me-1"></i>Add Product';
  cancelEditButton.classList.add('d-none');
  log('Edit cancelled.');
}
function addOrUpdateProduct(){
  let name  = (productNameInput.value || '').trim();
  const unit  = (productUnitInput.value || 'pc').trim();
  const stock = parseFloat(productStockInput.value || '');
  const price = parseFloat(productPriceInput.value || '');

  if (!name || !unit || isNaN(stock) || stock < 0 || isNaN(price) || price < 0){
    toastError('Complete product details with valid numbers.');
    return;
  }
  name = toTitleCase(name);

  const renaming = editingProduct && editingProduct !== name;
  if (!editingProduct && inventory[name])      return toastError(`"${name}" already exists. Use Edit instead.`);
  if (renaming && inventory[name])             return toastError(`Cannot rename to "${name}" (duplicate).`);
  if (renaming) delete inventory[editingProduct];

  inventory[name] = { unit, stock, price };

  // reset lots snapshot (single lot equal to total stock & current price)
  inventoryLots[name] = [{ qty: stock, unitPrice: price, ts: Date.now() }];

  Swal.fire({
    icon:'success',
    title: editingProduct ? 'Product Updated' : 'Product Added',
    html: `<div class="text-start">
            <div><strong>Name:</strong> ${name}</div>
            <div><strong>Stock:</strong> ${stock} ${unit}</div>
            <div><strong>Price:</strong> ₱${price.toFixed(2)}</div>
          </div>`
  });

  cancelEdit();
  updateAllViews();
  saveAll();
}

/* =======================================================================
   SALES (ORDER) — unit visibility in summary, subtotal (no VAT)
======================================================================== */
function updateSelectedUnit(){
  const name = toTitleCase((productSearchInput.value || '').trim());
  const unit = inventory[name]?.unit || '—';
  selectedUnitBadge.textContent = `unit: ${unit}`;
}
function addItemToSale(){
  let itemName = (productSearchInput.value || '').trim();
  const qty = parseFloat(productQuantityInput.value || '');

  if (!itemName || isNaN(qty) || qty <= 0) return toastError('Enter a valid product and quantity (> 0).');
  itemName = toTitleCase(itemName);
  const product = inventory[itemName];
  if (!product) return toastError(`Product "${itemName}" not found.`);

  const already = currentSaleItems.filter(it => it.name === itemName).reduce((s,it)=>s+it.quantity, 0);
  if (product.stock < already + qty) return toastError(`Exceeds stock: ${product.stock} ${product.unit}`);

  currentSaleItems.push({ name:itemName, quantity:qty });
  updateOrderSummary(); // shows unit & subtotal
  productSearchInput.value = '';
  productQuantityInput.value = '';
  updateSelectedUnit();
  hideProductDropdown();
  log(`Added to sale: ${itemName} (${qty} ${product.unit}).`);
}
function updateOrderSummary(){
  const tbody = orderSummaryTable.querySelector('tbody');
  tbody.innerHTML='';
  let subtotal = 0;

  currentSaleItems.forEach((item, idx)=>{
    const p = inventory[item.name] || { price:0, unit:'' };
    const total = p.price * item.quantity;
    subtotal += total;

    const row = tbody.insertRow(-1);
    row.insertCell(0).textContent = idx + 1;
    row.insertCell(1).textContent = item.name;
    row.insertCell(2).textContent = `${item.quantity} ${p.unit || ''}`;
    const priceCell = row.insertCell(3);
    priceCell.classList.add('text-end');
    priceCell.textContent = `₱${total.toFixed(2)}`;
  });

  subtotalSpan.textContent = `₱${subtotal.toFixed(2)}`;
  calcChange();
}
function calcChange(){
  const subtotal = parseFloat((subtotalSpan.textContent || '0').replace('₱','')) || 0;
  const cash = parseFloat(cashReceivedInput.value || '') || 0;
  const change = cash - subtotal;
  changeSpan.textContent = `₱${change.toFixed(2)}`;
}
function resetSaleFields(){
  currentSaleItems = [];
  orderSummaryTable.querySelector('tbody').innerHTML = '';
  subtotalSpan.textContent = '₱0.00';
  changeSpan.textContent = '₱0.00';
  cashReceivedInput.value = '';
  customerNameInput.value = '';
  updateSelectedUnit();
}
function processSale(type){ // 'Cash' | 'Credit'
  if (currentSaleItems.length === 0) return toastError('Please add items to the sale.');
  const customerName = (customerNameInput.value || '').trim();
  const subtotal = parseFloat((subtotalSpan.textContent || '0').replace('₱','')) || 0;

  if (type === 'Credit'){
    if (customerName === '') return toastError('Customer Name is required for Credit (Utang).');
  } else {
    const cash = parseFloat(cashReceivedInput.value || '');
    if (isNaN(cash) || cash < subtotal) return toastError(`Cash (₱${(cash||0).toFixed(2)}) is less than subtotal (₱${subtotal.toFixed(2)}).`);
  }

  processTransaction(customerName, currentSaleItems, type);
}

/* Stock depletion helper obeying INV_DEPLETION_MODE */
function depleteLots(name, qtyNeeded){
  // With single-lot snapshot this behaves same either mode for now; logic supports future multi-lots
  let lots = inventoryLots[name] || [];
  if (INV_DEPLETION_MODE === 'LIFO') lots = lots.sort((a,b)=> b.ts - a.ts);
  else                              lots = lots.sort((a,b)=> a.ts - b.ts);

  let remaining = qtyNeeded;
  for (const lot of lots){
    if (remaining <= 0) break;
    const take = Math.min(lot.qty, remaining);
    lot.qty -= take;
    remaining -= take;
  }
  // compact zero lots
  inventoryLots[name] = lots.filter(l=>l.qty > 0.000001);
  return remaining <= 0;
}

async function processTransaction(customerName, itemsSold, type){
  // Validate stock
  for (const it of itemsSold){
    const p = inventory[it.name];
    if (!p || p.stock < it.quantity) return toastError(`Insufficient stock for ${it.name}.`);
  }

  // Update inventory & compute total (obey INV_DEPLETION_MODE)
  let total = 0;
  for (const it of itemsSold){
    const p = inventory[it.name];
    // try deplete lots (prepped for batch mode)
    depleteLots(it.name, it.quantity);
    p.stock -= it.quantity;
    total += p.price * it.quantity;
  }

  let cust = customerName || 'Cash Customer';
  if (type === 'Credit'){
    cust = toTitleCase(customerName.trim());
    if (!customerCredit[cust]) customerCredit[cust] = [];
    customerCredit[cust].push({ timestamp:new Date().toISOString(), amount: total, status:'Pending' });
  }

  dailySales.push({ items: itemsSold, total, type, customer: cust, timestamp: new Date().toISOString() });

  Swal.fire({
    icon:'success',
    title:`${type} Transaction Completed`,
    html:`<div class="text-start"><div><strong>Customer:</strong> ${cust}</div><div><strong>Total:</strong> ₱${total.toFixed(2)}</div></div>`
  });

  log(`Transaction OK: ${type} ₱${total.toFixed(2)} (${cust}).`);
  updateAllViews();
  resetSaleFields();
  saveAll();
}

/* =======================================================================
   PAYMENTS (FIFO / LIFO) — full or partial against a specific tx
======================================================================== */
function recordPayment(){
  const cust = paymentCustomerDropdown.value || '';
  const amount = parseFloat(amountPaidInput.value || '');
  if (!cust) return toastError('Select a customer.');
  if (isNaN(amount) || amount <= 0) return toastError('Enter a valid payment amount (> 0).');

  const txIndexStr = pendingTransactionDropdown.value || '';
  if (txIndexStr !== ''){
    // Partial against a chosen transaction
    const pending = getPendingSorted(cust);
    const tx = pending[parseInt(txIndexStr,10)];
    if (!tx) return toastError('Selected transaction not found.');
    if (amount > tx.amount + 1e-6) return toastError(`Payment cannot exceed selected transaction (₱${tx.amount.toFixed(2)}).`);

    tx.amount = parseFloat((tx.amount - amount).toFixed(2));
    if (tx.amount <= 0.009){ tx.amount = 0; tx.status = 'Paid'; }
    const newBal = sumPending(cust);

    Swal.fire({
      icon:'success',
      title:'Partial Payment Recorded',
      html:`<div class="text-start">
              <div><strong>Customer:</strong> ${cust}</div>
              <div><strong>Paid:</strong> ₱${amount.toFixed(2)}</div>
              <div><strong>Remaining (this tx):</strong> ₱${tx.amount.toFixed(2)}</div>
              <div><strong>New Balance:</strong> ₱${newBal.toFixed(2)}</div>
            </div>`
    });

    // 🔁 Hard refresh of credit pane + keep selection
    updateAllViews();
    paymentCustomerDropdown.value = cust;
    populatePendingTransactions();
    updateAmountPaidPlaceholder();
    creditSearchInput.value = cust;
    displayCustomerCreditHistory(cust);

    amountPaidInput.value = '';
    pendingTransactionDropdown.value = '';
    saveAll();
    return;
  }

  // Multi-transaction payment using FIFO/LIFO across all pending
  fifoOrLifoPay(cust, amount);

  // 🔁 Hard refresh of credit pane + keep selection
  updateAllViews();
  paymentCustomerDropdown.value = cust;
  populatePendingTransactions();
  updateAmountPaidPlaceholder();
  creditSearchInput.value = cust;
  displayCustomerCreditHistory(cust);

  amountPaidInput.value = '';
  saveAll();
}

function getPendingSorted(cust){
  const arr = (customerCredit[cust] || []).filter(t=>t.status==='Pending');
  return (PAYMENT_MODE === 'LIFO')
    ? arr.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))
    : arr.sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp)); // FIFO
}
function sumPending(cust){
  return (customerCredit[cust] || []).filter(t=>t.status==='Pending').reduce((s,t)=>s+t.amount,0);
}
function fifoOrLifoPay(cust, amount){
  const pending = getPendingSorted(cust);
  if (pending.length === 0) return toastError(`'${cust}' has no outstanding balance.`);
  const balance = pending.reduce((s,t)=>s+t.amount,0);
  if (amount > balance) return toastWarn(`Payment (₱${amount.toFixed(2)}) exceeds balance (₱${balance.toFixed(2)}).`);

  let left = amount;
  for (const t of pending){
    if (left <= 0) break;
    if (left >= t.amount - 1e-6){ left -= t.amount; t.amount = 0; t.status='Paid'; }
    else { t.amount = parseFloat((t.amount - left).toFixed(2)); left = 0; if (t.amount <= 0.009){ t.amount=0; t.status='Paid'; } break; }
  }
  const newBal = sumPending(cust);
  Swal.fire({
    icon:'success',
    title:`Payment Recorded (${PAYMENT_MODE})`,
    html:`<div class="text-start"><div><strong>Customer:</strong> ${cust}</div><div><strong>Amount Paid:</strong> ₱${amount.toFixed(2)}</div><div><strong>New Balance:</strong> ₱${newBal.toFixed(2)}</div></div>`
  });
}

/* =======================================================================
   CREDIT HISTORY RENDER
======================================================================== */
function displayCustomerCreditHistory(nameInput){
  const search = (nameInput || '').trim();
  const name = toTitleCase(search);
  let customers = [];
  let grand = 0;

  if (search){
    if (!customerCredit[name]){
      creditHistoryDisplay.innerHTML = `<p class="text-muted mb-0">No credit history for <strong>${name}</strong>.</p>`;
      creditTotalDisplay.textContent = '₱0.00';
      return;
    }
    customers = [name];
  } else {
    customers = Object.keys(customerCredit).sort();
  }

  let html = '';
  customers.forEach(c=>{
    const txs = (customerCredit[c]||[]).slice().sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
    if (txs.length === 0) return;

    let bal = 0;
    html += `<h3 class="h6 mt-3 mb-2">${c}</h3>
             <table class="table table-sm table-striped align-middle mb-3">
               <thead class="table-secondary">
                 <tr>
                   <th style="width:5%;">#</th>
                   <th style="width:35%;">Date Utang</th>
                   <th style="width:25%;" class="text-end">Amount</th>
                   <th style="width:35%;">Status</th>
                 </tr>
               </thead>
               <tbody>`;
    txs.forEach((t,i)=>{
      if (t.status==='Pending') bal += t.amount;
      const cls = t.status==='Paid' ? 'text-success fw-normal' : 'text-dark fw-semibold';
      html += `<tr>
                <td>${i+1}</td>
                <td>${formatTimestamp(t.timestamp)}</td>
                <td class="text-end">₱${t.amount.toFixed(2)}</td>
                <td class="${cls}">${t.status}</td>
              </tr>`;
    });
    html += `<tr>
              <td colspan="2" class="text-end fw-semibold">TOTAL PENDING BALANCE:</td>
              <td colspan="2" class="fw-bold">₱${bal.toFixed(2)}</td>
            </tr>
            </tbody></table>`;
    grand += bal;
  });

  creditHistoryDisplay.innerHTML = html || `<p class="text-muted mb-0">No credit history yet.</p>`;
  creditTotalDisplay.textContent = `₱${grand.toFixed(2)}`;
}

/* =======================================================================
   PRODUCT SEARCH DROPDOWN (typeahead)
======================================================================== */
function showProductDropdown(){
  const term = (productSearchInput.value || '').toLowerCase().trim();
  productDropdown.innerHTML = '';
  if (!term){ hideProductDropdown(); return; }

  const matches = Object.keys(inventory).filter(p => p.toLowerCase().includes(term));
  if (matches.length === 0){ hideProductDropdown(); return; }

  matches.forEach(name=>{
    const li = document.createElement('li');
    li.className = 'list-group-item';
    const p = inventory[name];
    li.textContent = `${name} (Stock: ${p.stock} ${p.unit})`;
    li.onclick = ()=>{
      productSearchInput.value = name;
      updateSelectedUnit();
      hideProductDropdown();
      productQuantityInput.focus();
    };
    productDropdown.appendChild(li);
  });
  productDropdown.classList.remove('d-none');
}
function hideProductDropdown(){
  productDropdown.classList.add('d-none');
  productDropdown.innerHTML = '';
}
document.addEventListener('click', e=>{
  if (!productSearchInput.contains(e.target) && !productDropdown.contains(e.target)){
    hideProductDropdown();
  }
});

/* =======================================================================
   EXPORT HELPERS (System Log buttons)
======================================================================== */
function downloadTextFile(filename, text) {
  const a = document.createElement('a');
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  a.setAttribute('download', filename);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
function exportDataAsTxt(kind){
  let content = '';
  let filename = '';
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  if (kind === 'inventory'){ content = invToCSV(); filename = `ASTRA_Inventory_${ts}.txt`; }
  else if (kind === 'credit'){ content = generateCreditReport(); filename = `ASTRA_Credit_${ts}.txt`; }
  else if (kind === 'log'){ content = outputLog.textContent || ''; filename = `ASTRA_Log_${ts}.txt`; }
  else return toastError('Invalid export type.');
  if (!content.trim()) return toastWarn('Nothing to export.');
  downloadTextFile(filename, content);
  toastSuccess(`Exported: ${filename}`);
}
function generateCreditReport(){
  let report = `ASTRA Customer Credit History Report\nGenerated on: ${formatTimestamp(new Date().toISOString())}\n\n`;
  let grandTotal = 0;
  const names = Object.keys(customerCredit).sort();
  if (names.length === 0) return report + 'No credit history records found.\n';
  names.forEach(name=>{
    const txs = (customerCredit[name]||[]).slice().sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));
    if (txs.length === 0) return;
    let bal = 0, paidCount = 0, pendingCount = 0;
    report += `========================================\nCustomer: ${name}\n========================================\n`;
    txs.forEach((t, i)=>{
      const status = (t.status||'').padEnd(8);
      const dateStr = formatTimestamp(t.timestamp).padEnd(40);
      report += `${String(i+1).padStart(3,' ')}. ${dateStr} | ₱${t.amount.toFixed(2).padStart(10,' ')} | Status: ${status}\n`;
      if (t.status==='Pending'){ bal += t.amount; pendingCount++; } else { paidCount++; }
    });
    report += `----------------------------------------\n   Total: ${txs.length}\n   Paid: ${paidCount}\n   Pending: ${pendingCount}\n   TOTAL PENDING BALANCE: ₱${bal.toFixed(2)}\n\n`;
    grandTotal += bal;
  });
  report += `\n########################################\nGRAND TOTAL OUTSTANDING CREDIT: ₱${grandTotal.toFixed(2)}\n########################################\n`;
  return report;
}

/* =======================================================================
   DISPLAY BUILDERS
======================================================================== */
function updateAllViews(){
  renderInventoryTable();
  renderSalesTable();
  buildPaymentCustomerOptions();
  const term = (creditSearchInput.value || '').trim();
  if (term) displayCustomerCreditHistory(term); else displayCustomerCreditHistory('');
}
function renderInventoryTable(){
  const esc = s=>s.replace(/'/g,"\\'");
  let html = `<table class="table table-sm table-striped align-middle mb-0">
                <thead class="table-dark">
                  <tr>
                    <th>#</th><th>Product</th><th>Unit</th><th>Stock</th>
                    <th class="text-end">Price</th>
                    <th class="text-center" colspan="2">Action</th>
                  </tr>
                </thead><tbody>`;
  let i=1;
  for (const name in inventory){
    const p = inventory[name];
    html += `<tr>
              <td>${i++}</td>
              <td>${name}</td>
              <td>${p.unit}</td>
              <td>${p.stock}</td>
              <td class="text-end">₱${p.price.toFixed(2)}</td>
              <td class="text-center">
                <button class="btn btn-outline-primary btn-sm" title="Edit" onclick="editProduct('${esc(name)}')"><i class="bi bi-pencil-square"></i></button>
              </td>
              <td class="text-center">
                <button class="btn btn-outline-danger btn-sm" title="Delete" onclick="deleteProduct('${esc(name)}')"><i class="bi bi-trash3"></i></button>
              </td>
            </tr>`;
  }
  html += `</tbody></table>`;
  inventoryDisplay.innerHTML = html;
}
function renderSalesTable(){
  let html = `<table class="table table-sm table-striped align-middle mb-0">
                <thead class="table-secondary">
                  <tr><th>#</th><th>Time</th><th>Customer</th><th>Type</th><th class="text-end">Total</th></tr>
                </thead><tbody>`;
  const list = [...dailySales].sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
  list.forEach((s,idx)=>{
    html += `<tr>
              <td>${idx+1}</td>
              <td>${new Date(s.timestamp).toLocaleTimeString()}</td>
              <td>${s.customer}</td>
              <td>${s.type}</td>
              <td class="text-end">₱${s.total.toFixed(2)}</td>
            </tr>`;
  });
  html += `</tbody></table>`;
  salesDisplay.innerHTML = html;
}
function buildPaymentCustomerOptions(){
  paymentCustomerDropdown.innerHTML = '<option value="">--Select Customer--</option>';
  for (const name in customerCredit){
    const bal = sumPending(name);
    if (bal > 0){
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name} (₱${bal.toFixed(2)})`;
      paymentCustomerDropdown.appendChild(opt);
    }
  }
}

/* Pending transaction dropdown for partial payments */
function populatePendingTransactions(){
  const cust = paymentCustomerDropdown.value;
  pendingTransactionDropdown.innerHTML = '<option value="">--Select Transaction for PARTIAL PAYMENT--</option>';
  if (!cust) return;
  const pending = getPendingSorted(cust);
  pending.forEach((t,idx)=>{
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${formatTimestamp(t.timestamp)} - ₱${t.amount.toFixed(2)}`;
    pendingTransactionDropdown.appendChild(opt);
  });
  updateAmountPaidPlaceholder();
}
function updateAmountPaidPlaceholder(){
  const cust = paymentCustomerDropdown.value;
  const idx  = pendingTransactionDropdown.value;
  if (!cust || idx===''){ amountPaidInput.placeholder = 'Enter amount paid'; return; }
  const pending = getPendingSorted(cust);
  const tx = pending[parseInt(idx,10)];
  amountPaidInput.placeholder = tx ? `Max: ₱${tx.amount.toFixed(2)}` : 'Enter amount paid';
}

/* =======================================================================
   EVENTS + GLOBALS
======================================================================== */
document.addEventListener('DOMContentLoaded', ()=>{
  loadAll();
  updateAllViews();
  cancelEditButton.classList.add('d-none');
  updateSelectedUnit();

  cashReceivedInput.addEventListener('input', calcChange);
  creditSearchInput.addEventListener('input', e=> displayCustomerCreditHistory(e.target.value));
});

/* Make functions available for inline handlers in index.html */
window.showProductDropdown = showProductDropdown;
window.updateSelectedUnit  = updateSelectedUnit;
window.addItemToSale       = addItemToSale;
window.processSale         = processSale;
window.editProduct         = editProduct;
window.deleteProduct       = deleteProduct;
window.cancelEdit          = cancelEdit;
window.addProduct          = addOrUpdateProduct;
window.calculateChange     = calcChange;
window.populatePendingTransactions = populatePendingTransactions;
window.updateAmountPaidPlaceholder = updateAmountPaidPlaceholder;
window.recordPayment       = recordPayment;
window.exportDataAsTxt     = exportDataAsTxt;

/* =============================== END OF FILE =============================== */
