// --- DOM ELEMENT REFERENCES ---
const outputLog = document.getElementById('output-log');
const inventoryDisplay = document.getElementById('inventory-display');
const salesDisplay = document.getElementById('sales-display');
const creditDisplay = document.getElementById('credit-display'); 
const paymentCustomerDropdown = document.getElementById('paymentCustomerName');
const customerNameInput = document.getElementById('customerName');
const productSearchInput = document.getElementById('itemsSoldName');
const productDropdown = document.getElementById('product-dropdown');
const productQuantityInput = document.getElementById('itemsSoldQuantity');
const orderSummaryTable = document.getElementById('order-summary-items');
const subtotalSpan = document.getElementById('subtotal');
const changeSpan = document.getElementById('change');
const cashReceivedInput = document.getElementById('cashReceived');
const productNameInput = document.getElementById('productName');
const productUnitInput = document.getElementById('productUnit'); 
const productStockInput = document.getElementById('productStock');
const productPriceInput = document.getElementById('productPrice');
const uploadProductListInput = document.getElementById('uploadProductList');

// *** NEW CREDIT HISTORY ELEMENTS ***
const creditSearchInput = document.getElementById('creditCustomerSearch');
const creditHistoryDisplay = document.getElementById('creditHistoryDetails');
const creditTotalDisplay = document.getElementById('creditTotal');
// **********************************

// *** PAYMENT SELECTORS (in index.html) ***
const pendingTransactionDropdown = document.getElementById('pendingTransactionId');

// *** BUTTON REFERENCES ***
const addProductButton = document.getElementById('addProductButton'); 
const cancelEditButton = document.getElementById('cancelEditButton'); 

// --- DATA STRUCTURES (Initialized as empty objects) ---
let inventory = {}; 
let customerCredit = {}; 
let dailySales = []; 
let currentSaleItems = [];

// *** GLOBAL STATE FOR EDIT MODE ***
let editingProduct = null; 

// --- HELPER FUNCTION FOR CONSISTENT NAMING (Normalization) ---

/**
 * Converts a string to Title Case (e.g., "sArdInes" -> "Sardines").
 */
