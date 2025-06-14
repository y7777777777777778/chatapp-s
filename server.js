
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

const db = new sqlite3.Database('./users.db');

// ユーザー＆メッセージテーブル作成
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT,
    username TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ルーティング
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/register', (_, res) => {
  res.sendFile(path.join(__dirname, 'public/register.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (row) {
      res.redirect(`/chat.html?username=${encodeURIComponent(username)}&room=general`);
    } else {
      res.send('ログイン失敗');
    }
  });
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err) => {
    if (err) return res.send('登録失敗');
    res.redirect('/');
  });
});

// ユーザーとチャット管理
const usersInRoom = {};

io.on('connection', (socket) => {
  const username = socket.handshake.query.username || 'ゲスト';
  const room = socket.handshake.query.room || 'general';

  socket.join(room);
  socket.username = username;
  socket.room = room;
  usersInRoom[socket.id] = { username, room };

  // メッセージ履歴読み込み
  db.all('SELECT username, content FROM messages WHERE room = ? ORDER BY id ASC', [room], (err, rows) => {
    rows.forEach((row) => {
      socket.emit('chat message', `${row.username}: ${row.content}`);
    });
  });

  socket.broadcast.to(room).emit('chat message', `${username}が入室しました`);

  socket.on('chat message', (msg) => {
    if (msg.startsWith('/')) {
      handleCommand(msg, socket);
    } else {
      const message = `${username}: ${msg}`;
      io.to(room).emit('chat message', message);
      db.run('INSERT INTO messages (room, username, content) VALUES (?, ?, ?)', [room, username, msg]);
    }
  });

  socket.on('image', ({ buffer, name }) => {
    const ext = path.extname(name).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return;
    const base64 = buffer; // data URL
    const html = `<strong>${username}:</strong><br><img src="${base64}" alt="${name}" />`;
    io.to(room).emit('image message', html);
    db.run('INSERT INTO messages (room, username, content) VALUES (?, ?, ?)', [room, username, `[画像送信: ${name}]`]);
  });

  socket.on('disconnect', () => {
    delete usersInRoom[socket.id];
    io.to(room).emit('chat message', `${username}が退出しました`);
  });
});

function handleCommand(msg, socket) {
  const command = msg.trim().toLowerCase();
  const room = socket.room;
  switch (command) {
    case '/allclear':
      db.run('DELETE FROM messages WHERE room = ?', [room]);
      io.to(room).emit('clear messages');
      io.to(room).emit('chat message', `${socket.username}がメッセージを全削除しました。`);
      break;
    case '/help':
      socket.emit('chat message', '使用可能なコマンド: /allclear, /help, /date, /myname, /roll, /flip, /joke');
      break;
    case '/date':
      socket.emit('chat message', `現在時刻: ${new Date().toLocaleString()}`);
      break;
    case '/myname':
      socket.emit('chat message', `あなたの名前: ${socket.username}`);
      break;
    case '/roll':
      socket.emit('chat message', `🎲 ${socket.username}の出目: ${Math.ceil(Math.random() * 6)}`);
      break;
    case '/flip':
      socket.emit('chat message', `🪙 ${socket.username}のコイントス: ${Math.random() < 0.5 ? '表' : '裏'}`);
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
  console.log(`http://localhost:${PORT}`);
});
