// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBDXRiy1OX2Hk0n0G2R5UTQQM01CG37K_E",
    authDomain: "mock-stock-c6403.firebaseapp.com",
    databaseURL: "https://mock-stock-c6403-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "mock-stock-c6403",
    storageBucket: "mock-stock-c6403.firebasestorage.appspot.com",
    messagingSenderId: "213120811504",
    appId: "1:213120811504:web:8fc8443a4af5f3dbe39d35",
    measurementId: "G-BF6ZKFL1MJ"
};

try {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Firebase initialization error:", error);
}
const database = firebase.database();
const dbRef = firebase.database().ref('.info/connected');
dbRef.on('value', (snap) => {
    console.log('Firebase connection:', snap.val() ? "Connected" : "Disconnected");
});

// Generate or retrieve a unique user/computer ID
function getOrCreateUserId() {
    let userId = localStorage.getItem('btb_userId');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('btb_userId', userId);
    }
    return userId;
}

const currentUserId = getOrCreateUserId();

// Airtable Configuration
const AIRTABLE_API_KEY = 'patw5S6fdFTgeqbRJ.1800aa371612e0f70bff66fec491e03a1c7e86183cb73fe0a319c926afb72290';
const AIRTABLE_BASE_ID = 'appJBjancs1MLK3vJ';
const AIRTABLE_TABLE_NAME = 'Stock Prices';

// Application State
let initialBudget = 1000000;
let remainingBudget = initialBudget;
let stocksList = [];
let pricesMap = {};
let positions = {};
let orders = [];
let teams = new Set();
let currentSelectedStock = '';
let nifty10Index = 10000;
let previousPrices = {};
let isManualPriceChange = false;
let currentTeam = '';

// Bids State
let bids = {
    offered: [],
    received: []
};

// DOM Elements
const budgetTracker = document.getElementById('budget-tracker');
const stockSelect = document.getElementById('stock-select');
const stockPrice = document.getElementById('stock-price');
const quantityInput = document.getElementById('quantity');
const totalPriceInput = document.getElementById('total-price');
const teamNumberSelect = document.getElementById('team-number');
const orderTypeSelect = document.getElementById('order-type');
const tradeForm = document.getElementById('trade-form');
const privateOrderDialog = document.getElementById('private-order-dialog');
const privateOrderForm = document.getElementById('private-order-form');
const bidTeamSelect = document.getElementById('bid-team');
const privateStockSelect = document.getElementById('private-stock');
const privatePriceInput = document.getElementById('private-price');
const privateQuantityInput = document.getElementById('private-quantity');
const privateTotalInput = document.getElementById('private-total');
const closePrivateOrderBtn = document.getElementById('close-private-order');
const stockTicker = document.querySelector('.stock-ticker');
const niftyTicker = document.querySelector('.nifty-ticker');

// Chart Instances
let holdingsChart, pnlChart;

// Utility Functions
function formatCurrency(num) {
    return "₹" + num.toLocaleString('en-IN', {minimumFractionDigits: 2});
}

function getPLClass(value) {
    return value >= 0 ? 'positive' : 'negative';
}

function getPieColors(n) {
    const baseColors = [
        '#E53935', '#F4511E', '#FB8C00', '#FFB300', 
        '#7CB342', '#00897B', '#039BE5', '#5E35B1',
        '#8E24AA', '#00ACC1', '#43A047', '#D81B60',
        '#3949AB', '#C0CA33', '#FDD835', '#FF7043'
    ];
    const colors = [];
    for (let i = 0; i < n; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
}

function getBarColors(n) {
    return getPieColors(n);
}

// Notification System
function showNotification(title, message) {
    const notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) return;
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    
    notification.innerHTML = `
        <i class="fas fa-bell"></i>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
    `;
    
    notificationContainer.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 6000);
}

// Budget Functions
function updateBudget() {
    if (!budgetTracker) return;
    
    const budgetElement = budgetTracker.querySelector('span');
    if (budgetElement) {
        budgetElement.textContent = formatCurrency(remainingBudget);
    }
}

