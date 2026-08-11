"use strict";

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const github = require("./github");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const PRODUCTS_PATH = "products.json";
const UPLOAD_DIR = "assets/images/uploads";
const COOKIE = "ccc_admin";

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Allow the public website (a different address) to talk to this manager.
// Editing is protected by the login token below, so reflecting the origin is safe here.
app.use(function (req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

/* ---------- Auth helpers ---------- */

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function issueToken(res) {
  const token = jwt.sign({ role: "admin" }, SESSION_SECRET, { expiresIn: "30d" });
  // Cookie is handy for same-origin; the token is also returned for the website to store.
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return token;
}

function getToken(req) {
  const header = req.headers.authorization || "";
  if (header.indexOf("Bearer ") === 0) return header.slice(7);
  return (req.cookies && req.cookies[COOKIE]) || null;
}

function isAuthed(req) {
  const token = getToken(req);
  if (!token) return false;
  try {
    jwt.verify(token, SESSION_SECRET);
    return true;
  } catch (e) {
    return false;
  }
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: "Not signed in." });
  next();
}

/* ---------- Auth routes ---------- */

app.get("/api/session", function (req, res) {
  res.json({
    authed: isAuthed(req),
    configured: github.isConfigured(),
    passwordSet: Boolean(ADMIN_PASSWORD),
  });
});

app.post("/api/login", function (req, res) {
  const password = (req.body && req.body.password) || "";
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: "No admin password is configured on the server." });
  }
  if (!safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  const token = issueToken(res);
  res.json({ ok: true, token: token });
});

app.post("/api/logout", function (req, res) {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

/* ---------- Product routes ---------- */

app.get("/api/products", requireAuth, async function (req, res) {
  try {
    const file = await github.getFile(PRODUCTS_PATH);
    if (!file) return res.json({ categories: [], products: [], sha: null });
    const data = JSON.parse(file.content);
    res.json({
      categories: data.categories || [],
      products: data.products || [],
      sha: file.sha,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/products", requireAuth, async function (req, res) {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.products) || !Array.isArray(body.categories)) {
      return res.status(400).json({ error: "Expected categories and products arrays." });
    }
    // Re-read to get the latest sha, avoiding stale overwrites.
    const current = await github.getFile(PRODUCTS_PATH);
    const payload = {
      categories: body.categories,
      products: body.products,
    };
    const json = JSON.stringify(payload, null, 2) + "\n";
    await github.putFile(
      PRODUCTS_PATH,
      json,
      "Update products via admin",
      current ? current.sha : undefined
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- Image upload ---------- */

function safeName(name) {
  const base = String(name || "photo")
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "photo";
}

app.post("/api/upload", requireAuth, upload.single("file"), async function (req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const stamp = Date.now();
    const filePath = UPLOAD_DIR + "/" + stamp + "-" + safeName(req.file.originalname);
    await github.putFile(filePath, req.file.buffer, "Upload product photo via admin");
    res.json({ path: filePath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- Image preview proxy (so photos show in the admin, even for private repos) ---------- */

const CONTENT_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

app.get("/preview-image", requireAuth, async function (req, res) {
  try {
    const p = String(req.query.path || "");
    // Only allow reading from the site's own asset/image locations.
    if (!/^assets\/images\/[a-zA-Z0-9_\-./]+$/.test(p) || p.indexOf("..") !== -1) {
      return res.status(400).end();
    }
    const file = await github.getFileBuffer(p);
    if (!file) return res.status(404).end();
    const ext = path.extname(p).toLowerCase();
    res.set("Content-Type", CONTENT_TYPES[ext] || "application/octet-stream");
    res.set("Cache-Control", "no-store");
    res.send(file.buffer);
  } catch (e) {
    res.status(500).end();
  }
});

/* ---------- Static admin UI ---------- */

app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", function (req, res) {
  res.json({ ok: true });
});

app.listen(PORT, function () {
  console.log("Admin service listening on port " + PORT);
  if (!ADMIN_PASSWORD) console.warn("WARNING: ADMIN_PASSWORD is not set.");
  if (!github.isConfigured()) {
    console.warn("WARNING: GitHub storage is not configured (GITHUB_OWNER/REPO/TOKEN).");
  }
});
