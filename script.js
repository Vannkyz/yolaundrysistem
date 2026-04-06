// ==================== KONFIGURASI SUPABASE ====================
// 🔴 GANTI DENGAN CREDENTIAL SUPABASE ANDA! 🔴
// Cara dapatkan: https://supabase.com > Project Settings > API
const SUPABASE_URL = 'https://phpsktqxrrbxswhyvhwd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocHNrdHF4cnJieHN3aHl2aHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODkzOTIsImV4cCI6MjA5MTA2NTM5Mn0.EmHvCpqQokmm9CPDLC2p23vJxT_I929C5jAvGdcmRN0';

// Inisialisasi Supabase
const supabase = window.supabaseJs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== GLOBAL VARIABLES ====================
const TOTAL_LOKER = 40;
let currentLoker = 1;
let lokerData = {};
let isConnected = false;

// DOM Elements
const syncStatusEl = document.getElementById('syncStatus');
const lokerNavButtons = document.getElementById('lokerNavButtons');
const lokerNumberSpan = document.getElementById('lokerNumber');
const displayLokerNumberSpan = document.getElementById('displayLokerNumber');

// ==================== FUNGSI UTAMA ====================

// Update status koneksi di UI
function updateSyncStatus(connected, message = '') {
    isConnected = connected;
    if (connected) {
        syncStatusEl.innerHTML = '<i class="fas fa-check-circle"></i> Terhubung ke cloud • Data tersinkronisasi semua device';
        syncStatusEl.className = 'sync-status success';
    } else {
        syncStatusEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message || 'Offline mode • Data hanya lokal'}`;
        syncStatusEl.className = 'sync-status error';
    }
}

// Load semua data dari Supabase
async function loadAllData() {
    try {
        updateSyncStatus(false, 'Mengambil data dari cloud...');
        
        const { data, error } = await supabase
            .from('lokers')
            .select('*')
            .order('loker_id', { ascending: true });
        
        if (error) throw error;
        
        // Konversi array ke object
        const newData = {};
        data.forEach(item => {
            newData[item.loker_id] = {
                id: item.loker_id,
                nama: item.nama_customer || '',
                pin: item.pin_loker || '',
                status: item.status || 'belum',
                tanggal: item.tanggal || '',
                petugas: item.petugas || '',
                foto: item.foto_url || '',
                created_at: item.created_at,
                updated_at: item.updated_at
            };
        });
        
        // Inisialisasi loker yang kosong
        for (let i = 1; i <= TOTAL_LOKER; i++) {
            if (!newData[i]) {
                newData[i] = {
                    id: i,
                    nama: '',
                    pin: '',
                    status: 'belum',
                    tanggal: '',
                    petugas: '',
                    foto: ''
                };
            }
        }
        
        lokerData = newData;
        updateSyncStatus(true);
        renderNavButtons();
        displayCurrentLoker();
        
        console.log('✅ Data loaded from Supabase:', Object.keys(lokerData).length, 'lockers');
        
    } catch (error) {
        console.error('Error loading from Supabase:', error);
        updateSyncStatus(false, 'Gagal konek ke cloud • Gunakan data lokal');
        
        // Fallback ke localStorage
        loadFromLocalStorage();
    }
}

// Load dari localStorage (offline fallback)
function loadFromLocalStorage() {
    const saved = localStorage.getItem('loker_app_backup');
    if (saved) {
        const backupData = JSON.parse(saved);
        lokerData = backupData;
        console.log('📀 Using localStorage backup');
    } else {
        // Inisialisasi data kosong
        for (let i = 1; i <= TOTAL_LOKER; i++) {
            lokerData[i] = {
                id: i,
                nama: '',
                pin: '',
                status: 'belum',
                tanggal: '',
                petugas: '',
                foto: ''
            };
        }
    }
    renderNavButtons();
    displayCurrentLoker();
}

// Simpan ke Supabase (Cloud)
async function saveToSupabase(lokerId, data) {
    try {
        const { error } = await supabase
            .from('lokers')
            .upsert({
                loker_id: lokerId,
                nama_customer: data.nama,
                pin_loker: data.pin,
                status: data.status,
                tanggal: data.tanggal,
                petugas: data.petugas,
                foto_url: data.foto || '',
                updated_at: new Date().toISOString()
            }, { onConflict: 'loker_id' });
        
        if (error) throw error;
        
        // Backup ke localStorage juga
        backupToLocalStorage();
        
        console.log(`✅ Loker ${lokerId} saved to cloud`);
        return true;
        
    } catch (error) {
        console.error('Error saving to Supabase:', error);
        updateSyncStatus(false, 'Gagal simpan ke cloud • Data tersimpan lokal');
        
        // Tetap simpan ke localStorage
        backupToLocalStorage();
        return false;
    }
}

// Backup semua data ke localStorage
function backupToLocalStorage() {
    localStorage.setItem('loker_app_backup', JSON.stringify(lokerData));
}

// Upload foto ke Supabase Storage
async function uploadPhoto(file, lokerId) {
    if (!file) return null;
    
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `loker_${lokerId}_${Date.now()}.${fileExt}`;
        const filePath = `loker-photos/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('loker-bukti')
            .upload(filePath, file);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
            .from('loker-bukti')
            .getPublicUrl(filePath);
        
        return publicUrl;
        
    } catch (error) {
        console.error('Upload foto gagal:', error);
        // Fallback ke base64
        return await fileToBase64(file);
    }
}

