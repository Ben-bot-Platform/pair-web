const express = require("express");
const fs = require("fs");
const pino = require("pino");
const NodeCache = require("node-cache");
const chalk = require("chalk");
const readline = require("readline");
const {
    default: makeWASocket,
    Browsers,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;
const sessions = new Map();

// ذخیره اطلاعات اتصال در حافظه
const isValidPhoneNumber = (phone) => /^[0-9]{10,15}$/.test(phone);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// **API Endpoint برای دریافت Pairing Code**
app.get("/api/paircode", async (req, res) => {
    const phoneNumber = req.query.phone;

    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        return res.status(400).json({ error: "Invalid or missing phone number." });
    }

    if (sessions.has(phoneNumber)) {
        return res.status(200).json({
            message: "Session already active.",
            phone: phoneNumber,
            pairingCode: sessions.get(phoneNumber).pairingCode,
        });
    }

    try {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phoneNumber}`);
        const msgRetryCounterCache = new NodeCache();

        const socket = makeWASocket({
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            browser: Browsers.windows("Firefox"),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            msgRetryCounterCache,
        });

        socket.ev.on("creds.update", saveCreds);

        // تولید Pairing Code
        const pairingCode = await socket.requestPairingCode(phoneNumber);
        const formattedCode = pairingCode?.match(/.{1,4}/g)?.join("-") || pairingCode;

        // ذخیره جلسه در Map
        sessions.set(phoneNumber, { socket, pairingCode: formattedCode });

        res.status(200).json({
            phone: phoneNumber,
            pairingCode: formattedCode,
            message: "Pairing code generated successfully. Connect your WhatsApp now!",
        });

        // اتصال موفق
        socket.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                console.log(chalk.green(`Connected successfully to ${phoneNumber}`));

                const sessionData = fs.readFileSync(`./sessions/${phoneNumber}/creds.json`, "utf-8");
                await socket.sendMessage(socket.user.id, {
                    text: `✅ *Connected Successfully!*\n\nHere is your session data:\n\`\`\`${sessionData}\`\`\``,
                });

                // حذف جلسه از Map
                sessions.delete(phoneNumber);
            } else if (connection === "close") {
                console.error("Connection closed. Retrying...");
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
                if (shouldReconnect) await qr(phoneNumber); // Reconnect logic
            }
        });

        socket.ev.on("messages.upsert", () => {
            // این بخش برای مدیریت پیام‌های دریافتی است
        });

    } catch (error) {
        console.error("Error generating pairing code:", error);
        res.status(500).json({ error: "Failed to generate pairing code." });
    }
});

// **API Endpoint برای دریافت وضعیت اتصال**
app.get("/api/status", (req, res) => {
    const phoneNumber = req.query.phone;

    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        return res.status(400).json({ error: "Invalid or missing phone number." });
    }

    const session = sessions.get(phoneNumber);
    if (session) {
        res.status(200).json({ status: "active", phone: phoneNumber });
    } else {
        res.status(404).json({ status: "inactive", phone: phoneNumber });
    }
});

// **درخواست برای دریافت QR و کد Pairing**
async function qr(phoneNumber) {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phoneNumber}`);
    const msgRetryCounterCache = new NodeCache();

    const socket = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: true, // نمایش QR در ترمینال
        browser: Browsers.windows("Firefox"),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        msgRetryCounterCache,
    });

    socket.ev.on("creds.update", saveCreds);

    // تولید Pairing Code و ارسال به کاربر
    const pairingCode = await socket.requestPairingCode(phoneNumber);
    const formattedCode = pairingCode?.match(/.{1,4}/g)?.join("-") || pairingCode;

    console.log(chalk.black(chalk.bgGreen(`Your Pairing Code is: `)), chalk.black(chalk.white(formattedCode)));

    socket.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
            console.log(chalk.green(`Connected successfully to ${phoneNumber}`));
            // ادامه عملیات اتصال
        }
    });

    socket.ev.on("messages.upsert", () => {
        // این بخش برای مدیریت پیام‌های دریافتی است
    });
}

// راه‌اندازی سرور
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
