// State
let coinList = [];
let favorites = JSON.parse(localStorage.getItem('cryptoFavorites')) || [];
let currentCoin = null;
let topCoins = [];

// DOM Elements
const coinInput = document.getElementById('coinInput');
const searchBtn = document.getElementById('searchBtn');
const suggestions = document.getElementById('suggestions');
const coinData = document.getElementById('coinData');
const favoritesList = document.getElementById('favoritesList');
const addFavoriteBtn = document.getElementById('addFavoriteBtn');
const meterIndicator = document.getElementById('meterIndicator');
const meterValue = document.getElementById('meterValue');
const meterDescription = document.getElementById('meterDescription');
const sentimentAdvice = document.getElementById('sentimentAdvice');
const summaryContent = document.getElementById('summaryContent');
const topCoinsList = document.getElementById('topCoinsList');
const newsContainer = document.getElementById('newsContainer');
const tabContents = document.querySelectorAll('.tab-content');
const tabButtons = document.querySelectorAll('.tab-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchCoinList();
  fetchFearGreedIndex();
  fetchTopCoins();
  fetchNews();
  renderFavorites();
  setupEventListeners();
});

function setupEventListeners() {
  // Search functionality
  coinInput.addEventListener('input', debounce(handleSearch, 300));
  searchBtn.addEventListener('click', () => {
    const query = coinInput.value.trim();
    if (query) handleSearch();
  });

  // Tab switching
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      switchTab(tabId);
    });
  });

  // Add to favorites
  addFavoriteBtn.addEventListener('click', addToFavorites);
}

function switchTab(tabId) {
  tabButtons.forEach(btn => btn.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));
  
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// Fetch coin list from CoinGecko
async function fetchCoinList() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/coins/list');
    coinList = await response.json();
  } catch (error) {
    console.error('Error fetching coin list:', error);
  }
}

// Search handler with better filtering
async function handleSearch() {
  const query = coinInput.value.trim().toLowerCase();
  suggestions.innerHTML = '';
  
  if (query.length < 2) {
    suggestions.style.display = 'none';
    return;
  }

  // Filter coins - prioritize exact matches and more popular coins
  const results = coinList
    .filter(coin => {
      const nameMatch = coin.name.toLowerCase().includes(query);
      const symbolMatch = coin.symbol.toLowerCase() === query.toLowerCase();
      return nameMatch || symbolMatch;
    })
    .sort((a, b) => {
      // Prioritize exact matches
      if (a.name.toLowerCase() === query) return -1;
      if (b.name.toLowerCase() === query) return 1;
      if (a.symbol.toLowerCase() === query) return -1;
      if (b.symbol.toLowerCase() === query) return 1;
      
      // Then prioritize coins that start with the query
      const aStarts = a.name.toLowerCase().startsWith(query);
      const bStarts = b.name.toLowerCase().startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      
      // Then sort by name length (shorter names tend to be more popular)
      return a.name.length - b.name.length;
    })
    .slice(0, 8);

  if (results.length > 0) {
    suggestions.style.display = 'block';
    results.forEach(coin => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerHTML = `
        <span>${coin.name}</span>
        <span class="coin-symbol">${coin.symbol.toUpperCase()}</span>
      `;
      item.addEventListener('click', () => {
        coinInput.value = coin.name;
        fetchCoinData(coin.id);
        suggestions.style.display = 'none';
      });
      suggestions.appendChild(item);
    });
  } else {
    suggestions.style.display = 'none';
  }
}

// Fetch detailed coin data
async function fetchCoinData(coinId) {
  currentCoin = coinId;
  coinData.innerHTML = `
    <div class="loading">
      <i class="fas fa-spinner fa-spin fa-2x"></i>
      <p>Loading data...</p>
    </div>
  `;

  try {
    const [priceRes, detailRes] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`),
      fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`)
    ]);

    const priceData = await priceRes.json();
    const detailData = await detailRes.json();

    if (!priceData[coinId]) throw new Error('Coin not found');

    const price = priceData[coinId].usd;
    const change = priceData[coinId].usd_24h_change?.toFixed(2) || 0;
    const changeClass = change >= 0 ? 'positive' : 'negative';
    const signal = getSignal(change);
    const marketCap = detailData.market_data?.market_cap?.usd || 0;
    const volume = detailData.market_data?.total_volume?.usd || 0;

    coinData.innerHTML = `
      <div class="coin-data">
        <div class="coin-header">
          <img src="${detailData.image?.small}" class="coin-icon" onerror="this.style.display='none'">
          <div>
            <div class="coin-name">${detailData.name}</div>
            <div class="coin-symbol">${detailData.symbol.toUpperCase()}</div>
          </div>
        </div>
        <div class="price-display">$${price.toLocaleString()}</div>
        <div>
          <span class="price-change ${changeClass}">
            ${change >= 0 ? '+' : ''}${change}%
          </span>
          <span class="signal ${signal.class}">
            ${signal.text}
          </span>
        </div>
      </div>
    `;

    // Show/hide add to favorites button
    addFavoriteBtn.style.display = favorites.includes(coinId) ? 'none' : 'block';

    // Generate summary
    generateSummary(detailData, priceData[coinId], signal);

  } catch (error) {
    coinData.innerHTML = `
      <div class="loading">
        <i class="fas fa-exclamation-triangle fa-2x"></i>
        <p>Error loading data</p>
      </div>
    `;
    console.error('Error fetching coin data:', error);
  }
}

