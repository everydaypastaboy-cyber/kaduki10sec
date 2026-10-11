// ===== 共通処理：記録の保存先（Firebase / デモ）と表示用の関数 =====
(function () {
  // config.js に無い項目は既定値で補う（古い config.js のままでも動くように）
  const C = Object.assign({
    anonName: "ひみつさん",   // 名前を公開しない人の表示名
    rotateSec: 0              // ランキングの自動切り替え（秒）。0 で切り替えない
  }, window.APP_CONFIG);
  window.APP_CONFIG = C;
  const FB_VER = "10.12.2";
  const TARGET = Math.round(C.target * 1000);        // 目標（ミリ秒）
  const UNIT = C.digits === 2 ? 10 : 1;              // 2桁なら10ミリ秒単位に丸める
  const useFirebase = !!(C.firebase && C.firebase.apiKey && C.firebase.databaseURL);

  // ---------- 数字まわり ----------
  const quantize = ms => Math.round(ms / UNIT) * UNIT;
  const diffOf = ms => Math.abs(ms - TARGET);
  const fmt = ms => (ms / 1000).toFixed(C.digits);
  const fmtDiff = d => (d === 0 ? "ピッタリ" : "±" + (d / 1000).toFixed(C.digits));

  // タイム表示用の要素（3桁のときは最後の1桁を小さく表示）
  function timeEl(ms, cls) {
    const s = fmt(ms);
    const el = document.createElement("span");
    if (cls) el.className = cls;
    if (C.digits === 3) {
      el.append(s.slice(0, -1));
      const sm = document.createElement("small");
      sm.textContent = s.slice(-1);
      el.append(sm);
    } else {
      el.textContent = s;
    }
    return el;
  }

  // 手入力の秒数をミリ秒に変換（全角数字もOK）。不正なら null
  function parseTime(input) {
    const s = String(input).trim()
      .replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace("。", ".");
    const re = new RegExp("^\\d{1,2}(\\.\\d{1," + C.digits + "})?$");
    if (!re.test(s)) return null;
    const ms = quantize(Math.round(parseFloat(s) * 1000));
    return ms > 0 && ms < 100000 ? ms : null;
  }

  // 順位付け：差が小さい順 → 同じ差なら先に登録した順。差が同じ人は同順位
  function rank(records) {
    const r = records.map(x => ({ ...x })).sort((a, b) => a.d - b.d || a.at - b.at);
    r.forEach((x, i) => { x.rank = i > 0 && r[i - 1].d === x.d ? r[i - 1].rank : i + 1; });
    return r;
  }

  // 匿名の人をランキングに出すときの表示名
  const ANON_NAME = C.anonName || "匿名さん";

  // 保存データを表示用の形に整える（ここで差を計算し直すので改ざんされても順位は正しい）
  function clean(id, v) {
    v = v || {};
    const ms = Math.round(Number(v.ms)) || 0;
    const anon = v.anon === true;
    const at = Number(v.at) || 0;
    return {
      id,
      anon,
      name: anon ? ANON_NAME : String(v.name || "名無し").slice(0, 16),
      ms,
      d: diffOf(ms),
      at,
      day: dayKey(at)
    };
  }

  // ---------- 日付まわり（会場の日本時間で区切る） ----------
  const JST_DATE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const JST_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false });
  const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
  // 時刻 → "2026-11-14" のような日付キー
  function dayKey(at) { return at ? JST_DATE.format(new Date(at)) : ""; }
  // 時刻 → 0〜23 の「時」
  function hourOf(at) { return Number(JST_HOUR.format(new Date(at))) % 24; }
  // 日付キー → "11/14(土)"
  function dayLabel(key) {
    const [y, m, d] = key.split("-").map(Number);
    const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${m}/${d}(${WEEK[w]})`;
  }
  // 記録に含まれる日付を古い順に並べる
  function daysOf(records) {
    return [...new Set(records.map(x => x.day).filter(Boolean))].sort();
  }

  // ---------- デモモード（Firebase未設定時。同じブラウザのタブ間で同期） ----------
  const DEMO_KEY = "tsc-demo-records";
  const DEMO_PRIV_KEY = "tsc-demo-private";
  const demoListeners = [];
  const demoPrivListeners = [];
  function demoLoad(key = DEMO_KEY) {
    try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { return {}; }
  }
  function demoEmit() {
    const arr = Object.entries(demoLoad()).map(([k, v]) => clean(k, v));
    demoListeners.forEach(f => f(arr));
    const priv = demoLoad(DEMO_PRIV_KEY);
    demoPrivListeners.forEach(f => f(priv));
  }
  function demoSave(obj, priv) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(obj));
      if (priv) localStorage.setItem(DEMO_PRIV_KEY, JSON.stringify(priv));
    } catch (e) {}
    demoEmit();
  }
  window.addEventListener("storage", e => { if (e.key === DEMO_KEY || e.key === DEMO_PRIV_KEY) demoEmit(); });

  // ---------- 保存先 ----------
  const Store = {
    mode: useFirebase ? "firebase" : "demo",

    async init({ auth = false } = {}) {
      if (!useFirebase) return;
      const base = "https://www.gstatic.com/firebasejs/" + FB_VER + "/";
      const appMod = await import(base + "firebase-app.js");
      this.fb = await import(base + "firebase-database.js");
      this.app = appMod.initializeApp(C.firebase);
      this.db = this.fb.getDatabase(this.app);
      if (auth) {
        this.fa = await import(base + "firebase-auth.js");
        this.auth = this.fa.getAuth(this.app);
      }
    },

    // 記録をリアルタイムで受け取る。onStatus(つながっているか)
    subscribe(onData, onStatus) {
      if (!useFirebase) {
        demoListeners.push(onData);
        onStatus(true);
        demoEmit();
        return;
      }
      const { ref, onValue } = this.fb;
      onValue(ref(this.db, ".info/connected"), s => onStatus(s.val() === true));
      onValue(ref(this.db, "records"), snap => {
        const out = [];
        snap.forEach(ch => { out.push(clean(ch.key, ch.val())); });
        onData(out);
      }, () => onStatus(false));
    },

    // 記録を追加。anon = true のときは公開データに名前を入れず、
    // 本名（入力があれば）は受付だけが読める private に分けて保存する
    async add(name, ms, anon = false) {
      const rec = { name: anon ? "" : name, ms, d: diffOf(ms) };
      if (anon) rec.anon = true;
      if (!useFirebase) {
        const o = demoLoad(), p = demoLoad(DEMO_PRIV_KEY);
        const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        o[id] = { ...rec, at: Date.now() };
        if (anon && name) p[id] = { name };
        demoSave(o, p);
        return;
      }
      const { ref, push, update, serverTimestamp } = this.fb;
      const key = push(ref(this.db, "records")).key;   // 先にIDだけ発行
      const changes = { ["records/" + key]: { ...rec, at: serverTimestamp() } };
      if (anon && name) changes["private/" + key] = { name };
      await update(ref(this.db), changes);             // 2か所まとめて書き込む
    },

    async remove(id) {
      if (!useFirebase) {
        const o = demoLoad(), p = demoLoad(DEMO_PRIV_KEY);
        delete o[id]; delete p[id];
        demoSave(o, p);
        return;
      }
      const { ref, update } = this.fb;
      await update(ref(this.db), { ["records/" + id]: null, ["private/" + id]: null });
    },

    // 匿名の人の本名（受付用）。{ 記録ID: { name } } の形で届く
    subscribePrivate(onData) {
      if (!useFirebase) { demoPrivListeners.push(onData); demoEmit(); return; }
      const { ref, onValue } = this.fb;
      onValue(ref(this.db, "private"), snap => onData(snap.val() || {}), () => onData({}));
    },

    // 画面が裏に回ったら接続を切る（無料枠の同時接続数100を節約）
    pause() { if (useFirebase && this.db) this.fb.goOffline(this.db); },
    resume() { if (useFirebase && this.db) this.fb.goOnline(this.db); },

    // ---------- 受付用ログイン ----------
    onAuth(cb) {
      if (!useFirebase) { cb({ uid: "demo", email: "デモモード" }); return; }
      this.fa.onAuthStateChanged(this.auth, cb);
    },
    signIn(email, pw) { return this.fa.signInWithEmailAndPassword(this.auth, email, pw); },
    signOut() { return useFirebase ? this.fa.signOut(this.auth) : Promise.resolve(); }
  };

  window.TSC = { C, TARGET, ANON_NAME, quantize, diffOf, fmt, fmtDiff, timeEl, parseTime, rank, clean, dayKey, hourOf, dayLabel, daysOf, Store };
})();
