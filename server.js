console.log("✅ `server.js` の実行を開始しました！");

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// **📌 静的ファイルの配信**
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'index.html');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("❌ ファイルの読み込みに失敗しました:", err);
            res.status(500).send("❌ ファイルを読み込めませんでした");
            return;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        console.log("✅ 送信するHTML:\n", data);
        res.send(data);
    });
});

// **📌 Socket.io のリアルタイム通信設定**
io.on('connection', (socket) => {
    console.log('✅ ユーザーが接続しました');

    socket.on('message', (msg) => {
        console.log('💬 受信メッセージ:', msg);
        io.emit('message', msg);
    });

    socket.on('disconnect', () => {
        console.log('❌ ユーザーが切断しました');
    });
});

// **📌 サーバーの起動**
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 サーバーがポート ${PORT} で起動しました！`);
});

setInterval(() => {
    console.log("⏳ サーバーは正常に動作中...");
}, 5000);
