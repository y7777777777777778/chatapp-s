
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

// 静的ファイル
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// ユーザーDB
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT,
      username TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ルート
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public/register.html')));

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
    if (err) {
      res.send('登録失敗：すでに存在するユーザー名です');
    } else {
      res.redirect('/');
    }
  });
});

// ソケット処理
const usersInRoom = {};
const MAX_MESSAGES = 100;

io.on('connection', (socket) => {
  const username = socket.handshake.query.username || 'ゲスト';
  const room = socket.handshake.query.room || 'general';
  socket.join(room);
  socket.username = username;
  socket.room = room;

  if (!usersInRoom[room]) usersInRoom[room] = {};
  usersInRoom[room][socket.id] = username;
  io.to(room).emit('userList', Object.values(usersInRoom[room]));

  // 過去ログ読み込み
  db.all('SELECT username, content FROM messages WHERE room = ? ORDER BY id ASC', [room], (err, rows) => {
    if (!err) {
      rows.forEach(row => {
        socket.emit('chat message', `${row.username}: ${row.content}`);
      });
    }
  });

  io.to(room).emit('chat message', `${username}さんが参加しました。`);

  socket.on('chat message', (msg) => {
    if (msg.startsWith('/')) {
      handleCommand(msg, socket);
    } else {
      db.run('INSERT INTO messages (room, username, content) VALUES (?, ?, ?)', [room, username, msg]);
      io.to(room).emit('chat message', `${username}: ${msg}`);
    }
  });

  socket.on('disconnect', () => {
    delete usersInRoom[room][socket.id];
    io.to(room).emit('userList', Object.values(usersInRoom[room]));
    io.to(room).emit('chat message', `${username}さんが退出しました。`);
  });
});

// コマンド処理
function handleCommand(msg, socket) {
  const command = msg.trim().toLowerCase();
  switch (command) {
    case '/allclear':
      db.run('DELETE FROM messages WHERE room = ?', [socket.room]);
      io.to(socket.room).emit('clear messages');
      io.to(socket.room).emit('chat message', `${socket.username}がメッセージを全削除しました`);
      break;
    case '/help':
      socket.emit('chat message', '使用可能コマンド: /allclear, /help, /date, /roll, /flip');
      break;
    case '/date':
      socket.emit('chat message', `現在時刻: ${new Date().toLocaleString()}`);
      break;
    case '/roll':
      socket.emit('chat message', `🎲 サイコロ: ${Math.ceil(Math.random() * 6)}`);
      break;
    case '/flip':
      socket.emit('chat message', `🪙 コイントス: ${Math.random() < 0.5 ? '表' : '裏'}`);
      break;
    default:
      socket.emit('chat message', '不明なコマンドです (/help)');
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`サーバー起動: http://localhost:${PORT}`));