// Ticker Functions
function updateStockTicker() {
    if (!stockTicker) return;

    let tickerHTML = '';
    stocksList.forEach(stock => {
        const price = pricesMap[stock] || 0;
        const prevPrice = previousPrices[stock] || price;
        const change = price - prevPrice;
        const changePercent = prevPrice ? ((change / prevPrice) * 100) : 0;
        
        tickerHTML += `
            <div class="ticker-item">
                <span class="ticker-symbol">${stock}</span>
                <span class="ticker-price">${formatCurrency(price)}</span>
                <span class="ticker-change ${change >= 0 ? 'positive' : 'negative'}">
                    ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)
                </span>
            </div>
        `;
        previousPrices[stock] = price;
    });
    stockTicker.innerHTML = tickerHTML;
}

function updateNifty10Index() {
    if (!niftyTicker || stocksList.length === 0) return;
    
    let totalPrices = 0;
    let validStocks = 0;
    
    stocksList.forEach(stock => {
        const price = pricesMap[stock];
        if (price && !isNaN(price)) {
            totalPrices += price;
            validStocks++;
        }
    });
    
    if (validStocks === 0) return;
    
    const avgPrice = totalPrices / validStocks;
    const prevNifty = nifty10Index;
    nifty10Index = 10000 * (avgPrice / 100);
    const change = nifty10Index - prevNifty;
    
    niftyTicker.innerHTML = `
        <span class="nifty-value">${nifty10Index.toFixed(2)}</span>
        <span class="nifty-change ${change >= 0 ? 'positive' : 'negative'}">
            ${change >= 0 ? '+' : ''}${change.toFixed(2)}
        </span>
    `;
}

