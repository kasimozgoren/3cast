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
const videosContainer = document.getElementById('videos-container'); // Uzaktan gelen medya için

const mediaFileInput = document.getElementById('mediaFileInput');
const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');
const mediaPreviewImage = document.getElementById('mediaPreviewImage');
const mediaPreviewVideo = document.getElementById('mediaPreviewVideo');
const clearMediaButton = document.getElementById('clearMediaButton');

// Sabit şifre
const CORRECT_PASSWORD = '123';

// Kullanıcı profilleri tanımları (Kesinleşen 4 profil)
const profiles = {
    'stannis': { name: 'Stannis', image: 'images/stannis.jpg' },
    'vion': { name: 'Vion', image: 'images/vion.jpg' },
    'mecburietten': { name: 'Mecburietten', image: 'images/mecburietten.jpg' },
    'misafir': { name: 'Misafir', image: 'images/default_guest.jpg' } // Misafir profili için default_guest.jpg kullanıldı
};

let localStream;
let audioContext;
let analyser;
let microphone;
let javascriptNode;
let speakingTimeout;
let isMuted = false;
let currentProfile = {}; // Seçilen profil bilgilerini tutacak
let selectedMediaFile = null; // Seçilen medya dosyasını tutacak

const socket = io(); // Socket.IO bağlantısını başlat

// WebRTC için PeerConnection'ları tutacak obje
const peerConnections = {};

// ICE Sunucuları (Google'ınkiler genellikle ücretsiz ve güvenilirdir)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Gerekirse TURN sunucuları da ekleyebilirsiniz (daha güvenilir bağlantı için)
        // { urls: 'turn:YOUR_TURN_SERVER_IP:YOUR_TURN_SERVER_PORT', username: 'user', credential: 'password' }
    ],
};

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
profileCardsContainer.addEventListener('click', async (event) => {
    const targetButton = event.target.closest('.connect-button');
    if (targetButton) {
        const profileCard = targetButton.closest('.profile-card');
        const profileId = profileCard.dataset.profile;

        currentProfile = profiles[profileId];

        if (currentProfile) {
            // İlk olarak kendi medya akışımızı al
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                setupLocalAudioAnalysis(); // Ses analizi için kurulum

                socket.emit('joinRoom', currentProfile); // Sunucuya profil bilgisi ile odaya katılma isteği gönder
                profileSelectionScreen.style.display = 'none';
                chatRoomScreen.style.display = 'flex';
                displayWelcomeScreen(currentProfile.name);
                showSpeakingUser({ name: 'Kimse', image: '' }); // Konuşan kişi alanını başlangıçta "Kimse Konuşmuyor" ile göster

                // Kendi sesimizi de dinlemek isterseniz (genellikle muted olur):
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
                // Eğer mikrofon erişimi olmazsa, odaya katılmayı engelle
                profileSelectionScreen.style.display = 'flex'; // Profil ekranında kal
                chatRoomScreen.style.display = 'none';
            }
        }
    }
});

// Ses analizi için kurulum (konuşma tespiti için)
function setupLocalAudioAnalysis() {
    if (!localStream) return;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    microphone = audioContext.createMediaStreamSource(localStream);
    analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0.3;
    analyser.fftSize = 1024;

    // DEPRECATION UYARISI İÇİN GEÇİCİ ÇÖZÜM: ScriptProcessorNode yerine AudioWorkletNode kullanımı daha modern ve tavsiye edilir.
    // Ancak basitlik ve uyumluluk için şimdilik ScriptProcessorNode kullanmaya devam ediyoruz.
    // Gelecekte AudioWorkletNode'a geçiş yapılmalı.
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

// Sohbet mesajı veya medya gönderme
sendButton.addEventListener('click', () => {
    const messageText = chatInput.value.trim();

    if (messageText || selectedMediaFile) {
        const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        
        const messageData = {
            sender: currentProfile.name,
            timestamp: timestamp,
            message: messageText || '' // Metin boş olabilir
        };

        if (selectedMediaFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                messageData.media = {
                    type: selectedMediaFile.type.startsWith('image') ? 'image' : 'video',
                    data: e.target.result // Base64 encoded veri
                };
                socket.emit('chatMessage', messageData);
                resetMediaInput();
            };
            reader.readAsDataURL(selectedMediaFile); // Dosyayı Base64 olarak oku
        } else {
            // Sadece metin mesajı
            socket.emit('chatMessage', messageData);
        }

        chatInput.value = ''; // Mesaj gönderildikten sonra inputu temizle
    }
});

// Enter tuşu ile mesaj gönderme
chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendButton.click();
    }
});

