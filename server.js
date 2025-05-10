const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chat.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

let rooms = {
    "雑談部屋": [],
    "PC特化部屋": []
};

io.on('connection', (socket) => {
    console.log('✅ ユーザーが接続しました');

    socket.on('joinRoom', (room) => {
        socket.join(room);
        console.log(`🛜 ${socket.id} が「${room}」に参加`);
        socket.emit('messageHistory', rooms[room]);
    });

    socket.on('message', (data) => {
        rooms[data.room].push(data); // 🔹 部屋ごとにメッセージを保存
        io.to(data.room).emit('message', data);
    });

    socket.on('file', (file) => {
        rooms[file.room].push(file); // 🔹 部屋ごとに画像を保存
        io.to(file.room).emit('file', file);
    });

    socket.on('disconnect', () => {
        console.log('❌ ユーザーが切断しました');
    });
});

server.listen(5000, () => {
    console.log("🚀 サーバーがポート 5000 で起動しました！");
});
