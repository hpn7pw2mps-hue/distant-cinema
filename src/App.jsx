import React, { useState, useEffect, useRef, useCallback } from "react";
import { MonitorPlay, Link2, Users, Send, Film, Copy, Check, DoorOpen, Sparkles, Upload, Youtube, FolderOpen } from "lucide-react";

// ---------- helpers ----------
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function genGuestName() {
  const names = ["ضيف الصالة", "متفرج", "زائر البهو", "رفيق الشاشة"];
  return names[Math.floor(Math.random() * names.length)] + " " + Math.floor(Math.random() * 90 + 10);
}

// ---------- film leader (signature element) ----------
function FilmLeader({ size = 120, spinning = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={spinning ? "leader-spin" : ""}>
      <circle cx="50" cy="50" r="48" fill="none" stroke="#3a332c" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="2" fill="#e8a33d" />
      {[0, 90, 180, 270].map((deg) => (
        <line key={deg} x1="50" y1="50" x2={50 + 46 * Math.cos((deg * Math.PI) / 180)} y2={50 + 46 * Math.sin((deg * Math.PI) / 180)} stroke="#3a332c" strokeWidth="1.5" />
      ))}
      {[45, 135, 225, 315].map((deg) => (
        <line key={deg} x1="50" y1="50" x2={50 + 46 * Math.cos((deg * Math.PI) / 180)} y2={50 + 46 * Math.sin((deg * Math.PI) / 180)} stroke="#241f1a" strokeWidth="0.75" />
      ))}
    </svg>
  );
}

