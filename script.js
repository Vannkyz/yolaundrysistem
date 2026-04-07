// ==================== KONFIGURASI SUPABASE ====================
// Menggunakan environment variables dari Netlify Supabase Extension
// Extension otomatis menyediakan: SUPABASE_URL, SUPABASE_ANON_KEY [citation:1]

// Inisialisasi Supabase
const supabase = window.supabaseJs.createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Optional: Cek apakah environment variables tersedia
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn('⚠️ Supabase environment variables not found. Using fallback for local testing.');
    // Fallback hanya untuk development lokal
    const FALLBACK_URL = 'https://phpsktqxrrbxswhyvhwd.supabase.co';
    const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocHNrdHF4cnJieHN3aHl2aHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODkzOTIsImV4cCI6MjA5MTA2NTM5Mn0.EmHvCpqQokmm9CPDLC2p23vJxT_I929C5jAvGdcmRN0';
    supabase = window.supabaseJs.createClient(FALLBACK_URL, FALLBACK_KEY);
}

// ==================== GLOBAL VARIABLES ====================
const TOTAL_LOKER = 40;
let currentLoker = 1;
let lokerData = {};
let isConnected = false;

// DOM Elements
const syncStatusEl = document.getElementById('syncStatus');
const lokerNavButtons = document.getElementById('lokerNavButtons');
const totalDataCount = document.getElementById('totalDataCount');

