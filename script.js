// Socket.IO sunucusuna bağlanıyoruz
const socket = io(); // Render için dinamik bağlant

// HTML elemanlarını seçiyoruz (ID DÜZELTMELERİ BURADA YAPILDI)
const passwordScreen = document.querySelector('.password-screen');
const passwordInput = document.getElementById('passwordInput');
const passwordSubmitButton = document.getElementById('passwordSubmitButton');
const passwordErrorMessage = document.getElementById('passwordErrorMessage');

const profileSelectionScreen = document.getElementById('profileSelectionScreen');
const chatRoomScreen = document.getElementById('chatRoomScreen');
const profileCardsContainer = document.getElementById('profileCards');
const welcomeUserName = document.getElementById('welcomeUserName');

const speakingProfilePic = document.getElementById('speakingProfilePic');
const speakingUserName = document.getElementById('speakingUserName');
const toggleMuteButton = document.getElementById('toggleMuteButton');
const leaveRoomButton = document.getElementById('leaveRoomButton');

// Sohbet elementleri
const chatMessagesDiv = document.getElementById('chatMessagesDiv');
const chatInput = document.getElementById('chatInput');
const sendMessageButton = document.getElementById('sendMessageButton');
const videosContainer = document.getElementById('videos-container'); // Ses akışları için container (gizli)

const usersList = document.getElementById('usersList');

// Mevcut kullanıcı bilgilerini tutacak değişken
let currentUser = null;

// WebRTC ile ilgili değişkenler
const peerConnections = {};
let localStream;
let isMuted = false;

// STUN sunucuları
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
// Şifre Giriş İşlevselliği
// -----------------------------------------------------------------------------

const CORRECT_PASSWORD = "3castgizlisifresibromen"; // BURAYA KENDİ İSTEDİĞİNİZ ŞİFREYİ YAZIN!

passwordSubmitButton.addEventListener('click', () => {
    const enteredPassword = passwordInput.value;
    if (enteredPassword === CORRECT_PASSWORD) {
        passwordScreen.style.display = 'none';
        profileSelectionScreen.style.display = 'flex';
        passwordErrorMessage.textContent = '';
        loadProfiles(); // Profil kartlarını yükle
    } else {
        passwordErrorMessage.textContent = 'Yanlış şifre! Lütfen tekrar deneyin.';
        passwordInput.value = '';
    }
});

// Enter tuşuna basıldığında da giriş yapmayı sağla
passwordInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        passwordSubmitButton.click();
    }
});

// -----------------------------------------------------------------------------
// Kullanıcı Profilleri ve Seçimi
// -----------------------------------------------------------------------------

// Örnek profiller (sunucudan gelecek profillerin yerine geçici)
const PROFILES = [
    { id: 'stannis', name: 'Stannis', pic: 'images/stannis.jpg' },
    { id: 'hope', name: 'Hope', pic: 'images/hope.jpg' },
    { id: 'mecburiyetten', name: 'Mecburiyetten', pic: 'images/mecburiyetten.jpg' },
    { id: 'default', name: 'Misafir', pic: 'images/default_guest.jpg' } // Misafir resmi
];

function loadProfiles() {
    profileCardsContainer.innerHTML = ''; // Önceki kartları temizle
    PROFILES.forEach(profile => {
        const profileCard = document.createElement('div');
        profileCard.classList.add('profile-card');
        profileCard.dataset.userId = profile.id;
        profileCard.dataset.userName = profile.name;
        profileCard.dataset.profilePic = profile.pic;

        profileCard.innerHTML = `
            <img src="${profile.pic}" alt="${profile.name} Profil Resmi">
            <h3>${profile.name}</h3>
            <button class="connect-button">Odaya Bağlan</button>
        `;
        profileCardsContainer.appendChild(profileCard);
    });

    // Profil kartları yüklendikten sonra event listener'ları ekle
    document.querySelectorAll('.profile-card .connect-button').forEach(button => {
        button.addEventListener('click', async (event) => {
            const profileCard = event.target.closest('.profile-card');
            currentUser = {
                id: profileCard.dataset.userId,
                name: profileCard.dataset.userName,
                pic: profileCard.dataset.profilePic
            };

            welcomeUserName.textContent = currentUser.name;

            profileSelectionScreen.style.display = 'none';
            chatRoomScreen.style.display = 'flex';

            console.log(`${currentUser.name} profili seçildi ve odaya bağlanılıyor...`);

            try {
                // Mikrofon akışını başlat ve gürültü engelleme/iyileştirme özelliklerini etkinleştir
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });

                // Mikrofon durumunu güncelle
                isMuted = false;
                updateMuteButton();

                // Sunucuya odaya katıldığını bildir
                socket.emit('joinRoom', currentUser);

                // Kendi sesini sürekli dinle ve konuşma algıla
                setupLocalAudioAnalysis();

            } catch (error) {
                console.error('Mikrofon erişimi reddedildi veya bir hata oluştu:', error);
                alert('Mikrofon erişimi izni vermeniz gerekiyor! Sesli iletişim ve konuşma tespiti çalışmayabilir.');
                // Mikrofon erişimi olmasa bile odaya katılmaya devam et (ancak sesli iletişim olmaz)
                socket.emit('joinRoom', currentUser);
            }
        });
    });
}