function PerfBorder() {
  const holes = Array.from({ length: 24 });
  return (
    <div className="perf-border">
      {holes.map((_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export default function DistantCinema() {
  const [view, setView] = useState("landing"); // landing | room
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [guestName] = useState(genGuestName());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // room state
  const [videoInput, setVideoInput] = useState("");
  const [videoId, setVideoId] = useState(null);
  const [sourceType, setSourceType] = useState("youtube"); // youtube | file
  const [fileName, setFileName] = useState("");
  const [videoObjectUrl, setVideoObjectUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [members, setMembers] = useState(1);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [filters, setFilters] = useState({ brightness: 100, saturate: 100, hue: 0, contrast: 100 });
  const [presetTint, setPresetTint] = useState("original");

  const iframeRef = useRef(null);
  const fileVideoRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);
  const lastMsgIdRef = useRef(0);
  const chatEndRef = useRef(null);

  // load Google Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Lalezar&family=Cairo:wght@400;600;700;900&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  // check URL hash for room code on load
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/room=([A-Z0-9]+)/i);
    if (match) setJoinCode(match[1].toUpperCase());
  }, []);

  const createRoom = async () => {
    const code = genRoomCode();
    setRoomId(code);
    window.location.hash = `room=${code}`;
    setError("");
    try {
      await window.storage.set(`cinema-room:${code}`, JSON.stringify({ videoId: null, playing: false, ts: Date.now(), by: guestName }), true);
    } catch (e) {}
    setView("room");
  };

  const joinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("اكتب كود الغرفة أول");
      return;
    }
    try {
      const res = await window.storage.get(`cinema-room:${code}`, true);
      if (!res) {
        setError("ما لقيت هذي الغرفة، تأكد من الكود");
        return;
      }
      const data = JSON.parse(res.value);
      setRoomId(code);
      window.location.hash = `room=${code}`;
      setSourceType(data.sourceType || "youtube");
      setVideoId(data.videoId || null);
      setFileName(data.fileName || "");
      setPlaying(!!data.playing);
      setError("");
      setView("room");
    } catch (e) {
      setError("ما لقيت هذي الغرفة، تأكد من الكود");
    }
  };

  const copyInviteLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#room=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  const postToPlayer = (cmd) => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: cmd, args: "" }), "*");
    }
  };

  const broadcastRoomState = async (patch) => {
    try {
      const res = await window.storage.get(`cinema-room:${roomId}`, true);
      const current = res ? JSON.parse(res.value) : {};
      const next = { ...current, ...patch, ts: Date.now(), by: guestName };
      await window.storage.set(`cinema-room:${roomId}`, JSON.stringify(next), true);
    } catch (e) {}
  };

  const loadVideo = async () => {
    const id = extractYouTubeId(videoInput);
    if (!id) {
      setError("ما قدرت أطلع رابط يوتيوب صحيح من هذا النص");
      return;
    }
    setError("");
    setSourceType("youtube");
    setVideoObjectUrl(null);
    setFileName("");
    setVideoId(id);
    setPlaying(true);
    await broadcastRoomState({ videoId: id, sourceType: "youtube", playing: true, fileName: null });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSourceType("file");
    setVideoId(null);
    setVideoObjectUrl(url);
    setFileName(file.name);
    setError("");
    setPlaying(false);
    // the file itself never leaves this device — only the filename/state is shared
    await broadcastRoomState({ videoId: null, sourceType: "file", playing: false, fileName: file.name });
  };

  const togglePlay = async () => {
    const next = !playing;
    setPlaying(next);
    if (sourceType === "youtube") {
      postToPlayer(next ? "playVideo" : "pauseVideo");
    } else if (sourceType === "file" && fileVideoRef.current) {
      next ? fileVideoRef.current.play() : fileVideoRef.current.pause();
    }
    await broadcastRoomState({ playing: next, sourceType });
  };

  // poll shared room state
  useEffect(() => {
    if (view !== "room" || !roomId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await window.storage.get(`cinema-room:${roomId}`, true);
        if (res) {
          const data = JSON.parse(res.value);
          if (data.by !== guestName) {
            if (data.sourceType && data.sourceType !== sourceType) setSourceType(data.sourceType);
            if (data.sourceType === "youtube" && data.videoId && data.videoId !== videoId) setVideoId(data.videoId);
            if (data.sourceType === "file" && data.fileName && data.fileName !== fileName) setFileName(data.fileName);
            if (typeof data.playing === "boolean" && data.playing !== playing) {
              setPlaying(data.playing);
              if ((data.sourceType || sourceType) === "youtube") {
                postToPlayer(data.playing ? "playVideo" : "pauseVideo");
              } else if (fileVideoRef.current) {
                data.playing ? fileVideoRef.current.play() : fileVideoRef.current.pause();
              }
            }
          }
        }
      } catch (e) {}
      try {
        const chatRes = await window.storage.get(`cinema-chat:${roomId}`, true);
        if (chatRes) {
          const list = JSON.parse(chatRes.value);
          setMessages(list);
        }
      } catch (e) {}
    }, 2500);
    return () => clearInterval(pollRef.current);
  }, [view, roomId, videoId, playing, guestName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    const newMsg = { id: Date.now() + Math.random(), from: guestName, text, ts: Date.now() };
    try {
      const res = await window.storage.get(`cinema-chat:${roomId}`, true);
      const list = res ? JSON.parse(res.value) : [];
      const updated = [...list, newMsg].slice(-100);
      await window.storage.set(`cinema-chat:${roomId}`, JSON.stringify(updated), true);
      setMessages(updated);
    } catch (e) {}
  };

  const tints = {
    original: { hue: 0, saturate: 100 },
    sepia: { hue: 30, saturate: 40 },
    noir: { hue: 0, saturate: 0 },
    dusk: { hue: 220, saturate: 70 },
  };

  const applyTint = (key) => {
    setPresetTint(key);
    setFilters((f) => ({ ...f, ...tints[key] }));
  };

  const filterStyle = {
    filter: `brightness(${filters.brightness}%) saturate(${filters.saturate}%) hue-rotate(${filters.hue}deg) contrast(${filters.contrast}%)`,
  };

  return (
    <div dir="rtl" style={styles.app}>
      <style>{css}</style>

      {view === "landing" && (
        <div style={styles.landing}>
          <div className="beam" />
          <PerfBorder />
          <div style={styles.landingInner}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <FilmLeader size={100} />
            </div>
            <h1 className="display" style={styles.title}>السينما البعيدة</h1>
            <p style={styles.subtitle}>غرفتك، شاشتك، وصديقك بعيد… لكن يجلس جنبك وقت الفيلم</p>

            <div style={styles.actionsRow}>
              <button className="btn-primary" onClick={createRoom}>
                <Film size={18} />
                افتح غرفة جديدة
              </button>
            </div>

            <div style={styles.divider}>
              <span>أو</span>
            </div>

            <div style={styles.joinRow}>
              <input
                style={styles.input}
                placeholder="كود الغرفة"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={5}
              />
              <button className="btn-outline" onClick={joinRoom}>
                <DoorOpen size={18} />
                انضم
              </button>
            </div>
            {error && <p style={styles.error}>{error}</p>}
          </div>
          <PerfBorder />
        </div>
      )}

      {view === "room" && (
        <div style={styles.room}>
          <header style={styles.header}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FilmLeader size={34} />
              <div>
                <div className="display" style={styles.headerTitle}>غرفة {roomId}</div>
                <div style={styles.headerSub}>أنت: {guestName}</div>
              </div>
            </div>
            <button className="btn-outline small" onClick={copyInviteLink}>
              {copied ? <Check size={16} /> : <Link2 size={16} />}
              {copied ? "انتسخ الرابط" : "انسخ رابط الدعوة"}
            </button>
          </header>

          <div style={styles.screenArea}>
            {sourceType === "youtube" && !videoId && (
              <div style={styles.emptyScreen}>
                <MonitorPlay size={44} color="#5c5346" />
                <p style={styles.emptyText}>الشاشة لسه فاضية — حط رابط يوتيوب أو ارفع فيديو تبدأون تشاهدون</p>
              </div>
            )}
            {sourceType === "youtube" && videoId && (
              <div style={{ ...styles.videoWrap, ...filterStyle }}>
                <iframe
                  ref={iframeRef}
                  title="cinema-player"
                  src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`}
                  style={styles.iframe}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              </div>
            )}
            {sourceType === "file" && videoObjectUrl && (
              <video
                ref={fileVideoRef}
                src={videoObjectUrl}
                controls
                style={{ ...styles.iframe, objectFit: "contain", background: "#000", ...filterStyle }}
                onPlay={() => { if (!playing) { setPlaying(true); broadcastRoomState({ playing: true, sourceType: "file" }); } }}
                onPause={() => { if (playing) { setPlaying(false); broadcastRoomState({ playing: false, sourceType: "file" }); } }}
              />
            )}
            {sourceType === "file" && !videoObjectUrl && (
              <div style={styles.emptyScreen}>
                <FolderOpen size={44} color="#5c5346" />
                <p style={styles.emptyText}>
                  {fileName ? `صاحبك رفع "${fileName}" — لازم يكون عندك نفس الملف بجهازك عشان تشوفه، ارفعه من زر "ارفع فيديو"` : "ارفع فيديو من جهازك"}
                </p>
              </div>
            )}
            <div className="screen-glow" />
          </div>

          <div className="source-tabs">
            <button className={`tab ${sourceType === "youtube" ? "active" : ""}`} onClick={() => setSourceType("youtube")}>
              <Youtube size={15} /> رابط يوتيوب
            </button>
            <button className={`tab ${sourceType === "file" ? "active" : ""}`} onClick={() => setSourceType("file")}>
              <Upload size={15} /> ارفع فيديو
            </button>
          </div>

          {sourceType === "youtube" ? (
            <div style={styles.videoBar}>
              <input
                style={styles.inputFlex}
                placeholder="الصق رابط يوتيوب هنا…"
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadVideo()}
              />
              <button className="btn-primary small" onClick={loadVideo}>شغّل</button>
              {videoId && (
                <button className="btn-outline small" onClick={togglePlay}>
                  {playing ? "إيقاف للجميع" : "تشغيل للجميع"}
                </button>
              )}
            </div>
          ) : (
            <div style={styles.videoBar}>
              <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={handleFileUpload} />
              <button className="btn-primary small" onClick={() => fileInputRef.current?.click()}>
                <Upload size={15} /> اختر ملف فيديو
              </button>
              {fileName && <span style={styles.fileNameTag}>{fileName}</span>}
            </div>
          )}
          {sourceType === "file" && (
            <p style={styles.hint}>* الملف ما يترفع لأي سيرفر — يبقى بجهازك فقط. عشان تشاهدون سوا، لازم أنت وصاحبك ترفعون نفس ملف الفيديو كل واحد من جهازه، وبعدين زر "تشغيل/إيقاف" بالمشغّل يزامن الحالة بينكم.</p>
          )}
          {error && <p style={styles.error}>{error}</p>}

          <div style={styles.controlPanel}>
            <div style={styles.panelLabel}>
              <Sparkles size={15} /> لوحة الإضاءة والألوان
            </div>
            <div style={styles.tintRow}>
              {Object.keys(tints).map((k) => (
                <button
                  key={k}
                  className={`tint-chip ${presetTint === k ? "active" : ""}`}
                  onClick={() => applyTint(k)}
                >
                  {{ original: "أصلي", sepia: "سيبيا", noir: "أبيض وأسود", dusk: "شفق" }[k]}
                </button>
              ))}
            </div>
            <div style={styles.slidersGrid}>
              <label style={styles.sliderLabel}>
                السطوع
                <input type="range" min="40" max="160" value={filters.brightness} onChange={(e) => setFilters((f) => ({ ...f, brightness: +e.target.value }))} />
              </label>
              <label style={styles.sliderLabel}>
                التشبع
                <input type="range" min="0" max="200" value={filters.saturate} onChange={(e) => setFilters((f) => ({ ...f, saturate: +e.target.value }))} />
              </label>
              <label style={styles.sliderLabel}>
                التباين
                <input type="range" min="50" max="160" value={filters.contrast} onChange={(e) => setFilters((f) => ({ ...f, contrast: +e.target.value }))} />
              </label>
              <label style={styles.sliderLabel}>
                درجة اللون
                <input type="range" min="0" max="360" value={filters.hue} onChange={(e) => setFilters((f) => ({ ...f, hue: +e.target.value }))} />
              </label>
            </div>
            <p style={styles.hint}>* الجودة (الدقة) يتحكم فيها كل شخص من إعدادات يوتيوب (الترس ⚙) بمشغّله، ما تقدر تُفرض من الغرفة.</p>
          </div>

          <div style={styles.chatPanel}>
            <div style={styles.panelLabel}>
              <Users size={15} /> الدردشة
            </div>
            <div style={styles.chatMessages}>
              {messages.length === 0 && <p style={styles.chatEmpty}>لسه ما فيه أحد سولف… ابدأ أنت</p>}
              {messages.map((m) => (
                <div key={m.id} className={`chat-bubble ${m.from === guestName ? "mine" : ""}`}>
                  <div className="chat-from">{m.from}</div>
                  <div>{m.text}</div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={styles.chatInputRow}>
              <input
                style={styles.inputFlex}
                placeholder="اكتب تعليقك…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
              <button className="btn-primary small" onClick={sendMessage}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "#14110F",
    color: "#F2EBE1",
    fontFamily: "'Cairo', sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  landing: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    padding: "24px 16px",
  },
  landingInner: {
    position: "relative",
    zIndex: 2,
    textAlign: "center",
    maxWidth: 420,
    width: "100%",
  },
  title: { fontSize: 44, margin: "6px 0 4px", color: "#F2EBE1", letterSpacing: 1 },
  subtitle: { color: "#A89A87", fontSize: 15, marginBottom: 28, lineHeight: 1.8 },
  actionsRow: { display: "flex", justifyContent: "center", marginBottom: 18 },
  divider: { color: "#5c5346", fontSize: 13, margin: "6px 0 16px", position: "relative" },
  joinRow: { display: "flex", gap: 8, justifyContent: "center" },
  input: {
    background: "#1F1B17",
    border: "1px solid #3a332c",
    borderRadius: 8,
    padding: "11px 14px",
    color: "#F2EBE1",
    fontFamily: "'Cairo', sans-serif",
    fontSize: 15,
    width: 130,
    textAlign: "center",
    letterSpacing: 2,
  },
  inputFlex: {
    flex: 1,
    background: "#1F1B17",
    border: "1px solid #3a332c",
    borderRadius: 8,
    padding: "11px 14px",
    color: "#F2EBE1",
    fontFamily: "'Cairo', sans-serif",
    fontSize: 14,
  },
  error: { color: "#e07a5f", fontSize: 13, marginTop: 14 },
  room: { flex: 1, maxWidth: 760, margin: "0 auto", width: "100%", padding: "18px 16px 40px", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 22, color: "#F2EBE1" },
  headerSub: { fontSize: 12, color: "#A89A87" },
  screenArea: { position: "relative", background: "#000", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9", border: "1px solid #2a251f" },
  emptyScreen: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { color: "#5c5346", fontSize: 13, maxWidth: 240, textAlign: "center" },
  videoWrap: { position: "absolute", inset: 0 },
  iframe: { width: "100%", height: "100%", border: "none" },
  videoBar: { display: "flex", gap: 8 },
  controlPanel: { background: "#1a1611", border: "1px solid #2a251f", borderRadius: 12, padding: 16 },
  panelLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#E8A33D", marginBottom: 12, fontWeight: 700 },
  tintRow: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  slidersGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" },
  sliderLabel: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#A89A87" },
  hint: { fontSize: 11, color: "#5c5346", marginTop: 12, lineHeight: 1.7 },
  chatPanel: { background: "#1a1611", border: "1px solid #2a251f", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", height: 280 },
  chatMessages: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, paddingRight: 4 },
  chatEmpty: { color: "#5c5346", fontSize: 13, textAlign: "center", marginTop: 30 },
  chatInputRow: { display: "flex", gap: 8 },
  fileNameTag: { fontSize: 12, color: "#A89A87", background: "#14110F", border: "1px solid #2a251f", borderRadius: 8, padding: "9px 12px" },
};

const css = `
  * { box-sizing: border-box; }
  .display { font-family: 'Lalezar', 'Cairo', sans-serif; font-weight: 400; }
  .leader-spin { animation: spin 3s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .beam {
    position: absolute; top: -20%; left: 50%; transform: translateX(-50%);
    width: 140%; height: 140%;
    background: radial-gradient(ellipse at top, rgba(232,163,61,0.10) 0%, rgba(232,163,61,0.02) 40%, transparent 70%);
    pointer-events: none; z-index: 1;
  }
  .perf-border { display: flex; justify-content: space-between; padding: 0 6px; position: relative; z-index: 2; }
  .perf-border span { width: 8px; height: 8px; border-radius: 2px; background: #241f1a; margin: 4px 0; }
  .btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    background: linear-gradient(180deg, #f0b355, #d98f2b);
    color: #1a1210; border: none; border-radius: 9px;
    padding: 13px 26px; font-family: 'Cairo', sans-serif; font-weight: 700; font-size: 15px;
    cursor: pointer; transition: transform 0.15s ease, filter 0.15s ease;
  }
  .btn-primary:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .btn-primary.small { padding: 10px 16px; font-size: 13px; }
  .btn-outline {
    display: inline-flex; align-items: center; gap: 8px;
    background: transparent; color: #F2EBE1; border: 1px solid #4a4136; border-radius: 9px;
    padding: 12px 20px; font-family: 'Cairo', sans-serif; font-weight: 600; font-size: 14px;
    cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease;
  }
  .btn-outline:hover { border-color: #E8A33D; background: rgba(232,163,61,0.06); }
  .btn-outline.small { padding: 9px 14px; font-size: 12.5px; white-space: nowrap; }
  input:focus { outline: 2px solid #E8A33D; outline-offset: 1px; }
  input[type=range] { accent-color: #E8A33D; width: 100%; }
  .tint-chip {
    background: #14110F; border: 1px solid #3a332c; color: #A89A87; border-radius: 20px;
    padding: 6px 14px; font-family: 'Cairo', sans-serif; font-size: 12px; cursor: pointer;
  }
  .tint-chip.active { border-color: #E8A33D; color: #E8A33D; background: rgba(232,163,61,0.08); }
  .source-tabs { display: flex; gap: 8px; }
  .tab {
    display: inline-flex; align-items: center; gap: 6px;
    background: transparent; border: 1px solid #2a251f; color: #A89A87; border-radius: 8px;
    padding: 8px 14px; font-family: 'Cairo', sans-serif; font-size: 12.5px; cursor: pointer;
  }
  .tab.active { border-color: #E8A33D; color: #E8A33D; background: rgba(232,163,61,0.06); }
  .chat-bubble { background: #14110F; border: 1px solid #2a251f; border-radius: 10px; padding: 8px 12px; font-size: 13px; max-width: 85%; align-self: flex-start; }
  .chat-bubble.mine { align-self: flex-end; border-color: #4a3a20; background: rgba(232,163,61,0.06); }
  .chat-from { font-size: 10px; color: #E8A33D; margin-bottom: 2px; font-weight: 700; }
  .screen-glow { position: absolute; inset: -1px; box-shadow: inset 0 0 40px rgba(0,0,0,0.5); pointer-events: none; border-radius: 12px; }
  @media (prefers-reduced-motion: reduce) { .leader-spin { animation: none; } }
`;
