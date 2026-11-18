let budgetChart = null;

// Mapping Ikon Bootstrap per Kategori (Menyesuaikan tampilan gambar referensi)
const CATEGORY_ICONS = {
    'MAKAN': 'bi-egg-fried',
    'ROKOK': 'bi-fire',
    'INTERNET': 'bi-wifi',
    'JAJAN': 'bi-cup-straw',
    'ALAT KEBERSIHAN': 'bi-droplet-fill',
    'KASI MAMA': 'bi-heart-fill',
    'BPJS': 'bi-hospital-fill',
    'LAINNYA': 'bi-box-seam',
    'PELUNASAN HUTANG': 'bi-check-circle'
};

// Format Rupiah
function formatRupiah(angka) {
    const isMinus = angka < 0;
    const absVal = Math.abs(angka);
    const formatted = new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(absVal);
    return (isMinus ? '-Rp ' : 'Rp ') + formatted;
}

// Format YYYY-MM-DD menjadi DD/MM/YYYY
function formatTanggalID(isoDate) {
    if (!isoDate) return '-';
    const parts = isoDate.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Navigasi Tab (Sinkron untuk Top Bar Desktop & Bottom Bar HP)
function switchTab(tabName) {
    // Sembunyikan semua section & tampilkan section aktif
    document.querySelectorAll('.app-section').forEach(sec => sec.classList.add('d-none'));
    document.getElementById(`section-${tabName}`).classList.remove('d-none');

    // Update status aktif menu Desktop
    document.querySelectorAll('#navbarDesktop .nav-link').forEach(link => link.classList.remove('active'));
    const desktopNav = document.getElementById(`nav-desktop-${tabName}`);
    if (desktopNav) desktopNav.classList.add('active');

    // Update status aktif menu Bottom Bar HP
    document.querySelectorAll('.btn-bottom-nav').forEach(btn => btn.classList.remove('active'));
    const mobileNav = document.getElementById(`nav-mobile-${tabName}`);
    if (mobileNav) mobileNav.classList.add('active');

    // Scroll otomatis ke atas saat pindah tab
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabName === 'home') { refreshCloudData(); renderDashboard(); }
    if (tabName === 'laporan') {
        refreshCloudData();
        populateYearFilter();
        renderLaporan();
    }
}

// Toggle Form Pemasukan vs Pengeluaran
function toggleFormMode() {
    const isPemasukan = document.getElementById('tipe-pemasukan').checked;
    document.getElementById('group-pemasukan').classList.toggle('d-none', !isPemasukan);
    document.getElementById('group-pengeluaran').classList.toggle('d-none', isPemasukan);
}

// Update batas limit langsung dari kapsul input di tabel dashboard
function updateInlineLimit(category, newValue) {
    const limits = getLimits();
    limits[category] = Math.max(0, Number(newValue) || 0);
    saveLimits(limits);
    renderDashboard();
}

