// ==================== KONFIGURASI SUPABASE ====================
// GANTI DENGAN URL DAN ANON KEY DARI SUPABASE PROJECT ANDA!
const SUPABASE_URL = 'https://phpsktqxrrbxswhyvhwd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocHNrdHF4cnJieHN3aHl2aHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODkzOTIsImV4cCI6MjA5MTA2NTM5Mn0.EmHvCpqQokmm9CPDLC2p23vJxT_I929C5jAvGdcmRN0';

// Inisialisasi Supabase
let supabase;
let isSupabaseConnected = false;

// Coba load Supabase dari CDN dan inisialisasi
if (typeof supabaseJs !== 'undefined') {
    supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    isSupabaseConnected = true;
    console.log('✅ Supabase terhubung');
} else {
    console.warn('⚠️ Supabase tidak terdeteksi, menggunakan localStorage saja');
}

// ==================== DATA LOKER ====================
const TOTAL_LOKER = 40;
let currentLoker = 1;
let lokerData = {};

// Storage key
const STORAGE_KEY = 'loker_app_data';

// Load data dari localStorage atau Supabase
async function loadData() {
    if (isSupabaseConnected) {
        try {
            const { data, error } = await supabase
                .from('lokers')
                .select('*');
            
            if (error) throw error;
            
            // Convert array ke object
            const newData = {};
            data.forEach(item => {
                newData[item.loker_id] = {
                    nama: item.nama_customer,
                    pin: item.pin_loker,
                    status: item.status,
                    tanggal: item.tanggal,
                    petugas: item.petugas,
                    foto: item.foto_url
                };
            });
            lokerData = newData;
            console.log('Data loaded from Supabase');
        } catch (error) {
            console.error('Error loading from Supabase:', error);
            loadFromLocal();
        }
    } else {
        loadFromLocal();
    }
    
    // Ensure all loker have data structure
    for (let i = 1; i <= TOTAL_LOKER; i++) {
        if (!lokerData[i]) {
            lokerData[i] = {
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

function loadFromLocal() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        lokerData = JSON.parse(saved);
    } else {
        lokerData = {};
    }
}

async function saveToCloud() {
    if (!isSupabaseConnected) {
        saveToLocal();
        return;
    }
    
    try {
        // Untuk setiap loker yang berubah, upsert ke Supabase
        for (let id in lokerData) {
            const data = lokerData[id];
            const { error } = await supabase
                .from('lokers')
                .upsert({
                    loker_id: parseInt(id),
                    nama_customer: data.nama,
                    pin_loker: data.pin,
                    status: data.status,
                    tanggal: data.tanggal,
                    petugas: data.petugas,
                    foto_url: data.foto || '',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'loker_id' });
            
            if (error) console.error('Upsert error loker', id, error);
        }
        console.log('✅ Synced to Supabase');
    } catch (err) {
        console.error('Cloud sync failed:', err);
        saveToLocal();
    }
}

function saveToLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lokerData));
}

function saveAllData() {
    saveToLocal();
    saveToCloud(); // Async
}

// ==================== RENDER UI ====================
function renderNavButtons() {
    const container = document.getElementById('lokerNavButtons');
    container.innerHTML = '';
    for (let i = 1; i <= TOTAL_LOKER; i++) {
        const btn = document.createElement('button');
        btn.className = `nav-btn ${currentLoker === i ? 'active' : ''}`;
        btn.textContent = `Loker ${i}`;
        btn.onclick = () => {
            currentLoker = i;
            renderNavButtons();
            displayCurrentLoker();
            document.getElementById('lokerNumber').innerText = i;
            document.getElementById('displayLokerNumber').innerText = i;
            clearFormOnly(); // Clear form tanpa menghapus data tersimpan
        };
        container.appendChild(btn);
    }
}

