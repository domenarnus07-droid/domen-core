const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
// ✅ MongoDB povezava (Atlas URL)
mongoose.connect('mongodb+srv://domenarnus07:Domen12730@cluster0.do2brlj.mongodb.net/myapp?retryWrites=true&w=majority&appName=Cluster0')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Mongo error:', err));
//model za uporabnike
const User = mongoose.model('User', new mongoose.Schema({
  username: String,
  email: String,
  password: String
}));

//model za sporočila v klepetu
const Message = mongoose.model('Message', new mongoose.Schema({
  username: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const sessionMiddleware = session({
  secret: 'skrivnost',
  resave: false,
  saveUninitialized: false
});
app.use(sessionMiddleware);

// Middleware za zaščito strani
function authMiddleware(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/prijava.html');
  }
}

// Registracija
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).send('Vsa polja morajo biti izpolnjena.');
  }

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).send('Uporabniško ime že obstaja.');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, email, password: hashedPassword });
  await newUser.save();

  res.status(200).send('Registracija uspešna');
});
// Prijava
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) {
    return res.status(400).send('Uporabnik ne obstaja');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).send('Napačno geslo');
  }

  req.session.user = { username: user.username }; 

  res.status(200).send('Prijava uspešna'); 
});


// Odjava
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/prijava.html');
  });
});

// Vrni trenutno prijavljenega uporabnika
app.get('/api/user', (req, res) => {
  res.json({ user: req.session.user || null });
});

// Nalaganje sporočil za klepet
app.get('/api/messages', authMiddleware, async (req, res) => {
  const messages = await Message.find().sort({ timestamp: 1 });
  res.json(messages);
});

// Pošlji novo sporočilo
app.post('/api/messages', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).send('Sporočilo ne sme biti prazno');

  const newMessage = new Message({
    username: req.session.user.username,
    message
  });

  await newMessage.save();
  res.status(201).send('Sporočilo shranjeno');
});

// Zaščiten dostop do domače strani in klepeta
app.get('/', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat.html', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Dostop do prijave in registracije
app.get('/prijava.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'prijava.html'));
});

app.get('/registracija.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'registracija.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Socket.io povezava za klepet
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  const session = socket.request.session;
  if (!session.user) {
    socket.disconnect();
    return;
  }

  socket.on('chat message', async (msg) => {
    const newMessage = new Message({
      username: session.user.username,
      message: msg
    });
    await newMessage.save();

    io.emit('chat message', {
      username: session.user.username,
      message: msg,
      timestamp: newMessage.timestamp
    });
  });
});


const orderSchema = new mongoose.Schema({
  kupec: {
    ime: String,
    ulica: String,
    posta: String,
    kraj: String,
    email: String,
    telefon: String,
    dostava: String,
    placilo: String
    
    
  },
  izdelki: [Object],
  datum: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

app.post('/api/order', async (req, res) => {
  try {
    const { kupec, izdelki } = req.body;
    if (!kupec || !izdelki || izdelki.length === 0) {
      return res.status(400).send("Podatki niso popolni.");
    }

    const order = new Order({ kupec, izdelki });
    await order.save();

    res.status(200).send("✅ Naročilo je bilo uspešno oddano!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Napaka pri obdelavi naročila.");
  }
});
// model za ocene
const Rating = mongoose.model('Rating', new mongoose.Schema({
  stars: Number,
  comment: String,
  date: { type: Date, default: Date.now }
}));

// API endpoint za oddajo ocen
app.post('/api/ratings', async (req, res) => {
  const { stars, comment } = req.body;
  if (!stars || !comment) {
    return res.status(400).send("Manjkajo podatki.");
  }

  try {
    const newRating = new Rating({ stars, comment });
    await newRating.save();
    res.status(200).send("✅ Ocena uspešno shranjena!");
  } catch (err) {
    console.error("❌ Napaka pri shranjevanju ocene:", err);
    res.status(500).send("Napaka pri shranjevanju.");
  }
});

//Zagon strežnika
server.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