// ==================== UTILITY FUNCTIONS ====================

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Update sync status
function updateSyncStatus(connected, message = '') {
    isConnected = connected;
    if (connected) {
        syncStatusEl.innerHTML = '<i class="fas fa-check-circle"></i> Terhubung ke cloud • Data tersinkron semua device';
        syncStatusEl.className = 'sync-status success';
    } else {
        syncStatusEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message || 'Mode offline • Data tersimpan lokal'}`;
        syncStatusEl.className = 'sync-status error';
    }
}

// Konversi file ke base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Backup ke localStorage
function backupToLocalStorage() {
    localStorage.setItem('loker_app_data', JSON.stringify(lokerData));
}

// ==================== SUPABASE OPERATIONS ====================

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
        let filledCount = 0;
        
        data.forEach(item => {
            newData[item.loker_id] = {
                id: item.loker_id,
                nama: item.nama_customer || '',
                pin: item.pin_loker || '',
                status: item.status || 'belum',
                tanggal: item.tanggal || '',
                petugas: item.petugas || '',
                foto: item.foto_url || '',
                updated_at: item.updated_at
            };
            if (item.nama_customer && item.nama_customer !== '') filledCount++;
        });
        
        // Inisialisasi loker kosong
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
        updateTotalDataCount();
        
        showToast('✅ Data berhasil disinkronkan dari cloud!', 'success');
        console.log('Data loaded from Supabase');
        
    } catch (error) {
        console.error('Error loading from Supabase:', error);
        updateSyncStatus(false, 'Gagal konek ke cloud');
        loadFromLocalStorage();
    }
}

// Load dari localStorage (fallback)
function loadFromLocalStorage() {
    const saved = localStorage.getItem('loker_app_data');
    if (saved) {
        lokerData = JSON.parse(saved);
        showToast('📀 Menggunakan data lokal (offline mode)', 'info');
    } else {
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
    updateTotalDataCount();
}

// Simpan ke Supabase
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
        
        backupToLocalStorage();
        return true;
        
    } catch (error) {
        console.error('Error saving to Supabase:', error);
        updateSyncStatus(false, 'Gagal simpan ke cloud');
        backupToLocalStorage();
        return false;
    }
}

// Upload foto ke Supabase Storage
async function uploadPhoto(file, lokerId) {
    if (!file) return null;
    
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `loker_${lokerId}_${Date.now()}.${fileExt}`;
        const filePath = `foto-loker/${fileName}`;
        
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
        return await fileToBase64(file);
    }
}

// Hapus data loker dari cloud
async function deleteLokerData(lokerId) {
    if (!confirm(`⚠️ Yakin ingin menghapus SEMUA data Loker ${lokerId}?\n\nData akan hilang dari semua device!`)) return false;
    
    try {
        const { error } = await supabase
            .from('lokers')
            .delete()
            .eq('loker_id', lokerId);
        
        if (error) throw error;
        
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
        updateTotalDataCount();
        
        showToast(`🗑️ Data Loker ${lokerId} berhasil dihapus dari cloud!`, 'success');
        return true;
        
    } catch (error) {
        console.error('Error deleting from Supabase:', error);
        showToast('❌ Gagal menghapus data', 'error');
        return false;
    }
}

// ==================== RENDER UI ====================

function updateTotalDataCount() {
    let count = 0;
    for (let i = 1; i <= TOTAL_LOKER; i++) {
        if (lokerData[i] && lokerData[i].nama && lokerData[i].nama !== '') {
            count++;
        }
    }
    totalDataCount.textContent = `${count} terisi`;
}

function renderNavButtons() {
    lokerNavButtons.innerHTML = '';
    
    for (let i = 1; i <= TOTAL_LOKER; i++) {
        const btn = document.createElement('button');
        btn.className = `nav-btn ${currentLoker === i ? 'active' : ''}`;
        
        const data = lokerData[i];
        if (data && data.nama && data.nama !== '') {
            btn.classList.add('has-data');
        }
        
        btn.innerHTML = `<i class="fas fa-door-closed"></i> ${i}`;
        btn.onclick = () => {
            currentLoker = i;
            renderNavButtons();
            displayCurrentLoker();
            document.getElementById('lokerNumber').innerText = i;
            document.getElementById('displayLokerNumber').innerText = i;
            clearFormOnly();
        };
        
        lokerNavButtons.appendChild(btn);
    }
}

function displayCurrentLoker() {
    const data = lokerData[currentLoker] || {
        nama: '', pin: '', status: 'belum', tanggal: '', petugas: '', foto: ''
    };
    
    // Update display
    document.getElementById('displayNama').innerHTML = data.nama ? `<strong>${escapeHtml(data.nama)}</strong>` : '-';
    document.getElementById('displayPin').innerHTML = data.pin ? `<span class="pin-value">${escapeHtml(data.pin)}</span>` : '-';
    
    const statusHtml = data.status === 'sudah' 
        ? '<span class="status-badge sudah"><i class="fas fa-check"></i> Sudah Diambil</span>'
        : '<span class="status-badge belum"><i class="fas fa-clock"></i> Belum Diambil</span>';
    document.getElementById('displayStatus').innerHTML = statusHtml;
    
    document.getElementById('displayTanggal').innerHTML = data.tanggal || '-';
    document.getElementById('displayPetugas').innerHTML = data.petugas ? `<i class="fas fa-user-check"></i> ${escapeHtml(data.petugas)}` : '-';
    
    // Foto display
    const fotoDisplay = document.getElementById('fotoDisplay');
    if (data.foto && data.foto !== '') {
        fotoDisplay.innerHTML = `<img src="${data.foto}" alt="Bukti Loker ${currentLoker}" onclick="openModal('${data.foto}')">`;
    } else {
        fotoDisplay.innerHTML = '<span class="no-foto"><i class="fas fa-camera-slash"></i> Tidak ada foto</span>';
    }
    
    // Status indicator
    const indicator = document.getElementById('lokerStatusIndicator');
    if (data.nama && data.nama !== '') {
        indicator.className = 'loker-status-indicator filled';
        indicator.title = 'Loker terisi';
    } else {
        indicator.className = 'loker-status-indicator';
        indicator.title = 'Loker kosong';
    }
    
    // Isi form
    document.getElementById('namaCustomer').value = data.nama || '';
    document.getElementById('pinLoker').value = data.pin || '';
    document.getElementById('statusPengambilan').value = data.status || 'belum';
    document.getElementById('tanggal').value = data.tanggal || '';
    
    // Set petugas
    const selectedPetugas = document.getElementById('petugasSelect').value;
    if (selectedPetugas) {
        document.getElementById('namaPetugas').value = selectedPetugas;
    } else if (data.petugas) {
        document.getElementById('namaPetugas').value = data.petugas;
        const petugasSelect = document.getElementById('petugasSelect');
        if (petugasSelect.querySelector(`option[value="${data.petugas}"]`)) {
            petugasSelect.value = data.petugas;
            document.getElementById('petugasBadge').innerHTML = `<i class="fas fa-user-clock"></i> Petugas: ${data.petugas}`;
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

// ==================== SAVE DATA ====================

async function saveLokerData(event) {
    event.preventDefault();
    
    const nama = document.getElementById('namaCustomer').value.trim();
    const pin = document.getElementById('pinLoker').value.trim();
    const status = document.getElementById('statusPengambilan').value;
    const petugasInput = document.getElementById('petugasSelect').value;
    const petugasFinal = petugasInput || document.getElementById('namaPetugas').value;
    
    // Validasi
    if (!nama) {
        showToast('❌ Nama customer harus diisi!', 'error');
        return;
    }
    if (!pin || pin.length < 4 || !/^\d+$/.test(pin)) {
        showToast('❌ PIN harus minimal 4 digit angka!', 'error');
        return;
    }
    if (!petugasFinal) {
        showToast('❌ Pilih petugas terlebih dahulu!', 'error');
        return;
    }
    
    const saveBtn = document.querySelector('.btn-save');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menyimpan...';
    
    try {
        const now = new Date();
        const tanggalString = now.toLocaleString('id-ID', { 
            day: '2-digit', month: '2-digit', year: 'numeric', 
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });
        
        let fotoUrl = lokerData[currentLoker]?.foto || '';
        const fileInput = document.getElementById('fotoBukti');
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (isConnected) {
                fotoUrl = await uploadPhoto(file, currentLoker);
            } else {
                fotoUrl = await fileToBase64(file);
            }
        }
        
        lokerData[currentLoker] = {
            id: currentLoker,
            nama: nama,
            pin: pin,
            status: status,
            tanggal: tanggalString,
            petugas: petugasFinal,
            foto: fotoUrl
        };
        
        let saved = false;
        if (isConnected) {
            saved = await saveToSupabase(currentLoker, lokerData[currentLoker]);
        } else {
            backupToLocalStorage();
            saved = true;
        }
        
        if (saved) {
            showToast(`✅ Data Loker ${currentLoker} berhasil disimpan! Semua device akan melihat data ini.`, 'success');
        } else {
            showToast(`⚠️ Data tersimpan LOKAL. Koneksi cloud bermasalah.`, 'error');
        }
        
        renderNavButtons();
        displayCurrentLoker();
        updateTotalDataCount();
        clearFormOnly();
        
    } catch (error) {
        console.error('Save error:', error);
        showToast('❌ Terjadi kesalahan saat menyimpan data', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan Data';
    }
}

function clearTotalForm() {
    if (confirm(`⚠️ Hapus SEMUA data untuk Loker ${currentLoker}?\n\nData akan hilang dari semua device!`)) {
        deleteLokerData(currentLoker);
    }
}

async function refreshAllData() {
    const refreshBtn = document.getElementById('refreshDataBtn');
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menyinkronkan...';
    
    await loadAllData();
    
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sinkronisasi Cloud';
}

// ==================== MODAL ZOOM ====================

function openModal(imgSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const modalCaption = document.getElementById('modalCaption');
    modal.style.display = 'block';
    modalImg.src = imgSrc;
    modalCaption.textContent = `Foto Bukti Loker ${currentLoker}`;
}

// ==================== EVENT LISTENERS ====================

document.getElementById('lokerForm').addEventListener('submit', saveLokerData);
document.getElementById('clearFormBtn').addEventListener('click', clearTotalForm);
document.getElementById('refreshDataBtn').addEventListener('click', refreshAllData);
document.getElementById('deleteLokerBtn').addEventListener('click', () => clearTotalForm());

document.getElementById('petugasSelect').addEventListener('change', function(e) {
    const petugas = e.target.value;
    document.getElementById('namaPetugas').value = petugas;
    document.getElementById('petugasBadge').innerHTML = petugas 
        ? `<i class="fas fa-user-clock"></i> Petugas: ${petugas}` 
        : '<i class="fas fa-user-clock"></i> Belum dipilih';
});

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
    document.getElementById('imageModal').style.display = 'none';
};
window.onclick = function(event) {
    const modal = document.getElementById('imageModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// ==================== INITIALIZATION ====================

async function init() {
    console.log('🚀 Starting Loker App with Supabase Cloud Sync...');
    await loadAllData();
}

init();
