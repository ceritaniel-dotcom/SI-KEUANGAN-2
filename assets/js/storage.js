
// ============================================================
// SI-KEUANGAN
// Local Storage + Google Sheets Synchronization
// ============================================================

const CLOUD_API_URL =
    'https://script.google.com/macros/s/AKfycbzncLsSEqx2Wj3ZQvwJfTfu_hnrVqRQscRnAxP4FOgEgxKIPJ5t9b7k7YI3IYeKYZcISQ/exec';

const STORAGE_KEYS = {
    TRANSACTIONS: 'si_keuangan_transactions_v1',
    LIMITS: 'si_keuangan_limits_v1',
    MIGRATION_DONE: 'si_keuangan_cloud_migration_v1',
    PENDING_SYNC: 'si_keuangan_pending_sync_v1'
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

// Tidak menggunakan transaksi contoh.
const INITIAL_TRANSACTIONS = [];

// ============================================================
// STATUS SINKRONISASI
// ============================================================

let cloudSyncReady = false;
let cloudWriteTimer = null;
let cloudRefreshTimer = null;
let cloudWriteInFlight = false;
let cloudRefreshInFlight = false;

// ============================================================
// LOCAL STORAGE
// ============================================================

function getTransactions() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);

        if (!raw) return [];

        const data = JSON.parse(raw);

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Gagal membaca transaksi lokal:', error);
        return [];
    }
}

function saveTransactions(list) {
    const safeList = Array.isArray(list) ? list : [];

    localStorage.setItem(
        STORAGE_KEYS.TRANSACTIONS,
        JSON.stringify(safeList)
    );

    scheduleCloudSave();
}

function getLimits() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.LIMITS);

        if (!raw) return { ...DEFAULT_LIMITS };

        const data = JSON.parse(raw);

        return {
            ...DEFAULT_LIMITS,
            ...(data && typeof data === 'object' ? data : {})
        };
    } catch (error) {
        console.error('Gagal membaca batas anggaran:', error);
        return { ...DEFAULT_LIMITS };
    }
}

function saveLimits(limitsObj) {
    const safeLimits = {
        ...DEFAULT_LIMITS,
        ...(limitsObj || {})
    };

    localStorage.setItem(
        STORAGE_KEYS.LIMITS,
        JSON.stringify(safeLimits)
    );

    scheduleCloudSave();
}

// ============================================================
// STATUS UI
// ============================================================

function setSyncStatus(message, type = 'normal') {
    let el = document.getElementById('cloud-sync-status');

    if (!el) {
        el = document.createElement('div');
        el.id = 'cloud-sync-status';

        el.style.cssText = `
            position: fixed;
            right: 12px;
            bottom: 76px;
            z-index: 1080;
            background: #fff;
            border: 1px solid #dee2e6;
            border-radius: 20px;
            padding: 7px 12px;
            font-size: 11px;
            color: #495057;
            box-shadow: 0 2px 8px rgba(0,0,0,.08);
            max-width: 85vw;
        `;

        document.body.appendChild(el);
    }

    el.textContent = `☁ ${message}`;

    if (type === 'success') {
        el.style.color = '#198754';
    } else if (type === 'error') {
        el.style.color = '#dc3545';
    } else {
        el.style.color = '#495057';
    }
}

// ============================================================
// JSONP REQUEST - MEMBACA GOOGLE SHEETS
// ============================================================

function jsonpRequest(params) {
    return new Promise((resolve, reject) => {
        const callbackName =
            `siKeuanganCallback_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2)}`;

        const script = document.createElement('script');

        let completed = false;

        const timeout = setTimeout(() => {
            finish(new Error('Waktu koneksi ke Google Sheets habis.'));
        }, 20000);

        function finish(error, data) {
            if (completed) return;

            completed = true;

            clearTimeout(timeout);

            try {
                delete window[callbackName];
            } catch (_) {
                window[callbackName] = undefined;
            }

            script.remove();

            if (error) {
                reject(error);
            } else {
                resolve(data);
            }
        }

        window[callbackName] = data => {
            finish(null, data);
        };

        const query = new URLSearchParams({
            ...params,
            callback: callbackName,
            _: Date.now()
        });

        script.onerror = () => {
            finish(new Error('Tidak dapat menghubungi Google Sheets.'));
        };

        script.src = `${CLOUD_API_URL}?${query.toString()}`;

        document.head.appendChild(script);
    });
}

// ============================================================
// AMBIL DATA CLOUD
// ============================================================

async function getCloudData() {
    const response = await jsonpRequest({
        action: 'getAll'
    });

    if (!response || response.success === false) {
        throw new Error(
            response?.message || 'Respons Google Sheets tidak valid.'
        );
    }

    return {
        transactions: Array.isArray(response.transactions)
            ? response.transactions
            : [],

        limits:
            response.limits &&
            typeof response.limits === 'object'
                ? {
                    ...DEFAULT_LIMITS,
                    ...response.limits
                }
                : { ...DEFAULT_LIMITS }
    };
}

