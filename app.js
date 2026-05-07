const bybitApi = "https://api.bybit.com/v5/market/tickers?category=linear";
const bybitKlineApi = "https://api.bybit.com/v5/market/kline?category=linear";
const bybitInstrumentsApi =
  "https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000";
const fiatApi = "https://open.er-api.com/v6/latest/USD";
const refreshIntervalMs = 5_000;
const chartInterval = "15";
const chartLimit = 96;
const chartCacheMs = 15_000;
const storageKey = "bybit-dashboard-assets";

const defaultAssets = [
  {
    key: "bitcoin",
    symbol: "BTCUSDT",
    baseCoin: "BTC",
    name: "Bitcoin",
    pair: "BTCUSDT",
    icon: "₿",
    accentClass: "accent-orange",
  },
  {
    key: "ethereum",
    symbol: "ETHUSDT",
    baseCoin: "ETH",
    name: "Ethereum",
    pair: "ETHUSDT",
    icon: "Ξ",
    accentClass: "accent-blue",
  },
  {
    key: "usd",
    name: "Доллар",
    pair: "USD / RUB",
    icon: "$",
    accentClass: "accent-red",
  },
  {
    key: "tron",
    symbol: "TRXUSDT",
    baseCoin: "TRX",
    name: "TRON",
    pair: "TRXUSDT",
    icon: "T",
    accentClass: "accent-teal",
  },
];

const fallbackInstruments = [
  { symbol: "SOLUSDT", baseCoin: "SOL" },
  { symbol: "BNBUSDT", baseCoin: "BNB" },
  { symbol: "XRPUSDT", baseCoin: "XRP" },
  { symbol: "DOGEUSDT", baseCoin: "DOGE" },
  { symbol: "ADAUSDT", baseCoin: "ADA" },
  { symbol: "LINKUSDT", baseCoin: "LINK" },
  { symbol: "TONUSDT", baseCoin: "TON" },
  { symbol: "AVAXUSDT", baseCoin: "AVAX" },
];

const popularSymbols = [
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "LINKUSDT",
  "TONUSDT",
  "AVAXUSDT",
  "LTCUSDT",
  "DOTUSDT",
];

const accents = [
  "accent-violet",
  "accent-cyan",
  "accent-green",
  "accent-yellow",
  "accent-pink",
  "accent-indigo",
];

const usdt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const rub = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

const compactUsd = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const percent = new Intl.NumberFormat("ru-RU", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const axisPrice = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

const rateGrid = document.querySelector("#rate-grid");
const tableBody = document.querySelector("#rates-table");
const refreshButton = document.querySelector("#refresh-button");
const updatedEl = document.querySelector("#last-updated");
const statusPill = document.querySelector("#status-pill");
const toggleAddButton = document.querySelector("#toggle-add-button");
const addForm = document.querySelector("#add-form");
const hideAddButton = document.querySelector("#hide-add-button");
const symbolSelect = document.querySelector("#symbol-select");
const addStatus = document.querySelector("#add-status");
const chartCache = new Map();

let assets = [...defaultAssets, ...loadStoredAssets()];
let instruments = [...fallbackInstruments];
let activeChartSymbol = null;
let latestRows = [];

function loadStoredAssets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((asset) => asset?.symbol && asset?.baseCoin)
      .map((asset, index) => createAssetFromInstrument(asset, index, true));
  } catch (error) {
    return [];
  }
}

function saveStoredAssets() {
  const defaultSymbols = new Set(defaultAssets.map((asset) => asset.symbol).filter(Boolean));
  const customAssets = assets
    .filter((asset) => asset.symbol && !defaultSymbols.has(asset.symbol))
    .map(({ symbol, baseCoin }) => ({ symbol, baseCoin }));

  localStorage.setItem(storageKey, JSON.stringify(customAssets));
}

function createAssetFromInstrument(instrument, index = assets.length, removable = true) {
  const baseCoin = instrument.baseCoin || instrument.symbol.replace(/USDT$/, "");

  return {
    key: instrument.symbol.toLowerCase(),
    symbol: instrument.symbol,
    baseCoin,
    name: baseCoin,
    pair: instrument.symbol,
    icon: baseCoin.slice(0, 1),
    accentClass: accents[index % accents.length],
    removable,
  };
}

function getBybitTickerUrl(symbol) {
  return `${bybitApi}&symbol=${symbol}`;
}

