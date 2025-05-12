const server = http.createServer(app);
const io = socketIo(server);

// 静的ファイルの配信
app.use(express.static(path.join(__dirname, 'public')));

// ルートページの表示
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chat.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

let rooms = {
    "雑談部屋": [],
    "PC特化部屋": []
};

// Socket.io の設定
io.on('connection', (socket) => {
    console.log('✅ ユーザーが接続しました');

    // メッセージの受信と送信
    socket.on('message', (msg) => {
        console.log('💬 受信メッセージ:', msg);
        io.emit('message', msg);
    socket.on('joinRoom', (room) => {
        socket.join(room);
        console.log(`🛜 ${socket.id} が「${room}」に参加`);
        socket.emit('messageHistory', rooms[room]);
    });

    socket.on('message', (data) => {
        rooms[data.room].push(data); // 🔹 部屋ごとにメッセージを保存
        io.to(data.room).emit('message', data);
    });

    // 画像・動画の受信と送信
    socket.on('file', (file) => {
        console.log('📸 ファイル受信:', file.name);
        io.emit('file', file);
        rooms[file.room].push(file); // 🔹 部屋ごとに画像を保存
        io.to(file.room).emit('file', file);
    });

    socket.on('disconnect', () => {
        console.log('❌ ユーザーが切断しました');
    });
});

// サーバーの起動
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 サーバーがポート ${PORT} で起動しました！`);
server.listen(5000, () => {
    console.log("🚀 サーバーがポート 5000 で起動しました！");
});
