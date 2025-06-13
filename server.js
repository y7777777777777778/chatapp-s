const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const db = new sqlite3.Database('./users.db');

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

// チャット管理
let messages = [];
const MAX_MESSAGES = 100;
let usersInRoom = {};

io.on('connection', (socket) => {
  const username = socket.handshake.query.username || '匿名';

  socket.username = username;
  usersInRoom[socket.id] = username;

  io.emit('userList', Object.values(usersInRoom));

  socket.emit('chat message', 'ようこそチャットへ！');
  socket.broadcast.emit('chat message', `${username}さんが参加しました。`);

  socket.on('chat message', (msg) => {
    if (msg.startsWith('/')) {
      handleCommand(msg, socket);
    } else {
      const message = `${username}: ${msg}`;
      messages.push(message);
      if (messages.length > MAX_MESSAGES) messages.shift();
      io.emit('chat message', message);
    }
  });

  socket.on('disconnect', () => {
    delete usersInRoom[socket.id];
    io.emit('userList', Object.values(usersInRoom));
    io.emit('chat message', `${username}さんが退出しました。`);
  });
});

function handleCommand(msg, socket) {
  const command = msg.trim().toLowerCase();

  switch (command) {
    case '/allclear':
      messages = [];
      io.emit('clear messages');
      io.emit('chat message', `${socket.username}がメッセージを全削除しました。`);
      break;
    case '/help':
      socket.emit(
        'chat message',
        '使用可能なコマンド: /allclear, /help, /date, /usercount, /roomusers, /myname, /roll, /flip, /joke'
      );
      break;
    case '/date':
      socket.emit('chat message', `現在時刻: ${new Date().toLocaleString()}`);
      break;
    case '/usercount':
      socket.emit('chat message', `現在のユーザー数: ${Object.keys(usersInRoom).length}`);
      break;
    case '/roomusers':
      socket.emit('chat message', `参加中ユーザー: ${Object.values(usersInRoom).join(', ')}`);
      break;
    case '/myname':
      socket.emit('chat message', `あなたの名前: ${socket.username}`);
      break;
    case '/roll':
      socket.emit('chat message', `${socket.username}のサイコロ: 🎲 ${Math.ceil(Math.random() * 6)}`);
      break;
    case '/flip':
      const result = Math.random() < 0.5 ? '表 (Heads)' : '裏 (Tails)';
      socket.emit('chat message', `${socket.username}のコイントス: 🪙 ${result}`);
      break;
    case '/joke':
      socket.emit('chat message', 'なぜコンピューターは冷たい？ 冷却ファンがあるから！😄');
      break;
    default:
      socket.emit('chat message', '不明なコマンドです。"/help"でコマンド一覧を確認できます。');
      break;
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
});
