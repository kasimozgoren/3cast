const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*", // Tüm kökenlere (domain) izin ver
        methods: ["GET", "POST"]
    }
});

// Statik dosyaları sunuyoruz (index.html, style.css, script.js, images klasörü)
app.use(express.static(__dirname));

// Bağlanan her yeni istemci (tarayıcı) için
io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);

    // Bir kullanıcı bir odaya katılmak istediğinde
    socket.on('joinRoom', (userData) => {
        const roomName = 'sohbet_odasi';

        // Kullanıcıyı odaya dahil et
        socket.join(roomName);
        console.log(`${userData.name} (${socket.id}) ${roomName} odasına katıldı.`);

        // Yeni bağlanan kullanıcının bilgilerini Socket objesine ekle
        socket.userData = userData; 

        // Odaya yeni bir kullanıcı katıldığını tüm odaya duyur
        io.to(roomName).emit('userJoined', socket.id, userData);

        // Odadaki güncel kullanıcı listesini al ve gönder
        updateRoomUsers(roomName);

        // WebRTC sinyalizasyon mesajları (GERİ GETİRİLDİ)
        socket.on('offer', (targetId, description) => {
            console.log(`Offer alındı ${socket.id}'den ${targetId} için`);
            socket.to(targetId).emit('offer', socket.id, description);
        });

        socket.on('answer', (targetId, description) => {
            console.log(`Answer alındı ${socket.id}'den ${targetId} için`);
            socket.to(targetId).emit('answer', socket.id, description);
        });

        socket.on('candidate', (targetId, candidate) => {
            console.log(`Candidate alındı ${socket.id}'den ${targetId} için`);
            socket.to(targetId).emit('candidate', socket.id, candidate);
        });

        // Mikrofon sessize alma/açma durumu değiştiğinde
        socket.on('toggleMute', (isMutedStatus) => {
            io.to(roomName).emit('toggleMute', socket.id, isMutedStatus);
        });

        // Konuşan kişinin bilgisi geldiğinde tüm odaya yayıla
        socket.on('isSpeaking', (userId, userName, userPic) => {
            io.to(roomName).emit('speakingUser', userId, userName, userPic);
        });

        // Sohbet mesajı geldiğinde tüm odaya yayıla
        socket.on('chatMessage', (message) => {
            io.to(roomName).emit('chatMessage', message);
        });
    });

    // Bir kullanıcı bağlantısını kestiğinde
    socket.on('disconnect', () => {
        console.log('Bir kullanıcı ayrıldı:', socket.id);
        const roomName = 'sohbet_odasi';
        const disconnectedUserId = socket.id;
        const disconnectedUserName = socket.userData ? socket.userData.name : 'Bilinmeyen Kullanıcı';


        // Bu socket'in userData'sını sil (garbage collection'a yardımcı olur)
        if (socket.userData) {
            delete socket.userData;
        }

        // Diğer kullanıcılara bu kişinin ayrıldığını bildir
        io.to(roomName).emit('userLeft', disconnectedUserId, disconnectedUserName);

        // Odadaki güncel kullanıcı listesini güncelle ve gönder
        updateRoomUsers(roomName);
    });

    // Yardımcı fonksiyon: Odadaki kullanıcı listesini günceller ve tüm odaya gönderir
    function updateRoomUsers(roomName) {
        const clientsInRoom = Array.from(io.sockets.adapter.rooms.get(roomName) || []);
        const usersData = clientsInRoom.map(clientId => {
            const clientSocket = io.sockets.sockets.get(clientId);
            return clientSocket && clientSocket.userData ? {
                id: clientId,
                name: clientSocket.userData.name,
                pic: clientSocket.userData.pic
            } : null;
        }).filter(u => u !== null);

        console.log(`Güncel ${roomName} odası kullanıcıları:`, usersData.map(u => u.name));
        io.to(roomName).emit('roomUpdate', usersData);
    }
});

// Sunucuyu 3000 numaralı portta dinlemeye başla
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});