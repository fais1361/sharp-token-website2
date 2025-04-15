// Configuration constants
const CONFIG = {
    CONTRACT_ADDRESS: "0x697347f8d15bABaD054C84dAe3C8662addaf5c0b",
    BSC_SCAN_URL: "https://bscscan.com",
    CHAIN_ID: 56, // BSC Mainnet
    RPC_URLS: {
        56: "https://bsc-dataseed.binance.org/",
        97: "https://data-seed-prebsc-1-s1.binance.org:8545/"
    },
    TOKEN_INFO: {
        symbol: "SHRP",
        decimals: 18,
        image: "https://yourwebsite.com/shrp-logo.webp"
    }
};

// ABI for the contract (simplified version)
const TOKEN_ABI = [
    "function balanceOf(address) view returns (uint)",
    "function transfer(address, uint) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint amount)"
];

// Global state
const state = {
    provider: null,
    signer: null,
    contract: null,
    walletType: null,
    priceChart: null,
    priceData: null
};

// DOM Elements
const elements = {
    connectMetamask: document.getElementById('connect-metamask'),
    connectWalletConnect: document.getElementById('connect-walletconnect'),
    walletInfo: document.getElementById('wallet-info'),
    walletAddress: document.getElementById('wallet-address'),
    tokenBalance: document.getElementById('token-balance'),
    bnbBalance: document.getElementById('bnb-balance'),
    tokenPrice: document.getElementById('token-price'),
    marketCap: document.getElementById('market-cap'),
    priceChange: document.getElementById('price-change'),
    priceChart: document.getElementById('price-chart')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    checkSavedSession();
    initPriceChart();
});

function initEventListeners() {
    // Wallet connection
    elements.connectMetamask.addEventListener('click', () => connectWallet('metamask'));
    elements.connectWalletConnect.addEventListener('click', () => connectWallet('walletconnect'));
    
    // Other event listeners...
}

async function connectWallet(walletType) {
    try {
        showLoading(true);
        
        let provider;
        switch(walletType) {
            case 'metamask':
                provider = await connectMetaMask();
                break;
            case 'walletconnect':
                provider = await connectWalletConnect();
                break;
            default:
                throw new Error('Unknown wallet type');
        }
        
        // Verify network
        await verifyNetwork(provider);
        
        // Initialize contract
        const signer = provider.getSigner();
        const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, TOKEN_ABI, signer);
        
        // Update state
        state.provider = provider;
        state.signer = signer;
        state.contract = contract;
        state.walletType = walletType;
        
        // Update UI
        await updateWalletInfo();
        elements.walletInfo.style.display = 'block';
        
        // Save session
        saveSession(walletType);
        
        // Show success notification
        showNotification('Wallet connected successfully!', 'success');
        
    } catch (error) {
        console.error('Connection error:', error);
        showNotification(`Connection failed: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

async function connectMetaMask() {
    if (!window.ethereum) {
        throw new Error('MetaMask not installed');
    }
    
    try {
        // Request account access
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Create provider
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        
        // Set up event listeners
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
        
        return provider;
    } catch (error) {
        if (error.code === 4001) {
            throw new Error('User rejected the connection request');
        }
        throw error;
    }
}

async function connectWalletConnect() {
    try {
        const walletConnectProvider = new WalletConnectProvider.default({
            rpc: CONFIG.RPC_URLS,
            chainId: CONFIG.CHAIN_ID
        });
        
        // Enable session
        await walletConnectProvider.enable();
        
        // Create provider
        const provider = new ethers.providers.Web3Provider(walletConnectProvider);
        
        // Set up event listeners
        walletConnectProvider.on('disconnect', handleDisconnect);
        
        return provider;
    } catch (error) {
        throw new Error('WalletConnect connection failed');
    }
}

async function verifyNetwork(provider) {
    const network = await provider.getNetwork();
    if (network.chainId !== CONFIG.CHAIN_ID) {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${CONFIG.CHAIN_ID.toString(16)}` }],
            });
        } catch (error) {
            if (error.code === 4902) {
                throw new Error(`Please add Binance Smart Chain to your wallet`);
            }
            throw new Error('Please switch to Binance Smart Chain');
        }
    }
}

async function updateWalletInfo() {
    if (!state.signer || !state.contract) return;
    
    try {
        showLoading(true, 'wallet-info');
        
        const address = await state.signer.getAddress();
        const [balance, bnbBalance] = await Promise.all([
            state.contract.balanceOf(address),
            state.provider.getBalance(address)
        ]);
        
        // Update DOM
        elements.walletAddress.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
        elements.tokenBalance.textContent = ethers.utils.formatEther(balance);
        elements.bnbBalance.textContent = ethers.utils.formatEther(bnbBalance).substring(0, 6);
        
    } catch (error) {
        console.error('Error updating wallet info:', error);
        showNotification('Failed to update wallet info', 'error');
    } finally {
        showLoading(false, 'wallet-info');
    }
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.setAttribute('role', 'alert');
    
    const notificationCenter = document.getElementById('notification-center');
    notificationCenter.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Loading state management
function showLoading(show, elementId = 'global') {
    const loaderClass = 'loading';
    
    if (elementId === 'global') {
        document.body.classList.toggle(loaderClass, show);
    } else {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.toggle(loaderClass, show);
        }
    }
}

// Initialize price chart with real data
async function initPriceChart() {
    try {
        // Fetch historical data
        const historicalData = await fetchHistoricalPriceData();
        
        // Create chart
        const ctx = elements.priceChart.getContext('2d');
        state.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: historicalData.labels,
                datasets: [{
                    label: 'SHRP Price',
                    data: historicalData.prices,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: getChartOptions()
        });
    } catch (error) {
        console.error('Error initializing chart:', error);
    }
}

// Helper functions
function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else {
        updateWalletInfo();
    }
}

function handleChainChanged() {
    window.location.reload();
}

function handleDisconnect() {
    disconnectWallet();
}

function disconnectWallet() {
    // Clear state
    state.provider = null;
    state.signer = null;
    state.contract = null;
    state.walletType = null;
    
    // Update UI
    elements.walletInfo.style.display = 'none';
    
    // Clear session
    localStorage.removeItem('walletSession');
    
    // Show notification
    showNotification('Wallet disconnected', 'info');
}

function saveSession(walletType) {
    localStorage.setItem('walletSession', JSON.stringify({
        walletType,
        timestamp: Date.now()
    }));
}

function checkSavedSession() {
    const session = localStorage.getItem('walletSession');
    if (session) {
        try {
            const { walletType, timestamp } = JSON.parse(session);
            // Only reconnect if session is recent (e.g., less than 1 hour old)
            if (Date.now() - timestamp < 3600000) {
                connectWallet(walletType);
            }
        } catch (error) {
            console.error('Error parsing saved session:', error);
        }
    }
}

// Export functions that need to be available globally
window.addTokenToWallet = addTokenToWallet;
window.disconnectWallet = disconnectWallet;
// ... other global functions