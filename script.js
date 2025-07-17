// Socket.IO sunucusuna bağlanıyoruz
// Sunucu aynı bilgisayarda ve 3000 portunda çalışacak
const socket = io('http://localhost:3000'); 

// HTML elemanlarını seçiyoruz
const profileSelectionDiv = document.querySelector('.profile-selection'); // Profil seçim alanı
const chatRoomDiv = document.querySelector('.chat-room'); // Sohbet odası alanı
const connectButtons = document.querySelectorAll('.connect-button'); // Tüm "Odaya Bağlan" düğmeleri
const currentUserDisplay = document.getElementById('current-user-display'); // Sohbet odasında kullanıcının adının gösterileceği yer
const speakingProfilePic = document.getElementById('speaking-profile-pic'); // Konuşan kişinin profil resmi
const speakingUserName = document.getElementById('speaking-user-name'); // Konuşan kişinin adı
const muteButton = document.getElementById('mute-button'); // Mikrofon aç/kapat düğmesi
const videosDiv = document.getElementById('videos'); // Uzak kullanıcıların ses/video akışlarının gösterileceği yer

// Mevcut kullanıcı bilgilerini tutacak değişken
let currentUser = null; 

// WebRTC ile ilgili değişkenler
// Peer bağlantılarını tutmak için bir obje
const peerConnections = {}; 
// Yerel medya akışımız (kendi mikrofonumuzdan gelen ses)
let localStream; 
// Mikrofon açık mı kapalı mı?
let isMuted = false; 

// STUN sunucuları, WebRTC bağlantılarını NAT (Ağ Adresi Çevirisi) arkasından kurmaya yardımcı olur.
// Google'ın herkese açık STUN sunucuları kullanılabilir.
const iceServers = {
    'iceServers': [
        { 'urls': 'stun:stun.l.google.com:19302' },
        { 'urls': 'stun:stun1.l.google.com:19302' },
        { 'urls': 'stun:stun2.l.google.com:19302' },
        { 'urls': 'stun:stun3.l.google.com:19302' },
        { 'urls': 'stun:stun4.l.google.com:19302' },
    ]
};

// -----------------------------------------------------------------------------
// Kullanıcı Arayüzü (UI) İşlevleri
// -----------------------------------------------------------------------------

// Her bir "Odaya Bağlan" düğmesi için olay dinleyici ekliyoruz
connectButtons.forEach(button => {
    button.addEventListener('click', async (event) => {
        const profileCard = event.target.closest('.profile-card'); 
        
        currentUser = {
            id: profileCard.dataset.userId,
            name: profileCard.dataset.userName,
            pic: profileCard.dataset.profilePic
        };

        currentUserDisplay.textContent = `Hoş Geldin, ${currentUser.name}!`;

        // Profil seçim alanını gizle ve sohbet odası alanını göster
        profileSelectionDiv.style.display = 'none';
        chatRoomDiv.style.display = 'block';

        console.log(`${currentUser.name} profili seçildi ve odaya bağlanılıyor...`);
        
        // Kullanıcının mikrofon erişimini isteyelim
        try {
            // Sadece ses (audio: true) istiyoruz, video (video: false) istemiyoruz.
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            // Kendi sesimizi görmek için bir video etiketi oluşturabiliriz (isteğe bağlı, ses için gerekli değil)
            // Kendi sesimizi temsil eden bir video öğesi oluştur
            const localAudioEl = document.createElement('audio');
            localAudioEl.autoplay = true;
            localAudioEl.muted = true; // Kendi sesimizi dinlemek istemeyiz, yankı yapar
            localAudioEl.srcObject = localStream;
            localAudioEl.id = `local-audio-${currentUser.id}`; // Kendi elementimizi tanımlayalım

            // Görünür olması için (debugging amaçlı, production'da gizlenebilir)
            localAudioEl.style.display = 'none'; // Sadece ses olduğu için görünmez yapalım
            videosDiv.appendChild(localAudioEl);
            
            // Mikrofon açık olarak başlar
            isMuted = false;
            updateMuteButton();

            // Sunucuya 'joinRoom' olayını gönder ve seçilen kullanıcı bilgilerini aktar
            socket.emit('joinRoom', currentUser); 

        } catch (error) {
            console.error('Mikrofon erişimi reddedildi veya bir hata oluştu:', error);
            alert('Mikrofon erişimi izni vermeniz gerekiyor! Uygulama çalışmayabilir.');
        }
    });
});

