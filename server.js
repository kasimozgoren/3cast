const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Statik dosyaları sunma
app.use(express.static(path.join(__dirname, ''))); // Kök dizini statik olarak ayarla

// Ana sayfa yönlendirmesi
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Aktif kullanıcıları ve ses akışlarını depolamak için basit bir obje
const activeUsers = new Map(); // Key: socket.id, Value: { id: string, profile: {}, isMuted: boolean }
const speakingUsers = new Map(); // Key: profile.name, Value: Date.now() (son konuşma zamanı)

// Konuşma zaman aşımı (miliseconds)
const SPEAKING_TIMEOUT_MS = 1000; // 1 saniye (script.js'dekiyle senkronize olmalı)

// Socket.IO bağlantıları
io.on('connection', (socket) => {
    console.log(`Yeni kullanıcı bağlandı: ${socket.id}`);

    // Kullanıcı odaya katıldığında
    socket.on('joinRoom', (profile) => {
        activeUsers.set(socket.id, { id: socket.id, profile: profile, isMuted: false });
        console.log(`${profile.name} (${socket.id}) odaya katıldı.`);

        // Tüm client'lara güncel kullanıcı listesini gönder
        io.emit('updateUsers', Array.from(activeUsers.values()));

        // Odaya katılma mesajı gönder
        const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        io.emit('message', { sender: 'Sistem', message: `${profile.name} odaya katıldı.`, timestamp: timestamp });
    });

    // Sohbet mesajı veya medya alındığında
    socket.on('chatMessage', (data) => {
        // data objesi artık hem message hem de media (opsiyonel) içerebilir
        // console.log(`Mesaj alındı - ${data.sender}: ${data.message || '[Medya Mesajı]'}`);
        io.emit('message', data); // Tüm bağlı client'lara mesajı geri gönder
    });

    // Mikrofon kapatıldığında
    socket.on('userMuted', (profile) => {
        const user = activeUsers.get(socket.id);
        if (user) {
            user.isMuted = true;
            io.emit('updateUsers', Array.from(activeUsers.values())); // Listeyi güncelle
            const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            io.emit('message', { sender: 'Sistem', message: `${profile.name} mikrofonunu kapattı.`, timestamp: timestamp });
            speakingUsers.delete(profile.name); // Konuşuyorsa listeden çıkar
            // Eğer kimse konuşmuyorsa 'stoppedSpeaking' gönder
            if (speakingUsers.size === 0) {
                io.emit('stoppedSpeaking');
            }
            console.log(`${profile.name} mikrofonunu kapattı.`);
        }
    });

    // Mikrofon açıldığında
    socket.on('userUnmuted', (profile) => {
        const user = activeUsers.get(socket.id);
        if (user) {
            user.isMuted = false;
            io.emit('updateUsers', Array.from(activeUsers.values())); // Listeyi güncelle
            const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            io.emit('message', { sender: 'Sistem', message: `${profile.name} mikrofonunu açtı.`, timestamp: timestamp });
            console.log(`${profile.name} mikrofonunu açtı.`);
        }
    });

    // Kullanıcı konuşmaya başladığında
    socket.on('isSpeaking', (profile) => {
        const user = activeUsers.get(socket.id);
        if (user && !user.isMuted) { // Eğer kullanıcı susturulmamışsa
            speakingUsers.set(profile.name, Date.now());
            io.emit('speaking', profile); // Tüm client'lara kimin konuştuğunu bildir
            // console.log(`${profile.name} konuşuyor.`);
        }
    });

    // WebRTC sinyalleşme olayları
    socket.on('webrtc-offer', (data) => {
        socket.to(data.target).emit('webrtc-offer', {
            sdp: data.sdp,
            senderId: socket.id,
            senderProfile: data.senderProfile // Teklif gönderenin profilini de yolla
        });
        // console.log(`Teklif gönderildi: ${socket.id} -> ${data.target}`);
    });

    socket.on('webrtc-answer', (data) => {
        socket.to(data.target).emit('webrtc-answer', {
            sdp: data.sdp,
            senderId: socket.id,
        });
        // console.log(`Cevap gönderildi: ${socket.id} -> ${data.target}`);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            senderId: socket.id,
        });
        // console.log(`ICE adayı gönderildi: ${socket.id} -> ${data.target}`);
    });

    // Kullanıcı odadan ayrıldığında (disconnectRoom olayı veya doğrudan bağlantı kesildiğinde)
    socket.on('disconnectRoom', () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            activeUsers.delete(socket.id);
            speakingUsers.delete(user.profile.name); // Konuşuyorsa listeden çıkar
            console.log(`${user.profile.name} (${socket.id}) odadan ayrıldı.`);

            // Tüm client'lara güncel kullanıcı listesini gönder
            io.emit('updateUsers', Array.from(activeUsers.values()));

            // Odadan ayrılma mesajı gönder
            const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            io.emit('message', { sender: 'Sistem', message: `${user.profile.name} odadan ayrıldı.`, timestamp: timestamp });
            
            // Eğer kimse konuşmuyorsa 'stoppedSpeaking' gönder
            if (speakingUsers.size === 0) {
                io.emit('stoppedSpeaking');
            }
        }
    });

    socket.on('disconnect', (reason) => {
        const user = activeUsers.get(socket.id);
        if (user) {
            activeUsers.delete(socket.id);
            speakingUsers.delete(user.profile.name); // Konuşuyorsa listeden çıkar
            console.log(`${user.profile.name} (${socket.id}) bağlantısı kesildi. Sebep: ${reason}`);

            // Tüm client'lara güncel kullanıcı listesini gönder
            io.emit('updateUsers', Array.from(activeUsers.values()));

            // Odadan ayrılma mesajı gönder
            const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            io.emit('message', { sender: 'Sistem', message: `${user.profile.name} bağlantısı kesildi.`, timestamp: timestamp });
            
            // Eğer kimse konuşmuyorsa 'stoppedSpeaking' gönder
            if (speakingUsers.size === 0) {
                io.emit('stoppedSpeaking');
            }
        } else {
            console.log(`Bilinmeyen kullanıcı (${socket.id}) bağlantısı kesildi. Sebep: ${reason}`);
            // Belki hiç profili seçmeden bağlantısı kesilmiştir
            const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            io.emit('message', { sender: 'Sistem', message: `Bilinmeyen Kullanıcı odadan ayrıldı.`, timestamp: timestamp });
            io.emit('stoppedSpeaking');
        }
    });
});

// Konuşma zaman aşımını kontrol etme (server tarafında)
setInterval(() => {
    const now = Date.now();
    let shouldEmitStoppedSpeaking = false;

    // Süresi dolmuş konuşan kullanıcıları temizle
    for (const [profileName, lastSpeakingTime] of speakingUsers.entries()) {
        if (now - lastSpeakingTime > SPEAKING_TIMEOUT_MS) {
            speakingUsers.delete(profileName);
            shouldEmitStoppedSpeaking = true;
            // console.log(`${profileName} konuşmayı bıraktı (server timeout).`);
        }
    }

    // Eğer kimse konuşmuyorsa ve daha önce konuşan vardıysa bildir
    if (shouldEmitStoppedSpeaking && speakingUsers.size === 0) {
        io.emit('stoppedSpeaking'); // Hiç kimse konuşmuyorsa bildirim gönder
    }
}, 500); // Her 500 ms'de bir kontrol et

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
