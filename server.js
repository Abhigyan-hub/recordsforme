const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const dns = require('dns');
const { Server } = require("socket.io");

const connectDB = require('./config/db');

dotenv.config();

// Render needed public resolvers for Atlas SRV. AWS (App Runner / Elastic Beanstalk)
// should use the platform DNS. Set PUBLIC_DNS=true only if SRV lookup fails.
if (process.env.PUBLIC_DNS === 'true') {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const DEFAULT_ORIGINS = [
    'https://enqury-form-ss.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];

const allowedOrigins = [
    ...DEFAULT_ORIGINS,
    ...(process.env.CLIENT_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
];

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    if (process.env.ALLOW_VERCEL_PREVIEWS === 'true') {
        return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
    }
    return false;
};

const corsOrigin = (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed: ${origin}`));
};

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Make io globally accessible
global.io = io;

// Middleware
app.use(cors({
    origin: corsOrigin,
    credentials: true
}));

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));

// Render (and most hosts) sit behind a proxy: needed so req.ip is the visitor's IP.
app.set('trust proxy', 1);

// Public enquiry form: throttle scripted spam per IP.
const rateLimit = require('./middleware/rateLimit');
app.post('/api/enquiries', rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: 'Too many submissions from this network. Please try again in a few minutes.',
}));

// Routes
app.use('/api/enquiries', require('./routes/enquiryRoutes'));
app.use('/api/chat-leads', require('./routes/chatLeadRoutes'));

app.get('/', (_req, res) => {
    res.send('Enquiry Backend is running...');
});

// App Runner / load balancer health check. Does not touch MongoDB.
app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
});

// Socket Connection
io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on("disconnect", () => {
        console.log(`User Disconnected: ${socket.id}`);
    });
});

// Start Server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not set. Add it in the AWS service environment variables.');
        process.exit(1);
    }

    try {
        await connectDB();
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Socket.io is ready`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();