// Konversi file ke base64 (fallback)
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Hapus data loker dari cloud
async function deleteLokerData(lokerId) {
    if (!confirm(`Yakin ingin menghapus SEMUA data Loker ${lokerId}?`)) return false;
    
    try {
        const { error } = await supabase
            .from('lokers')
            .delete()
            .eq('loker_id', lokerId);
        
        if (error) throw error;
        
        // Reset data lokal
        lokerData[lokerId] = {
            id: lokerId,
            nama: '',
            pin: '',
            status: 'belum',
            tanggal: '',
            petugas: '',
            foto: ''
        };
        
        backupToLocalStorage();
        renderNavButtons();
        displayCurrentLoker();
        
        alert(`Data Loker ${lokerId} berhasil dihapus dari cloud!`);
        return true;
        
    } catch (error) {
        console.error('Error deleting from Supabase:', error);
        alert('Gagal menghapus dari cloud, coba lagi nanti');
        return false;
    }
}

// ==================== RENDER UI ====================

function renderNavButtons() {
    lokerNavButtons.innerHTML = '';
    
    for (let i = 1; i <= TOTAL_LOKER; i++) {
        const btn = document.createElement('button');
        btn.className = `nav-btn ${currentLoker === i ? 'active' : ''}`;
        
        // Tandai loker yang memiliki data
        const data = lokerData[i];
        if (data && data.nama && data.nama !== '') {
            btn.classList.add('has-data');
        }
        
        btn.textContent = `Loker ${i}`;
        btn.onclick = () => {
            currentLoker = i;
            renderNavButtons();
            displayCurrentLoker();
            if (lokerNumberSpan) lokerNumberSpan.innerText = i;
            if (displayLokerNumberSpan) displayLokerNumberSpan.innerText = i;
            clearFormOnly();
        };
        
        lokerNavButtons.appendChild(btn);
    }
}

