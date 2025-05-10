const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 静的ファイルの配信
app.use(express.static(path.join(__dirname, 'public')));

// ルートページの表示
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io の設定
io.on('connection', (socket) => {
    console.log('✅ ユーザーが接続しました');

    // メッセージの受信と送信
    socket.on('message', (msg) => {
        console.log('💬 受信メッセージ:', msg);
        io.emit('message', msg);
    });

    // 画像・動画の受信と送信
    socket.on('file', (file) => {
        console.log('📸 ファイル受信:', file.name);
        io.emit('file', file);
    });

    socket.on('disconnect', () => {
        console.log('❌ ユーザーが切断しました');
    });
});

// サーバーの起動
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 サーバーがポート ${PORT} で起動しました！`);
});