function displayCurrentLoker() {
    const data = lokerData[currentLoker] || {
        nama: '', pin: '', status: 'belum', tanggal: '', petugas: '', foto: ''
    };
    
    document.getElementById('displayNama').innerText = data.nama || '-';
    document.getElementById('displayPin').innerText = data.pin || '-';
    
    const statusSpan = document.getElementById('displayStatus');
    statusSpan.innerText = data.status === 'sudah' ? '✓ Sudah Diambil' : '⏳ Belum Diambil';
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
    
    // Petugas dari dropdown atau data tersimpan
    const selectedPetugas = document.getElementById('petugasSelect').value;
    if (selectedPetugas) {
        document.getElementById('namaPetugas').value = selectedPetugas;
    } else if (data.petugas) {
        document.getElementById('namaPetugas').value = data.petugas;
    } else {
        document.getElementById('namaPetugas').value = '';
    }
    
    // Preview foto jika ada
    if (data.foto) {
        const preview = document.getElementById('fotoPreview');
        preview.src = data.foto;
        preview.style.display = 'block';
    } else {
        document.getElementById('fotoPreview').style.display = 'none';
    }
}

function clearFormOnly() {
    document.getElementById('namaCustomer').value = '';
    document.getElementById('pinLoker').value = '';
    document.getElementById('statusPengambilan').value = 'belum';
    document.getElementById('fotoBukti').value = '';
    document.getElementById('fotoPreview').style.display = 'none';
    document.getElementById('fotoPreview').src = '';
    
    // Jangan reset tanggal dan petugas dulu, biar diisi saat save
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
    
    if (!nama) {
        alert('Nama customer harus diisi!');
        return;
    }
    if (!pin || pin.length < 4 || !/^\d+$/.test(pin)) {
        alert('PIN harus minimal 4 digit angka!');
        return;
    }
    if (!petugasFinal) {
        alert('Pilih petugas terlebih dahulu!');
        return;
    }
    
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
        if (isSupabaseConnected) {
            // Upload ke Supabase Storage
            const fileName = `loker_${currentLoker}_${Date.now()}.${file.name.split('.').pop()}`;
            const { data, error } = await supabase.storage
                .from('loker-photos')
                .upload(fileName, file);
            
            if (!error && data) {
                const { data: publicUrl } = supabase.storage
                    .from('loker-photos')
                    .getPublicUrl(fileName);
                fotoUrl = publicUrl.publicUrl;
            } else {
                console.error('Upload foto gagal:', error);
                // Fallback ke base64
                fotoUrl = await fileToBase64(file);
            }
        } else {
            fotoUrl = await fileToBase64(file);
        }
    }
    
    // Simpan data
    lokerData[currentLoker] = {
        nama: nama,
        pin: pin,
        status: status,
        tanggal: tanggalString,
        petugas: petugasFinal,
        foto: fotoUrl
    };
    
    saveAllData();
    displayCurrentLoker();
    renderNavButtons();
    
    alert(`Data Loker ${currentLoker} berhasil disimpan!`);
    
    // Clear form setelah save
    clearFormOnly();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// ==================== CLEAR TOTAL ====================
function clearTotalForm() {
    if (confirm(`Hapus SEMUA data untuk Loker ${currentLoker}?`)) {
        lokerData[currentLoker] = {
            nama: '',
            pin: '',
            status: 'belum',
            tanggal: '',
            petugas: '',
            foto: ''
        };
        saveAllData();
        clearFormOnly();
        displayCurrentLoker();
        alert(`Data Loker ${currentLoker} telah dihapus total!`);
    }
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
document.getElementById('refreshDataBtn').addEventListener('click', () => {
    loadData();
    alert('Data direfresh dari server/local');
});

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

// Inisialisasi
window.addEventListener('DOMContentLoaded', async () => {
    // Load Supabase script dulu jika perlu
    if (typeof supabaseJs === 'undefined' && SUPABASE_URL !== 'https://your-project.supabase.co') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = () => {
            supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            isSupabaseConnected = true;
            loadData();
        };
        document.head.appendChild(script);
    } else {
        await loadData();
    }
});