// Uygulama yüklendiğinde profilleri yükle
document.addEventListener('DOMContentLoaded', () => {
    // Uygulama ilk yüklendiğinde sadece şifre ekranını göster
    passwordScreen.style.display = 'flex';
    profileSelectionScreen.style.display = 'none';
    chatRoomScreen.style.display = 'none';
});

// -----------------------------------------------------------------------------
// Kullanıcı Arayüzü (UI) İşlevleri - Genel
// -----------------------------------------------------------------------------

toggleMuteButton.addEventListener('click', () => {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
            isMuted = !track.enabled;
            updateMuteButton();
            // Diğer kullanıcılara sessize alındığını/açıldığını bildir
            socket.emit('toggleMute', isMuted);
        });
    }
});

leaveRoomButton.addEventListener('click', () => {
    // WebRTC peer bağlantılarını kapat
    for (const peerId in peerConnections) {
        if (peerConnections[peerId]) {
            peerConnections[peerId].close();
            delete peerConnections[peerId];
        }
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    socket.disconnect(); // Socket.IO bağlantısını kes

    // Arayüzü sıfırla
    chatRoomScreen.style.display = 'none';
    profileSelectionScreen.style.display = 'none';
    passwordScreen.style.display = 'flex';

    chatMessagesDiv.innerHTML = ''; // Sohbet mesajlarını temizle
    usersList.innerHTML = '';
    speakingProfilePic.style.display = 'none';
    speakingUserName.textContent = 'Kimse Konuşmuyor'; // Varsayılan metni ayarla
    videosContainer.innerHTML = ''; // Remote sesleri temizle

    console.log("Odadan ayrıldı ve bağlantı kesildi.");
    // Sayfayı tamamen yeniden yükleyerek tüm durumu sıfırlayabiliriz
    // location.reload(); // Sayfayı yeniden yüklemek yerine sadece Socket bağlantısını kesmek daha iyi
});


function updateMuteButton() {
    if (isMuted) {
        toggleMuteButton.textContent = 'Mikrofon Aç';
        toggleMuteButton.classList.remove('unmuted');
    } else {
        toggleMuteButton.textContent = 'Mikrofon Kapat';
        toggleMuteButton.classList.add('unmuted');
    }
}

let speakingTimeout;
function showSpeakingUser(userId, userName, userPic) {
    // Konuk profili veya olmayan resimler için varsayılan resim
    const displayPic = userPic || 'images/default_guest.jpg';

    speakingProfilePic.src = displayPic;
    speakingProfilePic.alt = `${userName} Profil Resmi`;
    speakingProfilePic.style.display = 'block';

    // KENDİ KONUŞMASINI GÖSTERME DÜZELTMESİ BURADA
    if (userId === socket.id) {
        speakingUserName.textContent = 'Sen Konuşuyorsun';
    } else {
        speakingUserName.textContent = userName;
    }

    clearTimeout(speakingTimeout);
    speakingTimeout = setTimeout(() => {
        speakingProfilePic.style.display = 'none';
        speakingUserName.textContent = 'Kimse Konuşmuyor'; // Konuşma durunca varsayılan metin
    }, 1500);
}

function updateUsersInRoom(users) {
    usersList.innerHTML = '';
    users.forEach(user => {
        if (user.id) {
            const userItem = document.createElement('div');
            userItem.classList.add('user-item');
            // Konuk profili için özel resim yolu veya varsayılan resim
            const userPicPath = user.pic || 'images/default_guest.jpg';
            userItem.innerHTML = `
                <img src="${userPicPath}" alt="${user.name} Profil Resmi">
                <span>${user.name} ${user.id === socket.id ? '(Sen)' : ''}</span>
            `;
            usersList.appendChild(userItem);
        }
    });
}

// -----------------------------------------------------------------------------
// WebRTC İşlevselliği
// -----------------------------------------------------------------------------

function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(iceServers);

    // Kendi lokal stream'imizi (mikrofon) peer'e ekle
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // ICE adayları oluşturulduğunda sunucuya gönder
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('candidate', peerId, event.candidate);
        }
    };

    // Uzak bir stream (ses) geldiğinde
    pc.ontrack = (event) => {
        console.log(`Uzak akış ${peerId} için alındı`);
        const remoteAudio = document.createElement('audio');
        remoteAudio.id = `audio-${peerId}`; // ID ekle
        remoteAudio.autoplay = true;
        remoteAudio.controls = false; // Kontrolleri gizle
        remoteAudio.srcObject = event.streams[0];
        videosContainer.appendChild(remoteAudio); // Gizli containera ekle
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`ICE bağlantı durumu (${peerId}):`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            console.log(`PeerConnection ${peerId} bağlantısı kesildi.`);
            removeRemoteAudio(peerId);
        }
    };

    pc.onnegotiationneeded = async () => {
        try {
            // Sadece offer'ı başlatan taraf negotiationneeded'ı kullanır
            // Bu kısım genellikle yeni bir kullanıcı odaya katıldığında veya mevcut bir kullanıcıya offer gönderilmesi gerektiğinde tetiklenir
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', peerId, pc.localDescription);
            console.log(`Offer gönderildi ${peerId} için`);

        } catch (err) {
            console.error('Offer oluşturulurken hata:', err);
        }
    };

    return pc;
}

