
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(express.json());

const messages = {}; // 各部屋のメッセージを保持
const usersInRooms = {}; // 各部屋にいるユーザー

// ファイルアップロード設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "public", "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "_" + file.originalname;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  const { username, room } = req.body;
  const fileUrl = `/uploads/${req.file.filename}`;
  const msg = { user: username, file: fileUrl, room };
  if (!messages[room]) messages[room] = [];
  messages[room].push(msg);
  io.to(room).emit("message", msg);
  res.json({ success: true });
});

app.post("/send-message", (req, res) => {
  const { message, username, room } = req.body;
  if (!messages[room]) messages[room] = [];

  // コマンド処理
  if (message.startsWith("/")) {
    const cmd = message.trim().toLowerCase();

    switch (cmd) {
      case "/allclear":
        messages[room] = [];
        io.to(room).emit("message", {
          user: "システム",
          text: `${username} が全メッセージを削除しました`,
          room,
        });
        return res.json({ success: true });

      case "/help":
        const helpText = `
        利用可能なコマンド:
        /help - コマンド一覧を表示
        /allclear - メッセージを全削除
        /date - 現在日時を表示
        /usercount - 現在の総ユーザー数
        /roomusers - 現在の部屋のユーザー
        /myname - あなたのユーザー名
        /roll - サイコロを振る 🎲
        /flip - コインを投げる 🪙
        /joke - ランダムなジョークを表示`;
        messages[room].push({ user: "システム", text: helpText, room });
        io.to(room).emit("message", { user: "システム", text: helpText, room });
        return res.json({ success: true });

      case "/date":
        const now = new Date();
        const formatted = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
        const dateMsg = `📅 現在の日時: ${formatted}`;
        messages[room].push({ user: "システム", text: dateMsg, room });
        io.to(room).emit("message", { user: "システム", text: dateMsg, room });
        return res.json({ success: true });

      case "/usercount":
        const allUsers = Object.values(usersInRooms).flat();
        const uniqueUsers = [...new Set(allUsers)];
        const countMsg = `👥 サイト全体のユーザー数: ${uniqueUsers.length}`;
        messages[room].push({ user: "システム", text: countMsg, room });
        io.to(room).emit("message", { user: "システム", text: countMsg, room });
        return res.json({ success: true });

      case "/roomusers":
        const roomUsers = usersInRooms[room] || [];
        const list = roomUsers.join(", ") || "誰もいません";
        const userListMsg = `📍 現在の部屋のユーザー: ${list}`;
        messages[room].push({ user: "システム", text: userListMsg, room });
        io.to(room).emit("message", { user: "システム", text: userListMsg, room });
        return res.json({ success: true });

      case "/myname":
        const nameMsg = `あなたのユーザー名: ${username}`;
        messages[room].push({ user: "システム", text: nameMsg, room });
        io.to(room).emit("message", { user: "システム", text: nameMsg, room });
        return res.json({ success: true });

      case "/roll":
        const dice = Math.floor(Math.random() * 6) + 1;
        const diceMsg = `${username} のサイコロの目: 🎲 ${dice}`;
        messages[room].push({ user: "システム", text: diceMsg, room });
        io.to(room).emit("message", { user: "システム", text: diceMsg, room });
        return res.json({ success: true });

      case "/flip":
        const flip = Math.random() < 0.5 ? "表 (Heads)" : "裏 (Tails)";
        const flipMsg = `${username} のコイントス: 🪙 ${flip}`;
        messages[room].push({ user: "システム", text: flipMsg, room });
        io.to(room).emit("message", { user: "システム", text: flipMsg, room });
        return res.json({ success: true });

      case "/joke":
        const jokes = [
          "プログラマーがビールを嫌う理由？バグが酔って出てくるから！",
          "エラーが出たら？...逃げるが勝ち！😂",
          "JavaとJavaScriptは違う？犬とホットドッグくらい違うよ。",
        ];
        const joke = jokes[Math.floor(Math.random() * jokes.length)];
        messages[room].push({ user: "システム", text: `🤣 ジョーク: ${joke}`, room });
        io.to(room).emit("message", { user: "システム", text: `🤣 ジョーク: ${joke}`, room });
        return res.json({ success: true });

      default:
        const errorMsg = `❌ 未知のコマンド: ${cmd}`;
        messages[room].push({ user: "システム", text: errorMsg, room });
        io.to(room).emit("message", { user: "システム", text: errorMsg, room });
        return res.json({ success: true });
    }
  }

  // 通常メッセージ
  const msg = { user: username, text: message, room };
  messages[room].push(msg);
  io.to(room).emit("message", msg);
  res.json({ success: true });
});

app.get("/messages", (req, res) => {
  const room = req.query.room;
  res.json(messages[room] || []);
});

io.on("connection", (socket) => {
  socket.on("joinRoom", (room) => {
    socket.join(room);
    if (!usersInRooms[room]) usersInRooms[room] = [];

    const username = socket.handshake.query?.username || "ゲスト";
    if (!usersInRooms[room].includes(username)) {
      usersInRooms[room].push(username);
    }

    socket.on("disconnect", () => {
      const index = usersInRooms[room].indexOf(username);
      if (index !== -1) usersInRooms[room].splice(index, 1);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ サーバー起動 http://localhost:${PORT}`));
