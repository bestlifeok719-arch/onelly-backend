const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: [], posts: [], messages: [], videos: [], items: [] }).write();

const SECRET = process.env.JWT_SECRET || 'onelly-dev-secret-change-me';
const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.userId = jwt.verify(token, SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/signup', (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'Missing fields' });
  if (db.get('users').find({ phone }).value()) return res.status(409).json({ error: 'Phone already registered' });
  const id = 'u' + Date.now();
  const hash = bcrypt.hashSync(password, 10);
  db.get('users').push({ id, name, phone, hash }).write();
  const token = jwt.sign({ id }, SECRET);
  res.json({ token, user: { id, name, phone } });
});

app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  const user = db.get('users').find({ phone }).value();
  if (!user || !bcrypt.compareSync(password, user.hash)) {
    return res.status(401).json({ error: 'Incorrect phone or password' });
  }
  const token = jwt.sign({ id: user.id }, SECRET);
  res.json({ token, user: { id: user.id, name: user.name, phone: user.phone } });
});

app.get('/api/me', auth, (req, res) => {
  const u = db.get('users').find({ id: req.userId }).value();
  res.json({ id: u.id, name: u.name, phone: u.phone });
});

app.get('/api/users', auth, (req, res) => {
  res.json(db.get('users').map(u => ({ id: u.id, name: u.name })).value());
});

app.get('/api/posts', auth, (req, res) => {
  res.json(db.get('posts').orderBy('time', 'desc').value());
});

app.post('/api/posts', auth, (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  const post = { id: 'p' + Date.now(), author: req.userId, text, time: Date.now(), likes: [], comments: [] };
  db.get('posts').push(post).write();
  res.json(post);
});

app.post('/api/posts/:id/like', auth, (req, res) => {
  const post = db.get('posts').find({ id: req.params.id }).value();
  if (!post) return res.status(404).end();
  const i = post.likes.indexOf(req.userId);
  if (i === -1) post.likes.push(req.userId); else post.likes.splice(i, 1);
  db.write();
  res.json(post);
});

app.get('/api/messages/:otherId', auth, (req, res) => {
  const key = [req.userId, req.params.otherId].sort().join('|');
  res.json(db.get('messages').filter({ thread: key }).value());
});

app.post('/api/messages/:otherId', auth, (req, res) => {
  const { text } = req.body;
  const key = [req.userId, req.params.otherId].sort().join('|');
  const msg = { thread: key, from: req.userId, text, time: Date.now() };
  db.get('messages').push(msg).write();
  res.json(msg);
});

app.get('/api/items', auth, (req, res) => {
  res.json(db.get('items').orderBy('time', 'desc').value());
});

app.post('/api/items', auth, (req, res) => {
  const { name, price, desc } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Missing fields' });
  const item = { id: 'i' + Date.now(), seller: req.userId, name, price, desc, time: Date.now() };
  db.get('items').push(item).write();
  res.json(item);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Onelly backend running on port ${PORT}`));