function removeRemoteAudio(peerId) {
    const remoteAudio = document.getElementById(`audio-${peerId}`);
    if (remoteAudio) {
        if (remoteAudio.srcObject) {
            remoteAudio.srcObject.getTracks().forEach(track => track.stop()); // Stream'i durdur
        }
        remoteAudio.remove(); // HTML'den kaldır
        console.log(`Uzak ses (${peerId}) kaldırıldı.`);
    }
}

// -----------------------------------------------------------------------------
// Ses Algılama (Lokal Mikrofon Analizi)
// -----------------------------------------------------------------------------

function setupLocalAudioAnalysis() {
    if (!localStream) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function checkLocalSpeaking() {
        if (isMuted) { // Mikrofon kapalıysa konuşma kontrolü yapma
            requestAnimationFrame(checkLocalSpeaking);
            return;
        }
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
        // Eşik değeri aşılırsa konuşuyor demektir
        if (average > 30) { // Bu eşik değerini test ederek ayarlayabilirsiniz
            // Sunucuya benim konuştuğumu bildir
            socket.emit('isSpeaking', currentUser.id, currentUser.name, currentUser.pic);
        }
        requestAnimationFrame(checkLocalSpeaking);
    }
    checkLocalSpeaking();
}

// -----------------------------------------------------------------------------
// Sohbet Mesajı İşlevselliği
// -----------------------------------------------------------------------------

const MAX_MESSAGES = 100; // Sohbet geçmişindeki maksimum mesaj sayısı

sendMessageButton.addEventListener('click', () => {
    sendMessage();
});

chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const messageText = chatInput.value.trim();
    if (messageText) {
        const message = {
            senderId: socket.id,
            senderName: currentUser.name,
            senderPic: currentUser.pic,
            text: messageText,
            timestamp: new Date().toLocaleTimeString()
        };
        socket.emit('chatMessage', message);
        chatInput.value = ''; // Mesaj gönderildikten sonra inputu temizle
    }
}

function displayMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    // Kendi mesajımız mı başkasının mesajı mı kontrol et
    if (message.senderId === socket.id) {
        messageElement.classList.add('self');
    } else {
        messageElement.classList.add('other');
    }

    // Konuşan kişinin profil resmi için varsayılan guest resmi
    const displayPic = message.senderPic || 'images/default_guest.jpg';

    messageElement.innerHTML = `
        <span class="sender-name">${message.senderName} <span style="font-weight: normal; font-size: 0.8em; color: #bdc3c7;">(${message.timestamp})</span></span>
        <span class="message-text">${message.text}</span>
    `;
    chatMessagesDiv.appendChild(messageElement);

    // Mesaj sayısını kontrol et ve limiti aşarsa en eski mesajı sil
    while (chatMessagesDiv.children.length > MAX_MESSAGES) {
        chatMessagesDiv.removeChild(chatMessagesDiv.firstElementChild);
    }

    // En alta kaydır
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}