function getBybitKlineUrl(symbol) {
  return `${bybitKlineApi}&symbol=${symbol}&interval=${chartInterval}&limit=${chartLimit}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCryptoPrice(value) {
  if (!Number.isFinite(value)) {
    return "Нет данных";
  }

  if (value < 1) {
    return compactUsd.format(value);
  }

  return usdt.format(value);
}

function formatChange(value) {
  if (!Number.isFinite(value)) {
    return "Нет данных";
  }

  return `${value >= 0 ? "+" : ""}${percent.format(value)}`;
}

function getChangeClass(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return value >= 0 ? "positive" : "negative";
}

function renderCards(rows) {
  rateGrid.innerHTML = rows
    .map(
      (row) => `
        <article class="rate-card ${row.accentClass}" data-symbol="${escapeHtml(row.symbol || row.key)}">
          ${
            row.removable
              ? `<button class="remove-card-button" type="button" data-remove-symbol="${escapeHtml(row.symbol)}" aria-label="Убрать ${escapeHtml(row.pair)}">×</button>`
              : ""
          }
          <div>
            <div class="asset-row">
              <span class="asset-icon">${escapeHtml(row.icon)}</span>
              <div>
                <h2>${escapeHtml(row.name)}</h2>
                <p>${escapeHtml(row.pair)}</p>
              </div>
            </div>
            <strong>${escapeHtml(row.price)}</strong>
          </div>
          <small class="${getChangeClass(row.changeValue)}">${escapeHtml(row.changeText)}</small>
        </article>
      `,
    )
    .join("");
}

function renderTable(rows) {
  tableBody.innerHTML = rows
    .map((row) => {
      const isActive = row.symbol === activeChartSymbol;
      const buttonText = isActive ? "Скрыть" : "График";
      const button = row.symbol
        ? `<button class="chart-button" type="button" data-symbol="${escapeHtml(row.symbol)}" aria-expanded="${isActive}">
            ${buttonText}
          </button>`
        : `<button class="chart-button" type="button" disabled>Нет</button>`;
      const removeButton = row.removable
        ? `<button class="remove-row-button" type="button" data-remove-symbol="${escapeHtml(row.symbol)}">Убрать</button>`
        : "";
      const chartRow = isActive
        ? `
          <tr class="chart-row">
            <td colspan="6">
              <div class="chart-panel">
                <div class="chart-heading">
                  <strong>${escapeHtml(row.pair)}</strong>
                  <span>15m, последние 24 часа</span>
                </div>
                <canvas id="chart-${escapeHtml(row.symbol)}" height="210"></canvas>
                <p class="chart-status" id="chart-status-${escapeHtml(row.symbol)}">Загружаю график...</p>
              </div>
            </td>
          </tr>
        `
        : "";

      return `
        <tr class="${isActive ? "selected-row" : ""}">
          <td class="asset-name">${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.pair)}</td>
          <td>${escapeHtml(row.price)}</td>
          <td>${escapeHtml(row.markPrice)}</td>
          <td class="${getChangeClass(row.changeValue)}">
            ${escapeHtml(row.changeText)}
          </td>
          <td>
            <div class="row-actions">
              ${button}
              ${removeButton}
            </div>
          </td>
        </tr>
        ${chartRow}
      `;
    })
    .join("");

  renderActiveChart();
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  if (isLoading) {
    statusPill.textContent = "Обновляю";
  }
}

async function fetchRates() {
  setLoading(true);

  try {
    const futuresAssets = assets.filter((asset) => asset.symbol);
    const [tickerResponses, fiatResponse] = await Promise.all([
      Promise.all(futuresAssets.map((asset) => fetch(getBybitTickerUrl(asset.symbol)))),
      fetch(fiatApi),
    ]);

    if (tickerResponses.some((response) => !response.ok) || !fiatResponse.ok) {
      throw new Error("API returned an error");
    }

    const [tickerData, fiatData] = await Promise.all([
      Promise.all(tickerResponses.map((response) => response.json())),
      fiatResponse.json(),
    ]);

    const failedTicker = tickerData.find((data) => data.retCode !== 0);

    if (failedTicker) {
      throw new Error(failedTicker.retMsg || "Bybit API returned an error");
    }

    const bybitTickers = new Map(
      tickerData
        .map((data) => data.result?.list?.[0])
        .filter(Boolean)
        .map((ticker) => [ticker.symbol, ticker]),
    );

    const rows = assets.map((asset) => {
      if (asset.key === "usd") {
        const rubRate = fiatData.rates?.RUB;

        return {
          ...asset,
          price: Number.isFinite(rubRate) ? rub.format(rubRate) : "Нет данных",
          markPrice: "—",
          changeText: "Курс обновляется API",
          changeValue: null,
        };
      }

      const data = bybitTickers.get(asset.symbol) || {};
      const price = Number(data.lastPrice);
      const markPrice = Number(data.markPrice);
      const change = Number(data.price24hPcnt);

      return {
        ...asset,
        price: formatCryptoPrice(price),
        markPrice: formatCryptoPrice(markPrice),
        changeText: formatChange(change),
        changeValue: change,
      };
    });

    latestRows = rows;
    renderCards(rows);
    renderTable(rows);
    updatedEl.textContent = `Обновлено: ${new Date().toLocaleTimeString("ru-RU")}`;
    statusPill.textContent = "Онлайн";
  } catch (error) {
    statusPill.textContent = "Ошибка";
    updatedEl.textContent = "Не удалось получить данные";
    tableBody.innerHTML = `
      <tr>
        <td colspan="6">Проверь интернет или попробуй обновить еще раз.</td>
      </tr>
    `;
  } finally {
    refreshButton.disabled = false;
  }
}

function populateSymbolSelect() {
  const selectedSymbols = new Set(assets.map((asset) => asset.symbol).filter(Boolean));
  const available = instruments.filter((instrument) => !selectedSymbols.has(instrument.symbol));

  symbolSelect.innerHTML = available.length
    ? available
        .map(
          (instrument) => `
            <option value="${escapeHtml(instrument.symbol)}">
              ${escapeHtml(instrument.symbol)}
            </option>
          `,
        )
        .join("")
    : '<option value="">Все доступные пары уже добавлены</option>';

  symbolSelect.disabled = !available.length;
}

function removeAsset(symbol) {
  const asset = assets.find((item) => item.symbol === symbol);

  if (!asset?.removable) {
    return;
  }

  assets = assets.filter((item) => item.symbol !== symbol);
  latestRows = latestRows.filter((row) => row.symbol !== symbol);
  chartCache.delete(symbol);

  if (activeChartSymbol === symbol) {
    activeChartSymbol = null;
  }

  saveStoredAssets();
  populateSymbolSelect();
  renderCards(latestRows);
  renderTable(latestRows);
  addStatus.textContent = `${symbol} убран`;
}

async function loadBybitInstruments() {
  try {
    let cursor = "";
    const loaded = [];

    for (let page = 0; page < 4; page += 1) {
      const response = await fetch(
        `${bybitInstrumentsApi}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );

      if (!response.ok) {
        throw new Error("Instruments API returned an error");
      }

      const data = await response.json();

      if (data.retCode !== 0) {
        throw new Error(data.retMsg || "Bybit instruments API returned an error");
      }

      loaded.push(...(data.result?.list || []));
      cursor = data.result?.nextPageCursor || "";

      if (!cursor) {
        break;
      }
    }

    instruments = loaded
      .filter(
        (instrument) =>
          instrument.symbol?.endsWith("USDT") &&
          instrument.contractType === "LinearPerpetual" &&
          instrument.quoteCoin === "USDT" &&
          instrument.settleCoin === "USDT" &&
          instrument.status === "Trading",
      )
      .map((instrument) => ({
        symbol: instrument.symbol,
        baseCoin: instrument.baseCoin || instrument.symbol.replace(/USDT$/, ""),
      }))
      .sort(sortInstruments);

    populateSymbolSelect();
    addStatus.textContent = "";
  } catch (error) {
    instruments = [...fallbackInstruments];
    populateSymbolSelect();
    addStatus.textContent = "Список Bybit не загрузился, показаны популярные пары";
  }
}

