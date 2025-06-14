
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

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/register.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (row) {
      res.redirect(`/chat.html?username=${encodeURIComponent(username)}`);
    } else {
      res.send('ログイン失敗: ユーザー名またはパスワードが違います。');
    }
  });
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err) => {
    if (err) {
      res.send('登録失敗: すでに存在するユーザー名です。');
    } else {
      res.redirect('/');
    }
  });
});

let roomUsers = {};
let messages = {};
const MAX_MESSAGES = 100;

io.on('connection', (socket) => {
  const username = socket.handshake.query.username || 'ゲスト';
  socket.username = username;

  socket.on('joinRoom', (room) => {
    if (socket.room) {
      socket.leave(socket.room);
      if (roomUsers[socket.room]) {
        delete roomUsers[socket.room][socket.id];
        io.to(socket.room).emit('userList', Object.values(roomUsers[socket.room]));
      }
    }

    socket.join(room);
    socket.room = room;

    if (!roomUsers[room]) roomUsers[room] = {};
    roomUsers[room][socket.id] = username;

    if (!messages[room]) messages[room] = [];

    io.to(room).emit('userList', Object.values(roomUsers[room]));

    socket.emit('chat message', `ようこそ ${username} さん！`);
    socket.to(room).emit('chat message', `${username} さんが参加しました。`);

    messages[room].forEach((msg) => {
      socket.emit('chat message', msg);
    });
  });

  socket.on('chat message', ({ room, msg }) => {
    if (!room || !roomUsers[room]) return;

    if (msg.startsWith('/')) {
      handleCommand(room, msg, socket);
    } else {
      const message = `${socket.username}: ${msg}`;
      messages[room].push(message);
      if (messages[room].length > MAX_MESSAGES) messages[room].shift();
      io.to(room).emit('chat message', message);
    }
  });

  socket.on('disconnect', () => {
    const room = socket.room;
    if (room && roomUsers[room]) {
      delete roomUsers[room][socket.id];
      io.to(room).emit('userList', Object.values(roomUsers[room]));
      io.to(room).emit('chat message', `${socket.username} さんが退出しました。`);
    }
  });
});

function handleCommand(room, msg, socket) {
  const command = msg.trim().toLowerCase();

  switch (command) {
    case '/allclear':
      messages[room] = [];
      io.to(room).emit('clear messages');
      io.to(room).emit('chat message', `${socket.username} がメッセージを全削除しました。`);
      break;
    case '/help':
      socket.emit('chat message', '使用可能なコマンド: /allclear, /help, /date, /usercount, /roomusers, /myname, /roll, /flip, /joke');
      break;
    case '/date':
      socket.emit('chat message', `現在時刻: ${new Date().toLocaleString()}`);
      break;
    case '/usercount':
      socket.emit('chat message', `現在のユーザー数: ${Object.keys(roomUsers[socket.room] || {}).length}`);
      break;
    case '/roomusers':
      socket.emit('chat message', `参加中ユーザー: ${Object.values(roomUsers[socket.room] || {}).join(', ')}`);
      break;
    case '/myname':
      socket.emit('chat message', `あなたの名前: ${socket.username}`);
      break;
    case '/roll':
      socket.emit('chat message', `${socket.username} のサイコロ: 🎲 ${Math.ceil(Math.random() * 6)}`);
      break;
    case '/flip':
      const result = Math.random() < 0.5 ? '表 (Heads)' : '裏 (Tails)';
      socket.emit('chat message', `${socket.username} のコイントス: 🪙 ${result}`);
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