// ============================================================
// KIRIM DATA KE GOOGLE SHEETS
// ============================================================

async function postCloudData(transactions, limits) {
    const payload = {
        action: 'saveAll',
        transactions: transactions,
        limits: limits
    };

    // Mode no-cors tidak dapat membaca respons server.
    // Karena itu, keberhasilan harus diverifikasi dengan membaca
    // ulang data Google Sheets.
    return fetch(CLOUD_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
    });
}

// ============================================================
// PENDING SYNC
// ============================================================

function getPendingSync() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.PENDING_SYNC);

        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error('Gagal membaca pending sync:', error);
        return null;
    }
}

function setPendingSync(transactions, limits) {
    const payload = {
        transactions,
        limits,
        createdAt: Date.now()
    };

    localStorage.setItem(
        STORAGE_KEYS.PENDING_SYNC,
        JSON.stringify(payload)
    );

    return payload;
}

function clearPendingSync() {
    localStorage.removeItem(STORAGE_KEYS.PENDING_SYNC);
}

function createSnapshot(data) {
    return JSON.stringify({
        transactions: data.transactions,
        limits: data.limits
    });
}

function getLocalSnapshot() {
    return createSnapshot({
        transactions: getTransactions(),
        limits: getLimits()
    });
}

// ============================================================
// JADWALKAN PENYIMPANAN CLOUD
// ============================================================

function scheduleCloudSave() {
    if (!cloudSyncReady) return;

    // Simpan salinan yang menunggu sinkronisasi ke localStorage.
    // Jika halaman ditutup sebelum cloud selesai, data ini tetap ada.
    const transactions = getTransactions();
    const limits = getLimits();

    setPendingSync(transactions, limits);

    clearTimeout(cloudWriteTimer);

    setSyncStatus('Menunggu sinkronisasi...');

    cloudWriteTimer = setTimeout(() => {
        flushCloudSave();
    }, 1000);
}

// ============================================================
// KIRIM DATA YANG MENUNGGU
// ============================================================

async function flushCloudSave() {
    if (!cloudSyncReady || cloudWriteInFlight) return;

    const pending = getPendingSync();

    if (!pending) return;

    // Jangan mengirim snapshot lama jika data lokal sudah berubah.
    const currentSnapshot = getLocalSnapshot();

    const pendingSnapshot = createSnapshot(pending);

    if (currentSnapshot !== pendingSnapshot) {
        setPendingSync(getTransactions(), getLimits());
    }

    const latestPending = getPendingSync();

    if (!latestPending) return;

    cloudWriteInFlight = true;

    setSyncStatus('Mengirim data ke Google Sheets...');

    try {
        await postCloudData(
            latestPending.transactions,
            latestPending.limits
        );

        // Jangan menghapus pending di sini.
        // POST no-cors tidak membuktikan bahwa server sudah menyimpan data.
        setSyncStatus('Data dikirim, sedang memverifikasi...');

        setTimeout(() => {
            refreshCloudData();
        }, 2500);

    } catch (error) {
        console.error('Gagal mengirim data:', error);

        setSyncStatus(
            'Gagal mengirim. Data tetap aman di perangkat.',
            'error'
        );

    } finally {
        cloudWriteInFlight = false;
    }
}

// ============================================================
// TERAPKAN DATA CLOUD KE LOKAL
// ============================================================

function applyCloudData(cloud) {
    localStorage.setItem(
        STORAGE_KEYS.TRANSACTIONS,
        JSON.stringify(cloud.transactions)
    );

    localStorage.setItem(
        STORAGE_KEYS.LIMITS,
        JSON.stringify({
            ...DEFAULT_LIMITS,
            ...cloud.limits
        })
    );

    window.dispatchEvent(
        new CustomEvent('si-keuangan-cloud-updated')
    );
}

// ============================================================
// REFRESH / SINKRONISASI CLOUD
// ============================================================

