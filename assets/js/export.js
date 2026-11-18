// Isi dropdown tahun secara dinamis berdasarkan data transaksi + tahun saat ini
function populateYearFilter() {
    const selectTahun = document.getElementById('filter-tahun');
    const currentYear = new Date().getFullYear().toString();
    const years = new Set([currentYear]);

    getTransactions().forEach(t => {
        if (t.tanggal) years.add(t.tanggal.substring(0, 4));
    });

    const sortedYears = Array.from(years).sort().reverse();
    selectTahun.innerHTML = '<option value="ALL">Semua Tahun</option>';
    sortedYears.forEach(y => {
        selectTahun.innerHTML += `<option value="${y}">${y}</option>`;
    });
}

// Ambil data sesuai filter Tanggal / Bulan / Tahun
function getFilteredTransactions() {
    const fTanggal = document.getElementById('filter-tanggal').value;
    const fBulan = document.getElementById('filter-bulan').value;
    const fTahun = document.getElementById('filter-tahun').value;

    return getTransactions().filter(t => {
        if (fTanggal && t.tanggal !== fTanggal) return false;
        if (fBulan !== 'ALL' && t.tanggal.substring(5, 7) !== fBulan) return false;
        if (fTahun !== 'ALL' && t.tanggal.substring(0, 4) !== fTahun) return false;
        return true;
    });
}

// Render Tabel Laporan
function renderLaporan() {
    const data = getFilteredTransactions();
    const tbody = document.getElementById('tbody-laporan');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-4">
                    <i class="bi bi-inbox fs-4 d-block mb-1"></i>
                    Tidak ada data transaksi pada filter yang dipilih.
                </td>
            </tr>
        `;
        return;
    }

    data.forEach((t, index) => {
        const badgeJenis = t.jenis
            ? `<span class="badge bg-dark badge-kategori">${t.jenis}</span>`
            : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center">${index + 1}</td>
            <td class="text-center">${formatTanggalID(t.tanggal)}</td>
            <td class="fw-semibold">${t.sumber || '-'}</td>
            <td class="text-end text-success fw-semibold">${t.nominalPemasukan ? formatRupiah(t.nominalPemasukan) : '-'}</td>
            <td class="text-end text-danger">${t.langsungBayar ? formatRupiah(t.langsungBayar) : '-'}</td>
            <td class="text-end text-warning fw-semibold">${t.hutangDulu ? formatRupiah(t.hutangDulu) : '-'}</td>
            <td>${t.keterangan}</td>
            <td class="text-center">${badgeJenis}</td>
            <td class="text-center">
                <button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteTransaction(${t.id})" title="Hapus">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function resetFilter() {
    document.getElementById('filter-tanggal').value = '';
    document.getElementById('filter-bulan').value = 'ALL';
    document.getElementById('filter-tahun').value = 'ALL';
    renderLaporan();
}

// Unduh File Excel (.xlsx) dengan Struktur Kolom Persis Seperti Gambar
function exportToExcel() {
    const data = getFilteredTransactions();
    if (data.length === 0) {
        alert('Tidak ada data untuk diunduh pada filter ini.');
        return;
    }

    // Header bertingkat sesuai tabel Rekap Pemasukan & Pengeluaran
    const worksheetData = [
        ['REKAP PEMASUKAN & PENGELUARAN'],
        ['NO', 'HARI', 'PEMASUKAN', '', 'PENGELUARAN', '', '', ''],
        ['', '', 'SUMBER', 'NOMINAL (Rp)', 'LANGSUNG BAYAR (Rp)', 'HUTANG DULU (Rp)', 'KETERANGAN', 'JENIS TRANSAKSI']
    ];

    data.forEach((t, idx) => {
        worksheetData.push([
            idx + 1,
            formatTanggalID(t.tanggal),
            t.sumber || '',
            t.nominalPemasukan || '',
            t.langsungBayar || '',
            t.hutangDulu || '',
            t.keterangan,
            t.jenis || ''
        ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Penggabungan sel (Merge Cells) header Excel
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // Judul utama
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }, // NO
        { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }, // HARI
        { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } }, // PEMASUKAN
        { s: { r: 1, c: 4 }, e: { r: 1, c: 7 } }  // PENGELUARAN
    ];

    // Lebar kolom otomatis
    ws['!cols'] = [
        { wch: 5 },
        { wch: 13 },
        { wch: 18 },
        { wch: 16 },
        { wch: 20 },
        { wch: 18 },
        { wch: 42 },
        { wch: 20 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Keuangan');

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Laporan_SI_KEUANGAN_${today}.xlsx`);
}