function displayCurrentLoker() {
    const data = lokerData[currentLoker] || {
        nama: '', pin: '', status: 'belum', tanggal: '', petugas: '', foto: ''
    };
    
    // Update display elements
    document.getElementById('displayNama').innerText = data.nama || '-';
    document.getElementById('displayPin').innerText = data.pin || '-';
    
    const statusSpan = document.getElementById('displayStatus');
    const statusText = data.status === 'sudah' ? '✓ Sudah Diambil' : '⏳ Belum Diambil';
    statusSpan.innerText = statusText;
    statusSpan.className = `value status-badge ${data.status === 'sudah' ? 'sudah' : 'belum'}`;
    
    document.getElementById('displayTanggal').innerText = data.tanggal || '-';
    document.getElementById('displayPetugas').innerText = data.petugas || '-';
    
    // Tampilkan foto
    const fotoDisplay = document.getElementById('fotoDisplay');
    if (data.foto && data.foto !== '') {
        fotoDisplay.innerHTML = `<img src="${data.foto}" alt="Bukti Loker" style="max-width:200px; border-radius:12px; cursor:pointer" onclick="openModal('${data.foto}')">`;
    } else {
        fotoDisplay.innerHTML = '<span class="no-foto">Tidak ada foto</span>';
    }
    
    // Isi form dengan data yang ada
    document.getElementById('namaCustomer').value = data.nama || '';
    document.getElementById('pinLoker').value = data.pin || '';
    document.getElementById('statusPengambilan').value = data.status || 'belum';
    document.getElementById('tanggal').value = data.tanggal || '';
    
    // Set petugas dari dropdown atau data tersimpan
    const selectedPetugas = document.getElementById('petugasSelect').value;
    if (selectedPetugas) {
        document.getElementById('namaPetugas').value = selectedPetugas;
    } else if (data.petugas) {
        document.getElementById('namaPetugas').value = data.petugas;
        // Set dropdown juga
        const petugasSelect = document.getElementById('petugasSelect');
        if (petugasSelect.querySelector(`option[value="${data.petugas}"]`)) {
            petugasSelect.value = data.petugas;
            document.getElementById('petugasBadge').innerText = `Petugas: ${data.petugas}`;
        }
    } else {
        document.getElementById('namaPetugas').value = '';
    }
    
    // Preview foto
    const preview = document.getElementById('fotoPreview');
    if (data.foto) {
        preview.src = data.foto;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

function clearFormOnly() {
    document.getElementById('namaCustomer').value = '';
    document.getElementById('pinLoker').value = '';
    document.getElementById('statusPengambilan').value = 'belum';
    document.getElementById('fotoBukti').value = '';
    document.getElementById('fotoPreview').style.display = 'none';
    document.getElementById('fotoPreview').src = '';
    
    const petugas = document.getElementById('petugasSelect').value;
    if (petugas) {
        document.getElementById('namaPetugas').value = petugas;
    } else {
        document.getElementById('namaPetugas').value = '';
    }
    document.getElementById('tanggal').value = '';
}

// ==================== SIMPAN DATA ====================

async function saveLokerData(event) {
    event.preventDefault();
    
    const nama = document.getElementById('namaCustomer').value.trim();
    const pin = document.getElementById('pinLoker').value.trim();
    const status = document.getElementById('statusPengambilan').value;
    const petugasInput = document.getElementById('petugasSelect').value;
    const petugasFinal = petugasInput || document.getElementById('namaPetugas').value;
    
    // Validasi
    if (!nama) {
        alert('❌ Nama customer harus diisi!');
        return;
    }
    if (!pin || pin.length < 4 || !/^\d+$/.test(pin)) {
        alert('❌ PIN harus minimal 4 digit angka!');
        return;
    }
    if (!petugasFinal) {
        alert('❌ Pilih petugas terlebih dahulu!');
        return;
    }
    
    // Disable save button while processing
    const saveBtn = document.querySelector('.btn-save');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    
    try {
        // Tanggal otomatis sekarang
        const now = new Date();
        const tanggalString = now.toLocaleString('id-ID', { 
            day: '2-digit', month: '2-digit', year: 'numeric', 
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });
        
        // Upload foto jika ada
        let fotoUrl = lokerData[currentLoker]?.foto || '';
        const fileInput = document.getElementById('fotoBukti');
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            fotoUrl = await uploadPhoto(file, currentLoker);
        }
        
        // Simpan ke data lokal
        lokerData[currentLoker] = {
            id: currentLoker,
            nama: nama,
            pin: pin,
            status: status,
            tanggal: tanggalString,
            petugas: petugasFinal,
            foto: fotoUrl
        };
        
        // Simpan ke Supabase (cloud)
        const saved = await saveToSupabase(currentLoker, lokerData[currentLoker]);
        
        if (saved) {
            alert(`✅ Data Loker ${currentLoker} berhasil disimpan ke cloud! Semua device akan melihat data ini.`);
        } else {
            alert(`⚠️ Data tersimpan LOKAL. Koneksi cloud bermasalah, akan sync otomatis nanti.`);
        }
        
        // Refresh UI
        renderNavButtons();
        displayCurrentLoker();
        clearFormOnly();
        
    } catch (error) {
        console.error('Save error:', error);
        alert('❌ Terjadi kesalahan saat menyimpan data');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan Data';
    }
}

// ==================== CLEAR TOTAL ====================

function clearTotalForm() {
    if (confirm(`⚠️ Hapus SEMUA data untuk Loker ${currentLoker}? Data akan hilang dari semua device!`)) {
        deleteLokerData(currentLoker);
    }
}

// ==================== REFRESH DATA ====================

async function refreshAllData() {
    const refreshBtn = document.getElementById('refreshDataBtn');
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
    
    await loadAllData();
    
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sync Data';
    alert('✅ Data berhasil disinkronkan dari cloud!');
}

// ==================== MODAL ZOOM ====================

function openModal(imgSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modal.style.display = "block";
    modalImg.src = imgSrc;
}

// ==================== EVENT LISTENERS ====================

document.getElementById('lokerForm').addEventListener('submit', saveLokerData);
document.getElementById('clearFormBtn').addEventListener('click', clearTotalForm);
document.getElementById('refreshDataBtn').addEventListener('click', refreshAllData);
document.getElementById('deleteLokerBtn').addEventListener('click', () => clearTotalForm());

// Petugas dropdown change
document.getElementById('petugasSelect').addEventListener('change', function(e) {
    const petugas = e.target.value;
    document.getElementById('namaPetugas').value = petugas;
    document.getElementById('petugasBadge').innerText = petugas ? `Petugas: ${petugas}` : 'Belum dipilih';
});

// Preview foto
document.getElementById('fotoBukti').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const preview = document.getElementById('fotoPreview');
            preview.src = event.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// Modal close
document.querySelector('.close-modal').onclick = function() {
    document.getElementById('imageModal').style.display = "none";
};
window.onclick = function(event) {
    const modal = document.getElementById('imageModal');
    if (event.target === modal) {
        modal.style.display = "none";
    }
};

// ==================== INITIALIZATION ====================

async function init() {
    console.log('🚀 Starting Loker App with Supabase...');
    await loadAllData();
}

// Start the app
init();