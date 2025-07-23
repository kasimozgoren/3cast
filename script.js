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

// Sabit şifre
const CORRECT_PASSWORD = '123';

// Kullanıcı profilleri tanımları
const profiles = {
    'stannis': { name: 'Stannis', image: 'images/stannis.jpg' },
    'vion': { name: 'Vion', image: 'images/vion.jpg' },
    'mecburietten': { name: 'Mecburietten', image: 'images/mecburietten.jpg' },
    'misafir': { name: 'Misafir', image: 'images/default_guest.jpg' }
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

// WebRTC için PeerConnection'ları tutacak obje
const peerConnections = {};

// ICE Sunucuları (STUN sunucuları)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // TURN sunucusuna şu an için ihtiyaç duyulmadığı varsayıldı.
        // Eğer farklı ağlardaki kişiler arasında bağlantı kurulamazsa, buraya bir TURN sunucusu eklemek gerekebilir.
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
            try {
                // Mikrofon erişimi isteği
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                console.log('Mikrofon erişimi başarılı. Yerel akış alındı.');
                
                // AudioContext'i Resume et (tarayıcılar kullanıcı etkileşimi olmadan ses çalmayı engelleyebilir)
                if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                setupLocalAudioAnalysis(); // Ses analizi için kurulum

                socket.emit('joinRoom', currentProfile); // Sunucuya profil bilgisi ile odaya katılma isteği gönder
                profileSelectionScreen.style.display = 'none';
                chatRoomScreen.style.display = 'flex';
                displayWelcomeScreen(currentProfile.name);
                showSpeakingUser({ name: 'Kimse', image: '' }); // Konuşan kişi alanını başlangıçta "Kimse Konuşmuyor" ile göster

            } catch (error) {
                console.error('Mikrofon erişim hatası:', error);
                alert('Mikrofon erişimi gerekli. Lütfen izin verin.');
                muteButton.textContent = 'Mikrofon Kapalı';
                muteButton.classList.remove('unmuted');
                profileSelectionScreen.style.display = 'flex'; // Profil ekranında kal
                chatRoomScreen.style.display = 'none';
            }
        }
    }
});

// Ses analizi için kurulum (konuşma tespiti için)
function setupLocalAudioAnalysis() {
    if (!localStream) return;

    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close(); // Mevcut context'i kapat
    }
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
    const THRESHOLD = 10; 

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
    console.log('Yerel ses analizi kurulumu tamamlandı.');
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
        
        const messageData = {
            sender: currentProfile.name,
            timestamp: timestamp,
            message: messageText
        };

        socket.emit('chatMessage', messageData);
        console.log('Metin mesajı gönderildi:', messageText);

        chatInput.value = ''; // Mesaj gönderildikten sonra inputu temizle
    }
});

// Enter tuşu ile mesaj gönderme
chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Varsayılan Enter davranışını (yeni satır) engelle
        sendButton.click();
    }
});

// Mikrofonu kapatma/açma
muteButton.addEventListener('click', () => {
    if (localStream) {
        isMuted = !isMuted;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !isMuted; // Mikrofonu etkinleştir/devre dışı bırak
            console.log(`Mikrofon durumu: ${isMuted ? 'Kapalı' : 'Açık'}`);
        } else {
            console.warn('Ses track bulunamadı.');
        }

        // Tüm PeerConnection'lardaki kendi gönderdiğimiz ses track'ini de devre dışı bırak
        for (const peerId in peerConnections) {
            const sender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'audio' && s.track === audioTrack);
            if (sender) {
                sender.track.enabled = !isMuted;
                console.log(`PeerConnection ${peerId} için kendi ses track'i güncellendi.`);
            }
        }

        if (isMuted) {
            muteButton.textContent = 'Mikrofon Aç';
            muteButton.classList.remove('unmuted');
            socket.emit('userMuted', currentProfile); // Mikrofonun kapatıldığını sunucuya bildir
        } else {
            muteButton.textContent = 'Mikrofon Kapat';
            muteButton.classList.add('unmuted');
            socket.emit('userUnmuted', currentProfile); // Mikrofonun açıldığını sunucuya bildir
        }
    } else {
        console.warn('Yerel akış yok, mikrofon durumu değiştirilemez.');
    }
});

// Odadan ayrılma
disconnectButton.addEventListener('click', () => {
    socket.emit('disconnectRoom'); // Sunucuya odadan ayrılma isteği gönder

    // Tüm WebRTC bağlantılarını kapat
    for (const peerId in peerConnections) {
        if (peerConnections[peerId]) {
            console.log(`PeerConnection kapatılıyor: ${peerId}`);
            peerConnections[peerId].close();
        }
        delete peerConnections[peerId];
    }
    videosContainer.innerHTML = ''; // Tüm ses/video elementlerini temizle
    console.log('Tüm PeerConnections ve remote audio/video temizlendi.');

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop()); // Mikrofonu durdur
        console.log('Yerel akış durduruldu.');
    }
    if (audioContext) {
        if (audioContext.state !== 'closed') {
            audioContext.close(); // AudioContext'i kapat
            console.log('AudioContext kapatıldı.');
        }
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
    console.log('Uygulama durumu sıfırlandı.');
});