// Data Fetching
async function fetchStocksFromAirtable() {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?fields%5B%5D=Stock&fields%5B%5D=Price`;
    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });
        const data = await response.json();
        
        stocksList = [];
        pricesMap = {};
        data.records.forEach(record => {
            const stock = record.fields.Stock;
            const price = parseFloat(record.fields.Price);
            stocksList.push(stock);
            pricesMap[stock] = price;
        });
        
        return { success: true, stocksList, pricesMap };
    } catch (error) {
        console.error("Error fetching stock data:", error);
        showNotification("Error", "Failed to fetch stock data");
        return { success: false, error: error.message };
    }
}

// Firebase Functions
function saveOrderToFirebase(order) {
    try {
        const ordersRef = database.ref('orders');
        const newOrderRef = ordersRef.push();
        newOrderRef.set({
            userId: currentUserId,
            team: order.team,
            stock: order.stock,
            price: order.price,
            qty: order.qty,
            total: order.total,
            status: order.status,
            time: order.time,
            type: order.type,
            computerId: currentUserId,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (error) {
        console.error("Error saving to Firebase:", error);
        showNotification("Error", "Failed to save order to database");
    }
}

function saveBidToFirebase(bid) {
    try {
        const bidsRef = database.ref('bids');
        const newBidRef = bidsRef.push();
        newBidRef.set({
            ...bid,
            senderId: currentUserId,
            senderTeam: currentTeam,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            status: "Pending"
        });
    } catch (error) {
        console.error("Error saving bid to Firebase:", error);
        showNotification("Error", "Failed to save bid to database");
    }
}

function updateBidStatusInFirebase(bidId, status) {
    try {
        const bidRef = database.ref(`bids/${bidId}`);
        bidRef.update({
            status: status,
            responderId: currentUserId,
            responderTeam: currentTeam,
            responseTime: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (error) {
        console.error("Error updating bid status:", error);
        showNotification("Error", "Failed to update bid status");
    }
}

function loadOrdersFromFirebase() {
    try {
        const ordersRef = database.ref('orders');
        ordersRef.on('value', (snapshot) => {
            orders = [];
            snapshot.forEach((childSnapshot) => {
                const order = childSnapshot.val();
                orders.push(order);
            });
            renderOrdersTable();
            renderPositionsTable();
            renderCharts();
        });
    } catch (error) {
        console.error("Error loading from Firebase:", error);
        showNotification("Error", "Failed to load orders from database");
    }
}

function listenForBids() {
    try {
        // Listen for bids sent to our team
        const bidsRef = database.ref('bids');
        bidsRef.orderByChild('receiverTeam').equalTo(currentTeam).on('value', (snapshot) => {
            bids.received = [];
            snapshot.forEach((childSnapshot) => {
                const bid = childSnapshot.val();
                if (bid.status === "Pending") {
                    bids.received.push({
                        ...bid,
                        id: childSnapshot.key
                    });
                }
            });
            renderReceivedBidsTable();
        });

        // Listen for bids we've sent
        bidsRef.orderByChild('senderTeam').equalTo(currentTeam).on('value', (snapshot) => {
            bids.offered = [];
            snapshot.forEach((childSnapshot) => {
                const bid = childSnapshot.val();
                bids.offered.push({
                    ...bid,
                    id: childSnapshot.key
                });
            });
            renderOfferedBidsTable();
        });

        // Listen for bid responses
        bidsRef.orderByChild('senderId').equalTo(currentUserId).on('child_changed', (snapshot) => {
            const bid = snapshot.val();
            if (bid.status === "Accepted" || bid.status === "Declined") {
                showNotification("Bid Update", `Your bid to ${bid.receiverTeam} for ${bid.stock} has been ${bid.status.toLowerCase()}`);
                
                // Update the bid in our offered bids list
                const bidIndex = bids.offered.findIndex(b => b.id === snapshot.key);
                if (bidIndex !== -1) {
                    bids.offered[bidIndex].status = bid.status;
                    renderOfferedBidsTable();
                }

                // If accepted, process the transaction
                if (bid.status === "Accepted") {
                    processAcceptedBid(bid);
                }
            }
        });
    } catch (error) {
        console.error("Error setting up bid listeners:", error);
        showNotification("Error", "Failed to set up bid notifications");
    }
}

function processAcceptedBid(bid) {
    if (!bid) return;

    // Create an order object from the bid
    const order = {
        userId: bid.senderId,
        team: bid.senderTeam,
        stock: bid.stock,
        price: bid.price,
        qty: bid.quantity,
        total: bid.total,
        status: bid.action,
        time: new Date().toLocaleString(),
        type: "Private"
    };

    // Save the order to Firebase
    saveOrderToFirebase(order);

    // Update budgets and positions for both teams
    if (bid.action === "Buy") {
        // For the buyer (sender)
        updateBuyerBudgetAndPositions(bid);
        
        // For the seller (receiver)
        updateSellerBudgetAndPositions(bid);
    } else if (bid.action === "Sell") {
        // For the seller (sender)
        updateSellerBudgetAndPositions(bid);
        
        // For the buyer (receiver)
        updateBuyerBudgetAndPositions(bid);
    }
}

function updateBuyerBudgetAndPositions(bid) {
    // Deduct money from buyer's budget
    const buyerBudgetRef = database.ref(`budgets/${bid.senderTeam}`);
    buyerBudgetRef.transaction((currentBudget) => {
        return (currentBudget || initialBudget) - bid.total;
    });

    // Add to buyer's positions
    const buyerPositionsRef = database.ref(`positions/${bid.senderTeam}/${bid.stock}`);
    buyerPositionsRef.transaction((currentPosition) => {
        if (!currentPosition) {
            currentPosition = { qty: 0, buyLots: [], realizedPL: 0 };
        }
        
        currentPosition.qty += bid.quantity;
        currentPosition.buyLots.push({ qty: bid.quantity, price: bid.price });
        return currentPosition;
    });
}

function updateSellerBudgetAndPositions(bid) {
    // Add money to seller's budget
    const sellerBudgetRef = database.ref(`budgets/${bid.receiverTeam}`);
    sellerBudgetRef.transaction((currentBudget) => {
        return (currentBudget || initialBudget) + bid.total;
    });

    // Remove from seller's positions (FIFO method)
    const sellerPositionsRef = database.ref(`positions/${bid.receiverTeam}/${bid.stock}`);
    sellerPositionsRef.transaction((currentPosition) => {
        if (!currentPosition || currentPosition.qty < bid.quantity) {
            return currentPosition; // Abort if not enough quantity
        }

        let qtyToRemove = bid.quantity;
        const updatedBuyLots = [...(currentPosition.buyLots || [])];
        
        while (qtyToRemove > 0 && updatedBuyLots.length > 0) {
            const firstLot = updatedBuyLots[0];
            if (firstLot.qty <= qtyToRemove) {
                qtyToRemove -= firstLot.qty;
                updatedBuyLots.shift();
            } else {
                firstLot.qty -= qtyToRemove;
                qtyToRemove = 0;
            }
        }

        currentPosition.qty -= bid.quantity;
        currentPosition.buyLots = updatedBuyLots;
        return currentPosition;
    });
}

// Stock Selection Management
function populateStockSelect() {
    if (!stockSelect) return;
    
    stockSelect.innerHTML = '';
    stocksList.forEach(stock => {
        const option = document.createElement('option');
        option.value = stock;
        option.textContent = stock;
        stockSelect.appendChild(option);
    });
    
    if (privateStockSelect) {
        privateStockSelect.innerHTML = stockSelect.innerHTML;
    }
    
    if (currentSelectedStock && stocksList.includes(currentSelectedStock)) {
        stockSelect.value = currentSelectedStock;
    } else if (stocksList.length > 0) {
        currentSelectedStock = stocksList[0];
        stockSelect.value = currentSelectedStock;
    }
    
    updatePriceInput();
}

function updatePriceInput() {
    if (!stockSelect || !stockPrice) return;
    
    currentSelectedStock = stockSelect.value;
    const price = pricesMap[currentSelectedStock] || 0;
    stockPrice.value = price;
    calculateTotal();
}

function calculateTotal() {
    if (!stockPrice || !quantityInput || !totalPriceInput) return;
    
    const price = parseFloat(stockPrice.value) || 0;
    const qty = parseInt(quantityInput.value) || 0;
    totalPriceInput.value = (price * qty).toFixed(2);
}

function calculatePrivateTotal() {
    if (!privatePriceInput || !privateQuantityInput || !privateTotalInput) return;
    
    const price = parseFloat(privatePriceInput.value) || 0;
    const qty = parseInt(privateQuantityInput.value) || 0;
    privateTotalInput.value = (price * qty).toFixed(2);
}

// Trading Functions
function handleTradeSubmission(e) {
    e.preventDefault();
    
    if (!teamNumberSelect || !stockSelect || !stockPrice || !quantityInput) return;
    
    const team = teamNumberSelect.value;
    const stock = stockSelect.value;
    const price = parseFloat(stockPrice.value);
    const qty = parseInt(quantityInput.value);
    const total = price * qty;
    const status = document.querySelector('input[name="action"]:checked')?.value;
    const orderType = orderTypeSelect.value;

    if (!team || !stock || !qty || price <= 0 || !status) {
        showNotification("Error", "Please fill all fields with valid values");
        return;
    }

    teams.add(team);

    if (status === "Buy" && remainingBudget < total) {
        showNotification("Error", "You have exceeded your budget!");
        return;
    }

    if (!positions[stock]) {
        positions[stock] = { qty: 0, buyLots: [], realizedPL: 0, unrealizedPL: 0 };
    }
    
    const position = positions[stock];
    
    if (status === "Buy") {
        position.buyLots.push({ qty, price });
        position.qty += qty;
        remainingBudget -= total;
    } else {
        if (position.qty < qty) {
            showNotification("Error", `Insufficient holdings to sell. You currently own ${position.qty} units of ${stock}.`);
            return;
        }
        
        let qtyToSell = qty;
        let costBasis = 0;
        
        // FIFO method
        while (qtyToSell > 0 && position.buyLots.length > 0) {
            const firstLot = position.buyLots[0];
            
            if (firstLot.qty <= qtyToSell) {
                costBasis += firstLot.qty * firstLot.price;
                qtyToSell -= firstLot.qty;
                position.buyLots.shift();
            } else {
                costBasis += qtyToSell * firstLot.price;
                firstLot.qty -= qtyToSell;
                qtyToSell = 0;
            }
        }
        
        position.qty -= qty;
        const realizedPL = (price * qty) - costBasis;
        position.realizedPL += realizedPL;
        remainingBudget += total;
    }

    const order = {
        userId: currentUserId,
        team, 
        stock, 
        price, 
        qty, 
        total, 
        status, 
        time: new Date().toLocaleString(),
        type: orderType === 'private' ? 'Private' : 'Market'
    };

    saveOrderToFirebase(order);
    orders.push(order);

    if (quantityInput) quantityInput.value = '';
    calculateTotal();

    updateBudget();
    renderPositionsTable();
    renderOrdersTable();
    renderCharts();
    updateStockTicker();
    updateNifty10Index();
    
    const updateTimeElement = document.getElementById('update-time');
    if (updateTimeElement) {
        updateTimeElement.textContent = new Date().toLocaleTimeString();
    }
    
    showNotification("Order Placed", `${status} order for ${stock} executed successfully`);
}

function handlePrivateOrderSubmission(e) {
    e.preventDefault();
    
    const receiverTeam = bidTeamSelect.value;
    const stock = privateStockSelect.value;
    const price = parseFloat(privatePriceInput.value);
    const quantity = parseInt(privateQuantityInput.value);
    const total = price * quantity;
    const action = document.querySelector('input[name="private-action"]:checked')?.value;
    
    if (!receiverTeam || !stock || !quantity || price <= 0 || !action) {
        showNotification("Error", "Please fill all fields with valid values");
        return;
    }
    
    if (receiverTeam === currentTeam) {
        showNotification("Error", "You cannot place a bid to your own team");
        return;
    }
    
    const bid = {
        senderId: currentUserId,
        senderTeam: currentTeam,
        receiverTeam,
        stock,
        price,
        quantity,
        total,
        action,
        status: "Pending",
        time: new Date().toLocaleString()
    };
    
    saveBidToFirebase(bid);
    
    privateOrderDialog.classList.remove('active');
    privatePriceInput.value = '';
    privateQuantityInput.value = '';
    isManualPriceChange = false;
    
    showNotification("Bid Placed", `Placed ${action} bid for ${stock} with ${receiverTeam} for ${formatCurrency(total)}`);
    
    const updateTimeElement = document.getElementById('update-time');
    if (updateTimeElement) {
        updateTimeElement.textContent = new Date().toLocaleTimeString();
    }
}

// Bids Management
function renderBidsTables() {
    renderOfferedBidsTable();
    renderReceivedBidsTable();
}

function renderOfferedBidsTable() {
    const container = document.getElementById('offered-bids-table-container');
    if (!container) return;
    
    if (bids.offered.length === 0) {
        container.innerHTML = '<p>No bids offered yet.</p>';
        return;
    }
    
    let html = `<table class="bids-table">
        <thead>
            <tr>
                <th>Team</th>
                <th>Stock</th>
                <th>Action</th>
                <th>Price</th>
                <th>Quantity</th>
                <th>Total</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>`;
    
    bids.offered.forEach(bid => {
        html += `<tr>
            <td>${bid.receiverTeam}</td>
            <td>${bid.stock}</td>
            <td>${bid.action}</td>
            <td>${formatCurrency(bid.price)}</td>
            <td>${bid.quantity}</td>
            <td>${formatCurrency(bid.total)}</td>
            <td><span class="bid-status ${bid.status.toLowerCase()}">${bid.status}</span></td>
        </tr>`;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderReceivedBidsTable() {
    const container = document.getElementById('received-bids-table-container');
    if (!container) return;
    
    if (bids.received.length === 0) {
        container.innerHTML = '<p>No bids received yet.</p>';
        return;
    }
    
    let html = `<table class="bids-table">
        <thead>
            <tr>
                <th>Team</th>
                <th>Stock</th>
                <th>Action</th>
                <th>Price</th>
                <th>Quantity</th>
                <th>Total</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>`;
    
    bids.received.forEach((bid) => {
        html += `<tr>
            <td>${bid.senderTeam}</td>
            <td>${bid.stock}</td>
            <td>${bid.action}</td>
            <td>${formatCurrency(bid.price)}</td>
            <td>${bid.quantity}</td>
            <td>${formatCurrency(bid.total)}</td>
            <td>
                <button class="bid-action-btn bid-accept" data-id="${bid.id}">Accept</button>
                <button class="bid-action-btn bid-decline" data-id="${bid.id}">Decline</button>
            </td>
        </tr>`;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
    
    document.querySelectorAll('.bid-accept').forEach(btn => {
        btn.addEventListener('click', handleBidAccept);
    });
    
    document.querySelectorAll('.bid-decline').forEach(btn => {
        btn.addEventListener('click', handleBidDecline);
    });
}

function handleBidAccept(e) {
    const bidId = e.target.getAttribute('data-id');
    updateBidStatusInFirebase(bidId, "Accepted");
    
    // Remove the accepted bid from received bids
    const bidIndex = bids.received.findIndex(b => b.id === bidId);
    if (bidIndex !== -1) {
        bids.received.splice(bidIndex, 1);
        renderReceivedBidsTable();
    }
}

function handleBidDecline(e) {
    const bidId = e.target.getAttribute('data-id');
    updateBidStatusInFirebase(bidId, "Declined");
    
    // Remove the declined bid from received bids
    const bidIndex = bids.received.findIndex(b => b.id === bidId);
    if (bidIndex !== -1) {
        bids.received.splice(bidIndex, 1);
        renderReceivedBidsTable();
    }
}

// UI Rendering
function renderPositionsTable() {
    const container = document.getElementById('positions-table-container');
    if (!container) return;
    
    let html = `<table>
        <thead>
            <tr>
                <th>Stock</th>
                <th>Quantity</th>
                <th>Current Price</th>
                <th>Invested Value</th>
                <th>Current Value</th>
                <th>Unrealized P&L</th>
                <th>Realized P&L</th>
            </tr>
        </thead>
        <tbody>`;
    
    let totalInvested = 0;
    let totalCurrent = 0;
    let totalUnrealized = 0;
    let totalRealized = 0;
    
    stocksList.forEach(stock => {
        const position = positions[stock] || { qty: 0, buyLots: [], realizedPL: 0 };
        const currentPrice = pricesMap[stock] || 0;
        
        const investedValue = position.buyLots.reduce((sum, lot) => sum + (lot.qty * lot.price), 0);
        const currentValue = position.qty * currentPrice;
        const unrealizedPL = currentValue - investedValue;
        
        totalInvested += investedValue;
        totalCurrent += currentValue;
        totalUnrealized += unrealizedPL;
        totalRealized += position.realizedPL;
        
        if (position.qty > 0 || position.realizedPL !== 0) {
            html += `<tr>
                <td>${stock}</td>
                <td>${position.qty}</td>
                <td>${formatCurrency(currentPrice)}</td>
                <td>${formatCurrency(investedValue)}</td>
                <td>${formatCurrency(currentValue)}</td>
                <td class="${getPLClass(unrealizedPL)}">${formatCurrency(unrealizedPL)}</td>
                <td class="${getPLClass(position.realizedPL)}">${formatCurrency(position.realizedPL)}</td>
            </tr>`;
        }
    });
    
    const totalPL = totalUnrealized + totalRealized;
    const plClass = totalPL > 0 ? 'profit' : totalPL < 0 ? 'loss' : '';
    
    html += `<tr class="total-row ${plClass}">
        <td colspan="3">Total</td>
        <td>${formatCurrency(totalInvested)}</td>
        <td>${formatCurrency(totalCurrent)}</td>
        <td class="${getPLClass(totalUnrealized)}">${formatCurrency(totalUnrealized)}</td>
        <td class="${getPLClass(totalRealized)}">${formatCurrency(totalRealized)}</td>
    </tr></tbody></table>`;
    
    container.innerHTML = html;
}

function renderOrdersTable() {
    const container = document.getElementById('orders-table-container');
    if (!container) return;
    
    let html = `<table>
        <thead>
            <tr>
                <th>Team</th>
                <th>Stock</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Status</th>
                <th>Type</th>
                <th>Time</th>
                <th>User ID</th>
            </tr>
        </thead>
        <tbody>`;
    
    orders.forEach(order => {
        html += `<tr>
            <td>${order.team}</td>
            <td>${order.stock}</td>
            <td>${formatCurrency(order.price)}</td>
            <td>${order.qty}</td>
            <td>${formatCurrency(order.total)}</td>
            <td>${order.status}</td>
            <td>${order.type}</td>
            <td>${order.time}</td>
            <td class="user-id-cell">${order.userId ? order.userId.substring(0, 8) + '...' : 'N/A'}</td>
        </tr>`;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderCharts() {
    // Holdings Chart (Pie Chart)
    const holdingsLabels = [];
    const holdingsData = [];
    
    stocksList.forEach(stock => {
        const position = positions[stock] || { qty: 0 };
        if (position.qty > 0) {
            holdingsLabels.push(stock);
            holdingsData.push(position.qty * (pricesMap[stock] || 0));
        }
    });
    
    const holdingsCtx = document.getElementById('holdings-chart')?.getContext('2d');
    if (holdingsCtx) {
        if (holdingsChart) {
            holdingsChart.destroy();
        }
        
        holdingsChart = new Chart(holdingsCtx, {
            type: 'pie',
            data: {
                labels: holdingsLabels,
                datasets: [{
                    label: "Holdings Value",
                    data: holdingsData,
                    backgroundColor: getPieColors(holdingsLabels.length),
                    borderWidth: 1,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '60%',
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    }
    
    // P&L Chart (Bar Chart)
    const pnlLabels = [];
    const pnlData = [];
    
    stocksList.forEach(stock => {
        const position = positions[stock] || { qty: 0, buyLots: [], realizedPL: 0 };
        const currentPrice = pricesMap[stock] || 0;
        
        const investedValue = position.buyLots.reduce((sum, lot) => sum + (lot.qty * lot.price), 0);
        const currentValue = position.qty * currentPrice;
        const unrealizedPL = currentValue - investedValue;
        const totalPL = position.realizedPL + unrealizedPL;
        
        if (position.qty > 0 || position.realizedPL !== 0) {
            pnlLabels.push(stock);
            pnlData.push(totalPL);
        }
    });
    
    const pnlCtx = document.getElementById('pnl-chart')?.getContext('2d');
    if (pnlCtx) {
        if (pnlChart) {
            pnlChart.destroy();
        }
        
        pnlChart = new Chart(pnlCtx, {
            type: 'bar',
            data: {
                labels: pnlLabels,
                datasets: [{
                    label: "Profit & Loss",
                    data: pnlData,
                    backgroundColor: getBarColors(pnlLabels.length),
                    borderWidth: 1,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.raw || 0;
                                return `${label}: ${formatCurrency(value)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false,
                            drawBorder: false
                        }
                    }
                },
                animation: {
                    duration: 1000
                }
            }
        });
    }
}