// Medya Dosyası Seçme
mediaFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        // Maksimum dosya boyutu (örneğin 10MB)
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_FILE_SIZE) {
            alert('Dosya boyutu çok büyük! Maksimum 10MB.');
            resetMediaInput();
            return;
        }

        selectedMediaFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            mediaPreviewContainer.style.display = 'flex';
            if (file.type.startsWith('image')) {
                mediaPreviewImage.src = e.target.result;
                mediaPreviewImage.style.display = 'block';
                mediaPreviewVideo.style.display = 'none';
            } else if (file.type.startsWith('video')) {
                mediaPreviewVideo.src = e.target.result;
                mediaPreviewVideo.style.display = 'block';
                mediaPreviewImage.style.display = 'none';
            }
        };
        reader.readAsDataURL(file);
    } else {
        resetMediaInput();
    }
});

// Medya Önizlemesini Temizleme
clearMediaButton.addEventListener('click', () => {
    resetMediaInput();
});

function resetMediaInput() {
    selectedMediaFile = null;
    mediaFileInput.value = ''; // Inputu sıfırla
    mediaPreviewContainer.style.display = 'none';
    mediaPreviewImage.src = '';
    mediaPreviewVideo.src = '';
    mediaPreviewVideo.style.display = 'none'; // Video gizli kalsın
    mediaPreviewImage.style.display = 'none'; // Resim gizli kalsın
}