// WebRTC Yardımcı Fonksiyonları

// Yeni bir RTCPeerConnection oluşturur veya var olanı döndürür
function createPeerConnection(otherUserSocketId, isInitiator = false) {
    if (peerConnections[otherUserSocketId]) {
        console.log(`Mevcut RTCPeerConnection kullanılıyor: ${otherUserSocketId}`);
        return peerConnections[otherUserSocketId];
    }

    const pc = new RTCPeerConnection(iceServers);
    console.log(`Yeni RTCPeerConnection oluşturuldu: ${otherUserSocketId}`);

    // Kendi yerel akışımızı bağlantıya ekle
    if (localStream) {
        localStream.getTracks().forEach(track => {
            const senders = pc.getSenders();
            const existingSender = senders.find(s => s.track === track);
            if (!existingSender) {
                pc.addTrack(track, localStream);
                console.log(`Yerel ses track'i eklendi: ${track.kind} ${track.id} to ${otherUserSocketId}`);
            } else {
                console.log(`Yerel ses track'i zaten ekli: ${track.kind} ${track.id} to ${otherUserSocketId}`);
            }
        });
    }

    // Uzak medya akışı (ses) geldiğinde
    pc.ontrack = (event) => {
        console.log(`Uzak akış geldi from ${otherUserSocketId}:`, event.streams[0]);
        let remoteAudio = document.getElementById(`audio-${otherUserSocketId}`);
        if (!remoteAudio) {
            remoteAudio = document.createElement('audio');
            remoteAudio.id = `audio-${otherUserSocketId}`;
            remoteAudio.autoplay = true;
            remoteAudio.playsinline = true;
            remoteAudio.controls = false; 
            videosContainer.appendChild(remoteAudio);
            console.log(`Yeni audio elementi oluşturuldu ve eklendi: audio-${otherUserSocketId}`);
        }
        if (event.streams[0]) {
             remoteAudio.srcObject = event.streams[0];
        } else {
            console.warn(`Uzak akış boş veya tanımsız: ${otherUserSocketId}`);
        }
    };

    // ICE adayı oluşturulduğunda sunucuya gönder
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // console.log(`ICE Adayı Gönderiliyor ${otherUserSocketId}:`, event.candidate);
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                target: otherUserSocketId,
            });
        } else {
            console.log(`ICE aday toplama bitti for ${otherUserSocketId}.`);
        }
    };

    // Bağlantı durumu değiştiğinde logla
    pc.onconnectionstatechange = () => {
        console.log(`PeerConnection State (${otherUserSocketId}):`, pc.connectionState);
    };
    pc.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State (${otherUserSocketId}):`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            console.error(`ICE bağlantısı kesildi veya başarısız oldu: ${otherUserSocketId}.`);
        }
    };

    // Sinyalleşme durumu değiştiğinde logla
    pc.onsignalingstatechange = () => {
        console.log(`Signaling State (${otherUserSocketId}):`, pc.signalingState);
    };

    // Müzakere gerekli olduğunda teklif oluştur ve gönder
    pc.onnegotiationneeded = async () => {
        console.log(`Müzakere gerekli for ${otherUserSocketId}. signalingState: ${pc.signalingState}`);
        if (pc.signalingState === 'stable' && isInitiator) {
             try {
                console.log(`Teklif oluşturuluyor for ${otherUserSocketId}...`);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('webrtc-offer', {
                    sdp: pc.localDescription,
                    target: otherUserSocketId,
                    senderProfile: currentProfile
                });
                console.log(`Müzakere teklifi gönderildi to ${otherUserSocketId}.`);
            } catch (error) {
                console.error(`Müzakere teklifi oluşturma hatası for ${otherUserSocketId}:`, error);
            }
        } else {
            console.log(`Müzakere gerekli ama koşullar karşılanmadı (signalingState: ${pc.signalingState}, isInitiator: ${isInitiator}). Teklif oluşturulmadı.`);
        }
    };

    peerConnections[otherUserSocketId] = pc;
    return pc;
}


// SOCKET.IO OLAY DİNLEYİCİLERİ //

// Sunucudan mesaj geldiğinde
socket.on('message', (data) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    if (data.sender === currentProfile.name) {
        messageElement.classList.add('self');
    } else {
        messageElement.classList.add('other');
    }

    let contentHTML = `<span class="sender-name">${data.sender} (${data.timestamp})</span>`;
    contentHTML += `<span class="message-text">${data.message}</span>`;
    
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

        // Yeni kullanıcılar veya henüz PeerConnection'ı olmayanlar için bağlantı başlat
        if (!peerConnections[user.id]) {
            console.log(`Yeni/tanımsız kullanıcı algılandı: ${user.profile.name} (${user.id}). PeerConnection başlatılıyor.`);
            const isInitiator = socket.id < user.id; 
            createPeerConnection(user.id, isInitiator); 
        }
        currentActivePeerIds.delete(user.id); 
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
                console.log(`Audio elementi kaldırıldı: audio-${disconnectedPeerId}`);
            }
        }
    });
    console.log('Kullanıcı listesi güncellendi ve PeerConnection durumları kontrol edildi.');
});


// Sunucudan WebRTC teklifi alındığında
socket.on('webrtc-offer', async (data) => {
    console.log(`WebRTC Teklifi Alındı from ${data.senderProfile.name} (${data.senderId})`);
    const pc = createPeerConnection(data.senderId);

    if (pc.signalingState !== 'stable') {
        console.warn(`Signaling State stabil değil (${pc.signalingState}). Teklif işlenmiyor.`);
        return;
    }

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log(`Uzak teklif ayarlandı for ${data.senderId}.`);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', {
            sdp: pc.localDescription,
            target: data.senderId,
        });
        console.log(`Cevap gönderildi to ${data.senderId}.`);
    } catch (error) {
        console.error(`Teklif işleme hatası for ${data.senderId}:`, error);
    }
});

// Sunucudan WebRTC cevabı alındığında
socket.on('webrtc-answer', async (data) => {
    console.log(`WebRTC Cevabı Alındı from ${data.senderId}`);
    const pc = peerConnections[data.senderId];
    if (pc) {
        try {
            // Eğer remoteDescription zaten ayarlanmışsa (bir yarış durumu olabilir), tekrar ayarlamayı denemeyin
            if (pc.remoteDescription && pc.remoteDescription.type === data.sdp.type && pc.remoteDescription.sdp === data.sdp.sdp) {
                 console.log(`Uzak cevap zaten ayarlı for ${data.senderId}. Tekrar ayarlanmıyor.`);
                 return;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            console.log(`Uzak cevabı ayarlandı for ${data.senderId}.`);
        } catch (error) {
            console.error(`Cevap işleme hatası for ${data.senderId}:`, error);
        }
    } else {
        console.warn(`Cevap geldi ama PeerConnection yok for ${data.senderId}.`);
    }
});

// Sunucudan ICE adayı alındığında
socket.on('ice-candidate', async (data) => {
    const pc = peerConnections[data.senderId];
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            // console.log(`ICE Adayı eklendi for ${data.senderId}`);
        } catch (error) {
            console.error(`ICE adayı ekleme hatası for ${data.senderId}:`, error);
        }
    } else {
        console.warn(`ICE adayı boş veya PeerConnection yok for ${data.senderId}.`);
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
        console.log('Konuşma durduruldu (timeout).');
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
        speakingIndicator.classList.add('speaking-active');
    } else { // Kimse konuşmuyorsa veya başlangıç durumu
        speakingUserImage.src = ''; // Resmin kaynağını boşalt
        speakingUserImage.alt = '';
        speakingUserImage.style.display = 'none'; // Resmi gizle
        speakingUserName.textContent = 'Kimse Konuşmuyor';
        speakingIndicator.classList.remove('speaking-active');
    }
}


// Sunucu bağlantısı kesildiğinde veya hata oluştuğunda
socket.on('disconnect', (reason) => {
    console.warn('Socket.IO bağlantısı kesildi:', reason);
    alert('Sunucuya bağlantı kesildi. Lütfen uygulamayı yeniden başlatın.');
    
    for (const peerId in peerConnections) {
        if (peerConnections[peerId]) {
            console.log(`PeerConnection kapatılıyor (disconnect event): ${peerId}`);
            peerConnections[peerId].close();
        }
        delete peerConnections[peerId];
    }
    videosContainer.innerHTML = '';

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        if (audioContext.state !== 'closed') {
            audioContext.close();
        }
    }
    chatRoomScreen.style.display = 'none';
    passwordScreen.style.display = 'flex';
    chatMessages.innerHTML = '';
    usersList.innerHTML = '';
    showSpeakingUser({ name: 'Kimse', image: '' });
    isMuted = false;
    muteButton.textContent = 'Mikrofon Kapat';
    muteButton.classList.add('unmuted');
});

socket.on('connect_error', (error) => {
    console.error('Socket.IO bağlantı hatası:', error);
    alert('Sunucuya bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.');
    chatRoomScreen.style.display = 'none';
    passwordScreen.style.display = 'flex';
    showSpeakingUser({ name: 'Kimse', image: '' });
});


// Uygulama yüklendiğinde profilleri yükle ve şifre ekranını göster
document.addEventListener('DOMContentLoaded', () => {
    passwordScreen.style.display = 'flex';
    profileSelectionScreen.style.display = 'none';
    chatRoomScreen.style.display = 'none';
    showSpeakingUser({ name: 'Kimse', image: '' });
    console.log('Uygulama yüklendi.');
});