// Get trading signal with more sophisticated logic
function getSignal(change) {
  change = parseFloat(change);
  if (change > 10) return { text: 'STRONG BUY', class: 'buy' };
  if (change > 5) return { text: 'BUY', class: 'buy' };
  if (change > 2) return { text: 'WEAK BUY', class: 'buy' };
  if (change < -10) return { text: 'STRONG SELL', class: 'sell' };
  if (change < -5) return { text: 'SELL', class: 'sell' };
  if (change < -2) return { text: 'WEAK SELL', class: 'sell' };
  return { text: 'NEUTRAL', class: 'hold' };
}

// Generate comprehensive summary
function generateSummary(detailData, priceData, signal) {
  const change = priceData.usd_24h_change || 0;
  const marketCap = detailData.market_data?.market_cap?.usd || 0;
  const volume = detailData.market_data?.total_volume?.usd || 0;
  const ath = detailData.market_data?.ath?.usd || 0;
  const currentPrice = priceData.usd || 0;
  const fromATH = ((currentPrice - ath) / ath * 100).toFixed(2);

  let summary = `
    <p><strong>${detailData.name} (${detailData.symbol.toUpperCase()})</strong> is currently showing a 
    <span class="${signal.class}">${signal.text}</span> signal.</p>
  `;

  if (change > 5) {
    summary += `
      <p>The price has increased <strong>${change.toFixed(2)}%</strong> in the last 24 hours, 
      indicating strong positive momentum.</p>
    `;
  } else if (change < -5) {
    summary += `
      <p>The price has dropped <strong>${Math.abs(change).toFixed(2)}%</strong> in the last 24 hours, 
      indicating significant selling pressure.</p>
    `;
  }

  if (marketCap > 10000000000) { // > $10B
    summary += `<p>With a market cap of <strong>$${(marketCap/1000000000).toFixed(2)}B</strong>, 
      this is a large-cap cryptocurrency with relatively stable liquidity.</p>`;
  }

  if (fromATH < -50) {
    summary += `<p>The price is <strong>${Math.abs(fromATH)}%</strong> below its all-time high, 
      which may represent a buying opportunity if fundamentals are strong.</p>`;
  }

  summaryContent.innerHTML = summary;
}

// Fetch Fear & Greed Index with advice
async function fetchFearGreedIndex() {
  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=1');
    const data = await response.json();
    const index = parseInt(data.data[0].value);
    const mood = data.data[0].value_classification;

    // Update meter
    const position = (index / 100) * 100;
    meterIndicator.style.left = `${position}%`;
    meterValue.textContent = index;
    meterDescription.textContent = mood;

    // Generate advice based on index
    let advice = '';
    if (index <= 25) {
      advice = `Extreme fear suggests investors are too worried. This could be a buying opportunity 
                for brave investors, as markets often rebound from extreme fear levels.`;
    } else if (index <= 45) {
      advice = `Fear dominates the market. While risks remain, this could be a good time to 
                accumulate quality assets at lower prices.`;
    } else if (index <= 55) {
      advice = `Neutral market sentiment. Consider holding current positions and waiting for 
                clearer signals before making significant moves.`;
    } else if (index <= 75) {
      advice = `Greed is increasing in the market. Be cautious with new investments and consider 
                taking some profits on positions that have performed well.`;
    } else {
      advice = `Extreme greed suggests the market may be overheating. This is often a time to be 
                cautious and consider reducing risk exposure.`;
    }

    sentimentAdvice.innerHTML = advice;

    // Color based on value
    if (index <= 25) {
      meterValue.style.color = '#ff0000';
    } else if (index <= 50) {
      meterValue.style.color = '#ff9a00';
    } else if (index <= 75) {
      meterValue.style.color = '#ffce00';
    } else {
      meterValue.style.color = '#00ff00';
    }

  } catch (error) {
    console.error('Error fetching Fear & Greed Index:', error);
    meterDescription.textContent = 'Error loading data';
  }
}

