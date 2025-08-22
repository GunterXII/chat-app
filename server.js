const express = require("express");// per gestire pagine e API
const path = require("path");  
const app = express();// express serve i file statici

const {createServer} = require("http");       // per creare il server base
const { Server } = require("socket.io"); // per la chat in tempo reale
const fs = require("fs").promises;
const server=createServer(app)//Express da solo non basta per socket.io, perché socket.io ha bisogno di stare attaccato al server HTTP vero e proprio, non solo a Express.
//Quindi usiamo http.createServer(app) per costruire quel server.// server HTTP
const io=new Server(server) // <-- attacca Socket.IO al server
/* percorso file messaggi */
const MESSAGES_FILE = path.join(__dirname, "data", "messages.json");

/* in-memory messages (source of truth durante l'esecuzione) */
let messages = [];

/* semplice id generator */
function generateId() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}
/* write-lock per evitare race condition */
let isWriting = false;
let pendingWrite = false;

async function saveMessagesToFile() {
  if (isWriting) {
    // se è già in scrittura, segnalo che devo rieseguire dopo
    pendingWrite = true;
    return;
  }
  isWriting = true;
  try {
    const tmpPath = MESSAGES_FILE + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(messages, null, 2), "utf8");
    await fs.rename(tmpPath, MESSAGES_FILE); // scrittura atomica (rename è atomico su molti FS)
  } catch (err) {
    console.error("Errore salvataggio messages.json:", err);
  } finally {
    isWriting = false;
    if (pendingWrite) {
      pendingWrite = false;
      // esegui di nuovo per assicurare che l'ultima modifica sia scritta
      await saveMessagesToFile();
    }
  }
}

/* carica messaggi all'avvio */
async function loadMessagesFromFile() {
  try {
    const content = await fs.readFile(MESSAGES_FILE, "utf8");
    messages = JSON.parse(content);
    if (!Array.isArray(messages)) messages = [];
  } catch (err) {
    console.log("messages.json non trovato o non leggibile — creo file nuovo.");
    messages = [];
    // crea file vuoto
    try {
      await fs.mkdir(path.join(__dirname, "data"), { recursive: true });
      await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2), "utf8");
    } catch (e) {
      console.error("Errore creazione messages.json:", e);
    }
  }
}

/* carica all'avvio */
loadMessagesFromFile();

/* limiti: manteniamo al massimo N messaggi per non appesantire il file */
const MAX_MESSAGES = 500;
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath)); // I file dentro /public sono serviti automaticamente
app.use(express.urlencoded({ extended: true }))//leggere dati del form
const users = {}; // mappa socket.id -> username

// ascolto connessioni socket
io.on("connection", (socket) => {
    console.log("🔌 Nuovo utente connesso");

    socket.on("messaggio", (msg) => {
    console.log(`${msg.nome}: ${msg.testo}`);
    io.emit("messaggio", msg);
});;

    socket.on("disconnect", () => {
        console.log("❌ Utente disconnesso");
    });
});


io.on('connection', socket => {
  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data); // informa gli altri
  });
});


//socket.on(...) → ascolto quello che un utente dice.
//io.emit(...) → invio a tutti.
//socket.emit(...) → invio solo a quell’utente.



server.listen(3000, () => {
    console.log("Server avviato su http://localhost:3000");
});