// Event Listeners
function setupEventListeners() {
    // Tab Switching
    document.querySelectorAll('nav li.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('nav li.tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const tabToShow = this.getAttribute('data-tab');
            
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('active');
            });
            
            const paneToShow = document.getElementById(`${tabToShow}-tab`);
            if (paneToShow) {
                paneToShow.classList.add('active');
            }
        });
    });

    // Trade Action Toggle
    document.querySelectorAll('input[name="action"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const submitBtn = document.querySelector('.submit-trade');
            if (submitBtn) {
                if (this.value === 'Buy') {
                    submitBtn.className = 'submit-trade buy';
                    submitBtn.innerHTML = '<i class="fas fa-arrow-up"></i> Place Order';
                } else {
                    submitBtn.className = 'submit-trade sell';
                    submitBtn.innerHTML = '<i class="fas fa-arrow-down"></i> Place Order';
                }
            }
        });
    });

    // Private Order Action Toggle
    document.querySelectorAll('input[name="private-action"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const submitBtn = document.querySelector('#private-order-form .submit-btn');
            if (submitBtn) {
                if (this.value === 'Buy') {
                    submitBtn.style.backgroundColor = 'var(--buy-color)';
                } else {
                    submitBtn.style.backgroundColor = 'var(--sell-color)';
                }
            }
        });
    });

    // Order Type Change Handler
    orderTypeSelect?.addEventListener('change', function() {
        if (this.value === 'private') {
            showPrivateOrderDialog();
        }
    });

    // Form Submissions
    tradeForm?.addEventListener('submit', handleTradeSubmission);
    stockSelect?.addEventListener('change', updatePriceInput);
    quantityInput?.addEventListener('input', calculateTotal);
    closePrivateOrderBtn?.addEventListener('click', () => {
        privateOrderDialog.classList.remove('active');
        isManualPriceChange = false;
    });
    privateOrderForm?.addEventListener('submit', handlePrivateOrderSubmission);

    // Team Selection
    teamNumberSelect?.addEventListener('change', function() {
        const team = this.value;
        if (team) {
            currentTeam = team;
            teams.add(team);
            listenForBids(); // Start listening for bids when team is selected
            loadBudgetAndPositions(); // Load budget and positions for the selected team
        }
    });

    // Private Order Input Handlers
    privateStockSelect?.addEventListener('change', function() {
        const stock = this.value;
        currentSelectedStock = stock;
        
        if (!isManualPriceChange && stock) {
            const price = pricesMap[stock] || 0;
            privatePriceInput.value = price;
        }
        calculatePrivateTotal();
    });

    privatePriceInput?.addEventListener('input', function() {
        isManualPriceChange = true;
        calculatePrivateTotal();
    });

    privateQuantityInput?.addEventListener('input', function() {
        calculatePrivateTotal();
    });
}

