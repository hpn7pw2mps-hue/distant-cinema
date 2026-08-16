import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// -----------------------------------------------------------------
// هذا بديل مؤقت لـ window.storage (اللي كانت متوفرة جوا بيئة Claude فقط).
// يخزن البيانات محليًا بالمتصفح (localStorage) — يعني يشتغل التطبيق
// بدون كراش، لكن غرفة تسويها بجوالك ما تظهر لصاحبك بجواله، لأن كل
// جهاز يخزن نسخته الخاصة فقط. عشان تفعّل مزامنة حقيقية بين جهازين،
// لازم تربط هذا بقاعدة بيانات حقيقية زي Firebase Realtime Database
// أو Supabase — قول لي إذا تبي أضيفها بعدين.
// -----------------------------------------------------------------
window.storage = {
  async get(key, shared) {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return { key, value: raw, shared: !!shared };
  },
  async set(key, value, shared) {
    localStorage.setItem(key, value);
    return { key, value, shared: !!shared };
  },
  async delete(key, shared) {
    localStorage.removeItem(key);
    return { key, deleted: true, shared: !!shared };
  },
  async list(prefix, shared) {
    const keys = Object.keys(localStorage).filter((k) => !prefix || k.startsWith(prefix));
    return { keys, prefix, shared: !!shared };
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
