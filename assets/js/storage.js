// SI-KEUANGAN — penyimpanan lokal + sinkronisasi Google Sheets.
// URL Web App yang diberikan pengguna.
const CLOUD_API_URL = 'https://script.google.com/macros/s/AKfycbzncLsSEqx2Wj3ZQvwJfTfu_hnrVqRQscRnAxP4FOgEgxKIPJ5t9b7k7YI3IYeKYZcISQ/exec';

const STORAGE_KEYS = {
    TRANSACTIONS: 'si_keuangan_transactions_v1',
    LIMITS: 'si_keuangan_limits_v1',
    MIGRATION_DONE: 'si_keuangan_cloud_migration_v1'
};

const DEFAULT_LIMITS = {
    'MAKAN': 1080000,
    'ROKOK': 0,
    'INTERNET': 150000,
    'JAJAN': 150000,
    'ALAT KEBERSIHAN': 70000,
    'KASI MAMA': 350000,
    'BPJS': 72000,
    'LAINNYA': 70000
};

// Data contoh hanya dipakai jika belum ada data lokal maupun data cloud.
const INITIAL_TRANSACTIONS = [];
let cloudSyncReady = false;
let cloudWriteTimer = null;
let cloudRefreshTimer = null;
let cloudWritePending = false;
let lastCloudSnapshot = '';

function getTransactions() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.error('Gagal membaca transaksi lokal:', error);
        return [];
    }
}

function saveTransactions(list) {
    const safeList = Array.isArray(list) ? list : [];
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(safeList));
    scheduleCloudSave();
}

function getLimits() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.LIMITS);
        return raw ? { ...DEFAULT_LIMITS, ...JSON.parse(raw) } : { ...DEFAULT_LIMITS };
    } catch (error) {
        console.error('Gagal membaca batas anggaran:', error);
        return { ...DEFAULT_LIMITS };
    }
}

function saveLimits(limitsObj) {
    localStorage.setItem(STORAGE_KEYS.LIMITS, JSON.stringify(limitsObj || DEFAULT_LIMITS));
    scheduleCloudSave();
}

function jsonpRequest(params) {
    return new Promise((resolve, reject) => {
        const callbackName = `siKeuanganCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement('script');
        const timeout = setTimeout(() => finish(new Error('Waktu koneksi ke Google Sheets habis.')), 20000);
        function finish(error, data) {
            clearTimeout(timeout);
            try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
            script.remove();
            if (error) reject(error); else resolve(data);
        }
        window[callbackName] = data => finish(null, data);
        const query = new URLSearchParams({ ...params, callback: callbackName, _: Date.now() });
        script.onerror = () => finish(new Error('Tidak dapat menghubungi Google Sheets.'));
        script.src = `${CLOUD_API_URL}?${query.toString()}`;
        document.head.appendChild(script);
    });
}

async function getCloudData() {
    const response = await jsonpRequest({ action: 'getAll' });
    if (!response || response.success === false) {
        throw new Error(response?.message || 'Respons Google Sheets tidak valid.');
    }
    return {
        transactions: Array.isArray(response.transactions) ? response.transactions : [],
        limits: response.limits && typeof response.limits === 'object' ? response.limits : { ...DEFAULT_LIMITS }
    };
}

function postCloudData(transactions, limits) {
    // no-cors digunakan karena Apps Script Web App tidak menyediakan CORS standar.
    // Mode ini tidak mengizinkan browser membaca respons; status sinkronisasi ditampilkan sebagai proses pengiriman.
    return fetch(CLOUD_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'saveAll',
            transactions: transactions,
            limits: limits
        })
    });
}

function scheduleCloudSave() {
    if (!cloudSyncReady) return;
    cloudWritePending = true;
    clearTimeout(cloudWriteTimer);
    cloudWriteTimer = setTimeout(async () => {
        const transactions = getTransactions();
        const limits = getLimits();
        const snapshot = JSON.stringify({ transactions, limits });
        try {
            await postCloudData(transactions, limits);
            lastCloudSnapshot = snapshot;
            cloudWritePending = false;
            setSyncStatus('Terkirim ke Google Sheets.');
        } catch (error) {
            console.error('Gagal mengirim data ke cloud:', error);
            setSyncStatus('Gagal mengirim. Periksa koneksi internet.');
        }
    }, 700);
}

function setSyncStatus(message) {
    let el = document.getElementById('cloud-sync-status');
    if (!el) {
        el = document.createElement('div');
        el.id = 'cloud-sync-status';
        el.style.cssText = 'position:fixed;right:12px;bottom:76px;z-index:1080;background:#fff;border:1px solid #dee2e6;border-radius:20px;padding:6px 11px;font-size:11px;color:#495057;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:80vw';
        document.body.appendChild(el);
    }
    el.textContent = `☁ ${message}`;
}

async function refreshCloudData({ initial = false } = {}) {
    if (cloudWritePending) return;
    try {
        const cloud = await getCloudData();
        const cloudSnapshot = JSON.stringify(cloud);
        if (cloudSnapshot === lastCloudSnapshot && !initial) return;

        const localTransactionsRaw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        const migrationDone = localStorage.getItem(STORAGE_KEYS.MIGRATION_DONE) === 'yes';
        const localTransactions = getTransactions();
        const cloudHasData = cloud.transactions.length > 0;

        // Migrasi satu kali: jika database cloud masih kosong, ambil data laptop yang sudah tersimpan.
        if (!migrationDone && !cloudHasData && localTransactionsRaw && localTransactions.length > 0) {
            const localLimits = getLimits();
            await postCloudData(localTransactions, localLimits);
            localStorage.setItem(STORAGE_KEYS.MIGRATION_DONE, 'yes');
            lastCloudSnapshot = JSON.stringify({ transactions: localTransactions, limits: localLimits });
            setSyncStatus('Data laptop dikirim ke Google Sheets.');
            return;
        }

        // Jika cloud sudah berisi data, cloud menjadi sumber utama untuk perangkat ini.
        if (cloudHasData || migrationDone || !localTransactionsRaw) {
            localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(cloud.transactions));
            localStorage.setItem(STORAGE_KEYS.LIMITS, JSON.stringify({ ...DEFAULT_LIMITS, ...cloud.limits }));
            localStorage.setItem(STORAGE_KEYS.MIGRATION_DONE, 'yes');
            lastCloudSnapshot = cloudSnapshot;
            if (!initial) window.dispatchEvent(new CustomEvent('si-keuangan-cloud-updated'));
        } else {
            // Ada data lokal, tetapi status migrasi belum jelas: jangan menimpa data laptop.
            localStorage.setItem(STORAGE_KEYS.LIMITS, JSON.stringify({ ...DEFAULT_LIMITS, ...cloud.limits }));
        }
        setSyncStatus('Terhubung ke Google Sheets.');
    } catch (error) {
        console.error('Sinkronisasi Google Sheets gagal:', error);
        setSyncStatus('Belum terhubung. Data tetap tersimpan di perangkat ini.');
    }
}

async function initializeCloudSync() {
    setSyncStatus('Menghubungkan ke Google Sheets…');
    await refreshCloudData({ initial: true });
    cloudSyncReady = true;
    if (cloudRefreshTimer) clearInterval(cloudRefreshTimer);
    cloudRefreshTimer = setInterval(() => refreshCloudData(), 30000);
    window.addEventListener('focus', () => refreshCloudData());
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshCloudData();
    });
}
