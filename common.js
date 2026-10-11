// ===== 共通処理：記録の保存先（Firebase / デモ）と表示用の関数 =====
(function () {
  const C = window.APP_CONFIG;
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

  // 保存データを表示用の形に整える（ここで差を計算し直すので改ざんされても順位は正しい）
  function clean(id, v) {
    v = v || {};
    const ms = Math.round(Number(v.ms)) || 0;
    return {
      id,
      name: String(v.name || "名無し").slice(0, 16),
      ms,
      d: diffOf(ms),
      at: Number(v.at) || 0
    };
  }

  // ---------- デモモード（Firebase未設定時。同じブラウザのタブ間で同期） ----------
  const DEMO_KEY = "tsc-demo-records";
  const demoListeners = [];
  function demoLoad() {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "{}"); } catch (e) { return {}; }
  }
  function demoEmit() {
    const arr = Object.entries(demoLoad()).map(([k, v]) => clean(k, v));
    demoListeners.forEach(f => f(arr));
  }
  function demoSave(obj) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(obj)); } catch (e) {}
    demoEmit();
  }
  window.addEventListener("storage", e => { if (e.key === DEMO_KEY) demoEmit(); });

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

    async add(name, ms) {
      const rec = { name, ms, d: diffOf(ms) };
      if (!useFirebase) {
        const o = demoLoad();
        o["d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)] = { ...rec, at: Date.now() };
        demoSave(o);
        return;
      }
      const { ref, push, serverTimestamp } = this.fb;
      await push(ref(this.db, "records"), { ...rec, at: serverTimestamp() });
    },

    async remove(id) {
      if (!useFirebase) {
        const o = demoLoad(); delete o[id]; demoSave(o);
        return;
      }
      const { ref, remove } = this.fb;
      await remove(ref(this.db, "records/" + id));
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

  window.TSC = { C, TARGET, quantize, diffOf, fmt, fmtDiff, timeEl, parseTime, rank, clean, Store };
})();
