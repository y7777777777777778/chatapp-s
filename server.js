
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// DB
const db = new sqlite3.Database('./users.db');
db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);

// Multer設定（画像）
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// ルーティング
app.get('/', (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/register', (req, res) => res.sendFile(__dirname + '/public/register.html'));
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run('INSERT INTO users(username, password) VALUES(?, ?)', [username, password], err => {
    if (err) return res.send('登録失敗: 既に存在します');
    res.redirect('/');
  });
});
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username=? AND password=?', [username, password], (err, row) => {
    if (row) res.redirect(`/chat.html?username=${encodeURIComponent(username)}`);
    else res.send('ログイン失敗');
  });
});

// アップロード
app.post('/upload', upload.single('image'), (req, res) => {
  const imageUrl = `/uploads/${req.file.filename}`;
  res.send({ imageUrl });
});

let messages = {};
let usersInRooms = {};

io.on('connection', socket => {
  let username = socket.handshake.query.username || 'ゲスト';
  let room = socket.handshake.query.room || 'default';

  socket.username = username;
  socket.room = room;
  socket.join(room);

  if (!usersInRooms[room]) usersInRooms[room] = {};
  usersInRooms[room][socket.id] = username;
  if (!messages[room]) messages[room] = [];

  io.to(room).emit('userList', Object.values(usersInRooms[room]));

  socket.emit('chat message', 'ようこそチャットへ！');
  socket.broadcast.to(room).emit('chat message', `${username}さんが参加しました`);

  socket.on('chat message', msg => {
    if (msg.startsWith('/')) handleCommand(msg, socket);
    else {
      const formatted = `${username}: ${msg}`;
      messages[room].push(formatted);
      if (messages[room].length > 100) messages[room].shift();
      io.to(room).emit('chat message', formatted);
    }
  });

  socket.on('image', url => {
    const formatted = `${username} が画像を送信: <img src="${url}" class="chat-image">`;
    io.to(room).emit('chat message', formatted);
  });

  socket.on('disconnect', () => {
    delete usersInRooms[room][socket.id];
    io.to(room).emit('userList', Object.values(usersInRooms[room]));
    io.to(room).emit('chat message', `${username}さんが退出しました`);
  });
});

function handleCommand(msg, socket) {
  const cmd = msg.trim().toLowerCase();
  const room = socket.room;

  switch (cmd) {
    case '/allclear':
      messages[room] = [];
      io.to(room).emit('clear messages');
      break;
    case '/help':
      socket.emit('chat message', 'コマンド一覧: /allclear /help /date /usercount /roomusers /myname /roll /flip /joke');
      break;
    case '/date':
      socket.emit('chat message', `現在時刻: ${new Date().toLocaleString()}`);
      break;
    case '/usercount':
      socket.emit('chat message', `ユーザー数: ${Object.keys(usersInRooms[room]).length}`);
      break;
    case '/roomusers':
      socket.emit('chat message', `ユーザー一覧: ${Object.values(usersInRooms[room]).join(', ')}`);
      break;
    case '/myname':
      socket.emit('chat message', `あなたの名前: ${socket.username}`);
      break;
    case '/roll':
      socket.emit('chat message', `${socket.username}のサイコロ: 🎲 ${Math.ceil(Math.random() * 6)}`);
      break;
    case '/flip':
      socket.emit('chat message', `${socket.username}のコイントス: 🪙 ${Math.random() < 0.5 ? '表' : '裏'}`);
      break;
    case '/joke':
      socket.emit('chat message', 'プログラマが海に行くと？ → Javaが浮く！😄');
      break;
    default:
      socket.emit('chat message', '不明なコマンドです。/helpで確認してください');
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`ポート${PORT}でサーバー起動`));