function sortInstruments(a, b) {
  const aPopularIndex = popularSymbols.indexOf(a.symbol);
  const bPopularIndex = popularSymbols.indexOf(b.symbol);

  if (aPopularIndex !== -1 || bPopularIndex !== -1) {
    return (aPopularIndex === -1 ? 999 : aPopularIndex) - (bPopularIndex === -1 ? 999 : bPopularIndex);
  }

  return a.symbol.localeCompare(b.symbol);
}

refreshButton.addEventListener("click", fetchRates);

toggleAddButton.addEventListener("click", () => {
  addForm.hidden = !addForm.hidden;

  if (!addForm.hidden) {
    symbolSelect.focus();
  }
});

hideAddButton.addEventListener("click", () => {
  addForm.hidden = true;
  addStatus.textContent = "";
});

addForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const symbol = symbolSelect.value;
  const instrument = instruments.find((item) => item.symbol === symbol);

  if (!instrument || assets.some((asset) => asset.symbol === symbol)) {
    return;
  }

  assets = [...assets, createAssetFromInstrument(instrument)];
  saveStoredAssets();
  populateSymbolSelect();
  addStatus.textContent = `${symbol} добавлен`;
  fetchRates();
});

tableBody.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-row-button");

  if (removeButton) {
    removeAsset(removeButton.dataset.removeSymbol);
    return;
  }

  const button = event.target.closest(".chart-button");

  if (!button || button.disabled) {
    return;
  }

  const { symbol } = button.dataset;
  activeChartSymbol = activeChartSymbol === symbol ? null : symbol;
  renderTable(latestRows);
});

