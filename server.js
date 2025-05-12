
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const db = new sqlite3.Database('./chat.db');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chat.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

let rooms = {
    "雑談部屋": [],
    "雑談部屋2": [], // 🔹 追加
    "PC特化部屋": []
};

// 🔥 メッセージ履歴の保存
db.run("CREATE TABLE IF NOT EXISTS messages (room TEXT, username TEXT, message TEXT)");

db.all("SELECT * FROM messages", (err, rows) => {
    if (!err) {
        rows.forEach(row => {
            if (!rooms[row.room]) rooms[row.room] = [];
            rooms[row.room].push({ username: row.username, message: row.message });
        });
    }
});

io.on('connection', (socket) => {
    console.log('✅ ユーザーが接続しました');

    socket.on('joinRoom', (room) => {
        socket.join(room);
        console.log(`🛜 ${socket.id} が「${room}」に参加`);
        socket.emit('messageHistory', rooms[room] || []);
    });

    socket.on('message', (data) => {
        if (!rooms[data.room]) rooms[data.room] = [];
        rooms[data.room].push(data);
        db.run("INSERT INTO messages (room, username, message) VALUES (?, ?, ?)", [data.room, data.username, data.message]); // 🔹 DBに保存
        io.to(data.room).emit('message', data);
    });

    socket.on('file', (file) => {
        if (!rooms[file.room]) rooms[file.room] = [];
        rooms[file.room].push(file);
        io.to(file.room).emit('file', file);
    });

    socket.on('disconnect', () => {
        console.log('❌ ユーザーが切断しました');
    });
});

server.listen(5000, () => {
    console.log("🚀 サーバーがポート 5000 で起動しました！");
});

