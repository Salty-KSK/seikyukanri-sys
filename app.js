// ============================================================
// 請求管理ツール - メインアプリケーション
// ============================================================

(function () {
  'use strict';

  // ----------------------------------------------------------
  // 実行時エラーの検知・画面通知（トラブルシューティング用）
  // ----------------------------------------------------------
  window.addEventListener('error', function (e) {
    const errMsg = `【システムエラー検知】\nメッセージ: ${e.message}\nファイル: ${e.filename ? e.filename.split('/').pop() : 'app.js'}\n行番号: ${e.lineno}`;
    alert(errMsg);
  });

  // ----------------------------------------------------------
  // ユーティリティ
  // ----------------------------------------------------------
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function formatAmount(num) {
    if (num == null || isNaN(num)) return '';
    return Number(num).toLocaleString('ja-JP');
  }

  function parseAmount(str) {
    if (!str) return 0;
    return parseInt(String(str).replace(/[,\s¥￥]/g, ''), 10) || 0;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatDateSlash(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }

  // 日本の祝日（振替休日・国民の休日含む）を判定する軽量自己完結型ロジック
  function getJapaneseHolidays(year) {
    const holidays = [];
    const add = (dateStr, name) => holidays.push({ date: dateStr, name });

    add(`${year}-01-01`, "元日");
    add(`${year}-01-${getNthMonday(year, 1, 2)}`, "成人の日");
    add(`${year}-02-11`, "建国記念の日");
    add(`${year}-02-23`, "天皇誕生日");

    // 春分の日
    const vernalEquinox = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    add(`${year}-03-${String(vernalEquinox).padStart(2, '0')}`, "春分の日");

    add(`${year}-04-29`, "昭和の日");
    add(`${year}-05-03`, "憲法記念日");
    add(`${year}-05-04`, "みどりの日");
    add(`${year}-05-05`, "こどもの日");
    add(`${year}-07-${getNthMonday(year, 7, 3)}`, "海の日");
    add(`${year}-08-11`, "山の日");

    // 敬老の日
    const respectForAgeDay = getNthMonday(year, 9, 3);
    add(`${year}-09-${respectForAgeDay}`, "敬老の日");

    // 秋分の日
    const autumnalEquinox = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    add(`${year}-09-${String(autumnalEquinox).padStart(2, '0')}`, "秋分の日");

    add(`${year}-10-${getNthMonday(year, 10, 2)}`, "スポーツの日");
    add(`${year}-11-03`, "文化の日");
    add(`${year}-11-23`, "勤労感謝の日");

    const holidaySet = new Set(holidays.map(h => h.date));
    const resultHolidays = [...holidays];

    // 振替休日の判定 (祝日が日曜日の場合、その翌日以降の最初の「祝日でない平日」)
    holidays.forEach(h => {
      const [hy, hm, hd] = h.date.split('-').map(Number);
      const d = new Date(hy, hm - 1, hd);
      if (d.getDay() === 0) { // 日曜日
        let substituteDate = new Date(hy, hm - 1, hd);
        substituteDate.setDate(substituteDate.getDate() + 1);
        let subStr = formatDateYMD(substituteDate);
        while (holidaySet.has(subStr)) {
          substituteDate.setDate(substituteDate.getDate() + 1);
          subStr = formatDateYMD(substituteDate);
        }
        resultHolidays.push({ date: subStr, name: h.name + " 振替休日" });
      }
    });

    // 国民の休日の判定 (祝日と祝日に挟まれた平日を休日にする。主に9月の敬老の日と秋分の日の間)
    const updatedHolidaySet = new Set(resultHolidays.map(h => h.date));
    const daysInSeptember = new Date(year, 9, 0).getDate();
    for (let day = 2; day < daysInSeptember; day++) {
      const d = new Date(year, 8, day); // 9月 (0-indexedで8)
      const currentStr = formatDateYMD(d);
      if (d.getDay() !== 0 && d.getDay() !== 6 && !updatedHolidaySet.has(currentStr)) {
        const prevDate = new Date(year, 8, day - 1);
        const nextDate = new Date(year, 8, day + 1);

        if (updatedHolidaySet.has(formatDateYMD(prevDate)) && updatedHolidaySet.has(formatDateYMD(nextDate))) {
          resultHolidays.push({ date: currentStr, name: "国民の休日" });
        }
      }
    }

    return resultHolidays;
  }

  // 補助関数: 第N月曜日の日付(日)を取得
  function getNthMonday(year, month, n) {
    const firstDay = new Date(year, month - 1, 1).getDay(); // 1日の曜日
    let firstMonday = 1;
    if (firstDay !== 1) {
      firstMonday = firstDay === 0 ? 2 : 9 - firstDay;
    }
    return String(firstMonday + (n - 1) * 7).padStart(2, '0');
  }

  // 補助関数: YYYY-MM-DD フォーマット
  function formatDateYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 支払月(YYYY-MM)から「翌営業日の10日」を動的に算出する
  function calculatePaymentDate(monthStr) {
    const [year, month] = monthStr.split('-').map(Number);
    // 基準日：支払月（当月）の10日
    let paymentDate = new Date(year, month - 1, 10);

    let holidays = getJapaneseHolidays(year);
    if (month === 12) {
      // 12月支払の場合、翌営業日が翌年1月に入る可能性があるので翌年の祝日も取得
      holidays = holidays.concat(getJapaneseHolidays(year + 1));
    }
    const holidaySet = new Set(holidays.map(h => h.date));

    while (true) {
      const dayOfWeek = paymentDate.getDay();
      const dateStr = formatDateYMD(paymentDate);

      // 土曜日(6)、日曜日(0)、または祝日（振替休日含む）なら翌営業日へ繰り延べ
      if (dayOfWeek === 0 || dayOfWeek === 6 || holidaySet.has(dateStr)) {
        paymentDate.setDate(paymentDate.getDate() + 1);
      } else {
        break;
      }
    }
    return paymentDate;
  }

  function getPaymentMonthDefault(invoiceDateStr) {
    const d = new Date(invoiceDateStr);
    d.setMonth(d.getMonth() + 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthToDisplay(monthStr) {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-');
    return `${y}年${parseInt(m)}月`;
  }

  function monthToFiscalTitle(monthStr) {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-');
    const mi = parseInt(m);
    const fiscalYear = mi >= 4 ? parseInt(y) : parseInt(y) - 1;
    return `${fiscalYear}年度 請求管理表【${mi}月支払分】`;
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.style.cssText = 'min-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:fadeIn 0.3s;';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // 日本語あいうえお順ソート
  function sortByJapanese(a, b) {
    return (a || '').localeCompare(b || '', 'ja');
  }

  // 半角カタカナを全角カタカナに変換し、機種依存の括弧付き文字等を除去する
  function hankakuToZenkaku(str) {
    if (!str) return '';
    
    const map = {
      'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
      'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
      'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
      'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
      'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
      'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
      'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
      'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
      'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
      'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
      'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
      'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ', 'ｯ': 'ッ',
      'ｰ': 'ー', '  ': '　', ' ': ' ',
      'ﾞ': '゛', 'ﾟ': '゜'
    };
    
    const dakutenMap = {
      'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
      'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
      'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
      'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
      'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
      'ｳﾞ': 'ヴ'
    };
    
    let result = str;
    // 機種依存の括弧付き文字の除去
    result = result.replace(/[㈲㈱㈴㈵㈶㈷㈸㈹㈺㈻㈼㈽㈾㈿㉀㈜]/g, '');
    result = result.replace(/[(（](株|有|名|資|合|合資|合名|有資)[)）]/g, '');
    
    // まず濁点・半濁点の2文字の組み合わせを置換
    for (const [key, val] of Object.entries(dakutenMap)) {
      result = result.replace(new RegExp(key, 'g'), val);
    }
    // その後、個別の半角カナを置換
    let finalStr = '';
    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      finalStr += map[char] || char;
    }
    
    // ひらがなもカタカナに変換して統一する
    finalStr = finalStr.replace(/[\u3041-\u3096]/g, function(match) {
      return String.fromCharCode(match.charCodeAt(0) + 0x60);
    });

    return finalStr.trim();
  }

  // 会社のソート（kana優先、なければnameをクレンジングしてフォールバック）
  function sortByCompanyKana(a, b) {
    const kanaA = a.kana || hankakuToZenkaku(a.name) || '';
    const kanaB = b.kana || hankakuToZenkaku(b.name) || '';
    return sortByJapanese(kanaA, kanaB);
  }

  // ----------------------------------------------------------
  // デフォルトデータ
  // ----------------------------------------------------------
  const DEFAULT_DATA = {
    companies: [],
    sites: [],
    workTypes: [],
    invoices: [],
    settings: {
      companyName: '株式会社 パル設計',
      postalCode: '〒151-0051',
      address: '東京都渋谷区千駄ヶ谷3-25-9 DSⅣ 3F',
      tel: '03-6812-9196',
      fax: '03-6812-9197',
      invoiceNumber: 'T201230006251',
      taxRate: 10,
    },
  };

  // ----------------------------------------------------------
  // アプリケーション状態
  // ----------------------------------------------------------
  let appData = JSON.parse(JSON.stringify(DEFAULT_DATA));
  let currentListMonth = '';
  let editingCompanyId = null;
  let currentNoticeCompanyId = null;
  let currentNoticeMonth = null;
  let editingInvoiceId = null;

  // ----------------------------------------------------------
  // データ管理 (Google Apps Script + localStorage キャッシュ)
  // ----------------------------------------------------------
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbw6G6lXEqemHGSR6J5KrOS6zPX3SSKoo3__ZoxUQN32nquh_RWCEvOGZSa1I7RiBz0j2w/exec';
  const LS_KEY = 'invoiceTool_data';
  let syncTimeout = null;

  function updateConnectionStatus(status, message) {
    const statusEl = document.getElementById('data-status');
    if (!statusEl) return;
    const textEl = statusEl.querySelector('.status-text');
    statusEl.className = 'data-status ' + status;
    textEl.textContent = message;
  }

  async function loadFromCloud() {
    try {
      updateConnectionStatus('syncing', '読込中...');
      const res = await fetch(GAS_URL, { redirect: 'follow' });
      if (!res.ok) {
        console.error('Cloud load HTTP error:', res.status, res.statusText);
        updateConnectionStatus('disconnected', 'HTTP ' + res.status);
        return false;
      }
      const text = await res.text();
      console.log('Cloud response (first 200 chars):', text.substring(0, 200));
      const data = text ? JSON.parse(text) : {};
      if (data && data.error) {
        console.error('GAS error:', data.error);
        showToast('GASエラー: ' + data.error, 'error');
        updateConnectionStatus('disconnected', 'GASエラー');
        return false;
      }
      if (data && data.invoices && Array.isArray(data.invoices) && data.invoices.length > 0) {
        appData = data;
        if (!appData.companies) appData.companies = [];
        if (!appData.sites) appData.sites = [];
        if (!appData.workTypes) appData.workTypes = [];
        if (!appData.settings) appData.settings = { ...DEFAULT_DATA.settings };
        localStorage.setItem(LS_KEY, JSON.stringify(appData));
        updateConnectionStatus('connected', 'クラウド同期済');
        return true;
      }
      console.log('Cloud data empty or no invoices');
      return false;
    } catch (e) {
      console.error('Cloud load failed:', e.name, e.message);
      showToast('通信エラー: ' + e.message, 'error');
      updateConnectionStatus('disconnected', '通信エラー');
      return false;
    }
  }

  function loadFromLocalStorage() {
    try {
      const data = localStorage.getItem(LS_KEY);
      if (data) {
        appData = JSON.parse(data);
        if (!appData.companies) appData.companies = [];
        if (!appData.sites) appData.sites = [];
        if (!appData.workTypes) appData.workTypes = [];
        if (!appData.invoices) appData.invoices = [];
        if (!appData.settings) appData.settings = { ...DEFAULT_DATA.settings };
        return true;
      }
    } catch (e) {
      console.warn('localStorage load failed:', e);
    }
    return false;
  }

  function saveToFile() {
    // 1. localStorage に即時保存（高速レスポンス用）
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(appData));
    } catch (e) {
      console.warn('localStorage save failed:', e);
    }
    // 2. クラウドへのデバウンス同期（最後の変更から1.5秒後に送信）
    if (syncTimeout) clearTimeout(syncTimeout);
    updateConnectionStatus('syncing', '保存中...');
    syncTimeout = setTimeout(async () => {
      try {
        await fetch(GAS_URL, {
          method: 'POST',
          body: JSON.stringify(appData)
        });
        updateConnectionStatus('connected', 'クラウド同期済');
      } catch (e) {
        console.warn('Cloud save failed:', e);
        updateConnectionStatus('disconnected', '同期エラー');
      }
    }, 1500);
  }

  // ----------------------------------------------------------
  // タブナビゲーション
  // ----------------------------------------------------------
  function initTabs() {
    const buttons = document.querySelectorAll('.nav-item');
    const contents = document.querySelectorAll('.tab-content');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        buttons.forEach((b) => b.classList.remove('active'));
        contents.forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + tab).classList.add('active');

        // タブ切替時にデータリフレッシュ
        if (tab === 'list') refreshInvoiceList();
        if (tab === 'notice') refreshNoticeSection();
        if (tab === 'settings') refreshSettings();
      });
    });
  }

  // ----------------------------------------------------------
  // オートコンプリート
  // ----------------------------------------------------------
  function setupAutocomplete(inputId, listId, getItems) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    let selectedIndex = -1;

    input.addEventListener('input', () => {
      const val = input.value.trim().toLowerCase();
      const items = getItems();
      const filtered = val
        ? items.filter((item) => item.toLowerCase().includes(val))
        : items;

      renderSuggestions(filtered);
    });

    input.addEventListener('focus', () => {
      const val = input.value.trim().toLowerCase();
      const items = getItems();
      const filtered = val
        ? items.filter((item) => item.toLowerCase().includes(val))
        : items;
      if (filtered.length > 0) renderSuggestions(filtered);
    });

    input.addEventListener('keydown', (e) => {
      const items = list.querySelectorAll('.autocomplete-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        updateSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        updateSelection(items);
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        input.value = items[selectedIndex].textContent;
        hideSuggestions();
        input.dispatchEvent(new Event('change'));
      } else if (e.key === 'Escape') {
        hideSuggestions();
      }
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !list.contains(e.target)) {
        hideSuggestions();
      }
    });

    function renderSuggestions(filtered) {
      selectedIndex = -1;
      if (filtered.length === 0) {
        hideSuggestions();
        return;
      }
      list.innerHTML = filtered
        .map((item) => `<div class="autocomplete-item">${escapeHtml(item)}</div>`)
        .join('');
      list.classList.remove('hidden');

      list.querySelectorAll('.autocomplete-item').forEach((el) => {
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = el.textContent;
          hideSuggestions();
          input.dispatchEvent(new Event('change'));
        });
      });
    }

    function updateSelection(items) {
      items.forEach((el, i) => {
        el.classList.toggle('selected', i === selectedIndex);
      });
    }

    function hideSuggestions() {
      list.classList.add('hidden');
      list.innerHTML = '';
      selectedIndex = -1;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 現場名から省略名称を取得するヘルパー関数
  function getSiteShortName(siteName) {
    const found = appData.invoices.find((i) => i.siteName === siteName && i.siteShortName);
    return found ? found.siteShortName : siteName;
  }

  // ----------------------------------------------------------
  // 請求入力セクション
  // ----------------------------------------------------------
  function initInvoiceInput() {
    const form = document.getElementById('invoice-form');
    const dateInput = document.getElementById('input-date');
    const paymentInput = document.getElementById('input-payment-month');
    const amountInput = document.getElementById('input-amount');
    const companyInput = document.getElementById('input-company');

    // デフォルト日付を今日に
    dateInput.value = new Date().toISOString().split('T')[0];
    // 支払月を翌々月に
    paymentInput.value = getPaymentMonthDefault(dateInput.value);

    // 請求日変更で支払月を自動更新
    dateInput.addEventListener('change', () => {
      paymentInput.value = getPaymentMonthDefault(dateInput.value);
    });

    // 金額入力のフォーマット
    amountInput.addEventListener('blur', () => {
      const val = parseAmount(amountInput.value);
      if (val > 0) {
        amountInput.value = formatAmount(val);
      }
    });
    amountInput.addEventListener('focus', () => {
      const val = parseAmount(amountInput.value);
      if (val > 0) {
        amountInput.value = val;
      }
    });

    // オートコンプリート設定
    setupAutocomplete('input-company', 'company-suggestions', () =>
      [...appData.companies].sort(sortByCompanyKana).map((c) => c.name)
    );
    setupAutocomplete('input-site', 'site-suggestions', () =>
      [...new Set(appData.sites)].sort(sortByJapanese)
    );
    setupAutocomplete('input-work-type', 'work-suggestions', () =>
      [...new Set(appData.workTypes)].sort(sortByJapanese)
    );

    // 会社名変更時：新規会社ならモーダル表示 ＆ 業種と取引区分のスマート連携
    companyInput.addEventListener('change', () => {
      const name = companyInput.value.trim();
      if (!name) return;
      
      const foundCompany = appData.companies.find((c) => c.name === name);
      if (foundCompany) {
        // マスターの業種から、取引区分を自動推測してセット
        const ind = foundCompany.industry;
        if (ind === '外注') {
          categorySelect.value = 'outsource';
        } else if (ind === '資材') {
          categorySelect.value = 'material';
        } else if (ind === '経費') {
          categorySelect.value = 'expense';
        }
        handleCategoryChange(); // 区分切り替えを適用
      } else {
        openCompanyModal(name);
      }
    });

    // フォーム送信
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitInvoice();
    });

    // 現場名（正式）変更時：省略名の自動補完およびスマート提案
    const siteInput = document.getElementById('input-site');
    const siteShortInput = document.getElementById('input-site-short');
    
    const suggestSiteShortName = () => {
      const siteName = siteInput.value.trim();
      if (!siteName) return;
      
      // 過去データから省略名を探す（最新のものを優先）
      const found = appData.invoices.slice().reverse().find(
        (i) => i.siteName === siteName && i.siteShortName
      );
      
      if (found) {
        siteShortInput.value = found.siteShortName;
      } else {
        // 新規現場の場合のスマート推測
        let guess = siteName.replace(/[\(（].*?[\)）]/g, '').trim();
        guess = guess.replace(/(新築|改良|諸)?(工事|駅舎)$/, '');
        siteShortInput.value = guess || siteName;
      }
    };

    siteInput.addEventListener('change', suggestSiteShortName);
    siteInput.addEventListener('blur', suggestSiteShortName);

    // クリアボタン
    document.getElementById('btn-clear-form').addEventListener('click', clearInvoiceForm);

    // 編集キャンセルボタン
    document.getElementById('btn-cancel-edit').addEventListener('click', cancelInvoiceEdit);

    // 取引区分変更による工事内容入力の動的制御
    const categorySelect = document.getElementById('input-category');
    const groupWorkType = document.getElementById('group-work-type');
    const workTypeInput = document.getElementById('input-work-type');

    const handleCategoryChange = () => {
      const category = categorySelect.value;
      if (category === 'outsource') {
        // 外注: 工事内容を通常表示・活性化
        groupWorkType.classList.remove('hidden');
        workTypeInput.readOnly = false;
        workTypeInput.disabled = false;
        workTypeInput.required = true;
        if (workTypeInput.value === '資機材仕入') {
          workTypeInput.value = '';
        }
      } else if (category === 'material') {
        // 資機材: 工事内容に「資機材仕入」を自動セットし読み取り専用
        groupWorkType.classList.remove('hidden');
        workTypeInput.value = '資機材仕入';
        workTypeInput.readOnly = true;
        workTypeInput.disabled = false;
        workTypeInput.required = true;
      } else if (category === 'expense') {
        // 経費: 工事内容を非表示化・必須解除
        groupWorkType.classList.add('hidden');
        workTypeInput.value = '';
        workTypeInput.required = false;
      }
      checkDuplicateInvoice();
    };

    categorySelect.addEventListener('change', handleCategoryChange);

    // 重複チェック用入力監視イベント
    categorySelect.addEventListener('change', () => checkDuplicateInvoice());
    companyInput.addEventListener('change', () => checkDuplicateInvoice());
    siteInput.addEventListener('change', () => checkDuplicateInvoice());
    siteInput.addEventListener('blur', () => checkDuplicateInvoice());
    amountInput.addEventListener('change', () => checkDuplicateInvoice());
    amountInput.addEventListener('blur', () => checkDuplicateInvoice());
    dateInput.addEventListener('change', () => checkDuplicateInvoice());
    paymentInput.addEventListener('change', () => checkDuplicateInvoice());
  }

  function checkDuplicateInvoice(silent = false) {
    const companyName = document.getElementById('input-company').value.trim();
    const siteName = document.getElementById('input-site').value.trim();
    const amount = parseAmount(document.getElementById('input-amount').value);
    const invoiceDate = document.getElementById('input-date').value;
    const paymentMonth = document.getElementById('input-payment-month').value;
    
    const alertEl = document.getElementById('invoice-duplicate-alert');
    if (!alertEl) return false;
    
    if (!companyName || !siteName || !amount || !invoiceDate || !paymentMonth) {
      if (!silent) alertEl.classList.add('hidden');
      return false;
    }
    
    // 会社名からIDを引く
    const company = appData.companies.find((c) => c.name === companyName);
    if (!company) {
      if (!silent) alertEl.classList.add('hidden');
      return false;
    }
    
    // 重複をスキャン (編集中の自分自身は除外 ＆ 同じ請求月 ＆ 同じ支払月)
    const currentInvoiceMonth = invoiceDate.substring(0, 7); // YYYY-MM
    
    const duplicate = appData.invoices.find(
      (inv) => 
        inv.id !== editingInvoiceId && 
        inv.companyId === company.id && 
        inv.siteName === siteName && 
        inv.amount === amount &&
        inv.paymentMonth === paymentMonth &&
        (inv.invoiceDate || '').substring(0, 7) === currentInvoiceMonth
    );
    
    if (duplicate) {
      if (!silent) {
        alertEl.innerHTML = `⚠️ <strong>重複警告:</strong> 同一の請求月（<strong>${monthToDisplay(currentInvoiceMonth)}</strong>）および支払月（<strong>${monthToDisplay(paymentMonth)}分</strong>）で、同一現場・金額の請求データが既に登録されています。二重登録の可能性があります。`;
        alertEl.classList.remove('hidden');
      }
      return true;
    } else {
      if (!silent) {
        alertEl.classList.add('hidden');
      }
      return false;
    }
  }

  function submitInvoice() {
    const category = document.getElementById('input-category').value;
    const companyName = document.getElementById('input-company').value.trim();
    const siteName = document.getElementById('input-site').value.trim();
    const siteShortName = document.getElementById('input-site-short').value.trim();
    const invoiceDate = document.getElementById('input-date').value;
    const workType = document.getElementById('input-work-type').value.trim();
    const amount = parseAmount(document.getElementById('input-amount').value);
    const paymentMonth = document.getElementById('input-payment-month').value;
    const notes = document.getElementById('input-notes').value.trim();

    const isOutsourceOrMaterial = category === 'outsource' || category === 'material';
    if (!companyName || !siteName || !siteShortName || !invoiceDate || (isOutsourceOrMaterial && !workType) || !amount || !paymentMonth) {
      showToast('すべての必須項目を入力してください', 'error');
      return;
    }

    // 同一支払月・同一現場・同一金額の重複登録警告
    const isDuplicate = checkDuplicateInvoice(true);
    if (isDuplicate) {
      if (!confirm(`⚠️【重複登録警告】\n同じ会社・現場・金額の請求データが既に登録されています。\n本当にこのまま登録（または更新）しますか？`)) {
        return;
      }
    }

    // 会社が未登録なら簡易登録
    let company = appData.companies.find((c) => c.name === companyName);
    if (!company) {
      company = {
        id: generateId(),
        name: companyName,
        kana: hankakuToZenkaku(companyName),
        industry: '',
        postalCode: '',
        address: '',
        tel: '',
        fax: '',
        invoiceNumber: '',
        bankName: '',
        branchName: '',
        accountType: '普通',
        accountNumber: '',
        contactPerson: '',
        email: '',
      };
      appData.companies.push(company);
    }

    // 現場名・工事内容の記録 (経費でなければ工事内容もマスターに記録)
    if (!appData.sites.includes(siteName)) {
      appData.sites.push(siteName);
    }
    if (category !== 'expense' && workType && !appData.workTypes.includes(workType)) {
      appData.workTypes.push(workType);
    }

    if (editingInvoiceId) {
      // 既存の請求データを更新
      const invoice = appData.invoices.find((i) => i.id === editingInvoiceId);
      if (invoice) {
        invoice.companyId = company.id;
        invoice.siteName = siteName;
        invoice.siteShortName = siteShortName;
        invoice.category = category;
        invoice.invoiceDate = invoiceDate;
        invoice.workType = category === 'expense' ? '' : workType;
        invoice.amount = amount;
        invoice.paymentMonth = paymentMonth;
        invoice.notes = notes;
      }

      // 編集状態のクリア
      editingInvoiceId = null;
      document.getElementById('btn-submit-invoice').textContent = '登録';
      document.getElementById('invoice-edit-status').classList.add('hidden');
      document.getElementById('btn-cancel-edit').classList.add('hidden');

      saveToFile();
      clearInvoiceForm();
      refreshRecentInvoices();
      showToast(`${companyName} の請求を更新しました`);
    } else {
      // 請求データ新規追加
      const invoice = {
        id: generateId(),
        companyId: company.id,
        siteName,
        siteShortName,
        category,
        invoiceDate,
        workType: category === 'expense' ? '' : workType,
        amount,
        paymentMonth,
        notes,
        createdAt: new Date().toISOString(),
      };
      appData.invoices.push(invoice);

      saveToFile();
      clearInvoiceForm();
      refreshRecentInvoices();
      showToast(`${companyName} の請求を登録しました`);
    }
  }

  function clearInvoiceForm() {
    document.getElementById('input-category').value = 'outsource';
    document.getElementById('input-company').value = '';
    document.getElementById('input-site').value = '';
    document.getElementById('input-site-short').value = '';
    
    // 工事内容入力の表示状態を初期状態（活性化）にリセット
    const groupWorkType = document.getElementById('group-work-type');
    const workTypeInput = document.getElementById('input-work-type');
    groupWorkType.classList.remove('hidden');
    workTypeInput.value = '';
    workTypeInput.readOnly = false;
    workTypeInput.disabled = false;
    workTypeInput.required = true;

    document.getElementById('input-amount').value = '';
    document.getElementById('input-notes').value = '';
    const dateInput = document.getElementById('input-date');
    dateInput.value = new Date().toISOString().split('T')[0];
    document.getElementById('input-payment-month').value = getPaymentMonthDefault(dateInput.value);
    
    // 重複警告の非表示化
    const alertEl = document.getElementById('invoice-duplicate-alert');
    if (alertEl) alertEl.classList.add('hidden');
  }

  function refreshRecentInvoices() {
    const container = document.getElementById('recent-invoices');
    const recent = [...appData.invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);

    if (recent.length === 0) {
      container.innerHTML = '<p style="color:#64748B;text-align:center;padding:20px;">登録された請求はありません</p>';
      return;
    }

    let html = `<table class="data-table">
      <thead><tr>
        <th>会社名</th><th>現場名</th><th>区分</th><th>工事内容</th><th>請求日</th><th>金額</th><th>支払月</th><th>備考</th><th>操作</th>
      </tr></thead><tbody>`;

    recent.forEach((inv) => {
      const company = appData.companies.find((c) => c.id === inv.companyId);
      const categoryLabel = { outsource: '外注', material: '資機材', expense: '経費' }[inv.category || 'outsource'];
      html += `<tr>
        <td>${escapeHtml(company ? company.name : '不明')}</td>
        <td>${escapeHtml(inv.siteName)}</td>
        <td>${escapeHtml(categoryLabel)}</td>
        <td>${inv.category === 'expense' ? '<span style="color:#94A3B8">— (不要)</span>' : escapeHtml(inv.workType)}</td>
        <td>${formatDate(inv.invoiceDate)}</td>
        <td class="amount">${formatAmount(inv.amount)}</td>
        <td>${monthToDisplay(inv.paymentMonth)}</td>
        <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(inv.notes || '')}">
          ${escapeHtml(inv.notes || '—')}
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" data-edit-invoice="${inv.id}">編集</button>
          <button class="btn btn-danger btn-sm" data-delete-invoice="${inv.id}">削除</button>
        </td>
      </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // 編集ボタン
    container.querySelectorAll('[data-edit-invoice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        startInvoiceEdit(btn.dataset.editInvoice);
      });
    });

    // 削除ボタン
    container.querySelectorAll('[data-delete-invoice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('この請求を削除しますか？')) {
          // 削除対象が編集中なら編集状態を解除
          if (editingInvoiceId === btn.dataset.deleteInvoice) {
            cancelInvoiceEdit();
          }
          appData.invoices = appData.invoices.filter((i) => i.id !== btn.dataset.deleteInvoice);
          saveToFile();
          refreshRecentInvoices();
          showToast('請求を削除しました');
        }
      });
    });
  }

  function startInvoiceEdit(id) {
    const inv = appData.invoices.find((i) => i.id === id);
    if (!inv) return;

    editingInvoiceId = id;

    // 会社名取得
    const company = appData.companies.find((c) => c.id === inv.companyId);

    // フォームに値を復元
    document.getElementById('input-company').value = company ? company.name : '';
    document.getElementById('input-site').value = inv.siteName || '';
    document.getElementById('input-site-short').value = inv.siteShortName || inv.siteName || '';
    document.getElementById('input-date').value = inv.invoiceDate || '';
    document.getElementById('input-work-type').value = inv.workType || '';
    document.getElementById('input-amount').value = formatAmount(inv.amount) || '';
    document.getElementById('input-payment-month').value = inv.paymentMonth || '';
    document.getElementById('input-category').value = inv.category || 'outsource';
    document.getElementById('input-notes').value = inv.notes || '';
    
    // 取引区分に応じた工事内容欄の表示同期イベントを手動発火
    document.getElementById('input-category').dispatchEvent(new Event('change'));

    // UI更新
    document.getElementById('btn-submit-invoice').textContent = '更新';
    document.getElementById('invoice-edit-status').classList.remove('hidden');
    document.getElementById('btn-cancel-edit').classList.remove('hidden');

    // スムーズスクロール
    document.getElementById('invoice-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelInvoiceEdit() {
    editingInvoiceId = null;

    // UIリセット
    document.getElementById('btn-submit-invoice').textContent = '登録';
    document.getElementById('invoice-edit-status').classList.add('hidden');
    document.getElementById('btn-cancel-edit').classList.add('hidden');

    clearInvoiceForm();
    
    // 重複警告非表示化
    const alertEl = document.getElementById('invoice-duplicate-alert');
    if (alertEl) alertEl.classList.add('hidden');
  }

  // ----------------------------------------------------------
  // 会社マスターモーダル
  // ----------------------------------------------------------
  function initCompanyModal() {
    const modal = document.getElementById('company-modal');
    const form = document.getElementById('company-form');
    const nameInput = document.getElementById('company-name');
    const kanaInput = document.getElementById('company-kana');

    document.getElementById('btn-close-company-modal').addEventListener('click', closeCompanyModal);
    document.getElementById('btn-cancel-company').addEventListener('click', closeCompanyModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCompanyModal();
    });

    // 会社名が変更されたら、新規登録時に限りフリガナを自動提案する
    nameInput.addEventListener('input', () => {
      if (!editingCompanyId) {
        kanaInput.value = hankakuToZenkaku(nameInput.value);
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveCompany();
    });
  }

  function openCompanyModal(name, companyId) {
    const modal = document.getElementById('company-modal');
    const titleEl = document.getElementById('company-modal-title');
    editingCompanyId = companyId || null;

    if (companyId) {
      titleEl.textContent = '会社情報編集';
      const c = appData.companies.find((co) => co.id === companyId);
      if (c) {
        document.getElementById('company-name').value = c.name;
        document.getElementById('company-kana').value = c.kana || hankakuToZenkaku(c.name);
        document.getElementById('company-industry').value = c.industry || '';
        document.getElementById('company-postal').value = c.postalCode || '';
        document.getElementById('company-address').value = c.address || '';
        document.getElementById('company-tel').value = c.tel || '';
        document.getElementById('company-fax').value = c.fax || '';
        document.getElementById('company-invoice-num').value = c.invoiceNumber || '';
        document.getElementById('company-bank').value = c.bankName || '';
        document.getElementById('company-branch').value = c.branchName || '';
        document.getElementById('company-account-type').value = c.accountType || '普通';
        document.getElementById('company-account-num').value = c.accountNumber || '';
        document.getElementById('company-contact-person').value = c.contactPerson || '';
        document.getElementById('company-email').value = c.email || '';
      }
    } else {
      titleEl.textContent = '会社情報登録';
      document.getElementById('company-form').reset();
      document.getElementById('company-name').value = name || '';
      document.getElementById('company-kana').value = hankakuToZenkaku(name || '');
      document.getElementById('company-contact-person').value = '';
      document.getElementById('company-email').value = '';
    }

    modal.classList.remove('hidden');
  }

  function closeCompanyModal() {
    document.getElementById('company-modal').classList.add('hidden');
    editingCompanyId = null;
  }

  function saveCompany() {
    const name = document.getElementById('company-name').value.trim();
    const kana = document.getElementById('company-kana').value.trim();
    if (!name) {
      showToast('会社名を入力してください', 'error');
      return;
    }
    if (!kana) {
      showToast('フリガナを入力してください', 'error');
      return;
    }

    const companyData = {
      name,
      kana: hankakuToZenkaku(kana),
      industry: document.getElementById('company-industry').value,
      postalCode: document.getElementById('company-postal').value.trim(),
      address: document.getElementById('company-address').value.trim(),
      tel: document.getElementById('company-tel').value.trim(),
      fax: document.getElementById('company-fax').value.trim(),
      invoiceNumber: document.getElementById('company-invoice-num').value.trim(),
      bankName: document.getElementById('company-bank').value.trim(),
      branchName: document.getElementById('company-branch').value.trim(),
      accountType: document.getElementById('company-account-type').value,
      accountNumber: document.getElementById('company-account-num').value.trim(),
      contactPerson: document.getElementById('company-contact-person').value.trim(),
      email: document.getElementById('company-email').value.trim(),
    };

    if (editingCompanyId) {
      const idx = appData.companies.findIndex((c) => c.id === editingCompanyId);
      if (idx >= 0) {
        appData.companies[idx] = { ...appData.companies[idx], ...companyData };
      }
      showToast('会社情報を更新しました');
    } else {
      // 既存チェック
      const existing = appData.companies.find((c) => c.name === name);
      if (existing) {
        Object.assign(existing, companyData);
        showToast('会社情報を更新しました');
      } else {
        appData.companies.push({ id: generateId(), ...companyData });
        showToast('会社を登録しました');
      }
    }

    saveToFile();
    closeCompanyModal();
    refreshSettings();
  }

  // ----------------------------------------------------------
  // 請求一覧セクション（クロス集計表）
  // ----------------------------------------------------------
  function initInvoiceList() {
    const now = new Date();
    currentListMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    document.getElementById('btn-list-prev').addEventListener('click', () => {
      changeListMonth(-1);
    });
    document.getElementById('btn-list-next').addEventListener('click', () => {
      changeListMonth(1);
    });
    document.getElementById('btn-export-list-pdf').addEventListener('click', exportListToPdf);
    document.getElementById('btn-export-list-csv').addEventListener('click', exportListToCsv);

    refreshInvoiceList();
  }

  function changeListMonth(delta) {
    const [y, m] = currentListMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    currentListMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    refreshInvoiceList();
  }

  function refreshInvoiceList() {
    document.getElementById('list-month-display').textContent = monthToDisplay(currentListMonth);
    document.getElementById('list-title').textContent = monthToFiscalTitle(currentListMonth);

    const filtered = appData.invoices.filter((inv) => inv.paymentMonth === currentListMonth);

    const tableEl = document.getElementById('cross-table');
    const emptyEl = document.getElementById('list-empty');

    if (filtered.length === 0) {
      tableEl.style.display = 'none';
      emptyEl.classList.remove('hidden');
      return;
    }

    tableEl.style.display = '';
    emptyEl.classList.add('hidden');

    // 使われている現場名を収集
    const siteNames = [...new Set(filtered.map((i) => i.siteName))].sort(sortByJapanese);

    // 会社ごとにグループ化
    const companyMap = {};
    filtered.forEach((inv) => {
      if (!companyMap[inv.companyId]) {
        companyMap[inv.companyId] = {};
      }
      if (!companyMap[inv.companyId][inv.siteName]) {
        companyMap[inv.companyId][inv.siteName] = 0;
      }
      companyMap[inv.companyId][inv.siteName] += inv.amount;
    });

    // 会社情報取得・あいうえお順ソート
    const companyIds = Object.keys(companyMap);
    const companyInfos = companyIds.map((id) => {
      const c = appData.companies.find((co) => co.id === id);
      return { 
        id, 
        name: c ? c.name : '不明', 
        kana: c ? c.kana || hankakuToZenkaku(c.name) : 'フメイ',
        industry: c ? c.industry || '' : '' 
      };
    }).sort((a, b) => sortByJapanese(a.kana, b.kana));

    // ヘッダー行
    const thead = document.getElementById('cross-table-head');
    let headerHtml = '<tr><th>業者名</th><th>業種</th>';
    siteNames.forEach((site) => {
      headerHtml += `<th>${escapeHtml(getSiteShortName(site))}</th>`;
    });
    headerHtml += '<th>合計</th></tr>';
    thead.innerHTML = headerHtml;

    // ボディ行
    const tbody = document.getElementById('cross-table-body');
    let bodyHtml = '';
    const siteTotals = {};
    siteNames.forEach((s) => { siteTotals[s] = 0; });
    let grandTotal = 0;

    companyInfos.forEach((ci) => {
      const amounts = companyMap[ci.id];
      let rowTotal = 0;

      bodyHtml += `<tr>`;
      bodyHtml += `<td class="company-name-cell">${escapeHtml(ci.name)}</td>`;
      bodyHtml += `<td class="industry-cell">${escapeHtml(ci.industry)}</td>`;

      siteNames.forEach((site) => {
        const val = amounts[site] || 0;
        if (val > 0) {
          rowTotal += val;
          siteTotals[site] += val;
          bodyHtml += `<td class="amount-cell" data-company="${ci.id}" data-site="${escapeHtml(site)}">${formatAmount(val)}</td>`;
        } else {
          bodyHtml += `<td class="amount-cell"></td>`;
        }
      });

      grandTotal += rowTotal;
      bodyHtml += `<td class="amount-cell total-col">${formatAmount(rowTotal)}</td>`;
      bodyHtml += '</tr>';
    });

    // 合計行
    bodyHtml += '<tr class="total-row"><td>合計</td><td></td>';
    siteNames.forEach((site) => {
      bodyHtml += `<td class="amount-cell">${siteTotals[site] > 0 ? formatAmount(siteTotals[site]) : ''}</td>`;
    });
    bodyHtml += `<td class="amount-cell total-col">${formatAmount(grandTotal)}</td>`;
    bodyHtml += '</tr>';

    tbody.innerHTML = bodyHtml;

    // セルクリックで詳細表示
    tbody.querySelectorAll('.amount-cell[data-company]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const companyId = cell.dataset.company;
        const siteName = cell.dataset.site;
        showInvoiceDetail(companyId, siteName, currentListMonth);
      });
    });
  }

  function exportListToCsv() {
    const filtered = appData.invoices.filter((inv) => inv.paymentMonth === currentListMonth);
    if (filtered.length === 0) {
      showToast('出力するデータがありません', 'error');
      return;
    }

    // 使われている現場名を収集
    const siteNames = [...new Set(filtered.map((i) => i.siteName))].sort(sortByJapanese);

    // 会社ごとにグループ化
    const companyMap = {};
    filtered.forEach((inv) => {
      if (!companyMap[inv.companyId]) {
        companyMap[inv.companyId] = {};
      }
      if (!companyMap[inv.companyId][inv.siteName]) {
        companyMap[inv.companyId][inv.siteName] = 0;
      }
      companyMap[inv.companyId][inv.siteName] += inv.amount;
    });

    // 会社情報取得・あいうえお順ソート
    const companyIds = Object.keys(companyMap);
    const companyInfos = companyIds.map((id) => {
      const c = appData.companies.find((co) => co.id === id);
      return { 
        id, 
        name: c ? c.name : '不明', 
        kana: c ? c.kana || hankakuToZenkaku(c.name) : 'フメイ',
        industry: c ? c.industry || '' : '' 
      };
    }).sort((a, b) => sortByJapanese(a.kana, b.kana));

    // CSVの作成
    let csvContent = '';

    // ヘッダー行
    const headers = ['業者名', '業種', ...siteNames.map(getSiteShortName), '合計'];
    csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\r\n';

    // ボディ行
    const siteTotals = {};
    siteNames.forEach((s) => { siteTotals[s] = 0; });
    let grandTotal = 0;

    companyInfos.forEach((ci) => {
      const amounts = companyMap[ci.id];
      let rowTotal = 0;
      const row = [ci.name, ci.industry];

      siteNames.forEach((site) => {
        const val = amounts[site] || 0;
        rowTotal += val;
        siteTotals[site] += val;
        row.push(val > 0 ? val : '');
      });

      grandTotal += rowTotal;
      row.push(rowTotal);
      csvContent += row.map(v => typeof v === 'number' ? v : `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
    });

    // 合計行
    const totalRow = ['合計', ''];
    siteNames.forEach((site) => {
      totalRow.push(siteTotals[site] > 0 ? siteTotals[site] : '');
    });
    totalRow.push(grandTotal);
    csvContent += totalRow.map(v => typeof v === 'number' ? v : `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';

    // ダウンロード処理 (BOM付き UTF-8)
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    
    const [y, m] = currentListMonth.split('-');
    const fileName = `請求管理表_${y}年${m}月支払分.csv`;
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('CSVを出力しました');
  }

  function exportListToPdf() {
    const filtered = appData.invoices.filter((inv) => inv.paymentMonth === currentListMonth);

    if (filtered.length === 0) {
      showToast('出力するデータがありません', 'error');
      return;
    }

    showToast('PDF生成中...', 'info');

    // ── データ準備（refreshInvoiceList と同じロジック） ──
    const siteNames = [...new Set(filtered.map((i) => i.siteName))].sort(sortByJapanese);

    const companyMap = {};
    filtered.forEach((inv) => {
      if (!companyMap[inv.companyId]) companyMap[inv.companyId] = {};
      if (!companyMap[inv.companyId][inv.siteName]) companyMap[inv.companyId][inv.siteName] = 0;
      companyMap[inv.companyId][inv.siteName] += inv.amount;
    });

    const companyIds = Object.keys(companyMap);
    const companyInfos = companyIds.map((id) => {
      const c = appData.companies.find((co) => co.id === id);
      return { 
        id, 
        name: c ? c.name : '不明', 
        kana: c ? c.kana || hankakuToZenkaku(c.name) : 'フメイ',
        industry: c ? c.industry || '' : '' 
      };
    }).sort((a, b) => sortByJapanese(a.kana, b.kana));

    // ── スタイル定数 ──
    const colW = 110;
    const nameW = 140;
    const indW = 60;
    const bc = 'font-size:10px;padding:4px 6px;border:1px solid #9CA3AF;line-height:1.3;';
    const hc = bc + 'background:#1E293B;color:#fff;font-weight:600;text-align:center;white-space:normal;word-break:break-all;';

    // ── HTML文字列を直接構築（DOMクローンに依存しない） ──
    let h = '<div style="padding:10mm;background:#fff;font-family:sans-serif;color:#1E293B;">';

    // タイトル
    h += '<div style="font-size:20px;font-weight:700;text-align:center;margin-bottom:15px;border-bottom:2px solid #1E293B;padding-bottom:8px;">';
    h += escapeHtml(monthToFiscalTitle(currentListMonth));
    h += '</div>';

    // テーブル
    h += '<table style="border-collapse:collapse;table-layout:fixed;width:auto;">';

    // ヘッダー行
    h += '<thead><tr>';
    h += '<th style="' + hc + 'width:' + nameW + 'px;">業者名</th>';
    h += '<th style="' + hc + 'width:' + indW + 'px;">業種</th>';
    siteNames.forEach((site) => {
      h += '<th style="' + hc + 'width:' + colW + 'px;">' + escapeHtml(getSiteShortName(site)) + '</th>';
    });
    h += '<th style="' + hc + 'width:' + colW + 'px;">合計</th>';
    h += '</tr></thead>';

    // ボディ行
    h += '<tbody>';
    const siteTotals = {};
    siteNames.forEach((s) => { siteTotals[s] = 0; });
    let grandTotal = 0;

    companyInfos.forEach((ci) => {
      const amounts = companyMap[ci.id];
      let rowTotal = 0;

      h += '<tr>';
      h += '<td style="' + bc + 'font-weight:600;background:#F8FAFC;width:' + nameW + 'px;word-break:break-all;">' + escapeHtml(ci.name) + '</td>';
      h += '<td style="' + bc + 'background:#F8FAFC;text-align:center;width:' + indW + 'px;">' + escapeHtml(ci.industry) + '</td>';

      siteNames.forEach((site) => {
        const val = amounts[site] || 0;
        rowTotal += val;
        siteTotals[site] += val;
        h += '<td style="' + bc + 'text-align:right;width:' + colW + 'px;">' + (val > 0 ? formatAmount(val) : '') + '</td>';
      });

      grandTotal += rowTotal;
      h += '<td style="' + bc + 'font-weight:700;background:#F1F5F9;text-align:right;width:' + colW + 'px;">' + formatAmount(rowTotal) + '</td>';
      h += '</tr>';
    });

    // 合計行
    const tc = bc + 'font-weight:700;background:#F1F5F9;border-top:2px solid #1E293B;';
    h += '<tr>';
    h += '<td style="' + tc + 'width:' + nameW + 'px;">合計</td>';
    h += '<td style="' + tc + 'width:' + indW + 'px;"></td>';
    siteNames.forEach((site) => {
      h += '<td style="' + tc + 'text-align:right;width:' + colW + 'px;">' + (siteTotals[site] > 0 ? formatAmount(siteTotals[site]) : '') + '</td>';
    });
    h += '<td style="' + tc + 'text-align:right;width:' + colW + 'px;">' + formatAmount(grandTotal) + '</td>';
    h += '</tr>';

    h += '</tbody></table></div>';

    // ── PDF生成（HTML文字列を直接渡す） ──
    const [y, m] = currentListMonth.split('-');
    const fileName = `請求管理表_${y}年${m}月支払分.pdf`;

    const opt = {
      margin: 10,
      filename: fileName,
      image: { type: 'png', quality: 1.0 },
      html2canvas: { scale: 3, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' },
      pagebreak: { mode: ['avoid-all'] }
    };

    html2pdf().set(opt).from(h, 'string').save().then(() => {
      showToast('PDFを出力しました');
    }).catch((err) => {
      showToast('PDF生成に失敗しました: ' + err.message, 'error');
    });
  }

  function showInvoiceDetail(companyId, siteName, month) {
    const company = appData.companies.find((c) => c.id === companyId);
    const invoices = appData.invoices.filter(
      (i) => i.companyId === companyId && i.siteName === siteName && i.paymentMonth === month
    );

    if (invoices.length === 0) return;

    const modal = document.getElementById('invoice-modal');
    const content = document.getElementById('invoice-modal-content');

    let html = `<p style="margin-bottom:16px"><strong>${escapeHtml(company ? company.name : '不明')}</strong> ／ ${escapeHtml(siteName)}</p>`;
    html += `<table class="data-table"><thead><tr>
      <th>請求日</th><th>区分</th><th>工事内容</th><th>金額</th><th>備考</th><th>操作</th>
    </tr></thead><tbody>`;

    invoices.forEach((inv) => {
      const categoryLabel = { outsource: '外注', material: '資機材', expense: '経費' }[inv.category || 'outsource'];
      html += `<tr>
        <td>${formatDate(inv.invoiceDate)}</td>
        <td>${escapeHtml(categoryLabel)}</td>
        <td>${inv.category === 'expense' ? '<span style="color:#94A3B8">— (不要)</span>' : escapeHtml(inv.workType)}</td>
        <td class="amount">${formatAmount(inv.amount)}</td>
        <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(inv.notes || '')}">
          ${escapeHtml(inv.notes || '—')}
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" data-edit-inv="${inv.id}">編集</button>
            <button class="btn btn-danger btn-sm" data-del-inv="${inv.id}">削除</button>
          </div>
        </td>
      </tr>`;
    });

    html += '</tbody></table>';
    content.innerHTML = html;

    // 編集ボタン
    content.querySelectorAll('[data-edit-inv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.editInv;
        modal.classList.add('hidden'); // モーダルを閉じる

        // 請求入力タブをアクティブにする
        const inputTabBtn = document.querySelector('[data-tab="input"]');
        if (inputTabBtn) {
          inputTabBtn.click();
        }

        // 編集を開始する
        startInvoiceEdit(id);
      });
    });

    // 削除ボタン
    content.querySelectorAll('[data-del-inv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('この請求を削除しますか？')) {
          // 削除対象が編集中なら編集状態を解除
          if (editingInvoiceId === btn.dataset.delInv) {
            cancelInvoiceEdit();
          }
          appData.invoices = appData.invoices.filter((i) => i.id !== btn.dataset.delInv);
          saveToFile();
          refreshInvoiceList();
          modal.classList.add('hidden');
          showToast('請求を削除しました');
        }
      });
    });

    modal.classList.remove('hidden');
  }

  // ----------------------------------------------------------
  // 支払通知発行セクション
  // ----------------------------------------------------------
  function initPaymentNotice() {
    // 支払月変更イベント
    document.getElementById('notice-month').addEventListener('change', () => {
      renderNoticeCompanyList();
      // プレビューをクリア
      document.getElementById('notice-preview-container').classList.add('hidden');
      document.getElementById('notice-preview').innerHTML = '';
      currentNoticeCompanyId = null;
      currentNoticeMonth = null;
    });

    // 検索窓入力イベント（インクリメンタルサーチ）
    document.getElementById('notice-search').addEventListener('input', () => {
      const query = document.getElementById('notice-search').value.toLowerCase().trim();
      const rows = document.querySelectorAll('#notice-company-list tr');
      let visibleCount = 0;

      rows.forEach((row) => {
        const name = row.getAttribute('data-name').toLowerCase();
        const kana = row.getAttribute('data-kana').toLowerCase();
        if (name.includes(query) || kana.includes(query)) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      });

      const emptyEl = document.getElementById('notice-empty');
      if (visibleCount === 0 && rows.length > 0) {
        emptyEl.textContent = '検索条件に一致する業者はありません';
        emptyEl.classList.remove('hidden');
      } else if (rows.length === 0) {
        emptyEl.textContent = 'この月の支払い対象業者はありません';
        emptyEl.classList.remove('hidden');
      } else {
        emptyEl.classList.add('hidden');
      }
    });

    // プレビュー内のPDF出力ボタン
    document.getElementById('btn-generate-pdf').addEventListener('click', () => {
      if (currentNoticeCompanyId && currentNoticeMonth) {
        generatePdf(currentNoticeCompanyId, currentNoticeMonth);
      }
    });

    // デフォルト月を設定（今月）
    const now = new Date();
    document.getElementById('notice-month').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function refreshNoticeSection() {
    document.getElementById('notice-search').value = '';
    // プレビューをクリア
    document.getElementById('notice-preview-container').classList.add('hidden');
    document.getElementById('notice-preview').innerHTML = '';
    currentNoticeCompanyId = null;
    currentNoticeMonth = null;

    renderNoticeCompanyList();
  }

  // 支払い対象業者一覧テーブルの描画
  function renderNoticeCompanyList() {
    const month = document.getElementById('notice-month').value;
    const listBody = document.getElementById('notice-company-list');
    const emptyEl = document.getElementById('notice-empty');

    listBody.innerHTML = '';

    if (!month) {
      emptyEl.textContent = '支払月を選択してください';
      emptyEl.classList.remove('hidden');
      return;
    }

    // その月に支払いがある請求データをフィルタリング
    const monthInvoices = appData.invoices.filter((i) => i.paymentMonth === month);

    if (monthInvoices.length === 0) {
      emptyEl.textContent = 'この月の支払い対象業者はありません';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    // 業者ごとに集計
    const companySummary = {}; // companyId => { total: 0, count: 0 }
    monthInvoices.forEach((inv) => {
      if (!companySummary[inv.companyId]) {
        companySummary[inv.companyId] = { total: 0, count: 0 };
      }
      companySummary[inv.companyId].total += inv.amount;
      companySummary[inv.companyId].count += 1;
    });

    // 対象の業者オブジェクトをフリガナ順にソートして取得
    const activeCompanies = [];
    Object.keys(companySummary).forEach((companyId) => {
      const company = appData.companies.find((c) => c.id === companyId);
      if (company) {
        activeCompanies.push({
          ...company,
          totalAmount: companySummary[companyId].total,
          invoiceCount: companySummary[companyId].count
        });
      }
    });

    activeCompanies.sort(sortByCompanyKana);

    // テーブル行の生成
    activeCompanies.forEach((c) => {
      const statusKey = `payment_notice_status_${month}_${c.id}`;
      const isIssued = localStorage.getItem(statusKey) === 'issued';

      const tr = document.createElement('tr');
      tr.setAttribute('data-name', c.name || '');
      tr.setAttribute('data-kana', c.kana || '');

      tr.innerHTML = `
        <td>
          <span class="status-badge ${isIssued ? 'issued' : 'unissued'}">
            ${isIssued ? '発行済' : '未発行'}
          </span>
        </td>
        <td style="font-weight: 600;">${escapeHtml(c.name)}</td>
        <td class="amount">¥${formatAmount(c.totalAmount)}</td>
        <td class="text-center">${c.invoiceCount}</td>
        <td class="text-center">
          <button class="btn btn-secondary btn-sm btn-row-preview" data-id="${c.id}">プレビュー</button>
          <button class="btn btn-primary btn-sm btn-row-pdf" data-id="${c.id}">PDF出力</button>
        </td>
      `;

      // イベントリスナーの追加
      tr.querySelector('.btn-row-preview').addEventListener('click', (e) => {
        e.stopPropagation();
        previewNotice(c.id, month);
      });

      tr.querySelector('.btn-row-pdf').addEventListener('click', (e) => {
        e.stopPropagation();
        generatePdf(c.id, month);
      });

      listBody.appendChild(tr);
    });

    // 検索窓がすでに入力されている場合はフィルターを適用
    const query = document.getElementById('notice-search').value.toLowerCase().trim();
    if (query) {
      const rows = listBody.querySelectorAll('tr');
      let visibleCount = 0;
      rows.forEach((row) => {
        const name = row.getAttribute('data-name').toLowerCase();
        const kana = row.getAttribute('data-kana').toLowerCase();
        if (name.includes(query) || kana.includes(query)) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      });
      if (visibleCount === 0) {
        emptyEl.textContent = '検索条件に一致する業者はありません';
        emptyEl.classList.remove('hidden');
      }
    }
  }

  function previewNotice(companyId, month) {
    if (!companyId || !month) return;

    const company = appData.companies.find((c) => c.id === companyId);
    const invoices = appData.invoices.filter(
      (i) => i.companyId === companyId && i.paymentMonth === month
    );

    if (!company || invoices.length === 0) {
      showToast('該当するデータがありません', 'error');
      return;
    }

    currentNoticeCompanyId = companyId;
    currentNoticeMonth = month;

    const settings = appData.settings;
    const taxRate = settings.taxRate / 100;
    const today = new Date();

    // 支払月（年月）のパース
    const [py, pm] = month.split('-').map(Number);

    // 支払日（翌営業日10日）
    const paymentDate = calculatePaymentDate(month);
    const paymentDateStr = `${paymentDate.getFullYear()}/${String(paymentDate.getMonth() + 1).padStart(2, '0')}/${String(paymentDate.getDate()).padStart(2, '0')}`;

    // 明細計算
    let totalAmount = 0;
    let totalTaxExcluded = 0;
    let totalTax = 0;

    const details = invoices.map((inv) => {
      const tax = Math.floor(inv.amount * taxRate / (1 + taxRate));
      const taxExcluded = inv.amount - tax;
      totalAmount += inv.amount;
      totalTaxExcluded += taxExcluded;
      totalTax += tax;

      return {
        siteName: inv.siteName,
        workType: inv.workType,
        invoiceAmount: inv.amount,
        taxExcluded,
        tax,
        paymentAmount: inv.amount,
      };
    });

    // 振込先情報
    let bankInfo = '';
    if (company.bankName) {
      bankInfo = `${company.bankName}／${company.branchName || ''}　${company.accountType || '普通'}　${company.accountNumber || ''}`;
    }

    // プレビューHTML生成
    const previewContainer = document.getElementById('notice-preview-container');
    const preview = document.getElementById('notice-preview');

    let html = `
      <div class="notice-title">支 払 通 知 書</div>
      <div class="notice-header">
        <div class="notice-left">
          ${company.postalCode ? `<p>${escapeHtml(company.postalCode)}</p>` : ''}
          ${company.address ? `<p>${escapeHtml(company.address)}</p>` : ''}
          <p class="notice-company-name">${escapeHtml(company.name)} 御中</p>
          ${company.tel || company.fax ? `<p>${company.tel ? 'TEL ' + escapeHtml(company.tel) : ''}${company.tel && company.fax ? '　' : ''}${company.fax ? 'FAX ' + escapeHtml(company.fax) : ''}</p>` : ''}
          ${company.invoiceNumber ? `<p>登録番号 ${escapeHtml(company.invoiceNumber)}</p>` : ''}
        </div>
        <div class="notice-right">
          <p>発行日：${formatDate(today.toISOString().split('T')[0])}</p>
          <br>
          <p>${escapeHtml(settings.postalCode)}</p>
          <p>${escapeHtml(settings.address)}</p>
          <p class="notice-company-name">${escapeHtml(settings.companyName)}</p>
          <p>TEL ${escapeHtml(settings.tel)}　FAX ${escapeHtml(settings.fax)}</p>
          <p>登録番号 ${escapeHtml(settings.invoiceNumber)}</p>
        </div>
      </div>

      <div class="notice-message">
        <p>${py}年${pm}月の貴社へのお支払いは以下の通りですので、通知いたします。</p>
      </div>

      <table class="notice-summary-table">
        <thead><tr><th>支払日</th><th>支払額合計</th><th>振込先</th></tr></thead>
        <tbody><tr>
          <td>${paymentDateStr}</td>
          <td class="amount">¥${formatAmount(totalAmount)}</td>
          <td>${escapeHtml(bankInfo) || '—'}</td>
        </tr></tbody>
      </table>

      <div class="notice-detail-title">支払明細</div>

      <table class="notice-detail-table">
        <thead><tr>
          <th>現場名</th><th>工事内容</th><th>請求金額</th><th>内税額</th><th>消費税</th><th>支払金額</th>
        </tr></thead>
        <tbody>`;

    details.forEach((d) => {
      html += `<tr>
        <td>${escapeHtml(d.siteName)}</td>
        <td>${escapeHtml(d.workType)}</td>
        <td class="amount">${formatAmount(d.invoiceAmount)}</td>
        <td class="amount">${formatAmount(d.tax)}</td>
        <td class="amount">${settings.taxRate}%</td>
        <td class="amount">${formatAmount(d.paymentAmount)}</td>
      </tr>`;
    });

    html += `<tr class="total-row">
        <td>合計</td><td></td>
        <td class="amount">${formatAmount(totalAmount)}</td>
        <td class="amount">${formatAmount(totalTax)}</td>
        <td></td>
        <td class="amount">${formatAmount(totalAmount)}</td>
      </tr>`;

    html += '</tbody></table>';

    preview.innerHTML = html;
    previewContainer.classList.remove('hidden');
    previewContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function generatePdf(companyId, month) {
    if (!companyId || !month) {
      showToast('会社と支払月が指定されていません', 'error');
      return;
    }

    const company = appData.companies.find((c) => c.id === companyId);
    if (!company) {
      showToast('該当する会社が見つかりません', 'error');
      return;
    }

    const preview = document.getElementById('notice-preview');
    const previewContainer = document.getElementById('notice-preview-container');
    const originalHtml = preview.innerHTML;
    const isContainerOriginallyHidden = previewContainer.classList.contains('hidden');

    // プレビューのレンダリング
    previewNotice(companyId, month);

    const fileName = `支払通知書_${company.name}_${monthToDisplay(month)}.pdf`;

    // 元のスタイルを一時退避
    const originalBorder = preview.style.border;
    const originalMargin = preview.style.margin;
    const originalBoxShadow = preview.style.boxShadow;
    const originalWidth = preview.style.width;
    const originalHeight = preview.style.height;
    const originalMinHeight = preview.style.minHeight;
    const originalOverflow = preview.style.overflow;

    // PDF出力用にDOM要素のスタイルを一時的に変更（枠線・マージンを消去しサイズを確定）
    preview.style.border = 'none';
    preview.style.margin = '0';
    preview.style.boxShadow = 'none';
    preview.style.width = '210mm';
    preview.style.height = '296.8mm'; // 297mmよりわずかに小さくして2ページ目への溢れを防止
    preview.style.minHeight = '296.8mm';
    preview.style.overflow = 'hidden';

    const opt = {
      margin: 0,
      filename: fileName,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: { scale: 4, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all'] }
    };

    showToast('PDF生成中...', 'info');

    html2pdf().set(opt).from(preview).save().then(() => {
      // 成功時にスタイルを元に戻す
      preview.style.border = originalBorder;
      preview.style.margin = originalMargin;
      preview.style.boxShadow = originalBoxShadow;
      preview.style.width = originalWidth;
      preview.style.height = originalHeight;
      preview.style.minHeight = originalMinHeight;
      preview.style.overflow = originalOverflow;

      // もし元々プレビューしていなかったなら元の表示に戻す
      if (currentNoticeCompanyId !== companyId) {
        if (isContainerOriginallyHidden) {
          previewContainer.classList.add('hidden');
          preview.innerHTML = '';
        } else {
          preview.innerHTML = originalHtml;
        }
      }

      // 発行済みのステータスを localStorage に保存
      const statusKey = `payment_notice_status_${month}_${companyId}`;
      localStorage.setItem(statusKey, 'issued');

      // 業者一覧テーブルを更新
      renderNoticeCompanyList();

      showToast('PDFを出力しました');
    }).catch((err) => {
      console.error(err);
      // エラー時もスタイルを元に戻す
      preview.style.border = originalBorder;
      preview.style.margin = originalMargin;
      preview.style.boxShadow = originalBoxShadow;
      preview.style.width = originalWidth;
      preview.style.height = originalHeight;
      preview.style.minHeight = originalMinHeight;
      preview.style.overflow = originalOverflow;

      // 元の表示に戻す
      if (currentNoticeCompanyId !== companyId) {
        if (isContainerOriginallyHidden) {
          previewContainer.classList.add('hidden');
          preview.innerHTML = '';
        } else {
          preview.innerHTML = originalHtml;
        }
      }

      showToast('PDF生成に失敗しました: ' + err.message, 'error');
    });
  }

  // ----------------------------------------------------------
  // 設定セクション
  // ----------------------------------------------------------
  function initSettings() {
    const form = document.getElementById('settings-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      appData.settings.companyName = document.getElementById('settings-company-name').value.trim();
      appData.settings.postalCode = document.getElementById('settings-postal-code').value.trim();
      appData.settings.address = document.getElementById('settings-address').value.trim();
      appData.settings.tel = document.getElementById('settings-tel').value.trim();
      appData.settings.fax = document.getElementById('settings-fax').value.trim();
      appData.settings.invoiceNumber = document.getElementById('settings-invoice-number').value.trim();
      appData.settings.taxRate = parseInt(document.getElementById('settings-tax-rate').value) || 10;
      saveToFile();
      showToast('設定を保存しました');
    });

    document.getElementById('btn-add-company').addEventListener('click', () => {
      openCompanyModal('');
    });

    // エクスポート/インポート
    document.getElementById('btn-export-json').addEventListener('click', exportJson);
    document.getElementById('btn-import-json').addEventListener('click', () => {
      document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', importJson);
  }

  function refreshSettings() {
    const s = appData.settings;
    document.getElementById('settings-company-name').value = s.companyName || '';
    document.getElementById('settings-postal-code').value = s.postalCode || '';
    document.getElementById('settings-address').value = s.address || '';
    document.getElementById('settings-tel').value = s.tel || '';
    document.getElementById('settings-fax').value = s.fax || '';
    document.getElementById('settings-invoice-number').value = s.invoiceNumber || '';
    document.getElementById('settings-tax-rate').value = s.taxRate || 10;

    // 会社マスター一覧
    refreshCompanyMasterList();
  }

  function refreshCompanyMasterList() {
    const container = document.getElementById('company-master-list');
    const companies = [...appData.companies].sort(sortByCompanyKana);

    if (companies.length === 0) {
      container.innerHTML = '<p style="color:#64748B;text-align:center;padding:20px;">登録された会社はありません</p>';
      return;
    }

    let html = `<table class="data-table">
      <thead><tr>
        <th>会社名</th><th>フリガナ</th><th>業種</th><th>担当者</th><th>電話番号</th><th>銀行</th><th>操作</th>
      </tr></thead><tbody>`;

    companies.forEach((c) => {
      html += `<tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.kana || '—')}</td>
        <td>${escapeHtml(c.industry || '—')}</td>
        <td>${escapeHtml(c.contactPerson || '—')}</td>
        <td>${escapeHtml(c.tel || '—')}</td>
        <td>${escapeHtml(c.bankName ? `${c.bankName}/${c.branchName || ''}` : '—')}</td>
        <td>
          <button class="btn btn-secondary btn-sm" data-edit-company="${c.id}">編集</button>
          <button class="btn btn-danger btn-sm" data-delete-company="${c.id}" style="margin-left:4px">削除</button>
        </td>
      </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // イベント
    container.querySelectorAll('[data-edit-company]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openCompanyModal(null, btn.dataset.editCompany);
      });
    });

    container.querySelectorAll('[data-delete-company]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = appData.companies.find((co) => co.id === btn.dataset.deleteCompany);
        if (c && confirm(`「${c.name}」を削除しますか？\n関連する請求データも削除されます。`)) {
          appData.invoices = appData.invoices.filter((i) => i.companyId !== c.id);
          appData.companies = appData.companies.filter((co) => co.id !== c.id);
          saveToFile();
          refreshCompanyMasterList();
          showToast(`${c.name} を削除しました`);
        }
      });
    });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `請求管理データ_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('データをエクスポートしました');
  }

  function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.invoices && data.companies) {
          appData = data;
          if (!appData.sites) appData.sites = [];
          if (!appData.workTypes) appData.workTypes = [];
          if (!appData.settings) appData.settings = { ...DEFAULT_DATA.settings };
          saveToFile();
          refreshAll();
          showToast('データをインポートしました');
        } else {
          showToast('無効なデータ形式です', 'error');
        }
      } catch (err) {
        showToast('JSONの解析に失敗しました', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ----------------------------------------------------------
  // 請求詳細モーダル
  // ----------------------------------------------------------
  function initInvoiceModal() {
    const modal = document.getElementById('invoice-modal');
    document.getElementById('btn-close-invoice-modal').addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  // ----------------------------------------------------------
  // 全体リフレッシュ
  // ----------------------------------------------------------
  function refreshAll() {
    refreshRecentInvoices();
    refreshInvoiceList();
    refreshNoticeSection();
    refreshSettings();
  }

  // ----------------------------------------------------------
  // 初期化
  // ----------------------------------------------------------
  async function init() {
    initTabs();
    initInvoiceInput();
    initCompanyModal();
    initInvoiceModal();
    initInvoiceList();
    initPaymentNotice();
    initSettings();

    // まずローカルキャッシュからデータを読み込んで即座に表示（高速起動）
    const localLoaded = loadFromLocalStorage();
    if (localLoaded) refreshAll();

    // クラウド（GAS）から最新データを取得
    const cloudLoaded = await loadFromCloud();

    if (!cloudLoaded) {
      // クラウドが空 or 通信エラーの場合
      if (!appData.invoices || appData.invoices.length === 0) {
        // ローカルにもデータがない → 初期データをdata.jsonから読み込み
        try {
          const res = await fetch('data.json');
          const initialData = await res.json();
          if (initialData && initialData.invoices) {
            appData = initialData;
            saveToFile(); // クラウドにもアップロード
          }
        } catch (e) {
          console.warn('Initial data load failed:', e);
        }
      } else {
        // ローカルにデータがあるがクラウドが空 → クラウドにアップロード
        saveToFile();
      }
    }

    refreshAll();
  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
