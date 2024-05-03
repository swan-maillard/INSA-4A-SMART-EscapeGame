import express, { Application } from 'express';
import bodyParser from 'body-parser';
import usersRoutes from './routes/usersRoutes';
import gamesRoutes from './routes/gamesRoutes';
import cors from 'cors';
import gameRoutes from './routes/gameRoutes';
import chatRoutes from './routes/chatRoutes';
import { checkAuthAccessGame } from './JWT';
import { Server, Socket } from 'socket.io';

const https = require('https');
const fs = require('fs');
const logger = require('morgan');
const path = require('path');

const options = {
  key: fs.readFileSync(path.join(__dirname, './cert/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, './cert/cert.pem')),
};

// Boot express
const app: Application = express();
const server = https.createServer(options, app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const sessionsMap: { [key: string]: string } = {};

// Specify allowed origins
const corsOptions = {
  origin: '*', // Add other origins as needed
};

// Use the CORS middleware with options
app.use(cors());

// log requests
app.use(logger('dev'));

const port = 3000;

app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());

// Application routing
app.use('/users', usersRoutes);
app.use('/games', gamesRoutes);
app.use('/game', checkAuthAccessGame, gameRoutes);
app.use('/chat', chatRoutes);


//Inject the peerJS middleware on the /chat route
const ExpressPeerServer = require('peer').ExpressPeerServer;
const peerjs_options = {
  debug: true,
};
const peerServer = ExpressPeerServer(server, peerjs_options);
app.use('/peer', peerServer);



interface CustomSocket extends Socket {
  username?: string;
}

io.on('connection', function (socket: CustomSocket) {
  console.log('Socket connected');
  socket.on('user_join', function (data: { [key: string]: unknown }) {
    console.log(data);
    socket.username = data.user as string;
    sessionsMap[socket.id] = data.session_id as string;
    for (const [socketId, sessionId] of Object.entries(sessionsMap)) {
      if (sessionId == data.session_id) {
        socket.broadcast.to(socketId).emit('user_join', data.user);
      }
    }
  });

  socket.on('chat_message', function (data: { [key: string]: unknown }) {
    data.username = socket.username;
    for (const [socketId, sessionId] of Object.entries(sessionsMap)) {
      if (sessionId == data.session_id) {
        socket.broadcast.to(socketId).emit('chat_message', data);
      }
    }
  });

  socket.on('disconnect', function () {
    const disconnectedSession = sessionsMap[socket.id];
    delete sessionsMap[socket.id];
    for (const [socketId, sessionId] of Object.entries(sessionsMap)) {
      if (sessionId == disconnectedSession) {
        socket.broadcast.to(socketId).emit('user_leave', socket.username);
      }
    }
  });
});

server.listen(port, '0.0.0.0', () => console.log(`Server is listening on port ${port}`));