async function refreshCloudData({ initial = false } = {}) {
    if (cloudRefreshInFlight || cloudWriteInFlight) return;

    cloudRefreshInFlight = true;

    try {
        const cloud = await getCloudData();

        const cloudSnapshot = createSnapshot(cloud);

        const localTransactions = getTransactions();
        const localLimits = getLimits();

        const localTransactionsRaw =
            localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);

        const localLimitsRaw =
            localStorage.getItem(STORAGE_KEYS.LIMITS);

        const migrationDone =
            localStorage.getItem(STORAGE_KEYS.MIGRATION_DONE) === 'yes';

        const pending = getPendingSync();

        const cloudHasTransactions = cloud.transactions.length > 0;

        const localHasTransactions = localTransactions.length > 0;

        // ----------------------------------------------------
        // 1. ADA DATA YANG BELUM TERVERIFIKASI?
        // ----------------------------------------------------

        if (pending) {
            const pendingSnapshot = createSnapshot(pending);

            // Jika data cloud sudah sama dengan data yang dikirim,
            // sinkronisasi dinyatakan berhasil.
            if (cloudSnapshot === pendingSnapshot) {
                clearPendingSync();

                localStorage.setItem(
                    STORAGE_KEYS.MIGRATION_DONE,
                    'yes'
                );

                if (getLocalSnapshot() !== cloudSnapshot) {
                    applyCloudData(cloud);
                }

                setSyncStatus('Data berhasil tersimpan dan terverifikasi.', 'success');

                return;
            }

            // Jika belum sama, pertahankan data lokal.
            // Jangan biarkan data cloud yang belum diperbarui
            // menghapus transaksi yang baru diinput.
            setSyncStatus('Menunggu konfirmasi penyimpanan cloud...');

            if (!cloudWriteInFlight) {
                setTimeout(() => {
                    flushCloudSave();
                }, 1500);
            }

            return;
        }

        // ----------------------------------------------------
        // 2. MIGRASI PERTAMA DARI LAPTOP
        // ----------------------------------------------------

        const hasLocalStorage =
            localTransactionsRaw !== null ||
            localLimitsRaw !== null;

        if (!migrationDone && hasLocalStorage && (
            localHasTransactions || localLimitsRaw !== null
        )) {
            // Data lokal laptop adalah sumber awal.
            // Kirim ke cloud, jangan langsung ditimpa cloud.
            setPendingSync(localTransactions, localLimits);

            setSyncStatus('Migrasi data laptop ke Google Sheets...');

            setTimeout(() => {
                flushCloudSave();
            }, 500);

            return;
        }

        // ----------------------------------------------------
        // 3. CLOUD KOSONG, LOKAL BERISI DATA
        // ----------------------------------------------------

        if (!cloudHasTransactions && localHasTransactions) {
            // Perlindungan utama:
            // cloud kosong tidak boleh menghapus data lokal.
            setPendingSync(localTransactions, localLimits);

            setSyncStatus('Cloud kosong. Mengamankan data lokal...');

            setTimeout(() => {
                flushCloudSave();
            }, 500);

            return;
        }

        // ----------------------------------------------------
        // 4. CLOUD SUDAH BERISI DATA
        // ----------------------------------------------------

        if (cloudHasTransactions || !hasLocalStorage) {
            const oldSnapshot = getLocalSnapshot();

            if (oldSnapshot !== cloudSnapshot) {
                applyCloudData(cloud);
            }

            localStorage.setItem(
                STORAGE_KEYS.MIGRATION_DONE,
                'yes'
            );

            setSyncStatus('Terhubung dan data tersinkronisasi.', 'success');

            return;
        }

        // ----------------------------------------------------
        // 5. KEDUA PENYIMPANAN KOSONG
        // ----------------------------------------------------

        if (!localHasTransactions && !cloudHasTransactions) {
            localStorage.setItem(
                STORAGE_KEYS.LIMITS,
                JSON.stringify({
                    ...DEFAULT_LIMITS,
                    ...cloud.limits
                })
            );

            localStorage.setItem(
                STORAGE_KEYS.MIGRATION_DONE,
                'yes'
            );

            setSyncStatus('Terhubung ke Google Sheets.', 'success');
        }

    } catch (error) {
        console.error('Sinkronisasi gagal:', error);

        setSyncStatus(
            'Tidak terhubung. Data lokal tetap tersimpan.',
            'error'
        );

    } finally {
        cloudRefreshInFlight = false;
    }
}

// ============================================================
// INISIALISASI SINKRONISASI
// ============================================================

async function initializeCloudSync() {
    if (cloudSyncReady) return;

    setSyncStatus('Menghubungkan ke Google Sheets...');

    await refreshCloudData({ initial: true });

    cloudSyncReady = true;

    // Jika ada data yang belum selesai dikirim,
    // lanjutkan setelah koneksi siap.
    if (getPendingSync()) {
        setTimeout(() => {
            flushCloudSave();
        }, 1000);
    }

    if (cloudRefreshTimer) {
        clearInterval(cloudRefreshTimer);
    }

    // Periksa perubahan dari perangkat lain setiap 30 detik.
    cloudRefreshTimer = setInterval(() => {
        refreshCloudData();
    }, 30000);

    // Periksa kembali saat pengguna kembali ke tab aplikasi.
    window.addEventListener('focus', () => {
        refreshCloudData();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refreshCloudData();
        }
    });
}
