const passwordScreen = document.getElementById('passwordScreen');
const profileSelectionScreen = document.getElementById('profileSelectionScreen');
const chatRoomScreen = document.getElementById('chatRoomScreen');

const passwordInput = document.getElementById('passwordInput');
const passwordSubmitButton = document.getElementById('passwordSubmitButton');
const passwordErrorMessage = document.getElementById('passwordErrorMessage');

const profileCardsContainer = document.querySelector('.profile-cards');
const welcomeMessage = document.getElementById('welcomeMessage');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const chatMessages = document.getElementById('chatMessages');
const usersList = document.getElementById('usersList');
const muteButton = document.getElementById('muteButton');
const disconnectButton = document.getElementById('disconnectButton');
const speakingIndicator = document.getElementById('speakingIndicator');
const speakingUserName = document.getElementById('speakingUserName');
const speakingUserImage = document.getElementById('speakingUserImage');
const videosContainer = document.getElementById('videos-container'); // Gizli videolar için

// Sabit şifre
const CORRECT_PASSWORD = '3castgizlisifresibromen'; // Bu şifreyi kendi istediğinizle değiştirin

// Kullanıcı profilleri tanımları
const profiles = {
    'stannis': { name: 'Stannis', image: 'images/stannis.jpg' },
    'vion': { name: 'Vion', image: 'images/vion.jpg' }, // Hope yerine Vion
    'mecburietten': { name: 'Mecburietten', image: 'images/mecburietten.jpg' },
    'guest': { name: 'Misafir', image: 'images/default_guest.jpg' } // Misafir profili
};

let localStream;
let audioContext;
let analyser;
let microphone;
let javascriptNode;
let speakingTimeout;
let isMuted = false;
let currentProfile = {}; // Seçilen profil bilgilerini tutacak

const socket = io(); // Socket.IO bağlantısını başlat

// Şifre Giriş Mantığı
passwordSubmitButton.addEventListener('click', () => {
    if (passwordInput.value === CORRECT_PASSWORD) {
        passwordScreen.style.display = 'none';
        profileSelectionScreen.style.display = 'flex';
        passwordErrorMessage.style.display = 'none';
        passwordInput.value = ''; // Şifre alanını temizle
    } else {
        passwordErrorMessage.style.display = 'block';
        passwordInput.value = ''; // Yanlış şifreyi temizle
    }
});

// Profil Seçimi Mantığı
profileCardsContainer.addEventListener('click', (event) => {
    const targetButton = event.target.closest('.connect-button');
    if (targetButton) {
        const profileCard = targetButton.closest('.profile-card');
        const profileId = profileCard.dataset.profile;

        currentProfile = profiles[profileId];

        if (currentProfile) {
            socket.emit('joinRoom', currentProfile); // Sunucuya profil bilgisi ile odaya katılma isteği gönder
            profileSelectionScreen.style.display = 'none';
            chatRoomScreen.style.display = 'flex';
            displayWelcomeScreen(currentProfile.name);
            initializeAudioStream();
        }
    }
});

// Ses akışını başlatma (mikrofon)
async function initializeAudioStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setupLocalAudioAnalysis(); // Ses analizi için kurulum
        // Kendi sesimizi de diğer kullanıcılara göndermek için
        socket.emit('audioStream', { streamId: socket.id, profile: currentProfile });
        console.log("Ses akışı başlatıldı ve sunucuya bilgi gönderildi.");

        // Kendi ses akışımızı dinlemek için (isteğe bağlı, debugging için)
        // const selfAudio = document.createElement('audio');
        // selfAudio.srcObject = localStream;
        // selfAudio.muted = true; // Kendi sesimizi duymayalım
        // selfAudio.play();
        // videosContainer.appendChild(selfAudio); // Gizli div'e ekle
    } catch (error) {
        console.error('Mikrofon erişimi reddedildi veya başka bir hata oluştu:', error);
        alert('Mikrofon erişimi gerekli. Lütfen izin verin.');
        muteButton.textContent = 'Mikrofon Kapalı';
        muteButton.classList.remove('unmuted');
    }
}

// Ses analizi için kurulum
function setupLocalAudioAnalysis() {
    if (!localStream) return;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    microphone = audioContext.createMediaStreamSource(localStream);
    analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0.3;
    analyser.fftSize = 1024;

    javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

    microphone.connect(analyser);
    analyser.connect(javascriptNode);
    javascriptNode.connect(audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const THRESHOLD = 10; // Ses seviyesi eşiği (0-255 arası)

    javascriptNode.onaudioprocess = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        let average = sum / dataArray.length;

        if (average > THRESHOLD && !isMuted) {
            socket.emit('isSpeaking', currentProfile);
            // console.log('Konuşuyor:', currentProfile.name, 'Ortalama:', average);
        }
    };
}


// Karşılama mesajını göster
function displayWelcomeScreen(profileName) {
    welcomeMessage.textContent = `Hoş Geldin, ${profileName}!`;
}

// Sohbet mesajı gönderme
sendButton.addEventListener('click', () => {
    const messageText = chatInput.value.trim();
    if (messageText) {
        const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        socket.emit('chatMessage', { sender: currentProfile.name, message: messageText, timestamp: timestamp });
        chatInput.value = ''; // Mesaj gönderildikten sonra inputu temizle
    }
});

// Enter tuşu ile mesaj gönderme
chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendButton.click();
    }
});

