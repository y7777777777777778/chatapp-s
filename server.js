
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const db = new sqlite3.Database('./users.db');

// multer設定（uploadsフォルダに保存）
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // ファイル名をユニークに
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  },
});
const upload = multer({ storage });

// 静的ファイル提供
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// ユーザーDB作成
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);
});

// ルーティング
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/register.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, row) => {
      if (row) {
        res.redirect(`/chat.html?username=${encodeURIComponent(username)}`);
      } else {
        res.send('ログイン失敗: ユーザー名またはパスワードが違います。');
      }
    }
  );
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run(
    'INSERT INTO users (username, password) VALUES (?, ?)',
    [username, password],
    (err) => {
      if (err) {
        res.send('登録失敗: すでに存在するユーザー名です。');
      } else {
        res.redirect('/');
      }
    }
  );
});

// 画像アップロードAPI
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '画像ファイルがありません' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

// チャット管理
let messages = [];
const MAX_MESSAGES = 100;
let usersInRoom = {};

io.on('connection', (socket) => {
  const username = socket.handshake.query.username || '匿名';

  socket.username = username;
  usersInRoom[socket.id] = username;

  // 接続ユーザーリスト送信
  io.emit('userList', Object.values(usersInRoom));

  // 過去のメッセージを送信
  messages.forEach((m) => socket.emit('chat message', m));

  socket.emit('chat message', 'ようこそチャットへ！');
  socket.broadcast.emit('chat message', `${username}さんが参加しました。`);

  socket.on('chat message', (msg) => {
    if (typeof msg === 'string' && msg.startsWith('/')) {
      handleCommand(msg, socket);
    } else {
      // 文字メッセージまたは画像メッセージの形式で処理
      let message;
      if (typeof msg === 'string') {
        message = { type: 'text', username, text: msg };
      } else if (msg.type === 'image' && msg.url) {
        message = { type: 'image', username, url: msg.url };
      } else {
        return;
      }
      messages.push(message);
      if (messages.length > MAX_MESSAGES) messages.shift();
      io.emit('chat message', message);
    }
  });

  socket.on('disconnect', () => {
    delete usersInRoom[socket.id];
    io.emit('userList', Object.values(usersInRoom));
    io.emit('chat message', { type: 'text', username: 'システム', text: `${username}さんが退出しました。` });
  });
});

function handleCommand(msg, socket) {
  const command = msg.trim().toLowerCase();

  switch (command) {
    case '/allclear':
      messages = [];
      io.emit('clear messages');
      io.emit('chat message', { type: 'text', username: 'システム', text: `${socket.username}がメッセージを全削除しました。` });
      break;
    case '/help':
      socket.emit(
        'chat message',
        { type: 'text', username: 'システム', text: '使用可能なコマンド: /allclear, /help, /date, /usercount, /roomusers, /myname, /roll, /flip, /joke' }
      );
      break;
    case '/date':
      socket.emit('chat message', { type: 'text', username: 'システム', text: `現在時刻: ${new Date().toLocaleString()}` });
      break;
    case '/usercount':
      socket.emit('chat message', { type: 'text', username: 'システム', text: `現在のユーザー数: ${Object.keys(usersInRoom).length}` });
      break;
    case '/roomusers':
      socket.emit('chat message', { type: 'text', username: 'システム', text: `参加中ユーザー: ${Object.values(usersInRoom).join(', ')}` });
      break;
    case '/myname':
      socket.emit('chat message', { type: 'text', username: 'システム', text: `あなたの名前: ${socket.username}` });
      break;
    case '/roll':
      socket.emit('chat message', { type: 'text', username: 'システム', text: `${socket.username}のサイコロ: 🎲 ${Math.ceil(Math.random() * 6)}` });
      break;
    case '/flip':
      const result = Math.random() < 0.5 ? '表 (Heads)' : '裏 (Tails)';
      socket.emit('chat message', { type: 'text', username: 'システム', text: `${socket.username}のコイントス: 🪙 ${result}` });
      break;
    case '/joke':
      socket.emit('chat message', { type: 'text', username: 'システム', text: 'なぜコンピューターは冷たい？ 冷却ファンがあるから！😄' });
      break;
    default:
      socket.emit('chat message', { type: 'text', username: 'システム', text: '不明なコマンドです。"/help"でコマンド一覧を確認できます。' });
      break;
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
});
