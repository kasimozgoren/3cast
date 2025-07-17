// Gerekli modülleri içeri aktarıyoruz
const express = require('express'); // Web sunucusu için Express
const http = require('http');     // HTTP sunucusu için
const socketIo = require('socket.io'); // Gerçek zamanlı iletişim için Socket.IO

// Express uygulamasını başlat
const app = express();
// HTTP sunucusunu Express uygulamasıyla oluştur
const server = http.createServer(app);
// Socket.IO'yu HTTP sunucusuna bağla
// CORS ayarları: Herhangi bir alan adından bağlantıya izin veriyoruz.
// Geliştirme aşamasında bu önemlidir. Üretimde daha kısıtlayıcı olmalıyız.
const io = socketIo(server, {
    cors: {
        origin: "*", // Tüm kökenlere (domain) izin ver
        methods: ["GET", "POST"] // İzin verilen HTTP metotları
    }
});

// Ana dizine (/) yapılan isteklerde index.html dosyasını sun
// Bu kısım, tarayıcıda localhost:3000 adresine gidildiğinde index.html'i göstermesini sağlar.
app.use(express.static(__dirname)); // Bu, 'sesli_sohbet_uygulamasi' klasöründeki tüm dosyaları sunar (index.html, style.css, script.js, resimler)

// Sunucuya bağlanan her yeni istemci (tarayıcı) için çalışacak kod bloğu
io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);

    // Bir kullanıcı bir odaya katılmak istediğinde
    socket.on('joinRoom', (userData) => {
        // Socket.IO'da odalar, kullanıcıları gruplamak için kullanılır.
        // Bizim uygulamamızda tek bir "sohbet_odasi" olacak.
        const roomName = 'sohbet_odasi'; // Tüm kullanıcılar aynı odaya katılacak

        // Kullanıcıyı odaya dahil et
        socket.join(roomName);
        console.log(`${userData.name} (${socket.id}) ${roomName} odasına katıldı.`);

        // Odaya katılan kullanıcının bilgilerini diğer tüm kullanıcılara gönder
        // 'roomUsers' olayı ile güncel kullanıcı listesini gönderiyoruz.
        const clientsInRoom = Array.from(io.sockets.adapter.rooms.get(roomName) || []);
        const usersData = clientsInRoom.map(clientId => ({
            id: clientId, // Socket ID'si
            name: io.sockets.sockets.get(clientId)?.userData?.name, // Kullanıcı adı
            pic: io.sockets.sockets.get(clientId)?.userData?.pic // Profil resmi
        })).filter(u => u.name); // Sadece adı olanları filtrele (geçici bağlantıları elemek için)

        // Yeni bağlanan kullanıcının bilgilerini Socket objesine ekle
        // Bu bilgi, kimin kim olduğunu takip etmemizi sağlar.
        socket.userData = userData; 

        // Odaya yeni bir kullanıcı katıldığını tüm odaya duyur
        // 'userJoined' olayıyla kimin katıldığını bildiriyoruz.
        io.to(roomName).emit('userJoined', socket.id, userData);

        // Mevcut tüm kullanıcı listesini yeni katılan kişiye gönder
        socket.emit('currentUsers', usersData); // Sadece yeni katılan kişiye gönder
        io.to(roomName).emit('roomUpdate', usersData); // Tüm odaya güncel listeyi gönder

        // ODADA YETERİ KADAR KİŞİ VARSA BURADA WEBRTC BAĞLANTILARINI BAŞLATACAĞIZ
        // Şimdilik sadece konsola log atalım.
        const numClients = io.sockets.adapter.rooms.get(roomName)?.size || 0;
        console.log(`Odada ${roomName} bulunan kişi sayısı: ${numClients}`);

        // WebRTC teklif (offer) ve cevap (answer) alışverişi
        socket.on('offer', (id, message) => {
            socket.to(id).emit('offer', socket.id, message);
        });

        socket.on('answer', (id, message) => {
            socket.to(id).emit('answer', socket.id, message);
        });

        socket.on('candidate', (id, message) => {
            socket.to(id).emit('candidate', socket.id, message);
        });
    });

    // Bir kullanıcı bağlantısını kestiğinde
    socket.on('disconnect', () => {
        console.log('Bir kullanıcı ayrıldı:', socket.id);
        // Kullanıcının hangi odadan ayrıldığını bulup diğerlerine bildirin
        const roomName = 'sohbet_odasi'; // Bizim tek odamız
        const disconnectedUserId = socket.id;

        // Odayı terk eden kullanıcının verisini Socket nesnesinden kaldır
        delete socket.userData;

        // Diğer kullanıcılara bu kişinin ayrıldığını bildir
        io.to(roomName).emit('userLeft', disconnectedUserId);

        // Odadaki güncel kullanıcı listesini güncelle ve gönder
        const clientsInRoom = Array.from(io.sockets.adapter.rooms.get(roomName) || []);
        const usersData = clientsInRoom.map(clientId => ({
            id: clientId,
            name: io.sockets.sockets.get(clientId)?.userData?.name,
            pic: io.sockets.sockets.get(clientId)?.userData?.pic
        })).filter(u => u.name);
        io.to(roomName).emit('roomUpdate', usersData);
    });
});

// Sunucuyu 3000 numaralı portta dinlemeye başla
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});