function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word => {
        if (word.length === 0) return '';
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

// --- NEW HELPER: Timestamp Formatting ---
function formatTimestamp(isoString) {
    const date = new Date(isoString);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const day = dayNames[date.getDay()];
    const month = monthNames[date.getMonth()];
    const dateNum = date.getDate();
    const year = date.getFullYear();
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    
    // Example: Sat-Sep 27, 2025 at 07:56AM
    return `${day}-${month} ${dateNum}, ${year} at ${hours.toString().padStart(2, '0')}:${minutes}${ampm}`;
}

// --- CSV/JSON Conversion Functions ---

/**
 * Converts the inventory object into a CSV string.
 * Format: ProductName,Unit,Stock,Price
 */
function inventoryToCSV() {
    let csv = "ProductName,Unit,Stock,Price\n";
    for (const name in inventory) {
        let escapedName = name.includes(',') ? `"${name.replace(/"/g, '""')}"` : name;
        csv += `${escapedName},${inventory[name].unit},${inventory[name].stock},${inventory[name].price.toFixed(2)}\n`;
    }
    return csv.trim();
}

/**
 * Converts a CSV string into the inventory object.
 */
function csvToInventory(csvString) {
    const newInventory = {};
    const lines = csvString.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        
        let name, unit, stock, price;
        
        if (parts.length === 4) {
            name = toTitleCase(parts[0].trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
            unit = parts[1].trim();
            stock = parseFloat(parts[2].trim());
            price = parseFloat(parts[3].trim());
        } else if (parts.length === 3) {
            name = toTitleCase(parts[0].trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
            unit = 'pc'; 
            stock = parseFloat(parts[1].trim());
            price = parseFloat(parts[2].trim());
        } else {
            continue; 
        }
        
        if (name && !isNaN(stock) && !isNaN(price)) {
            newInventory[name] = { stock, price, unit }; 
        }
    }
    return newInventory;
}

/**
 * Converts the customerCredit object (history structure) into a JSON string.
 */
function creditToJSON() {
    return JSON.stringify(customerCredit, null, 2); // Use 2 spaces for formatting for readability
}

/**
 * Converts a JSON string into the customerCredit object (history structure).
 */
function jsonToCredit(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        if (typeof parsed === 'object' && parsed !== null) {
             // Basic validation for the new history structure
            for (const name in parsed) {
                if (Array.isArray(parsed[name])) {
                    parsed[name] = parsed[name].map(record => ({
                        timestamp: record.timestamp || new Date().toISOString(), // Ensure timestamp exists
                        amount: parseFloat(record.amount) || 0,
                        status: record.status || 'Pending'
                    }));
                } else {
                    // Handle conversion from old simple balance to new structure if necessary
                    const oldBalance = parseFloat(parsed[name]);
                    if (!isNaN(oldBalance) && oldBalance > 0) {
                        parsed[name] = [{ 
                            timestamp: new Date().toISOString(), 
                            amount: oldBalance, 
                            status: 'Pending' 
                        }];
                    } else if (name !== 'Josie' && name !== 'Raymart') {
                        // Exclude non-history data from being imported as valid
                        delete parsed[name];
                    }
                }
            }
            return parsed;
        }
    } catch (e) {
        logMessage("Error loading or parsing customer credit history. Loading default.");
    }
    return {};
}

 // --- LOCAL STORAGE FUNCTIONS (The 'Database') ---

function saveDataToLocalStorage() {
    localStorage.setItem('astraInventoryCSV', inventoryToCSV());
    localStorage.setItem('astraCustomerCreditJSON', creditToJSON());
    localStorage.setItem('astraDailySalesJSON', JSON.stringify(dailySales));
    logMessage("Data saved to local storage.");
}

function loadDataFromLocalStorage() {
    const savedInventoryCSV = localStorage.getItem('astraInventoryCSV');
    const savedCustomerCreditJSON = localStorage.getItem('astraCustomerCreditJSON');
    const savedDailySalesJSON = localStorage.getItem('astraDailySalesJSON');

    let loadedDefault = false;

    if (savedInventoryCSV) {
        inventory = csvToInventory(savedInventoryCSV);
    }
    if (savedCustomerCreditJSON) {
        customerCredit = jsonToCredit(savedCustomerCreditJSON);
    }
    if (savedDailySalesJSON) {
        dailySales = JSON.parse(savedDailySalesJSON) || [];
    }

    // Default data if local storage is empty or initial data is needed
    if (Object.keys(inventory).length === 0) {
        inventory = {
            "Sardines": { stock: 50, price: 21.50, unit: 'pc' },
            "Ground Coffee": { stock: 1.5, price: 350.00, unit: 'kg' },
            "Bottled Water": { stock: 24, price: 250.00, unit: 'doz' }
        };
        // Add default credit history for a clean display on first load
        customerCredit = {
            "Josie": [
                { timestamp: new Date(Date.now() - 86400000 * 5).toISOString(), amount: 50.00, status: 'Paid' },
                { timestamp: new Date(Date.now() - 86400000).toISOString(), amount: 100.00, status: 'Pending' }
            ],
            "Raymart": [
                { timestamp: new Date().toISOString(), amount: 75.00, status: 'Pending' }
            ]
        };
        loadedDefault = true;
    }
    
    if (loadedDefault) {
        logMessage("Loaded default sample data and saved as JSON.");
        saveDataToLocalStorage(); 
    } else {
        logMessage("Data loaded from local storage.");
    }
}

// --- CORE ALGORITHMS AND DATA FUNCTIONS (CRUD Operations) ---

function processTransaction(customerName, itemsSold, transactionType) {
    logMessage("--- Starting New Transaction ---");
    let totalCost = 0;
    let validatedCustomerName = customerName || 'Cash Customer';

    // 1. Validate Stock (Read)
    for (const item of itemsSold) {
        const productName = item.name;
        const quantity = item.quantity;
        if (!inventory[productName] || inventory[productName].stock < quantity) {
            alert(`Error: Insufficient stock for ${productName}. Transaction cancelled.`);
            logMessage(`Error: Insufficient stock for ${productName}. Transaction cancelled.`);
            return;
        }
    }

    // 2. Update Inventory (Update)
    for (const item of itemsSold) {
        inventory[item.name].stock -= item.quantity;
        totalCost += inventory[item.name].price * item.quantity;
    }
    logMessage("Inventory updated.");

    // 3. Update Credit (Create New Row/Entry)
    if (transactionType === "Credit") {
        validatedCustomerName = toTitleCase(customerName.trim());
        
        if (!customerCredit.hasOwnProperty(validatedCustomerName)) {
            customerCredit[validatedCustomerName] = [];
            logMessage(`New customer '${validatedCustomerName}' credit record initiated.`);
        }

        // Add a NEW ROW to the history for every utang
        if (totalCost > 0) {
             const creditEntry = {
                timestamp: new Date().toISOString(),
                amount: totalCost,
                status: 'Pending' 
            };
            customerCredit[validatedCustomerName].push(creditEntry);
            logMessage(`Credit for ${validatedCustomerName} recorded (₱${totalCost.toFixed(2)}).`);
        }
    }
    
    // 4. Record Sale (Create)
    const saleRecord = {
        items: itemsSold,
        total: totalCost,
        type: transactionType,
        customer: validatedCustomerName,
        timestamp: new Date().toISOString()
    };
    dailySales.push(saleRecord);

    alert(`SUCCESS: ${transactionType} Transaction Completed!\nCustomer: ${validatedCustomerName}\nTotal Amount: ₱${totalCost.toFixed(2)}`);
    logMessage(`Transaction successful. Total: ₱${totalCost.toFixed(2)}`);
    
    updateDisplays();
    resetSaleFields();
    saveDataToLocalStorage();
}

/**
 * RECORD PAYMENT (improved)
 * - Supports FULL payment across FIFO (oldest first).
 * - Supports PARTIAL payment on a specific transaction (handled outside this function).
 *
 * This function now properly applies the amount to oldest pending transactions,
 * reducing amounts when partial coverage occurs, and marking records 'Paid' when amount <= 0.
 */
function recordPaymentAlgorithm(customerName, amountPaid) {
    logMessage("--- Recording Payment (Full/FIFO) ---");
    
    const validatedCustomerName = customerName;

    if (!customerCredit.hasOwnProperty(validatedCustomerName) || customerCredit[validatedCustomerName].length === 0) {
        alert(`Error: Customer '${validatedCustomerName}' has no existing credit record.`);
        logMessage(`Error: Customer '${validatedCustomerName}' has no existing credit record.`);
        return;
    }

    // Filter and sort by oldest first
    const pendingTransactions = customerCredit[validatedCustomerName]
        .filter(t => t.status === 'Pending')
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (pendingTransactions.length === 0) {
        alert(`Error: Customer '${validatedCustomerName}' has no outstanding balance to pay.`);
        logMessage(`Error: Customer '${validatedCustomerName}' has no outstanding balance to pay.`);
        return;
    }

    let currentBalance = pendingTransactions.reduce((sum, t) => sum + t.amount, 0);

    if (amountPaid > currentBalance) {
        alert(`WARNING: Payment amount (₱${amountPaid.toFixed(2)}) exceeds the current balance (₱${currentBalance.toFixed(2)}) for ${validatedCustomerName}.\n\nPlease input an amount that is exact or less than the total credit.`);
        logMessage(`Warning: Payment amount (₱${amountPaid.toFixed(2)}) is greater than balance (₱${currentBalance.toFixed(2)}). Payment blocked.`);
        return; 
    }

    let remainingPayment = amountPaid;
    let paidRecordsCount = 0;
    let partialApplied = false;

    for (const transaction of pendingTransactions) {
        if (remainingPayment <= 0) break;

        if (remainingPayment >= transaction.amount - 0.000001) {
            // Full pay this transaction
            remainingPayment -= transaction.amount;
            logMessage(`Transaction from ${formatTimestamp(transaction.timestamp)} (₱${transaction.amount.toFixed(2)}) marked as Paid.`);
            transaction.amount = 0;
            transaction.status = 'Paid';
            paidRecordsCount++;
        } else {
            // Partial payment on this transaction => reduce its amount
            transaction.amount = parseFloat((transaction.amount - remainingPayment).toFixed(2));
            logMessage(`Partial payment applied to ${formatTimestamp(transaction.timestamp)}. Remaining amount: ₱${transaction.amount.toFixed(2)}.`);
            remainingPayment = 0;
            partialApplied = true;
            // do not mark as Paid (unless the rounding made it 0)
            if (transaction.amount <= 0.009) {
                transaction.amount = 0;
                transaction.status = 'Paid';
                paidRecordsCount++;
            }
            break;
        }
    }

    // Re-calculate the actual balance after updates
    const newBalance = customerCredit[validatedCustomerName]
        .filter(t => t.status === 'Pending')
        .reduce((sum, t) => sum + t.amount, 0);

    alert(`SUCCESS: Payment Recorded!\nCustomer: ${validatedCustomerName}\nAmount Paid: ₱${amountPaid.toFixed(2)}\nNew Balance: ₱${newBalance.toFixed(2)}`);
    logMessage(`Payment of ₱${amountPaid.toFixed(2)} recorded for ${validatedCustomerName}. New balance is ₱${newBalance.toFixed(2)}.`);

    updateDisplays();
    if (toTitleCase(creditSearchInput.value.trim()) === validatedCustomerName) {
        displayCustomerCreditHistory(validatedCustomerName);
    }
    saveDataToLocalStorage();
}


// --- DELETE and EDIT (CRUD Operations) ---

/**
 * DELETE Operation: Removes a product from the inventory.
 */
function deleteProduct(productName) {
    if (confirm(`Are you sure you want to delete the product: ${productName}?`)) {
        if (inventory.hasOwnProperty(productName)) {
            delete inventory[productName];
            alert(`SUCCESS: Product '${productName}' has been permanently deleted.`);
            logMessage(`Product '${productName}' deleted from inventory.`);
            updateDisplays();
            saveDataToLocalStorage();
        } else {
            logMessage(`Error: Product '${productName}' not found for deletion.`);
        }
    }
}

/**
 * Cancels the edit operation and resets the UI.
 */
function cancelEdit() {
    logMessage("Product edit cancelled. UI reset.");
    editingProduct = null;
    productNameInput.value = '';
    productUnitInput.value = 'pc'; 
    productStockInput.value = '';
    productPriceInput.value = '';
    
    if (addProductButton) {
        addProductButton.textContent = 'Add Product';
    }
    if (cancelEditButton) {
        cancelEditButton.style.display = 'none';
    }
}

/**
 * Fills the product input fields for an EDIT operation and sets the edit mode UI.
 */
function editProduct(productName) {
    if (inventory.hasOwnProperty(productName)) {
        const product = inventory[productName];
        productNameInput.value = productName;
        productStockInput.value = product.stock;
        productPriceInput.value = product.price.toFixed(2);
        productUnitInput.value = product.unit || 'pc'; 

        editingProduct = productName;

        if (addProductButton) {
            addProductButton.textContent = 'SAVE UPDATE';
        }
        if (cancelEditButton) {
            cancelEditButton.style.display = 'inline-block';
        }

        logMessage(`Editing product: ${productName}. Click 'SAVE UPDATE' to save changes or 'CANCEL' to discard.`);
        productNameInput.focus();
    } else {
        logMessage(`Error: Product '${productName}' not found for editing.`);
    }
}

function addProduct() {
    let name = productNameInput.value.trim();
    const unit = productUnitInput.value; 
    const stock = parseFloat(productStockInput.value); 
    const price = parseFloat(productPriceInput.value);

    if (!name || !unit || isNaN(stock) || stock < 0 || isNaN(price) || price < 0) {
        alert("Please complete product details including Unit, Stock, and Price with valid numbers (Stock/Price >= 0).");
        logMessage("Error: Please complete product details with valid numbers.");
        return;
    }
    
    name = toTitleCase(name);
    
    const isEditing = editingProduct !== null;
    const oldProductName = editingProduct;
    let messageType = 'Added';

    if (!isEditing) {
        if (inventory.hasOwnProperty(name)) {
            alert(`ERROR: Product '${name}' already exists! To change the stock, price, or spelling, please use the 'Edit' button in the 'Product Inventory' table below. Direct adding an existing product is blocked.`);
            logMessage(`Error: Direct add of existing product '${name}' blocked. Use Edit feature.`);
            return;
        }
        
        const lowerName = name.toLowerCase();
        const existingKeys = Object.keys(inventory);

        const isAlmostDuplicate = existingKeys.some(key => {
            const lowerKey = key.toLowerCase();
            if (lowerName + 's' === lowerKey || lowerKey + 's' === lowerName) return true;
            if (Math.abs(lowerName.length - lowerKey.length) <= 2 && lowerName.substring(0, lowerName.length-1) === lowerKey.substring(0, lowerKey.length-1)) return true;
            return false;
        });

        if (isAlmostDuplicate) {
            alert(`WARNING: The product name '${name}' is very similar to an existing product in the inventory. Please check the spelling and use the 'Edit' button to update the existing product if you only meant to change the stock or price. Direct adding is blocked.`);
            logMessage(`Warning: Product name '${name}' is similar to an existing product. Direct add blocked.`);
            return;
        }
        logMessage(`Product '${name}' is new. Adding to inventory. (CREATE)`);
        
    } else {
        if (name !== oldProductName && inventory.hasOwnProperty(name)) {
             alert(`ERROR: Cannot rename product to '${name}' because a product with that exact name already exists in the inventory. Please choose a unique name.`);
             logMessage(`Error: Cannot rename product to '${name}' as it already exists.`);
             return;
        }

        logMessage(`Product '${oldProductName}' is being updated/renamed to '${name}'. (UPDATE)`);
        messageType = 'Updated';
        
        if (name !== oldProductName) {
            delete inventory[oldProductName];
            logMessage(`Old product name '${oldProductName}' deleted.`);
        }
    }

    inventory[name] = { stock, price, unit };
    
    alert(`SUCCESS: Product ${messageType}!\nProduct Name: ${name}\nNew Stock: ${stock} ${unit}\nNew Price: ₱${price.toFixed(2)}`);
    logMessage(`Product '${name}' has been added/updated.`);
    
    if (isEditing) {
        cancelEdit();
    } else {
        productNameInput.value = '';
        productUnitInput.value = 'pc'; 
        productStockInput.value = '';
        productPriceInput.value = '';
    }
    
    updateDisplays();
    saveDataToLocalStorage();
}

/**
 * Handles the file upload for product list, updating the inventory.
 */
function uploadProductsFromFile() {
    const file = uploadProductListInput.files[0];
    if (!file) {
        alert("Please select a file to upload.");
        logMessage("Error: No file selected for upload.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const lines = event.target.result.split('\n');
        let successCount = 0;
        let errorCount = 0;
        
        let startIndex = lines[0].toLowerCase().includes('productname,') ? 1 : 0; 

        for (let i = startIndex; i < lines.length; i++) {
            const trimmedLine = lines[i].trim();
            if (trimmedLine) {
                const parts = trimmedLine.split(',');
                
                let name, unit, stock, price;
                
                if (parts.length === 4) {
                    name = toTitleCase(parts[0].trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
                    unit = parts[1].trim();
                    stock = parseFloat(parts[2].trim());
                    price = parseFloat(parts[3].trim());
                } else if (parts.length === 3) {
                    name = toTitleCase(parts[0].trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
                    unit = 'pc';
                    stock = parseFloat(parts[1].trim());
                    price = parseFloat(parts[2].trim());
                } else {
                    logMessage(`Error processing line: "${trimmedLine}" - Invalid number of fields.`);
                    errorCount++;
                    continue;
                }

                if (name && unit && !isNaN(stock) && stock >= 0 && !isNaN(price) && price >= 0) {
                    inventory[name] = { stock, price, unit };
                    successCount++;
                } else {
                    logMessage(`Error processing line: "${trimmedLine}" - Invalid value.`);
                    errorCount++;
                }
            }
        }

        alert(`SUCCESS: File upload complete!\n${successCount} product(s) added/updated.\n${errorCount} line(s) skipped due to errors.`);
        logMessage(`File upload complete. ${successCount} product(s) added/updated. ${errorCount} line(s) skipped due to errors.`);
        
        uploadProductListInput.value = ''; 
        
        updateDisplays();
        saveDataToLocalStorage();
    };
    reader.onerror = () => {
        alert("Error reading file.");
        logMessage("Error reading file.");
    };
    reader.readAsText(file);
}

// --- UI HELPER AND EVENT HANDLER FUNCTIONS ---

function addItemToSale() {
    let itemName = productSearchInput.value.trim();
    const itemQuantity = parseFloat(productQuantityInput.value); 
    
    if (!itemName || isNaN(itemQuantity) || itemQuantity <= 0) {
        alert("Error: Please enter a valid product and quantity (> 0).");
        logMessage("Error: Please enter a valid product and quantity.");
        return;
    }

    itemName = toTitleCase(itemName);

    if (!inventory.hasOwnProperty(itemName)) {
        alert(`Error: Product '${itemName}' not found in inventory.`);
        logMessage(`Error: Product '${itemName}' not found in inventory.`);
        return;
    }
    
    const currentOrderQuantity = currentSaleItems
        .filter(item => item.name === itemName)
        .reduce((sum, item) => sum + item.quantity, 0);
    
    const productUnit = inventory[itemName].unit || 'pc';

    if (inventory[itemName].stock < (currentOrderQuantity + itemQuantity)) {
        alert(`Error: Adding ${itemQuantity} ${productUnit} will exceed the current stock of ${inventory[itemName].stock} ${productUnit} for ${itemName}.`);
        logMessage(`Error: Stock check failed for ${itemName}.`);
        return;
    }

    currentSaleItems.push({ name: itemName, quantity: itemQuantity });
    updateOrderSummary();
    productSearchInput.value = '';
    productQuantityInput.value = '';
    productDropdown.style.display = 'none';
    
    logMessage(`Item '${itemName}' (${itemQuantity} ${productUnit}) added to current sale.`);
}

function updateOrderSummary() {
    const tbody = orderSummaryTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    let subtotal = 0;
    
    currentSaleItems.forEach((item, index) => {
        const product = inventory[item.name];
        const itemPrice = product ? product.price : 0; 
        const itemUnit = product ? product.unit : ''; 
        const itemTotal = itemPrice * item.quantity;
        subtotal += itemTotal;
        
        const row = tbody.insertRow(-1);
        const cell1 = row.insertCell(0);
        const cell2 = row.insertCell(1);
        const cell3 = row.insertCell(2);
        const cell4 = row.insertCell(3);
        
        cell1.textContent = index + 1;
        cell2.textContent = item.name;
        cell3.textContent = `${item.quantity} ${itemUnit}`; 
        cell4.textContent = `₱${itemTotal.toFixed(2)}`;
    });
    
    subtotalSpan.textContent = `₱${subtotal.toFixed(2)}`;
    calculateChange();
}

function calculateChange() {
    const subtotalText = subtotalSpan.textContent.replace('₱', '').trim();
    const subtotal = parseFloat(subtotalText) || 0;
    const cashReceived = parseFloat(cashReceivedInput.value) || 0;
    
    if (cashReceived >= 0) {
        const change = cashReceived - subtotal;
        changeSpan.textContent = `₱${change.toFixed(2)}`;
    } else {
        changeSpan.textContent = `₱0.00`;
    }
}

function resetSaleFields() {
    currentSaleItems = [];
    const tbody = orderSummaryTable.querySelector('tbody');
    tbody.innerHTML = '';
    subtotalSpan.textContent = '₱0.00';
    changeSpan.textContent = '₱0.00';
    cashReceivedInput.value = '';
    customerNameInput.value = '';
}

function processSale(transactionType) {
    if (currentSaleItems.length === 0) {
        alert("Please add items to the sale.");
        logMessage("Error: No items in the current sale.");
        return;
    }

    const customerName = customerNameInput.value.trim();
    const subtotal = parseFloat(subtotalSpan.textContent.replace('₱', ''));

    if (transactionType === 'Credit') {
        if (customerName === '') {
            alert("Error: Customer Name is **REQUIRED** for a Credit (Utang) transaction.");
            logMessage("Error: Customer name is required for a credit transaction.");
            return;
        }
    } else if (transactionType === 'Cash') {
        const cashReceived = parseFloat(cashReceivedInput.value);
        if (isNaN(cashReceived) || cashReceived < subtotal) {
              alert(`Error: Cash received (₱${(cashReceived || 0).toFixed(2)}) is less than the subtotal (₱${subtotal.toFixed(2)}) for a cash sale.`);
            logMessage("Error: Insufficient cash received for cash sale.");
            return;
        }
    }

    processTransaction(customerName, currentSaleItems, transactionType);
}

/**
 * recordPayment() used by the button.
 * - If a specific pendingTransactionId is selected => partial payment on that transaction.
 * - If no transaction selected => use FIFO full/partial behavior handled in recordPaymentAlgorithm().
 */
function recordPayment() {
    const customerName = paymentCustomerDropdown.value;
    const transactionIndexStr = pendingTransactionDropdown ? pendingTransactionDropdown.value : '';
    const amountPaid = parseFloat(document.getElementById('amountPaid').value);
    
    if (!customerName) {
        alert("Error: Please select a customer.");
        logMessage("Error: Please select a customer.");
        return;
    }
    if (isNaN(amountPaid) || amountPaid <= 0) {
        alert("Error: Please enter a valid payment amount (> 0).");
        logMessage("Error: Please enter a valid payment amount.");
        return;
    }

    // If a specific transaction is chosen -> PARTIAL on that row
    if (transactionIndexStr !== '' && pendingTransactionDropdown) {
        const pendingIndex = parseInt(transactionIndexStr, 10);
        const pendingTransactions = customerCredit[customerName]
            .filter(t => t.status === 'Pending')
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const transaction = pendingTransactions[pendingIndex];
        if (!transaction) {
            alert("Error: Selected transaction not found.");
            logMessage("Error: Selected transaction not found for partial payment.");
            return;
        }

        if (amountPaid > transaction.amount + 0.000001) {
            alert(`Payment cannot exceed selected transaction amount (₱${transaction.amount.toFixed(2)}). For paying more across multiple transactions, leave the Specific Transaction empty and pay full/FIFO.`);
            logMessage("Error: Attempt to overpay a single transaction via partial-payment UI.");
            return;
        }

        // Apply partial payment to this transaction
        transaction.amount = parseFloat((transaction.amount - amountPaid).toFixed(2));
        if (transaction.amount <= 0.009) {
            transaction.amount = 0;
            transaction.status = 'Paid';
        }

        const newBalance = customerCredit[customerName]
            .filter(t => t.status === 'Pending')
            .reduce((sum, t) => sum + t.amount, 0);

        alert(`SUCCESS: Partial Payment Recorded!\nCustomer: ${customerName}\nPaid: ₱${amountPaid.toFixed(2)}\nRemaining for transaction: ₱${transaction.amount.toFixed(2)}\nNew Balance: ₱${newBalance.toFixed(2)}`);
        logMessage(`Partial payment of ₱${amountPaid.toFixed(2)} applied to ${customerName}. Transaction remaining: ₱${transaction.amount.toFixed(2)}.`);

        updateDisplays();
        displayCustomerCreditHistory(customerName);
        saveDataToLocalStorage();

        // Reset selection and input
        if (pendingTransactionDropdown) pendingTransactionDropdown.value = '';
        document.getElementById('amountPaid').value = '';
        return;
    }

    // Otherwise: FULL/FIFO payment across pending transactions (recordPaymentAlgorithm will handle partial reductions as needed)
    recordPaymentAlgorithm(customerName, amountPaid);
    document.getElementById('amountPaid').value = '';
}

function logMessage(message) {
    outputLog.textContent = `[${new Date().toLocaleTimeString()}] ${message}\n` + outputLog.textContent;
}


function updateDisplays() {
    const escapeSingleQuotes = (str) => str.replace(/'/g, "\\'");

    // 1. Inventory Display (Read)
    let inventoryTable = '<table border="1" cellpadding="5" cellspacing="0" width="100%"><thead><tr><th>#</th><th>Product</th><th>Unit</th><th>Stock</th><th>Price</th><th colspan="2">Action</th></tr></thead><tbody>';
    let i = 1;
    for (const key in inventory) {
        const escapedKey = escapeSingleQuotes(key);
        inventoryTable += `<tr>
            <td>${i++}</td>
            <td>${key}</td>
            <td>${inventory[key].unit}</td>
            <td>${inventory[key].stock}</td>
            <td>₱${inventory[key].price.toFixed(2)}</td>
            <td><button onclick="editProduct('${escapedKey}')">Edit</button></td>
            <td><button onclick="deleteProduct('${escapedKey}')">Delete</button></td>
        </tr>`;
    }
    inventoryTable += '</tbody></table>';
    inventoryDisplay.innerHTML = inventoryTable;

    // 2. Payment Dropdown Update (Based on Pending Balance)
    if (paymentCustomerDropdown) {
        paymentCustomerDropdown.innerHTML = '<option value="">--Select Customer--</option>';
    }
    let totalCreditBalance = {};
    let hasCreditCustomers = false;

    for (const name in customerCredit) {
        // Calculate the total pending balance for this customer
        const pendingBalance = customerCredit[name]
            .filter(t => t.status === 'Pending')
            .reduce((sum, t) => sum + t.amount, 0);

        totalCreditBalance[name] = pendingBalance;

        if (pendingBalance > 0 && paymentCustomerDropdown) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `${name} (₱${pendingBalance.toFixed(2)})`;
            paymentCustomerDropdown.appendChild(option);
            hasCreditCustomers = true;
        }
    }
    
    // 3. Daily Sales table (Read)
    let salesTable = '<table border="1" cellpadding="5" cellspacing="0" width="100%"><thead><tr><th>#</th><th>Time</th><th>Customer</th><th>Type</th><th>Total</th></tr></thead><tbody>';
    
    // Sort transactions by timestamp (newest first)
    const sortedSales = [...dailySales].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const totalSalesCount = sortedSales.length;

    sortedSales.forEach((sale, index) => {
        const displayIndex = index + 1; 
        
        salesTable += `<tr>
            <td>${displayIndex}</td>
            <td>${new Date(sale.timestamp).toLocaleTimeString()}</td>
            <td>${sale.customer}</td>
            <td>${sale.type}</td>
            <td>₱${sale.total.toFixed(2)}</td>
        </tr>`;
    });
    salesTable += '</tbody></table>';
    salesDisplay.innerHTML = salesTable;

    // 4. Update Credit History Display (NEW DEFAULT LOGIC)
    const currentSearchTerm = creditSearchInput.value.trim();
    if (currentSearchTerm) {
        const validatedName = toTitleCase(currentSearchTerm);
        displayCustomerCreditHistory(validatedName);
    } else {
        // Display ALL customer history by default when search is empty
        displayCustomerCreditHistory(''); 
    }
}

// --- CREDIT HISTORY FUNCTIONS ---

/**
 * Displays credit history based on the customer name or displays all if name is empty.
 * @param {string} customerName - The customer name to search, or empty string to display all.
 */
function displayCustomerCreditHistory(customerName) {
    const searchMode = customerName.trim() !== '';
    const validatedName = toTitleCase(customerName.trim());
    
    let customersToDisplay = [];
    let grandTotalBalance = 0;

    if (searchMode) {
        if (customerCredit.hasOwnProperty(validatedName)) {
            customersToDisplay.push(validatedName);
        } else {
            // Customer not found
            creditHistoryDisplay.innerHTML = `<p>No credit history found for: <strong>${validatedName}</strong>.</p>`;
            creditTotalDisplay.textContent = `₱0.00`;
            return;
        }
    } else {
        // Default mode: Display all customers with history
        customersToDisplay = Object.keys(customerCredit).sort();
    }

    let historyHTML = '';
    
    customersToDisplay.forEach(name => {
        const transactions = customerCredit[name] || [];
        // Sort transactions by timestamp (newest first for display)
        const sortedTransactions = transactions.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        if (sortedTransactions.length === 0) return; // Skip customers with empty history array

        let customerBalance = 0;
        
        // Start history block for the current customer
        historyHTML += `<h3 style="margin-top: 10px; margin-bottom: 5px;">${name}</h3>`;
        historyHTML += `
            <table border="1" cellpadding="5" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 10px;">
                <thead>
                    <tr>
                        <th style="width: 5%;">#</th>
                        <th style="width: 35%;">Date Utang</th>
                        <th style="width: 25%;">Amount</th>
                        <th style="width: 35%;">Status</th>
                    </tr>
                </thead>
                <tbody>`;
        
        const totalTransactionsCount = sortedTransactions.length;

        sortedTransactions.forEach((t, index) => {
            const displayIndex = index + 1; 

            const statusStyle = t.status === 'Paid' ? 'font-weight: normal; color: green;' : 'font-weight: bold; color: black;';
            
            if (t.status === 'Pending') {
                customerBalance += t.amount;
            }

            historyHTML += `<tr>
                <td>${displayIndex}</td>
                <td>${formatTimestamp(t.timestamp)}</td>
                <td>₱${t.amount.toFixed(2)}</td>
                <td style="${statusStyle}">${t.status}</td>
            </tr>`;
        });

        // Add customer total row
        historyHTML += `
            <tr>
                <td colspan="3" style="text-align: right; font-weight: bold;">TOTAL PENDING BALANCE:</td>
                <td style="font-weight: bold;">₱${customerBalance.toFixed(2)}</td>
            </tr>
            </tbody></table>`;

        grandTotalBalance += customerBalance;
    });

    if (customersToDisplay.length === 0 && !searchMode) {
         creditHistoryDisplay.innerHTML = `<p>No credit history recorded yet.</p>`;
    } else {
        creditHistoryDisplay.innerHTML = historyHTML;
    }
    
    // Display the overall total at the bottom
    creditTotalDisplay.textContent = `₱${grandTotalBalance.toFixed(2)}`;

    // Scroll to the top of the history list
    creditHistoryDisplay.scrollTop = 0;
}

// Attach the search function to the input
if (creditSearchInput) {
    creditSearchInput.addEventListener('input', (event) => {
        const searchTerm = event.target.value.trim();
        displayCustomerCreditHistory(searchTerm);
    });
}

// Wrapper to match index.html's oninput handler name (if present)
function displayCreditHistory() {
    const searchTerm = creditSearchInput ? creditSearchInput.value.trim() : '';
    displayCustomerCreditHistory(searchTerm);
}

// --- PRODUCT SEARCH UI ---

function showProductDropdown() {
    const searchTerm = productSearchInput.value.toLowerCase();
    const productKeys = Object.keys(inventory);
    
    productDropdown.innerHTML = '';
    
    if (searchTerm.length > 0) {
        const matchingProducts = productKeys.filter(product => product.toLowerCase().includes(searchTerm));
        
        if (matchingProducts.length > 0) {
            matchingProducts.forEach(product => {
                const li = document.createElement('li');
                li.textContent = `${product} (Stock: ${inventory[product].stock} ${inventory[product].unit})`;
                li.style.padding = '5px';
                li.style.cursor = 'pointer';
                li.onmouseover = function() { this.style.backgroundColor = '#f0f0f0'; };
                li.onmouseout = function() { this.style.backgroundColor = 'white'; };
                li.onclick = function() {
                    productSearchInput.value = product;
                    productDropdown.style.display = 'none';
                    productQuantityInput.focus();
                };
                productDropdown.appendChild(li);
            });
            productDropdown.style.display = 'block';
        } else {
            productDropdown.style.display = 'none';
        }
    } else {
        productDropdown.style.display = 'none';
    }
}

document.addEventListener('click', (event) => {
    if (!productSearchInput.contains(event.target) && !productDropdown.contains(event.target)) {
        productDropdown.style.display = 'none';
    }
});

// *******************************************************************
// *** PAYMENT UI HELPERS (populate per-transaction dropdown) ***
// *******************************************************************

/**
 * Populate pendingTransactionDropdown with pending transactions for the selected customer.
 * Option value is the index (0-based) into the pendingTransactions array (oldest-first).
 */
function populatePendingTransactions() {
    if (!paymentCustomerDropdown || !pendingTransactionDropdown) return;

    const customerName = paymentCustomerDropdown.value;
    pendingTransactionDropdown.innerHTML = '<option value="">--Select Transaction for PARTIAL PAYMENT--</option>';

    if (!customerName || !customerCredit[customerName]) return;

    const pendingTransactions = customerCredit[customerName]
        .filter(t => t.status === 'Pending')
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    pendingTransactions.forEach((t, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.textContent = `${formatTimestamp(t.timestamp)} - ₱${t.amount.toFixed(2)}`;
        pendingTransactionDropdown.appendChild(option);
    });

    // Also update the amount placeholder if one transaction exists
    updateAmountPaidPlaceholder();
}

/**
 * Update the amountPaid input placeholder to show max for selected transaction (if any).
 */
function updateAmountPaidPlaceholder() {
    const amountInput = document.getElementById('amountPaid');
    if (!paymentCustomerDropdown || !pendingTransactionDropdown || !amountInput) return;

    const customerName = paymentCustomerDropdown.value;
    const transactionIndex = pendingTransactionDropdown.value;

    if (!customerName || transactionIndex === '') {
        amountInput.placeholder = 'Enter amount paid';
        return;
    }

    const pendingTransactions = customerCredit[customerName]
        .filter(t => t.status === 'Pending')
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const transaction = pendingTransactions[parseInt(transactionIndex, 10)];
    if (!transaction) {
        amountInput.placeholder = 'Enter amount paid';
    } else {
        amountInput.placeholder = `Max: ₱${transaction.amount.toFixed(2)}`;
    }
}

// *******************************************************************
// *** NEW: EXPORT FUNCTIONS ***
// *******************************************************************

/**
 * Helper function to trigger a file download.
 * @param {string} filename - The name of the file to download (e.g., 'data.txt').
 * @param {string} text - The content of the file.
 */
function downloadTextFile(filename, text) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}


/**
 * Main function to export data based on type.
 * @param {string} dataType - 'inventory', 'credit', or 'log'.
 */
function exportDataAsTxt(dataType) {
    let content = '';
    let filename = '';

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    switch (dataType) {
        case 'inventory':
            content = inventoryToCSV(); // Re-use CSV function
            filename = `ASTRA_Inventory_${timestamp}.txt`; // <-- changed to .txt as requested
            break;
        case 'credit':
            // Generate a readable text report for credit history
            content = generateCreditReport();
            filename = `ASTRA_Credit_History_${timestamp}.txt`;
            break;
        case 'log':
            content = outputLog.textContent;
            filename = `ASTRA_System_Log_${timestamp}.txt`;
            break;
        default:
            logMessage(`Error: Invalid export data type: ${dataType}`);
            alert(`Error: Invalid export type.`);
            return;
    }
    
    if (content.trim().length === 0) {
        alert(`WARNING: The ${dataType} data is currently empty. Nothing to export.`);
        logMessage(`Warning: Export skipped. ${dataType} data is empty.`);
        return;
    }

    downloadTextFile(filename, content);
    
    // Success prompt
    alert(`SUCCESS! Exported '${filename}' to your downloads folder.`);
    logMessage(`Successfully exported ${dataType} to ${filename}.`);
}

/**
 * Generates a human-readable text report for the credit history.
 */
function generateCreditReport() {
    let report = `ASTRA Customer Credit History Report\nGenerated on: ${formatTimestamp(new Date().toISOString())}\n\n`;
    let grandTotal = 0;

    const customerNames = Object.keys(customerCredit).sort();

    if (customerNames.length === 0) {
        return report + "No credit history records found.\n";
    }

    customerNames.forEach(name => {
        const transactions = customerCredit[name] || [];
        const sortedTransactions = transactions.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        if (sortedTransactions.length === 0) return;

        let customerBalance = 0;
        let pendingCount = 0;
        let paidCount = 0;

        report += `========================================\n`;
        report += `Customer: ${name}\n`;
        report += `========================================\n`;
        
        sortedTransactions.forEach((t, index) => {
            const status = t.status.padEnd(8);
            const dateStr = formatTimestamp(t.timestamp).padEnd(40);
            
            report += `${(index + 1).toString().padStart(3, ' ')}. ${dateStr} | ₱${t.amount.toFixed(2).padStart(10, ' ')} | Status: ${status}\n`;
            
            if (t.status === 'Pending') {
                customerBalance += t.amount;
                pendingCount++;
            } else {
                paidCount++;
            }
        });

        report += `----------------------------------------\n`;
        report += `   Summary:\n`;
        report += `   Total Records: ${transactions.length}\n`;
        report += `   Paid Records: ${paidCount}\n`;
        report += `   Pending Records: ${pendingCount}\n`;
        report += `   TOTAL PENDING BALANCE: ₱${customerBalance.toFixed(2)}\n\n`;
        
        grandTotal += customerBalance;
    });

    report += `\n########################################\n`;
    report += `GRAND TOTAL OUTSTANDING CREDIT: ₱${grandTotal.toFixed(2)}\n`;
    report += `########################################\n`;

    return report;
}

// *******************************************************************

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadDataFromLocalStorage();
    updateDisplays();
    if (cancelEditButton) {
        cancelEditButton.style.display = 'none';
    }

    // Ensure payment dropdown population triggers prepared function
    if (paymentCustomerDropdown) paymentCustomerDropdown.addEventListener('change', populatePendingTransactions);
    if (pendingTransactionDropdown) pendingTransactionDropdown.addEventListener('change', updateAmountPaidPlaceholder);
});