// Mikrofonu kapatma/açma
muteButton.addEventListener('click', () => {
    if (localStream) {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted; // Mikrofonu etkinleştir/devre dışı bırak
        if (isMuted) {
            muteButton.textContent = 'Mikrofon Aç';
            muteButton.classList.remove('unmuted');
            socket.emit('userMuted', currentProfile); // Mikrofonun kapatıldığını sunucuya bildir
            hideSpeakingUser(); // Konuşma göstergesini gizle
        } else {
            muteButton.textContent = 'Mikrofon Kapat';
            muteButton.classList.add('unmuted');
            socket.emit('userUnmuted', currentProfile); // Mikrofonun açıldığını sunucuya bildir
        }
    }
});

// Odadan ayrılma
disconnectButton.addEventListener('click', () => {
    socket.emit('disconnectRoom'); // Sunucuya odadan ayrılma isteği gönder

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop()); // Mikrofonu durdur
    }
    if (audioContext) {
        audioContext.close(); // AudioContext'i kapat
    }

    // Ekranları sıfırla
    chatRoomScreen.style.display = 'none';
    passwordScreen.style.display = 'flex'; // Şifre ekranına geri dön
    chatMessages.innerHTML = ''; // Sohbet mesajlarını temizle
    usersList.innerHTML = ''; // Kullanıcı listesini temizle
    hideSpeakingUser(); // Konuşan kişiyi sıfırla
    isMuted = false; // Mikrofon durumunu sıfırla
    muteButton.textContent = 'Mikrofon Kapat';
    muteButton.classList.add('unmuted');
});


// SOCKET.IO OLAY DİNLEYİCİLERİ //

// Sunucudan mesaj geldiğinde
socket.on('message', (data) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    // Kendi mesajımız mı, başkasının mesajı mı?
    if (data.sender === currentProfile.name) {
        messageElement.classList.add('self');
    } else {
        messageElement.classList.add('other');
    }

    messageElement.innerHTML = `<span class="sender-name">${data.sender} (${data.timestamp})</span><span class="message-text">${data.message}</span>`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // En alta kaydır
});

// Kullanıcı listesi güncellendiğinde
socket.on('updateUsers', (users) => {
    usersList.innerHTML = ''; // Listeyi temizle
    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.classList.add('user-item');

        const isSelf = user.id === socket.id;
        const userDisplayName = isSelf ? `${user.profile.name} (Sen)` : user.profile.name;
        const userImage = user.profile.image; // Profil resmini kullan

        userItem.innerHTML = `<img src="${userImage}" alt="${userDisplayName}"><span ${user.isMuted ? 'style="text-decoration: line-through; opacity: 0.7;"' : ''}>${userDisplayName}</span>`;
        usersList.appendChild(userItem);
    });
});

// Kimin konuştuğunu göster
socket.on('speaking', (profile) => {
    showSpeakingUser(profile);
});

// Konuşmayı durdurduğunu göster
socket.on('stoppedSpeaking', () => {
    // Sadece eğer konuşan kişi şu an gösterilen kişiyse gizle
    if (speakingTimeout) {
        clearTimeout(speakingTimeout);
    }
    speakingTimeout = setTimeout(hideSpeakingUser, 1500); // 1.5 saniye sonra gizle
});

// Konuşan kişiyi gösteren fonksiyon
function showSpeakingUser(profile) {
    if (speakingTimeout) {
        clearTimeout(speakingTimeout);
    }
    speakingUserImage.src = profile.image;
    speakingUserImage.alt = `${profile.name} Konuşuyor`;
    speakingUserName.textContent = profile.name + " Konuşuyor...";
    speakingIndicator.style.display = 'flex'; // Göster
}

// Konuşan kişiyi gizleyen fonksiyon
function hideSpeakingUser() {
    speakingUserImage.src = 'images/default_guest.jpg'; // Varsayılan resme dön
    speakingUserImage.alt = 'Kimse Konuşmuyor';
    speakingUserName.textContent = 'Kimse Konuşmuyor';
    // speakingIndicator.style.display = 'none'; // Tamamen gizlememize gerek yok, sadece içeriği değişsin
}

// Sunucu bağlantısı kesildiğinde veya hata oluştuğunda
socket.on('disconnect', (reason) => {
    console.warn('Socket.IO bağlantısı kesildi:', reason);
    alert('Sunucuya bağlantı kesildi. Lütfen uygulamayı yeniden başlatın.');
    // Gerekirse kullanıcıyı ana ekrana yönlendir
    chatRoomScreen.style.display = 'none';
    passwordScreen.style.display = 'flex';
    // Temizlik
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.close();
    }
    chatMessages.innerHTML = '';
    usersList.innerHTML = '';
    hideSpeakingUser();
    isMuted = false;
    muteButton.textContent = 'Mikrofon Kapat';
    muteButton.classList.add('unmuted');
});

socket.on('connect_error', (error) => {
    console.error('Socket.IO bağlantı hatası:', error);
    alert('Sunucuya bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.');
    chatRoomScreen.style.display = 'none';
    passwordScreen.style.display = 'flex';
});


// Uygulama yüklendiğinde profilleri yükle ve şifre ekranını göster
document.addEventListener('DOMContentLoaded', () => {
    // Uygulama ilk yüklendiğinde sadece şifre ekranını göster
    passwordScreen.style.display = 'flex';
    profileSelectionScreen.style.display = 'none';
    chatRoomScreen.style.display = 'none';
});