// -----------------------------------------------------------------------------
// Socket.IO Olay Dinleyicileri (Sunucu ile İletişim)
// -----------------------------------------------------------------------------

socket.on('connect', () => {
    console.log('Sunucuya bağlandı! Socket ID:', socket.id);
});

socket.on('userJoined', (newSocketId, userData) => {
    console.log(`${userData.name} (${newSocketId}) odaya katıldı.`);

    // Odaya katılım mesajını chat'e de ekleyebiliriz
    if (newSocketId !== socket.id) { // Kendi katılım mesajımızı tekrar etme
        displayMessage({
            senderId: 'system',
            senderName: 'Sistem',
            text: `${userData.name} odaya katıldı.`,
            timestamp: new Date().toLocaleTimeString()
        });
    }

    // Yeni bağlanan kullanıcı için PeerConnection oluştur
    if (newSocketId !== socket.id && localStream) {
        const pc = createPeerConnection(newSocketId);
        peerConnections[newSocketId] = pc;
    }
});

socket.on('userLeft', (socketId, userName) => {
    console.log(`Kullanıcı (${socketId}) odadan ayrıldı.`);

    // Odadan ayrılma mesajını chat'e de ekleyebiliriz
    displayMessage({
        senderId: 'system',
        senderName: 'Sistem',
        text: `${userName || socketId} odadan ayrıldı.`,
        timestamp: new Date().toLocaleTimeString()
    });

    // WebRTC PeerConnection'ı ve uzak ses/video'yu kapat
    if (peerConnections[socketId]) {
        peerConnections[socketId].close();
        delete peerConnections[socketId];
    }
    removeRemoteAudio(socketId); // Uzak ses elementini kaldır

    // Konuşan kişi ayrılırsa ekranı temizle
    if (speakingProfilePic.style.display === 'block' &&
        (speakingUserName.textContent.includes(socketId) || speakingUserName.textContent === 'Sen Konuşuyorsun')) {
        speakingProfilePic.style.display = 'none';
        speakingUserName.textContent = 'Kimse Konuşmuyor'; // Varsayılan metin
    }
});

// WebRTC sinyalizasyon mesajları
socket.on('offer', async (senderId, offer) => {
    if (!peerConnections[senderId]) {
        peerConnections[senderId] = createPeerConnection(senderId);
    }
    try {
        await peerConnections[senderId].setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnections[senderId].createAnswer();
        await peerConnections[senderId].setLocalDescription(answer);
        socket.emit('answer', senderId, peerConnections[senderId].localDescription);
    } catch (err) {
        console.error('Offer işlenirken hata:', err);
    }
});

socket.on('answer', async (senderId, answer) => {
    if (peerConnections[senderId]) {
        try {
            await peerConnections[senderId].setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
            console.error('Answer işlenirken hata:', err);
        }
    }
});

socket.on('candidate', async (senderId, candidate) => {
    if (peerConnections[senderId]) {
        try {
            await peerConnections[senderId].addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error('ICE adayı eklenirken hata:', err);
        }
    }
});

socket.usersInRoom = [];

socket.on('roomUpdate', (users) => {
    console.log('Oda güncellendi. Yeni kullanıcılar:', users);
    socket.usersInRoom = users;
    updateUsersInRoom(users);
});

socket.on('toggleMute', (socketId, isMutedStatus) => {
    const user = socket.usersInRoom.find(u => u.id === socketId);
    if (user) {
        console.log(`${user.name} ${isMutedStatus ? 'sessize alındı' : 'sessizden çıkarıldı'}.`);
        // Eğer uzaktaki sesi çalmaya devam ediyorsak, sessize alma/açma durumunu burada yönetebiliriz.
        // Örneğin, audio elementinin sesini kısmak gibi:
        const remoteAudio = document.getElementById(`audio-${socketId}`);
        if (remoteAudio) {
            remoteAudio.muted = isMutedStatus; // veya remoteAudio.volume = isMutedStatus ? 0 : 1;
        }
    }
});

// Sunucudan gelen konuşma durumunu dinle
socket.on('speakingUser', (userId, userName, userPic) => {
    showSpeakingUser(userId, userName, userPic);
});

// Sunucudan gelen sohbet mesajlarını dinle
socket.on('chatMessage', (message) => {
    displayMessage(message);
});

socket.on('connect_error', (err) => {
    console.error('Socket.IO bağlantı hatası:', err.message);
    alert('Sunucuya bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.');
});
