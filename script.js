// Socket.IO sunucusuna bağlanıyoruz
const socket = io(); // Render için dinamik bağlantı

// HTML elemanlarını seçiyoruz (ID DÜZELTMELERİ BURADA YAPILDI)
const passwordScreen = document.querySelector('.password-screen');
const passwordInput = document.getElementById('passwordInput'); // Düzeltme: password-input -> passwordInput
const passwordSubmitButton = document.getElementById('passwordSubmitButton'); // Düzeltme: password-submit-button -> passwordSubmitButton
const passwordErrorMessage = document.getElementById('passwordErrorMessage'); // Düzeltme: password-error-message -> passwordErrorMessage

const profileSelectionScreen = document.getElementById('profileSelectionScreen'); // Düzeltme: profileSelectionDiv -> profileSelectionScreen
const chatRoomScreen = document.getElementById('chatRoomScreen'); // Düzeltme: chatRoomDiv -> chatRoomScreen
const profileCardsContainer = document.getElementById('profileCards'); // Yeni: Profil kartlarını tutan ana div
const welcomeUserName = document.getElementById('welcomeUserName'); // Yeni: Hoş geldin metnindeki kullanıcı adı alanı

const speakingProfilePic = document.getElementById('speakingProfilePic'); // Düzeltme: speaking-profile-pic -> speakingProfilePic
const speakingUserName = document.getElementById('speakingUserName'); // Düzeltme: speaking-user-name -> speakingUserName
const toggleMuteButton = document.getElementById('toggleMuteButton'); // Düzeltme: muteButton -> toggleMuteButton
const leaveRoomButton = document.getElementById('leaveRoomButton'); // Düzeltme: disconnectButton -> leaveRoomButton

// Sohbet elementleri
const chatMessagesDiv = document.getElementById('chatMessagesDiv'); // Düzeltme: chat-messages -> chatMessagesDiv
const chatInput = document.getElementById('chatInput'); // Düzeltme: chat-input -> chatInput
const sendMessageButton = document.getElementById('sendMessageButton'); // Düzeltme: send-message-button -> sendMessageButton
const videosContainer = document.getElementById('videos-container'); // Ses akışları için container (gizli)

const usersList = document.getElementById('usersList'); // Düzeltme: usersInRoomList -> usersList (HTML ile uyumlu)

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
        profileSelectionScreen.style.display = 'flex'; // Düzeltme: profileSelectionDiv -> profileSelectionScreen
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
    { id: 'mecburiyetten', name: 'Mecburiyetten', pic: 'images/mecburiyetten.jpg' }, // Düzeltme: Resim adı doğru olacak
    { id: 'default', name: 'Misafir', pic: 'images/default_guest.jpg' } // Düzeltme: Resim adı doğru olacak
];

function loadProfiles() {
    profileCardsContainer.innerHTML = ''; // Önceki kartları temizle
    PROFILES.forEach(profile => {
        const profileCard = document.createElement('div');
        profileCard.classList.add('profile-card');
        profileCard.dataset.userId = profile.id; // data-user-id
        profileCard.dataset.userName = profile.name; // data-user-name
        profileCard.dataset.profilePic = profile.pic; // data-profile-pic (resim yolu)

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

            welcomeUserName.textContent = currentUser.name; // Hoş geldin metnini güncelle

            profileSelectionScreen.style.display = 'none';
            chatRoomScreen.style.display = 'flex';

            console.log(`${currentUser.name} profili seçildi ve odaya bağlanılıyor...`);

            try {
                // Mikrofon akışını başlat ve gürültü engelleme/iyileştirme özelliklerini etkinleştir
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,      // Yankı giderme
                        noiseSuppression: true,      // Gürültü engelleme
                        autoGainControl: true        // Otomatik ses seviyesi kontrolü
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

toggleMuteButton.addEventListener('click', () => { // Düzeltme: muteButton -> toggleMuteButton
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

leaveRoomButton.addEventListener('click', () => { // Düzeltme: disconnectButton -> leaveRoomButton
    // WebRTC peer bağlantılarını kapat
    for (const peerId in peerConnections) {
        if (peerConnections