// Mikrofon aç/kapat düğmesi işlevselliği
muteButton.addEventListener('click', () => {
    if (localStream) {
        // localStream'deki tüm ses parçalarını al
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled; // Mikrofonu aç/kapat
            isMuted = !track.enabled; // Durumu güncelle
            updateMuteButton(); // Düğme metnini ve rengini güncelle
            // Diğer kullanıcılara sessize alındığını bildirmek için bir Socket.IO olayı gönderebiliriz
            socket.emit('toggleMute', isMuted);
        });
    }
});

// Mikrofon düğmesinin metnini ve rengini güncelleyen fonksiyon
function updateMuteButton() {
    if (isMuted) {
        muteButton.textContent = 'Mikrofon Aç';
        muteButton.classList.remove('unmuted');
    } else {
        muteButton.textContent = 'Mikrofon Kapat';
        muteButton.classList.add('unmuted');
    }
}

// Konuşan kişiyi gösteren fonksiyon
let speakingTimeout;
function showSpeakingUser(userId, userName, userPic) {
    // Kendi konuşmamızı gösterme (isteğe bağlı)
    if (userId === socket.id) {
        speakingProfilePic.style.display = 'none'; // Kendi resmimizi gizleyelim
        speakingUserName.textContent = 'Sen Konuşuyorsun';
    } else {
        speakingProfilePic.src = userPic;
        speakingProfilePic.alt = `${userName} Profil Resmi`;
        speakingProfilePic.style.display = 'block'; // Resmi göster
        speakingUserName.textContent = userName;
    }
    
    // Konuşma durduktan sonra bilgiyi temizlemek için timeout
    clearTimeout(speakingTimeout);
    speakingTimeout = setTimeout(() => {
        speakingProfilePic.style.display = 'none';
        speakingUserName.textContent = '';
    }, 1500); // 1.5 saniye sonra temizle
}


// -----------------------------------------------------------------------------
// Socket.IO Olay Dinleyicileri (Sunucu ile İletişim)
// -----------------------------------------------------------------------------

// Sunucuya başarıyla bağlandığımızda
socket.on('connect', () => {
    console.log('Sunucuya bağlandı! Socket ID:', socket.id);
});

// Sunucudan 'userJoined' olayı geldiğinde (yeni birisi odaya katıldığında)
socket.on('userJoined', async (newSocketId, userData) => {
    console.log(`${userData.name} (${newSocketId}) odaya katıldı.`);
    // Yeni katılan kullanıcıya bir WebRTC bağlantısı teklifi gönder (eğer ben zaten bağlıysam)
    if (newSocketId !== socket.id && localStream) {
        // Yeni bir RTCPeerConnection oluştur
        const peerConnection = new RTCPeerConnection(iceServers);
        peerConnections[newSocketId] = peerConnection; // Bu bağlantıyı sakla

        // Kendi ses akışımızı karşı tarafa ekle
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        // Karşı taraftan gelen medya akışını dinle
        peerConnection.ontrack = (event) => {
            console.log('Uzak ses akışı alındı:', event.streams[0]);
            const remoteAudioEl = document.createElement('audio');
            remoteAudioEl.autoplay = true;
            remoteAudioEl.srcObject = event.streams[0];
            remoteAudioEl.id = `remote-audio-${newSocketId}`;
            videosDiv.appendChild(remoteAudioEl);

            // Ses seviyesi tespiti ve konuşan kişi gösterimi
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(event.streams[0]);
            source.connect(analyser);
            analyser.fftSize = 256;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            function checkSpeaking() {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
                // Eşik değeri ayarlayın, deneme yanılma ile bulunabilir
                if (average > 30) { // 30, konuşma sesini tespit etmek için bir eşik değeri olabilir
                    showSpeakingUser(newSocketId, userData.name, userData.pic);
                }
                requestAnimationFrame(checkSpeaking);
            }
            checkSpeaking();
        };

        // ICE adaylarını (ağ adresleri) sunucu aracılığıyla paylaş
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', newSocketId, event.candidate);
            }
        };

        // Bir teklif (offer) oluştur ve ayarla
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', newSocketId, offer); // Teklifi yeni kullanıcıya gönder
    }
});

// Sunucudan 'userLeft' olayı geldiğinde (birisi odadan ayrıldığında)
socket.on('userLeft', (socketId) => {
    console.log(`Kullanıcı (${socketId}) odadan ayrıldı.`);
    // O kişinin peer bağlantısını kapat
    if (peerConnections[socketId]) {
        peerConnections[socketId].close();
        delete peerConnections[socketId];
    }
    // O kişinin ses/video elementini kaldır
    const remoteAudioEl = document.getElementById(`remote-audio-${socketId}`);
    if (remoteAudioEl) {
        remoteAudioEl.remove();
    }
    // Konuşan kişi ayrılırsa ekranı temizle
    if (speakingProfilePic.alt === `${socketId} Profil Resmi` || speakingProfilePic.src.includes(socketId)) {
        speakingProfilePic.style.display = 'none';
        speakingUserName.textContent = '';
    }
});