// Konversi format tanggal DD/MM/YYYY atau serial Excel menjadi YYYY-MM-DD
function parseExcelDateToISO(val) {
    if (!val) return '';

    // Jika Excel menyimpan tanggal sebagai angka serial
    if (typeof val === 'number') {
        const dateObj = XLSX.SSF.parse_date_code(val);
        if (dateObj) {
            const y = dateObj.y;
            const m = String(dateObj.m).padStart(2, '0');
            const d = String(dateObj.d).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }

    const str = String(val).trim();
    // Format DD/MM/YYYY atau DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
        const d = dmyMatch[1].padStart(2, '0');
        const m = dmyMatch[2].padStart(2, '0');
        const y = dmyMatch[3];
        return `${y}-${m}-${d}`;
    }

    // Format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }

    return '';
}

// Bersihkan format angka/Rupiah menjadi integer murni
function parseNominalExcel(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const cleaned = String(val).replace(/[^0-9\-]/g, '');
    return Number(cleaned) || 0;
}

// Fungsi Import Data dari File Excel (.xlsx / .xls)
function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Ubah sheet menjadi array 2 dimensi
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            const importedList = [];
            let baseId = Date.now();

            // Baca baris mulai dari baris ke-4 (indeks 3) ke bawah, melewati baris header
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const isoDate = parseExcelDateToISO(row[1]); // Kolom B = HARI

                // Lewati baris jika kolom tanggal tidak valid (misal baris judul/header)
                if (!isoDate) continue;

                const sumber = String(row[2] || '').trim().toUpperCase();
                const nominalPemasukan = parseNominalExcel(row[3]);
                const langsungBayar = parseNominalExcel(row[4]);
                const hutangDulu = parseNominalExcel(row[5]);
                const keterangan = String(row[6] || '').trim().toUpperCase();
                const jenis = String(row[7] || '').trim().toUpperCase();

                // Tentukan tipe transaksi otomatis
                const isPemasukan = nominalPemasukan > 0 && langsungBayar === 0 && hutangDulu === 0;

                if (nominalPemasukan === 0 && langsungBayar === 0 && hutangDulu === 0) continue;

                importedList.push({
                    id: baseId++,
                    tanggal: isoDate,
                    tipe: isPemasukan ? 'PEMASUKAN' : 'PENGELUARAN',
                    sumber: isPemasukan ? (sumber || 'LAIN LAIN') : '',
                    nominalPemasukan: isPemasukan ? nominalPemasukan : 0,
                    langsungBayar: !isPemasukan ? langsungBayar : 0,
                    hutangDulu: !isPemasukan ? hutangDulu : 0,
                    keterangan: keterangan || '-',
                    jenis: !isPemasukan ? (jenis || 'LAINNYA') : ''
                });
            }

            if (importedList.length === 0) {
                alert('Tidak ada data transaksi valid yang ditemukan. Pastikan format kolom Excel sesuai dengan template Unduh Excel.');
                event.target.value = '';
                return;
            }

            // Konfirmasi apakah data lama digabung atau ditimpa
            const isReplace = confirm(
                `Ditemukan ${importedList.length} transaksi dari Excel.\n\n` +
                `Klik OK untuk MENGGABUNGKAN dengan data yang ada sekarang.\n` +
                `Klik Cancel untuk MENIMPA (hapus data lama & ganti dengan data Excel).`
            );

            let finalData = isReplace ? [...getTransactions(), ...importedList] : importedList;
            finalData.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

            saveTransactions(finalData);
            populateYearFilter();
            renderLaporan();
            renderDashboard();

            alert(`Berhasil mengimpor ${importedList.length} data transaksi.`);
        } catch (err) {
            console.error(err);
            alert('Gagal membaca file Excel. Pastikan file berformat .xlsx atau .xls yang valid.');
        } finally {
            // Reset input file agar file yang sama bisa dipilih ulang jika diperlukan
            event.target.value = '';
        }
    };

    reader.readAsArrayBuffer(file);
}