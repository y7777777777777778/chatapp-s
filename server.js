
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const db = new sqlite3.Database('./chat.db');
db.run("CREATE TABLE IF NOT EXISTS messages (room TEXT, username TEXT, message TEXT, timestamp TEXT)");
db.run("CREATE TABLE IF NOT EXISTS pinned (room TEXT, message TEXT)");
db.run("CREATE TABLE IF NOT EXISTS files (room TEXT, username TEXT, data TEXT, timestamp TEXT)");
db.run("CREATE TABLE IF NOT EXISTS direct_messages (sender TEXT, recipient TEXT, message TEXT, timestamp TEXT)");

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

io.on('connection', (socket) => {
    socket.on('setUsername', (username) => {
        socket.username = username;
        io.emit('updateUserList', getConnectedUsers());
    });

    socket.on('joinRoom', (room) => {
        socket.join(room);
        db.all("SELECT * FROM messages WHERE room = ?", [room], (err, rows) => {
            if (!err) socket.emit('messageHistory', rows);
        });

        db.get("SELECT message FROM pinned WHERE room = ?", [room], (err, row) => {
            if (row) socket.emit('updatePinnedMessage', row);
        });

        db.all("SELECT * FROM files WHERE room = ?", [room], (err, rows) => {
            if (!err) socket.emit('fileHistory', rows);
        });
    });

    socket.on('message', (data) => {
        db.run("INSERT INTO messages (room, username, message, timestamp) VALUES (?, ?, ?, ?)", 
               [data.room, data.username, data.message, new Date().toISOString()]);
        io.to(data.room).emit('message', data);
    });

    socket.on('pinMessage', (data) => {
        db.run("DELETE FROM pinned WHERE room = ?", [data.room]); 
        db.run("INSERT INTO pinned (room, message) VALUES (?, ?)", [data.room, data.message]);
        io.to(data.room).emit('updatePinnedMessage', data);
    });

    socket.on('file', (file) => {
        db.run("INSERT INTO files (room, username, data, timestamp) VALUES (?, ?, ?, ?)", 
               [file.room, file.username, file.data, new Date().toISOString()]);
        io.to(file.room).emit('file', file);
    });

    socket.on('directMessage', ({ recipient, message }) => {
        const sender = socket.username;
        db.run("INSERT INTO direct_messages (sender, recipient, message, timestamp) VALUES (?, ?, ?, ?)", 
               [sender, recipient, message, new Date().toISOString()]);
        io.to(getSocketId(recipient)).emit('directMessage', { sender, message });
    });

    socket.on('disconnect', () => {
        io.emit('updateUserList', getConnectedUsers());
    });

    function getConnectedUsers() {
        return Array.from(io.sockets.sockets.values()).map(s => s.username).filter(Boolean);
    }

    function getSocketId(username) {
        return Array.from(io.sockets.sockets.values()).find(s => s.username === username)?.id;
    }
});

server.listen(process.env.PORT || 5000, () => {
    console.log("🚀 サーバーがポート 5000 で起動しました！");
});