// Sunucudan 'offer' geldiğinde (karşı taraftan bir bağlantı teklifi)
socket.on('offer', async (fromId, offer) => {
    console.log(`Teklif (${fromId}) adresinden alındı.`);
    if (fromId !== socket.id && localStream) {
        const peerConnection = new RTCPeerConnection(iceServers);
        peerConnections[fromId] = peerConnection;

        // Kendi ses akışımızı karşı tarafa ekle
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        // Karşı taraftan gelen medya akışını dinle
        peerConnection.ontrack = (event) => {
            console.log('Uzak ses akışı alındı:', event.streams[0]);
            const remoteAudioEl = document.createElement('audio');
            remoteAudioEl.autoplay = true;
            remoteAudioEl.srcObject = event.streams[0];
            remoteAudioEl.id = `remote-audio-${fromId}`;
            videosDiv.appendChild(remoteAudioEl);

            // Konuşan kişi tespiti için kullanıcı bilgilerini bul
            // Bu kısım için 'roomUpdate' event'ından gelen kullanıcı listesine ihtiyacımız var.
            // Şimdilik sadece id ile gösterelim. Daha sonra 'usersInRoom' gibi bir global değişken tutabiliriz.
            const connectedUser = Object.values(peerConnections).find(pc => pc.socketId === fromId)?.userData;
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(event.streams[0]);
            source.connect(analyser);
            analyser.fftSize = 256;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            function checkSpeaking() {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
                if (average > 30) {
                    // usersInRoom listesinden kullanıcıyı bulup adı ve resmi ile çağır
                    const speakerData = usersInRoom.find(u => u.id === fromId);
                    if (speakerData) {
                        showSpeakingUser(fromId, speakerData.name, speakerData.pic);
                    } else {
                        // Eğer kullanıcı bilgisi bulunamazsa sadece ID ile göster
                        showSpeakingUser(fromId, fromId, ''); // Resim yoksa boş gönder
                    }
                }
                requestAnimationFrame(checkSpeaking);
            }
            checkSpeaking();
        };

        // ICE adaylarını sunucu aracılığıyla paylaş
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', fromId, event.candidate);
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', fromId, answer); // Cevabı teklifi gönderen kişiye geri gönder
    }
});

// Sunucudan 'answer' geldiğinde (teklife verilen cevap)
socket.on('answer', async (fromId, answer) => {
    console.log(`Cevap (${fromId}) adresinden alındı.`);
    if (peerConnections[fromId]) {
        await peerConnections[fromId].setRemoteDescription(new RTCSessionDescription(answer));
    }
});

// Sunucudan 'candidate' geldiğinde (ICE adayı)
socket.on('candidate', async (fromId, candidate) => {
    console.log(`Aday (${fromId}) adresinden alındı.`);
    if (peerConnections[fromId] && candidate) {
        await peerConnections[fromId].addIceCandidate(new RTCIceCandidate(candidate));
    }
});

let usersInRoom = []; // Odadaki aktif kullanıcıları takip etmek için global bir dizi

// Sunucudan 'roomUpdate' olayı geldiğinde (odadaki kullanıcı listesi değiştiğinde)
// Bu event, hem yeni birisi katıldığında hem de birisi ayrıldığında tetiklenir
socket.on('roomUpdate', (users) => {
    console.log('Oda güncellendi. Yeni kullanıcılar:', users);
    usersInRoom = users; // Global kullanıcı listesini güncelle
    
    // Bu kısım, WebRTC bağlantıları için yardımcı olabilir.
    // Örneğin, 3 kişi tamamlandığında otomatik arama başlatmak gibi.
});


// Sunucudan sessize alma/açma bilgisi geldiğinde (isteğe bağlı)
socket.on('toggleMute', (socketId, isMutedStatus) => {
    // Burada diğer kullanıcıların sessize alınıp alınmadığını görsel olarak belirtebiliriz.
    // Örneğin, ilgili kullanıcının video/audio elementine bir ikon ekleyebiliriz.
    const user = usersInRoom.find(u => u.id === socketId);
    if (user) {
        console.log(`${user.name} ${isMutedStatus ? 'sessize alındı' : 'sessizden çıkarıldı'}.`);
        // UI'da bir gösterge ekleyebiliriz (örneğin, resmin üzerine bir mikrofon ikonu)
    }
});

// Hata yönetimi (isteğe bağlı)
socket.on('connect_error', (err) => {
    console.error('Socket.IO bağlantı hatası:', err.message);
    alert('Sunucuya bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.');
});