// Render Home Dashboard Bulan Berjalan
function renderDashboard() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentPrefix = `${currentYear}-${currentMonth}`;

    const namaBulan = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    document.getElementById('label-bulan-berjalan').textContent = `Periode Aktif: ${namaBulan}`;

    const allTx = getTransactions();
    const monthlyTx = allTx.filter(t => t.tanggal.startsWith(currentPrefix));
    const limits = getLimits();

    let totalPemasukan = 0;
    let totalLangsungBayar = 0;
    let totalHutangBulanIni = 0;
    let totalPelunasanHutang = 0;
    let realisasiPengeluaranKategori = 0;

    const spentPerCategory = {};
    Object.keys(limits).forEach(cat => spentPerCategory[cat] = 0);

    monthlyTx.forEach(t => {
        if (t.tipe === 'PEMASUKAN') {
            totalPemasukan += Number(t.nominalPemasukan || 0);
        } else {
            const lb = Number(t.langsungBayar || 0);
            const hd = Number(t.hutangDulu || 0);
            const totalItem = lb + hd;

            totalLangsungBayar += lb;
            totalHutangBulanIni += hd;

            if (t.jenis === 'PELUNASAN HUTANG') {
                totalPelunasanHutang += totalItem;
            } else {
                realisasiPengeluaranKategori += totalItem;
                if (spentPerCategory.hasOwnProperty(t.jenis)) {
                    spentPerCategory[t.jenis] += totalItem;
                } else {
                    spentPerCategory['LAINNYA'] += totalItem;
                }
            }
        }
    });

    const rencanaPengeluaran = Object.values(limits).reduce((acc, val) => acc + Number(val), 0);
    const saldoAkhir = totalPemasukan - totalLangsungBayar;

    // Update Kartu Ringkasan
    document.getElementById('dash-pemasukan').textContent = formatRupiah(totalPemasukan);
    document.getElementById('dash-rencana').textContent = formatRupiah(rencanaPengeluaran);
    document.getElementById('dash-realisasi').textContent = formatRupiah(realisasiPengeluaranKategori);
    document.getElementById('dash-hutang-sekarang').textContent = formatRupiah(totalHutangBulanIni);
    document.getElementById('dash-pelunasan').textContent = formatRupiah(totalPelunasanHutang);
    document.getElementById('dash-saldo').textContent = formatRupiah(saldoAkhir);
    document.getElementById('dash-langsung-bayar').textContent = formatRupiah(totalLangsungBayar);
    // Update Kartu Ringkasan
    document.getElementById('dash-pemasukan').textContent = formatRupiah(totalPemasukan);
    document.getElementById('dash-langsung-bayar-card').textContent = formatRupiah(totalLangsungBayar);
    document.getElementById('dash-rencana').textContent = formatRupiah(rencanaPengeluaran);
    document.getElementById('dash-realisasi').textContent = formatRupiah(realisasiPengeluaranKategori);
    document.getElementById('dash-hutang-sekarang').textContent = formatRupiah(totalHutangBulanIni);
    document.getElementById('dash-pelunasan').textContent = formatRupiah(totalPelunasanHutang);
    document.getElementById('dash-saldo').textContent = formatRupiah(saldoAkhir);
    document.getElementById('dash-langsung-bayar').textContent = formatRupiah(totalLangsungBayar);

    // Status Peringatan Sistem
    const badgePeringatan = document.getElementById('badge-peringatan');
    if (realisasiPengeluaranKategori <= rencanaPengeluaran && saldoAkhir >= 0) {
        badgePeringatan.className = 'badge bg-success py-2 px-3 rounded-pill shadow-sm';
        badgePeringatan.innerHTML = '<i class="bi bi-shield-check me-1"></i> BAJET MASIH AMAN';
    } else {
        badgePeringatan.className = 'badge bg-danger py-2 px-3 rounded-pill shadow-sm';
        badgePeringatan.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-1"></i> MELEBIHI BAJET / SALDO MINUS';
    }

    // Render Tabel Kategori Modern (Ikon Kotak Biru + Kapsul Input + Progress Bar)
    const tbodyLimit = document.getElementById('tbody-limit-dashboard');
    tbodyLimit.innerHTML = '';

    const labelsChart = [];
    const dataLimitChart = [];
    const dataSpentChart = [];

    Object.keys(limits).forEach(cat => {
        const maxLimit = Number(limits[cat]);
        const spent = spentPerCategory[cat] || 0;
        const sisa = maxLimit - spent;
        const iconClass = CATEGORY_ICONS[cat] || 'bi-tag-fill';

        // Hitung persentase progress bar
        let pct = 0;
        if (maxLimit > 0) {
            pct = Math.min(100, Math.round((spent / maxLimit) * 100));
        } else if (spent > 0) {
            pct = 100;
        }
        const barColor = sisa < 0 ? 'bg-danger' : 'bg-primary';

        labelsChart.push(cat);
        dataLimitChart.push(maxLimit);
        dataSpentChart.push(spent);

        const statusClass = sisa < 0 ? 'limit-minus' : 'limit-aman';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-3">
                <div class="d-flex align-items-center gap-2">
                    <div class="cat-icon-box">
                        <i class="bi ${iconClass}"></i>
                    </div>
                    <span class="fw-bold text-dark small">${cat}</span>
                </div>
            </td>
            <td>
                <div class="limit-pill-group">
                    <span class="limit-pill-prefix">Rp</span>
                    <input type="number" class="limit-pill-input" value="${maxLimit}" min="0" onchange="updateInlineLimit('${cat}', this.value)">
                </div>
            </td>
            <td>
                <div class="fw-bold text-dark small">${formatRupiah(spent)}</div>
                <div class="mini-progress">
                    <div class="progress-bar ${barColor}" style="width: ${pct}%"></div>
                </div>
            </td>
            <td class="text-end pe-3 small ${statusClass}">${formatRupiah(sisa)}</td>
        `;
        tbodyLimit.appendChild(tr);
    });

    // Tambahkan baris informasi Pelunasan Hutang di bagian bawah tabel (seperti di gambar referensi)
    const trPelunasan = document.createElement('tr');
    trPelunasan.className = 'table-light';
    trPelunasan.innerHTML = `
        <td class="ps-3">
            <div class="d-flex align-items-center gap-2">
                <div class="cat-icon-box">
                    <i class="bi ${CATEGORY_ICONS['PELUNASAN HUTANG']}"></i>
                </div>
                <span class="fw-bold text-dark small">PELUNASAN HUTANG</span>
            </div>
        </td>
        <td class="text-muted small">Non-Limit</td>
        <td>
            <div class="fw-bold text-dark small">${formatRupiah(totalPelunasanHutang)}</div>
            <div class="mini-progress">
                <div class="progress-bar bg-info" style="width: ${totalPelunasanHutang > 0 ? 100 : 0}%"></div>
            </div>
        </td>
        <td class="text-end pe-3 small text-muted">-</td>
    `;
    tbodyLimit.appendChild(trPelunasan);

    renderChart(labelsChart, dataLimitChart, dataSpentChart);
}

// Render Grafik Chart.js
function renderChart(labels, limitData, spentData) {
    const ctx = document.getElementById('chartPengeluaran').getContext('2d');
    if (budgetChart) {
        budgetChart.destroy();
    }

    budgetChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Batas Maksimal (Rp)',
                    data: limitData,
                    backgroundColor: 'rgba(13, 110, 253, 0.25)',
                    borderColor: 'rgba(13, 110, 253, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Pengeluaran (Rp)',
                    data: spentData,
                    backgroundColor: 'rgba(220, 53, 69, 0.75)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Submit Form Input Transaksi
document.getElementById('form-transaksi').addEventListener('submit', function (e) {
    e.preventDefault();

    const tanggal = document.getElementById('input-tanggal').value;
    const isPemasukan = document.getElementById('tipe-pemasukan').checked;
    const nominal = Number(document.getElementById('input-nominal').value);
    const keterangan = document.getElementById('input-keterangan').value.trim().toUpperCase();

    const newTx = {
        id: Date.now(),
        tanggal: tanggal,
        tipe: isPemasukan ? 'PEMASUKAN' : 'PENGELUARAN',
        sumber: isPemasukan ? document.getElementById('input-sumber').value : '',
        nominalPemasukan: isPemasukan ? nominal : 0,
        langsungBayar: (!isPemasukan && document.getElementById('input-metode').value === 'LANGSUNG BAYAR') ? nominal : 0,
        hutangDulu: (!isPemasukan && document.getElementById('input-metode').value === 'HUTANG DULU') ? nominal : 0,
        keterangan: keterangan,
        jenis: isPemasukan ? '' : document.getElementById('input-jenis').value
    };

    const list = getTransactions();
    list.push(newTx);
    list.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    saveTransactions(list);

    this.reset();
    document.getElementById('input-tanggal').valueAsDate = new Date();
    toggleFormMode();
    alert('Transaksi berhasil disimpan.');
    switchTab('home');
});

// Hapus Transaksi Satuan
function deleteTransaction(id) {
    if (!confirm('Hapus transaksi ini?')) return;
    const updated = getTransactions().filter(t => t.id !== id);
    saveTransactions(updated);
    renderLaporan();
    renderDashboard();
}

// Hapus Semua Data
function resetAllData() {
    if (!confirm('Semua data transaksi akan dihapus permanen. Lanjutkan?')) return;
    saveTransactions([]);
    renderLaporan();
    renderDashboard();
}

// Inisialisasi: ambil database cloud dahulu, kemudian render aplikasi.
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('input-tanggal').valueAsDate = new Date();
    await initializeCloudSync();
    renderDashboard();
    window.addEventListener('si-keuangan-cloud-updated', () => {
        renderDashboard();
        if (!document.getElementById('section-laporan').classList.contains('d-none')) {
            populateYearFilter();
            renderLaporan();
        }
    });
});