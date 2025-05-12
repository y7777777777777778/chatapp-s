const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const db = new sqlite3.Database('./chat.db');
db.run("CREATE TABLE IF NOT EXISTS messages (room TEXT, username TEXT, message TEXT, timestamp TEXT)");

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    console.log("✅ Render のサーバーにアクセスされました！");
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

io.on('connection', (socket) => {
    console.log('✅ ユーザーが接続しました');

    socket.on('joinRoom', (room) => {
        socket.join(room);
        console.log(`🛜 ${socket.id} が「${room}」に参加`);

        db.all("SELECT * FROM messages WHERE room = ?", [room], (err, rows) => {
            if (!err) socket.emit('messageHistory', rows);
        });
    });

    socket.on('message', (data) => {
        console.log("📩 メッセージを受信:", data);
        db.run("INSERT INTO messages (room, username, message, timestamp) VALUES (?, ?, ?, ?)", 
               [data.room, data.username, data.message, new Date().toISOString()]);
        io.to(data.room).emit('message', data);
    });

    socket.on('file', (file) => {
        console.log("📸 画像/動画を受信:", file);
        io.to(file.room).emit('file', file);
    });

    socket.on('disconnect', () => {
        console.log('❌ ユーザーが切断しました');
    });
});

server.listen(process.env.PORT || 5000, () => {
    console.log("🚀 サーバーがポート 5000 で起動しました！");
});