// Fetch top coins by market cap
async function fetchTopCoins() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1');
    topCoins = await response.json();
    renderTopCoins();
  } catch (error) {
    console.error('Error fetching top coins:', error);
    topCoinsList.innerHTML = `
      <div class="loading">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error loading top coins</p>
      </div>
    `;
  }
}

function renderTopCoins() {
  topCoinsList.innerHTML = '';
  topCoins.forEach((coin, index) => {
    const change = coin.price_change_percentage_24h || 0;
    const changeClass = change >= 0 ? 'positive' : 'negative';
    const changeSymbol = change >= 0 ? '▲' : '▼';

    const row = document.createElement('div');
    row.className = 'coin-row';
    row.innerHTML = `
      <div class="coin-rank">${index + 1}</div>
      <img src="${coin.image}" class="coin-row-icon" onerror="this.style.display='none'">
      <div class="coin-row-name">
        ${coin.name}
        <span class="coin-row-symbol">${coin.symbol.toUpperCase()}</span>
      </div>
      <div class="coin-row-price">$${coin.current_price.toLocaleString()}</div>
      <div class="coin-row-change ${changeClass}">
        ${changeSymbol} ${Math.abs(change).toFixed(1)}%
      </div>
    `;
    row.addEventListener('click', () => {
      coinInput.value = coin.name;
      fetchCoinData(coin.id);
      switchTab('dashboard');
    });
    topCoinsList.appendChild(row);
  });
}

// Fetch crypto news
async function fetchNews() {
  try {
    // Using Cryptocompare API for news
    const response = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
    const data = await response.json();
    renderNews(data.Data.slice(0, 5)); // Show top 5 news
  } catch (error) {
    console.error('Error fetching news:', error);
    newsContainer.innerHTML = `
      <div class="loading">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error loading news</p>
      </div>
    `;
  }
}

function renderNews(newsItems) {
  newsContainer.innerHTML = '';
  newsItems.forEach(item => {
    const newsItem = document.createElement('div');
    newsItem.className = 'news-item';
    
    // Format published date
    const pubDate = new Date(item.published_on * 1000);
    const formattedDate = pubDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    newsItem.innerHTML = `
      <h3 class="news-title"><a href="${item.url}" target="_blank">${item.title}</a></h3>
      <div class="news-source">
        <i class="fas fa-newspaper"></i>
        ${item.source_info.name}
        <span class="news-date">• ${formattedDate}</span>
      </div>
    `;
    newsContainer.appendChild(newsItem);
  });
}

// Favorites functionality
function renderFavorites() {
  if (favorites.length === 0) {
    favoritesList.innerHTML = '<div class="loading">No favorites yet</div>';
    return;
  }

  favoritesList.innerHTML = '';
  favorites.forEach(coinId => {
    const coin = coinList.find(c => c.id === coinId);
    const tag = document.createElement('div');
    tag.className = 'favorite-item';
    tag.innerHTML = `
      <span>${coin ? coin.symbol.toUpperCase() : coinId}</span>
      <i class="fas fa-times remove-favorite"></i>
    `;
    
    // Click to view
    tag.querySelector('span').addEventListener('click', () => {
      coinInput.value = coin?.name || coinId;
      fetchCoinData(coinId);
      switchTab('dashboard');
    });
    
    // Remove button
    tag.querySelector('.remove-favorite').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromFavorites(coinId);
    });
    
    favoritesList.appendChild(tag);
  });
}

function addToFavorites() {
  if (!currentCoin || favorites.includes(currentCoin)) return;
  
  favorites.push(currentCoin);
  localStorage.setItem('cryptoFavorites', JSON.stringify(favorites));
  renderFavorites();
  addFavoriteBtn.style.display = 'none';
}

function removeFromFavorites(coinId) {
  favorites = favorites.filter(id => id !== coinId);
  localStorage.setItem('cryptoFavorites', JSON.stringify(favorites));
  renderFavorites();
  
  if (currentCoin === coinId) {
    addFavoriteBtn.style.display = 'block';
  }
}

// Utility function
function debounce(func, wait) {
  let timeout;
  return function() {
    const context = this, args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}