// Mikrofonu kapatma/açma
muteButton.addEventListener('click', () => {
    if (localStream) {
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted; // Mikrofonu etkinleştir/devre dışı bırak

        // Tüm PeerConnection'lardaki kendi gönderdiğimiz ses track'ini de devre dışı bırak
        for (const peerId in peerConnections) {
            const sender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'audio');
            if (sender) {
                sender.track.enabled = !isMuted;
            }
        }

        if (isMuted) {
            muteButton.textContent = 'Mikrofon Aç';
            muteButton.classList.remove('unmuted');
            socket.emit('userMuted', currentProfile); // Mikrofonun kapatıldığını sunucuya bildir
            // Konuşma göstergesini gizle, sadece "Kimse Konuşmuyor" yazsın
            // showSpeakingUser({ name: 'Kimse', image: '' }); // Bu satırı kaldırdık, çünkü server tarafı bu bilgiyi client'lara gönderecek
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

    // Tüm WebRTC bağlantılarını kapat
    for (const peerId in peerConnections) {
        if (peerConnections[peerId]) {
            peerConnections[peerId].close();
        }
        delete peerConnections[peerId];
    }
    videosContainer.innerHTML = ''; // Tüm ses/video elementlerini temizle

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
    showSpeakingUser({ name: 'Kimse', image: '' }); // Konuşan kişiyi sıfırla ama görünür kalsın
    isMuted = false; // Mikrofon durumunu sıfırla
    muteButton.textContent = 'Mikrofon Kapat';
    muteButton.classList.add('unmuted');
    resetMediaInput(); // Medya önizlemesini sıfırla
});


// WebRTC Yardımcı Fonksiyonları

// Yeni bir RTCPeerConnection oluşturur veya var olanı döndürür
function createPeerConnection(otherUserSocketId) {
    if (peerConnections[otherUserSocketId]) {
        return peerConnections[otherUserSocketId];
    }

    const pc = new RTCPeerConnection(iceServers);
    console.log(`Yeni RTCPeerConnection oluşturuldu: ${otherUserSocketId}`);

    // Kendi yerel akışımızı bağlantıya ekle
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            console.log(`Yerel ses track'i eklendi: ${track.kind} ${track.id} to ${otherUserSocketId}`);
        });
    }

    // Uzak medya akışı (ses) geldiğinde
    pc.ontrack = (event) => {
        console.log(`Uzak akış geldi from ${otherUserSocketId}:`, event.streams[0]);
        let remoteAudio = document.getElementById(`audio-${otherUserSocketId}`);
        if (!remoteAudio) {
            remoteAudio = document.createElement('audio');
            remoteAudio.id = `audio-${otherUserSocketId}`;
            remoteAudio.autoplay = true; // Otomatik oynatma
            remoteAudio.playsinline = true; // iOS için gerekli olabilir
            videosContainer.appendChild(remoteAudio); // Gizli container'a ekle
            console.log(`Yeni audio elementi oluşturuldu ve eklendi: audio-${otherUserSocketId}`);
        }
        remoteAudio.srcObject = event.streams[0]; // Akışı ses elementine ata
    };

    // ICE adayı oluşturulduğunda sunucuya gönder
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // console.log(`ICE Adayı Gönderiliyor ${otherUserSocketId}:`, event.candidate);
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                target: otherUserSocketId,
            });
        }
    };

    // Bağlantı durumu değiştiğinde logla (hata ayıklama için)
    pc.onconnectionstatechange = () => {
        console.log(`PeerConnection State (${otherUserSocketId}):`, pc.connectionState);
    };
    pc.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State (${otherUserSocketId}):`, pc.iceConnectionState);
    };
    pc.onnegotiationneeded = async () => {
        // console.log('Müzakere gerekli:', otherUserSocketId);
        try {
            // Sadece stabil durumda teklif oluştur ve gönder
            if (pc.signalingState !== 'stable') {
                console.warn(`Müzakere zaten devam ediyor veya durum stabil değil (${pc.signalingState}). Teklif oluşturulmadı.`);
                return;
            }
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('webrtc-offer', {
                sdp: pc.localDescription,
                target: otherUserSocketId,
                senderProfile: currentProfile // Teklif gönderenin profilini de yolla
            });
            console.log(`Müzakere teklifi gönderildi: ${otherUserSocketId}`);
        } catch (error) {
            console.error('Müzakere teklifi oluşturma hatası:', error);
        }
    };

    peerConnections[otherUserSocketId] = pc;
    return pc;
}


// SOCKET.IO OLAY DİNLEYİCİLERİ //

// Sunucudan mesaj geldiğinde (hem metin hem de medya için)
socket.on('message', (data) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    if (data.sender === currentProfile.name) {
        messageElement.classList.add('self');
    } else {
        messageElement.classList.add('other');
    }

    let contentHTML = `<span class="sender-name">${data.sender} (${data.timestamp})</span>`;
    
    if (data.message) {
        contentHTML += `<span class="message-text">${data.message}</span>`;
    }

    if (data.media) {
        if (data.media.type === 'image') {
            contentHTML += `<img src="${data.media.data}" class="media-content" alt="Resim">`;
        } else if (data.media.type === 'video') {
            contentHTML += `<video src="${data.media.data}" class="media-content" controls></video>`;
        }
    }

    messageElement.innerHTML = contentHTML;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // En alta kaydır
});

// Kullanıcı listesi güncellendiğinde
socket.on('updateUsers', (users) => {
    usersList.innerHTML = ''; // Listeyi temizle
    const currentActivePeerIds = new Set(Object.keys(peerConnections)); // Mevcut bağlantıları takip et

    users.forEach(user => {
        // Kendi kendimize PeerConnection oluşturma
        if (user.id === socket.id) {
            const userItem = document.createElement('div');
            userItem.classList.add('user-item');
            userItem.innerHTML = `<img src="${user.profile.image}" alt="${user.profile.name}"><span ${user.isMuted ? 'style="text-decoration: line-through; opacity: 0.7;"' : ''}>${user.profile.name} (Sen)</span>`;
            usersList.appendChild(userItem);
            return;
        }

        const userItem = document.createElement('div');
        userItem.classList.add('user-item');
        userItem.innerHTML = `<img src="${user.profile.image}" alt="${user.profile.name}"><span ${user.isMuted ? 'style="text-decoration: line-through; opacity: 0.7;"' : ''}>${user.profile.name}</span>`;
        usersList.appendChild(userItem);

        // Yeni kullanıcılar için PeerConnection başlat
        if (!peerConnections[user.id]) {
            console.log(`Yeni kullanıcı algılandı: ${user.profile.name} (${user.id}). PeerConnection başlatılıyor.`);
            // createPeerConnection içinde onnegotiationneeded ile offer otomatik gönderilecek
            createPeerConnection(user.id);
        }
        currentActivePeerIds.delete(user.id); // Bu kullanıcı hala odada, silmeyeceğiz
    });

    // Odadan ayrılan kullanıcıların bağlantılarını kapat ve ses elementlerini kaldır
    currentActivePeerIds.forEach(disconnectedPeerId => {
        if (peerConnections[disconnectedPeerId]) {
            console.log(`Kullanıcı odadan ayrıldı: ${disconnectedPeerId}. PeerConnection kapatılıyor.`);
            peerConnections[disconnectedPeerId].close();
            delete peerConnections[disconnectedPeerId];
            const remoteAudio = document.getElementById(`audio-${disconnectedPeerId}`);
            if (remoteAudio) {
                remoteAudio.remove();
            }
        }
    });
});


// Sunucudan WebRTC teklifi alındığında
socket.on('webrtc-offer', async (data) => {
    console.log(`WebRTC Teklifi Alındı from ${data.senderProfile.name} (${data.senderId})`);
    const pc = createPeerConnection(data.senderId); // Teklif gönderen için PeerConnection oluştur/getir

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', {
            sdp: pc.localDescription,
            target: data.senderId,
        });
        console.log(`Cevap gönderildi ${data.senderId}:`, pc.localDescription);
    } catch (error) {
        console.error('Teklif işleme hatası:', error);
    }
});

// Sunucudan WebRTC cevabı alındığında
socket.on('webrtc-answer', async (data) => {
    console.log(`WebRTC Cevabı Alındı from ${data.senderId}`);
    const pc = peerConnections[data.senderId];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            console.log(`Uzak cevabı ayarlandı ${data.senderId}`);
        } catch (error) {
            console.error('Cevap işleme hatası:', error);
        }
    }
});

// Sunucudan ICE adayı alındığında
socket.on('ice-candidate', async (data) => {
    // console.log(`ICE Adayı Alındı from ${data.senderId}`);
    const pc = peerConnections[data.senderId];
    if (pc && data.candidate) { // Aday null veya undefined gelirse hata vermemek için kontrol
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            // console.log(`ICE Adayı eklendi ${data.senderId}`);
        } catch (error) {
            console.error('ICE adayı ekleme hatası:', error);
        }
    }
});

// Kimin konuştuğunu göster
socket.on('speaking', (profile) => {
    showSpeakingUser(profile);
});

// Konuşmayı durdurduğunu göster
socket.on('stoppedSpeaking', () => {
    if (speakingTimeout) {
        clearTimeout(speakingTimeout);
    }
    speakingTimeout = setTimeout(() => {
        showSpeakingUser({ name: 'Kimse', image: '' }); // Süre dolunca "Kimse Konuşmuyor" yap
    }, 1500); // 1.5 saniye sonra "Kimse Konuşmuyor" yaz
});


// Konuşan kişiyi gösteren fonksiyon (her zaman görünür)
function showSpeakingUser(profile) {
    if (speakingTimeout) {
        clearTimeout(speakingTimeout);
    }

    if (profile && profile.name !== 'Kimse') { // Gerçekten birisi konuşuyorsa
        speakingUserImage.src = profile.image;
        speakingUserImage.alt = `${profile.name} Konuşuyor`;
        speakingUserImage.style.display = 'block'; // Resmi göster
        speakingUserName.textContent = profile.name + " Konuşuyor...";
        speakingIndicator.classList.add('speaking-active'); // Konuşma aktif sınıfı (CSS'te belki bir animasyon için)
    } else { // Kimse konuşmuyorsa veya başlangıç durumu
        speakingUserImage.src = ''; // Resmin kaynağını boşalt
        speakingUserImage.alt = '';
        speakingUserImage.style.display = 'none'; // Resmi gizle
        speakingUserName.textContent = 'Kimse Konuşmuyor';
        speakingIndicator.classList.remove('speaking-active');
    }
    // speakingIndicator.style.display = 'flex'; // Zaten CSS'te flex, burada eklemeye gerek yok
}


// Sunucu bağlantısı kesildiğinde veya hata oluştuğunda
socket.on('disconnect', (reason) => {
    console.warn('Socket.IO bağlantısı kesildi:', reason);
    alert('Sunucuya bağlantı kesildi. Lütfen uygulamayı yeniden başlatın.');
    
    // Tüm WebRTC bağlantılarını kapat
    for (const peerId in peerConnections) {
        if (peerConnections[peerId]) {
            peerConnections[peerId].close();
        }
        delete peerConnections[peerId];
    }
    videosContainer.innerHTML = ''; // Tüm ses/video elementlerini temizle

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
    showSpeakingUser({ name: 'Kimse', image: '' }); // Konuşan kişiyi sıfırla ama görünür kalsın
    isMuted = false;
    muteButton.textContent = 'Mikrofon Kapat';
    muteButton.classList.add('unmuted');
    resetMediaInput(); // Medya önizlemesini sıfırla
});

socket.on('connect_error', (error) => {
    console.error('Socket.IO bağlantı hatası:', error);
    alert('Sunucuya bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.');
    chatRoomScreen.style.display = 'none';
    passwordScreen.style.display = 'flex';
    showSpeakingUser({ name: 'Kimse', image: '' }); // Bağlantı hatasında da sıfırla
    resetMediaInput(); // Medya önizlemesini sıfırla
});


// Uygulama yüklendiğinde profilleri yükle ve şifre ekranını göster
document.addEventListener('DOMContentLoaded', () => {
    // Uygulama ilk yüklendiğinde sadece şifre ekranını göster
    passwordScreen.style.display = 'flex';
    profileSelectionScreen.style.display = 'none';
    chatRoomScreen.style.display = 'none';
    showSpeakingUser({ name: 'Kimse', image: '' }); // Başlangıçta konuşan kişi alanını "Kimse Konuşmuyor" ile göster
    resetMediaInput(); // Medya önizlemesini başlangıçta gizle
});