rateGrid.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-card-button");

  if (!removeButton) {
    return;
  }

  removeAsset(removeButton.dataset.removeSymbol);
});

async function fetchChartData(symbol) {
  const cached = chartCache.get(symbol);

  if (cached && Date.now() - cached.updatedAt < chartCacheMs) {
    return cached.candles;
  }

  const response = await fetch(getBybitKlineUrl(symbol));

  if (!response.ok) {
    throw new Error("Kline API returned an error");
  }

  const data = await response.json();

  if (data.retCode !== 0) {
    throw new Error(data.retMsg || "Bybit kline API returned an error");
  }

  const candles = (data.result?.list || [])
    .map((item) => ({
      time: Number(item[0]),
      close: Number(item[4]),
    }))
    .filter((item) => Number.isFinite(item.time) && Number.isFinite(item.close))
    .sort((a, b) => a.time - b.time);

  chartCache.set(symbol, {
    candles,
    updatedAt: Date.now(),
  });
  return candles;
}

function drawChart(canvas, candles) {
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const padding = {
    top: 18,
    right: 18,
    bottom: 34,
    left: 76,
  };

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  if (candles.length < 2) {
    return;
  }

  const closes = candles.map((item) => item.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  context.strokeStyle = "#d9e0ea";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, height - padding.bottom);
  context.lineTo(width - padding.right, height - padding.bottom);
  context.stroke();

  context.fillStyle = "#667085";
  context.font =
    '12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.textBaseline = "middle";
  context.textAlign = "right";

  const priceTicks = 4;

  for (let tick = 0; tick <= priceTicks; tick += 1) {
    const value = max - (range / priceTicks) * tick;
    const y = padding.top + (tick / priceTicks) * plotHeight;

    context.strokeStyle = tick === priceTicks ? "#d9e0ea" : "#edf1f7";
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();

    context.fillText(formatAxisPrice(value), padding.left - 10, y);
  }

  context.textBaseline = "top";
  context.textAlign = "center";

  const timeIndexes = [0, Math.floor((candles.length - 1) / 2), candles.length - 1];

  timeIndexes.forEach((index) => {
    const candle = candles[index];
    const x = padding.left + (index / (candles.length - 1)) * plotWidth;

    context.fillText(formatAxisTime(candle.time), x, height - padding.bottom + 10);
  });

  context.strokeStyle = candles.at(-1).close >= candles[0].close ? "#118a51" : "#c2413a";
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();

  candles.forEach((candle, index) => {
    const x = padding.left + (index / (candles.length - 1)) * plotWidth;
    const y = padding.top + ((max - candle.close) / range) * plotHeight;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });

  context.stroke();
}

function formatAxisPrice(value) {
  if (value < 1) {
    return value.toFixed(4);
  }

  if (value < 100) {
    return value.toFixed(2);
  }

  return axisPrice.format(value);
}

function formatAxisTime(timestamp) {
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function renderActiveChart() {
  if (!activeChartSymbol) {
    return;
  }

  const canvas = document.querySelector(`#chart-${activeChartSymbol}`);
  const status = document.querySelector(`#chart-status-${activeChartSymbol}`);

  if (!canvas || !status) {
    return;
  }

  try {
    const candles = await fetchChartData(activeChartSymbol);
    drawChart(canvas, candles);
    status.textContent = candles.length ? "" : "Нет данных для графика";
  } catch (error) {
    status.textContent = "Не удалось загрузить график";
  }
}

populateSymbolSelect();
loadBybitInstruments();
fetchRates();
setInterval(fetchRates, refreshIntervalMs);
