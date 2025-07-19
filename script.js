// Socket.IO sunucusuna bağlanıyoruz
const socket = io(); 

// HTML elemanlarını seçiyoruz
const passwordScreen = document.querySelector('.password-screen');
const passwordInput = document.getElementById('password-input');
const passwordSubmitButton = document.getElementById('password-submit-button');
const passwordErrorMessage = document.getElementById('password-error-message');

const profileSelectionDiv = document.querySelector('.profile-selection');
const chatRoomDiv = document.querySelector('.chat-room');
const connectButtons = document.querySelectorAll('.connect-button');
const currentUserDisplay = document.getElementById('current-user-display');
const speakingProfilePic = document.getElementById('speaking-profile-pic');
const speakingUserName = document.getElementById('speaking-user-name');
const muteButton = document.getElementById('mute-button');
const disconnectButton = document.getElementById('disconnect-button');
const videosDiv = document.getElementById('videos');
const usersInRoomList = document.getElementById('users-in-room');

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
        profileSelectionDiv.style.display = 'flex';
        passwordErrorMessage.textContent = '';
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
// Kullanıcı Arayüzü (UI) İşlevleri
// -----------------------------------------------------------------------------

connectButtons.forEach(button => {
    button.addEventListener('click', async (event) => {
        const profileCard = event.target.closest('.profile-card'); 
        
        currentUser = {
            id: profileCard.dataset.userId,
            name: profileCard.dataset.userName,
            pic: profileCard.dataset.profilePic
        };

        currentUserDisplay.textContent = `Hoş Geldin, ${currentUser.name}!`;

        profileSelectionDiv.style.display = 'none';
        chatRoomDiv.style.display = 'flex'; 

        console.log(`${currentUser.name} profili seçildi ve odaya bağlanılıyor...`);
        
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            
            const localAudioEl = document.createElement('audio');
            localAudioEl.autoplay = true;
            localAudioEl.muted = true;
            localAudioEl.srcObject = localStream;
            localAudioEl.id = `local-audio-${currentUser.id}`;
            localAudioEl.style.display = 'none';
            videosDiv.appendChild(localAudioEl);
            
            isMuted = false;
            updateMuteButton();

            socket.emit('joinRoom', currentUser); 

        } catch (error) {
            console.error('Mikrofon erişimi reddedildi veya bir hata oluştu:', error);
            alert('Mikrofon erişimi izni vermeniz gerekiyor! Uygulama çalışmayabilir.');
        }
    });
});

muteButton.addEventListener('click', () => {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
            isMuted = !track.enabled;
            updateMuteButton();
            socket.emit('toggleMute', isMuted);
        });
    }
});

disconnectButton.addEventListener('click', () => {
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

    socket.disconnect();

    chatRoomDiv.style.display = 'none';
    profileSelectionDiv.style.display = 'none';
    passwordScreen.style.display = 'flex';

    videosDiv.innerHTML = ''; 
    usersInRoomList.innerHTML = '';
    speakingProfilePic.style.display = 'none';
    speakingUserName.textContent = '';

    console.log("Odadan ayrıldı ve bağlantı kesildi.");
});


function updateMuteButton() {
    if (isMuted) {
        muteButton.textContent = 'Mikrofon Aç';
        muteButton.classList.remove('unmuted');
    } else {
        muteButton.textContent = 'Mikrofon Kapat';
        muteButton.classList.add('unmuted');
    }
}

let speakingTimeout;
function showSpeakingUser(userId, userName, userPic) {
    // Eğer konuk profili seçildiyse ve resim yoksa varsayılan bir konuk resmi kullanabiliriz
    const displayPic = userPic && userPic !== 'images/default_guest.jpg' ? userPic : 'images/default_guest.jpg'; 

    if (userId === socket.id) {
        speakingProfilePic.src = currentUser.pic; // Kendi profil resmini göster
        speakingProfilePic.alt = `${currentUser.name} Profil Resmi`;
        speakingProfilePic.style.display = 'block';
        speakingUserName.textContent = 'Sen Konuşuyorsun';
    } else {
        speakingProfilePic.src = displayPic;
        speakingProfilePic.alt = `${userName} Profil Resmi`;
        speakingProfilePic.style.display = 'block';
        speakingUserName.textContent = userName;
    }
    
    clearTimeout(speakingTimeout);
    speakingTimeout = setTimeout(() => {
        speakingProfilePic.style.display = 'none';
        speakingUserName.textContent = '';
    }, 1500);
}