// Periodic Updates
async function periodicUpdate() {
    try {
        const { success } = await fetchStocksFromAirtable();
        if (success) {
            populateStockSelect();
            updatePriceInput();
            renderPositionsTable();
            renderOrdersTable();
            renderBidsTables();
            renderCharts();
            updateStockTicker();
            updateNifty10Index();
        }
    } catch (error) {
        console.error("Error during periodic update:", error);
    }
    
    setTimeout(periodicUpdate, 5000);
}

// Private Order Dialog
function showPrivateOrderDialog() {
    if (!privateOrderDialog || !privateStockSelect) return;
    
    isManualPriceChange = false;
    privateStockSelect.value = stockSelect.value;
    currentSelectedStock = stockSelect.value;
    
    if (currentSelectedStock) {
        privatePriceInput.value = pricesMap[currentSelectedStock] || 0;
    }
    
    privateQuantityInput.value = quantityInput.value || '';
    calculatePrivateTotal();
    
    const mainAction = document.querySelector('input[name="action"]:checked')?.value;
    if (mainAction) {
        document.getElementById(`private-${mainAction.toLowerCase()}-action`).checked = true;
    }
    
    privateOrderDialog.classList.add('active');
}

// Budget and Positions Loading
async function loadBudgetAndPositions() {
    try {
        // Load budget
        const budgetRef = database.ref(`budgets/${currentTeam}`);
        budgetRef.on('value', (snapshot) => {
            remainingBudget = snapshot.val() || initialBudget;
            updateBudget();
        });

        // Load positions
        const positionsRef = database.ref(`positions/${currentTeam}`);
        positionsRef.on('value', (snapshot) => {
            positions = snapshot.val() || {};
            renderPositionsTable();
            renderCharts();
        });
    } catch (error) {
        console.error("Error loading budget and positions:", error);
        showNotification("Error", "Failed to load budget and positions");
    }
}

// Initialize App
async function initializeApp() {
    try {
        // Log the current user ID for debugging
        console.log("Current User ID:", currentUserId);
        
        // Load initial budget and positions from Firebase
        await loadBudgetAndPositions();
        
        // Load orders from Firebase
        loadOrdersFromFirebase();
        
        // Fetch stock data from Airtable
        await fetchStocksFromAirtable();
        
        // Setup event listeners
        setupEventListeners();
        
        // Initialize UI
        populateStockSelect();
        updatePriceInput();
        updateBudget();
        renderPositionsTable();
        renderOrdersTable();
        renderBidsTables();
        renderCharts();
        updateStockTicker();
        updateNifty10Index();
        
        if (teamNumberSelect?.value) {
            currentTeam = teamNumberSelect.value;
            teams.add(currentTeam);
            listenForBids(); // Start listening for bids
        }
        
        // Start periodic updates
        periodicUpdate();
    } catch (error) {
        console.error("Failed to initialize application:", error);
        showNotification("Error", "Failed to initialize application. Please check console for details.");
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', initializeApp);