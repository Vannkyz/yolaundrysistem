// ==================== KONFIGURASI SUPABASE ====================
const supabase = window.supabaseJs.createClient(
    process.env.SUPABASE_DATABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: false, // Nonaktifkan session untuk speed
            autoRefreshToken: false,
            detectSessionInUrl: false
        },
        global: {
            headers: { 'x-application-name': 'loker-app' }
        },
        db: {
            schema: 'public'
        },
        realtime: {
            params: {
                eventsPerSecond: 2 // Batasi event realtime
            }
        }
    }
);

// ==================== GLOBAL VARIABLES ====================
const TOTAL_LOKER = 40;
let currentLoker = 1;
let lokerData = {};
let isConnected = false;
let isLoading = false;
let loadTimeout = null;

// Cache untuk mengurangi request
let lastLoadTime = 0;
const CACHE_DURATION = 30000; // 30 detik cache

// DOM Elements
const syncStatusEl = document.getElementById('syncStatus');
const lokerNavButtons = document.getElementById('lokerNavButtons');
const totalDataCount = document.getElementById('totalDataCount');

// ==================== UTILITY FUNCTIONS ====================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function updateSyncStatus(connected, message = '') {
    isConnected = connected;
    if (connected) {
        syncStatusEl.innerHTML = '<i class="fas fa-check-circle"></i> Cloud sync aktif';
        syncStatusEl.className = 'sync-status success';
    } else {
        syncStatusEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message || 'Mode offline'}`;
        syncStatusEl.className = 'sync-status error';
    }
}

// ==================== SUPABASE OPERATIONS (OPTIMIZED) ====================

// Load data dengan timeout dan retry
async function loadAllDataWithRetry(retryCount = 0) {
    if (isLoading) return;
    isLoading = true;
    
    // Cek cache dulu
    const now = Date.now();
    if (lastLoadTime && (now - lastLoadTime) < CACHE_DURATION && Object.keys(lokerData).length > 0) {
        console.log('📦 Using cached data');
        isLoading = false;
        return;
    }
    
    // Set timeout untuk loading (5 detik)
    const timeoutPromise = new Promise((_, reject) => {
        loadTimeout = setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    try {
        updateSyncStatus(false, 'Mengambil data...');
        
        const fetchPromise = supabase
            .from('lokers')
            .select('loker_id, nama_customer, pin_loker, status, tanggal, petugas, foto_url')
            .order('loker_id', { ascending: true });
        
        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
        clearTimeout(loadTimeout);
        
        if (error) throw error;
        
        // Proses data
        const newData = {};
        let filledCount = 0;
        
        if (data && data.length > 0) {
            data.forEach(item => {
                newData[item.loker_id] = {
                    id: item.loker_id,
                    nama: item.nama_customer || '',
                    pin: item.pin_loker || '',
                    status: item.status || 'belum',
                    tanggal: item.tanggal || '',
                    petugas: item.petugas || '',
                    foto: item.foto_url || ''
                };
                if (item.nama_customer && item.nama_customer !== '') filledCount++;
            });
        }
        
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
        lastLoadTime = Date.now();
        updateSyncStatus(true);
        renderNavButtons();
        displayCurrentLoker();
        updateTotalDataCount();
        
        console.log(`✅ Loaded ${filledCount} lockers in ${Date.now() - now}ms`);
        
    } catch (error) {
        clearTimeout(loadTimeout);
        console.error('Load error:', error);
        
        if (retryCount < 2) {
            console.log(`Retry ${retryCount + 1}/2...`);
            setTimeout(() => loadAllDataWithRetry(retryCount + 1), 1000);
        } else {
            updateSyncStatus(false, 'Koneksi lambat • Mode offline');
            loadFromLocalStorage();
            showToast('⚠️ Koneksi lambat, menggunakan data lokal', 'error');
        }
    } finally {
        isLoading = false;
    }
}

// Load dari localStorage (fast fallback)
function loadFromLocalStorage() {
    const saved = localStorage.getItem('loker_app_data');
    if (saved) {
        try {
            lokerData = JSON.parse(saved);
            console.log('📀 Using localStorage (fast)');
        } catch(e) {
            initEmptyData();
        }
    } else {
        initEmptyData();
    }
    renderNavButtons();
    displayCurrentLoker();
    updateTotalDataCount();
}

function initEmptyData() {
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

// Simpan ke Supabase (optimized - batch update)
async function saveToSupabase(lokerId, data) {
    try {
        // Set timeout untuk save
        const savePromise = supabase
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
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Save timeout')), 3000)
        );
        
        await Promise.race([savePromise, timeoutPromise]);
        
        backupToLocalStorage();
        return true;
        
    } catch (error) {
        console.error('Save error:', error);
        backupToLocalStorage();
        return false;
    }
}

// Upload foto dengan kompresi
async function uploadPhoto(file, lokerId) {
    if (!file) return null;
    
    // Kompres foto sebelum upload
    const compressedFile = await compressImage(file);
    
    try {
        const fileExt = compressedFile.name.split('.').pop();
        const fileName = `loker_${lokerId}_${Date.now()}.${fileExt}`;
        const filePath = `foto-loker/${fileName}`;
        
        const uploadPromise = supabase.storage
            .from('loker-bukti')
            .upload(filePath, compressedFile);
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Upload timeout')), 5000)
        );
        
        const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
            .from('loker-bukti')
            .getPublicUrl(filePath);
        
        return publicUrl;
        
    } catch (error) {
        console.error('Upload error:', error);
        return await fileToBase64(file);
    }
}

// Kompres gambar sebelum upload
function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Resize jika terlalu besar (max 800px)
                const maxSize = 800;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    } else {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Kompres ke JPEG dengan quality 70%
                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', 0.7);
            };
        };
    });
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function backupToLocalStorage() {
    localStorage.setItem('loker_app_data', JSON.stringify(lokerData));
}

// ==================== RENDER UI (Optimized) ====================

function updateTotalDataCount() {
    let count = 0;
    for (let i = 1; i <= TOTAL_LOKER; i++) {
        if (lokerData[i]?.nama && lokerData[i].nama !== '') count++;
    }
    if (totalDataCount) totalDataCount.textContent = `${count} terisi`;
}

function renderNavButtons() {
    if (!lokerNavButtons) return;
    
    // Batch DOM updates
    const fragment = document.createDocumentFragment();
    
    for (let i = 1; i <= TOTAL_LOKER; i++) {
        const btn = document.createElement('button');
        btn.className = `nav-btn ${currentLoker === i ? 'active' : ''}`;
        
        const data = lokerData[i];
        if (data?.nama && data.nama !== '') {
            btn.classList.add('has-data');
        }
        
        btn.innerHTML = `<i class="fas fa-door-closed"></i> ${i}`;
        btn.onclick = (function(lokerId) {
            return function() {
                currentLoker = lokerId;
                renderNavButtons();
                displayCurrentLoker();
                const lokerNumberSpan = document.getElementById('lokerNumber');
                const displayLokerNumberSpan = document.getElementById('displayLokerNumber');
                if (lokerNumberSpan) lokerNumberSpan.innerText = lokerId;
                if (displayLokerNumberSpan) displayLokerNumberSpan.innerText = lokerId;
                clearFormOnly();
            };
        })(i);
        
        fragment.appendChild(btn);
    }
    
    lokerNavButtons.innerHTML = '';
    lokerNavButtons.appendChild(fragment);
}

function displayCurrentLoker() {
    const data = lokerData[currentLoker] || {
        nama: '', pin: '', status: 'belum', tanggal: '', petugas: '', foto: ''
    };
    
    // Update display elements with safe checks
    const displayNama = document.getElementById('displayNama');
    const displayPin = document.getElementById('displayPin');
    const displayStatus = document.getElementById('displayStatus');
    const displayTanggal = document.getElementById('displayTanggal');
    const displayPetugas = document.getElementById('displayPetugas');
    const fotoDisplay = document.getElementById('fotoDisplay');
    const indicator = document.getElementById('lokerStatusIndicator');
    
    if (displayNama) displayNama.innerHTML = data.nama ? `<strong>${escapeHtml(data.nama)}</strong>` : '-';
    if (displayPin) displayPin.innerHTML = data.pin ? `<span class="pin-value">${escapeHtml(data.pin)}</span>` : '-';
    
    if (displayStatus) {
        const statusHtml = data.status === 'sudah' 
            ? '<span class="status-badge sudah"><i class="fas fa-check"></i> Sudah Diambil</span>'
            : '<span class="status-badge belum"><i class="fas fa-clock"></i> Belum Diambil</span>';
        displayStatus.innerHTML = statusHtml;
    }
    
    if (displayTanggal) displayTanggal.innerHTML = data.tanggal || '-';
    if (displayPetugas) displayPetugas.innerHTML = data.petugas ? `<i class="fas fa-user-check"></i> ${escapeHtml(data.petugas)}` : '-';
    
    if (fotoDisplay) {
        if (data.foto && data.foto !== '') {
            fotoDisplay.innerHTML = `<img src="${data.foto}" alt="Bukti Loker ${currentLoker}" onclick="openModal('${data.foto}')" loading="lazy">`;
        } else {
            fotoDisplay.innerHTML = '<span class="no-foto"><i class="fas fa-camera-slash"></i> Tidak ada foto</span>';
        }
    }
    
    if (indicator) {
        if (data.nama && data.nama !== '') {
            indicator.className = 'loker-status-indicator filled';
        } else {
            indicator.className = 'loker-status-indicator';
        }
    }
    
    // Isi form
    const namaCustomer = document.getElementById('namaCustomer');
    const pinLoker = document.getElementById('pinLoker');
    const statusPengambilan = document.getElementById('statusPengambilan');
    const tanggal = document.getElementById('tanggal');
    
    if (namaCustomer) namaCustomer.value = data.nama || '';
    if (pinLoker) pinLoker.value = data.pin || '';
    if (statusPengambilan) statusPengambilan.value = data.status || 'belum';
    if (tanggal) tanggal.value = data.tanggal || '';
    
    // Set petugas
    const selectedPetugas = document.getElementById('petugasSelect');
    const namaPetugas = document.getElementById('namaPetugas');
    const petugasBadge = document.getElementById('petugasBadge');
    
    if (selectedPetugas && namaPetugas) {
        if (selectedPetugas.value) {
            namaPetugas.value = selectedPetugas.value;
        } else if (data.petugas) {
            namaPetugas.value = data.petugas;
            if (selectedPetugas.querySelector(`option[value="${data.petugas}"]`)) {
                selectedPetugas.value = data.petugas;
                if (petugasBadge) petugasBadge.innerHTML = `<i class="fas fa-user-clock"></i> Petugas: ${data.petugas}`;
            }
        } else {
            namaPetugas.value = '';
        }
    }
    
    // Preview foto
    const fotoPreview = document.getElementById('fotoPreview');
    if (fotoPreview) {
        if (data.foto) {
            fotoPreview.src = data.foto;
            fotoPreview.style.display = 'block';
        } else {
            fotoPreview.style.display = 'none';
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function clearFormOnly() {
    const namaCustomer = document.getElementById('namaCustomer');
    const pinLoker = document.getElementById('pinLoker');
    const statusPengambilan = document.getElementById('statusPengambilan');
    const fotoBukti = document.getElementById('fotoBukti');
    const fotoPreview = document.getElementById('fotoPreview');
    const tanggal = document.getElementById('tanggal');
    const petugasSelect = document.getElementById('petugasSelect');
    const namaPetugas = document.getElementById('namaPetugas');
    
    if (namaCustomer) namaCustomer.value = '';
    if (pinLoker) pinLoker.value = '';
    if (statusPengambilan) statusPengambilan.value = 'belum';
    if (fotoBukti) fotoBukti.value = '';
    if (fotoPreview) {
        fotoPreview.style.display = 'none';
        fotoPreview.src = '';
    }
    if (tanggal) tanggal.value = '';
    
    if (petugasSelect && petugasSelect.value && namaPetugas) {
        namaPetugas.value = petugasSelect.value;
    } else if (namaPetugas) {
        namaPetugas.value = '';
    }
}

// ==================== SAVE DATA ====================

async function saveLokerData(event) {
    event.preventDefault();
    
    const nama = document.getElementById('namaCustomer')?.value.trim() || '';
    const pin = document.getElementById('pinLoker')?.value.trim() || '';
    const status = document.getElementById('statusPengambilan')?.value || 'belum';
    const petugasInput = document.getElementById('petugasSelect')?.value || '';
    const petugasFinal = petugasInput || document.getElementById('namaPetugas')?.value || '';
    
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
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menyimpan...';
    }
    
    try {
        const now = new Date();
        const tanggalString = now.toLocaleString('id-ID', { 
            day: '2-digit', month: '2-digit', year: 'numeric', 
            hour: '2-digit', minute: '2-digit'
        });
        
        let fotoUrl = lokerData[currentLoker]?.foto || '';
        const fileInput = document.getElementById('fotoBukti');
        if (fileInput?.files?.length > 0) {
            const file = fileInput.files[0];
            showToast('📸 Mengupload foto...', 'info');
            fotoUrl = await uploadPhoto(file, currentLoker);
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
            showToast(`✅ Data Loker ${currentLoker} tersimpan!`, 'success');
        } else {
            showToast(`⚠️ Data tersimpan lokal`, 'error');
        }
        
        renderNavButtons();
        displayCurrentLoker();
        updateTotalDataCount();
        clearFormOnly();
        
    } catch (error) {
        console.error('Save error:', error);
        showToast('❌ Gagal menyimpan data', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan Data';
        }
    }
}

function clearTotalForm() {
    if (confirm(`⚠️ Hapus SEMUA data untuk Loker ${currentLoker}?\n\nData akan hilang dari semua device!`)) {
        deleteLokerData(currentLoker);
    }
}

async function deleteLokerData(lokerId) {
    try {
        if (isConnected) {
            await supabase.from('lokers').delete().eq('loker_id', lokerId);
        }
        
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
        showToast(`🗑️ Data Loker ${lokerId} dihapus`, 'success');
        
    } catch (error) {
        console.error('Delete error:', error);
        showToast('❌ Gagal menghapus data', 'error');
    }
}

async function refreshAllData() {
    const refreshBtn = document.getElementById('refreshDataBtn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
    }
    
    lastLoadTime = 0; // Reset cache
    await loadAllDataWithRetry();
    
    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
    }
}

// ==================== MODAL ZOOM ====================

function openModal(imgSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const modalCaption = document.getElementById('modalCaption');
    if (modal && modalImg) {
        modal.style.display = 'block';
        modalImg.src = imgSrc;
        if (modalCaption) modalCaption.textContent = `Foto Bukti Loker ${currentLoker}`;
    }
}

// ==================== EVENT LISTENERS ====================

document.getElementById('lokerForm')?.addEventListener('submit', saveLokerData);
document.getElementById('clearFormBtn')?.addEventListener('click', clearTotalForm);
document.getElementById('refreshDataBtn')?.addEventListener('click', refreshAllData);
document.getElementById('deleteLokerBtn')?.addEventListener('click', () => clearTotalForm());

document.getElementById('petugasSelect')?.addEventListener('change', function(e) {
    const petugas = e.target.value;
    const namaPetugas = document.getElementById('namaPetugas');
    const petugasBadge = document.getElementById('petugasBadge');
    if (namaPetugas) namaPetugas.value = petugas;
    if (petugasBadge) {
        petugasBadge.innerHTML = petugas 
            ? `<i class="fas fa-user-clock"></i> Petugas: ${petugas}` 
            : '<i class="fas fa-user-clock"></i> Belum dipilih';
    }
});

document.getElementById('fotoBukti')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const preview = document.getElementById('fotoPreview');
            if (preview) {
                preview.src = event.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }
});

// Modal close
document.querySelector('.close-modal')?.addEventListener('click', function() {
    document.getElementById('imageModal').style.display = 'none';
});
window.onclick = function(event) {
    const modal = document.getElementById('imageModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// ==================== INITIALIZATION ====================

async function init() {
    console.log('🚀 Starting Loker App...');
    
    // Tampilkan loading indicator
    if (syncStatusEl) {
        syncStatusEl.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menghubungkan...';
    }
    
    // Load data dengan timeout 5 detik
    const loadPromise = loadAllDataWithRetry();
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            console.log('⚠️ Load timeout, using localStorage');
            loadFromLocalStorage();
            resolve();
        }, 5000);
    });
    
    await Promise.race([loadPromise, timeoutPromise]);
}

// Start the app
init();