function updateUsersInRoom(users) {
    usersInRoomList.innerHTML = '';
    users.forEach(user => {
        if (user.id) { 
            const userItem = document.createElement('div');
            userItem.classList.add('user-item');
            // Konuk profili için özel resim yolu veya varsayılan resim
            const userPicPath = user.pic && user.pic !== 'images/default_guest.jpg' ? user.pic : 'images/default_guest.jpg';
            userItem.innerHTML = `
                <img src="${userPicPath}" alt="${user.name} Profil Resmi">
                <span>${user.name} ${user.id === socket.id ? '(Sen)' : ''}</span>
            `;
            usersInRoomList.appendChild(userItem);
        }
    });
}


// -----------------------------------------------------------------------------
// Socket.IO Olay Dinleyicileri (Sunucu ile İletişim)
// -----------------------------------------------------------------------------

socket.on('connect', () => {
    console.log('Sunucuya bağlandı! Socket ID:', socket.id);
});

socket.on('userJoined', async (newSocketId, userData) => {
    console.log(`${userData.name} (${newSocketId}) odaya katıldı.`);
    if (newSocketId !== socket.id && localStream) {
        const peerConnection = new RTCPeerConnection(iceServers);
        peerConnections[newSocketId] = peerConnection;

        peerConnection.userData = userData; 

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            console.log('Uzak ses akışı alındı:', event.streams[0]);
            const remoteAudioEl = document.createElement('audio');
            remoteAudioEl.autoplay = true;
            remoteAudioEl.srcObject = event.streams[0];
            remoteAudioEl.id = `remote-audio-${newSocketId}`;
            videosDiv.appendChild(remoteAudioEl);

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
                    showSpeakingUser(newSocketId, userData.name, userData.pic);
                }
                requestAnimationFrame(checkSpeaking);
            }
            checkSpeaking();
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', newSocketId, event.candidate);
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', newSocketId, offer);
    }
});

socket.on('userLeft', (socketId) => {
    console.log(`Kullanıcı (${socketId}) odadan ayrıldı.`);
    if (peerConnections[socketId]) {
        peerConnections[socketId].close();
        delete peerConnections[socketId];
    }
    const remoteAudioEl = document.getElementById(`remote-audio-${socketId}`);
    if (remoteAudioEl) {
        remoteAudioEl.remove();
    }
    // Konuşan kişi ayrılırsa ekranı temizle
    if (speakingProfilePic.style.display === 'block' && 
        (speakingProfilePic.src.includes(socketId) || speakingUserName.textContent.includes(socketId) || speakingUserName.textContent === 'Sen Konuşuyorsun')) {
        speakingProfilePic.style.display = 'none';
        speakingUserName.textContent = '';
    }
});

socket.on('offer', async (fromId, offer) => {
    console.log(`Teklif (${fromId}) adresinden alındı.`);
    if (fromId !== socket.id && localStream) {
        const peerConnection = new RTCPeerConnection(iceServers);
        peerConnections[fromId] = peerConnection;

        peerConnection.userData = socket.usersInRoom.find(u => u.id === fromId) || { name: fromId, pic: 'images/default_guest.jpg' }; 

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            console.log('Uzak ses akışı alındı:', event.streams[0]);
            const remoteAudioEl = document.createElement('audio');
            remoteAudioEl.autoplay = true;
            remoteAudioEl.srcObject = event.streams[0];
            remoteAudioEl.id = `remote-audio-${fromId}`;
            videosDiv.appendChild(remoteAudioEl);

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
                    const speakerData = socket.usersInRoom.find(u => u.id === fromId);
                    if (speakerData) {
                        showSpeakingUser(fromId, speakerData.name, speakerData.pic);
                    } else {
                        showSpeakingUser(fromId, fromId, 'images/default_guest.jpg'); 
                    }
                }
                requestAnimationFrame(checkSpeaking);
            }
            checkSpeaking();
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', fromId, event.candidate);
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', fromId, answer);
    }
});

socket.on('answer', async (fromId, answer) => {
    console.log(`Cevap (${fromId}) adresinden alındı.`);
    if (peerConnections[fromId]) {
        await peerConnections[fromId].setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('candidate', async (fromId, candidate) => {
    console.log(`Aday (${fromId}) adresinden alındı.`);
    if (peerConnections[fromId] && candidate) {
        await peerConnections[fromId].addIceCandidate(new RTCIceCandidate(candidate));
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
    }
});

socket.on('connect_error', (err) => {
    console.error('Socket.IO bağlantı hatası:', err.message);
    alert('Sunucuya bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.');
});