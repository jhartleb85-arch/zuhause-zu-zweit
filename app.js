/* Zuhause zu zweit – Oberfläche */
(function () {
  "use strict";
  const L = window.L, CFG = window.CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = n => (+n || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const NAMES = { J: "Jessica", E: "Eric", B: "Wir beide", O: "Noch offen", F: "Frida", A: "Alle drei", K: "Haushaltskonto", M: "Mietkonto", T: "Tagesgeld" };
  const TONNEN = { bio: "Biotonne", gelb: "Gelbe Tonne", papier: "Papiertonne", rest: "Restmüll" };
  const RAEUME = ["Wohnzimmer", "Küche", "Bad", "Gäste-WC", "Schlafzimmer", "Flur", "Eingangsbereich", "Haushaltsraum", "Dachboden", "Schuppen", "Garten & Außen", "Ganzes Haus"];
  const VRKAT = ["Küche & Vorrat", "Gewürze", "Bad & Drogerie", "Putzen & Wäsche", "Sonstiges"];
  const VR2EK = { "Küche & Vorrat": "Vorrat", "Gewürze": "Vorrat", "Bad & Drogerie": "Drogerie", "Putzen & Wäsche": "Drogerie", "Sonstiges": "Sonstiges" };
  const QUICK = [["Milch", "Kühlregal"], ["Brot", "Vorrat"], ["Eier", "Kühlregal"], ["Bananen", "Obst & Gemüse"], ["Butter", "Kühlregal"], ["Katzenfutter", "Haustier"]];
  const KATFARBE = { haushalt: "var(--k-haushalt)", fix: "var(--k-fix)", haus: "var(--k-haus)", auslage: "var(--k-auslage)", zahlung: "var(--k-zahlung)", umbuchung: "var(--k-zahlung)" };
  const COLS = ["termine", "aufgaben", "einkauf", "vorrat", "buchungen", "vertraege", "abfuhr", "abschluesse", "einstellungen"];
  const S = {}; COLS.forEach(c => S[c] = []);
  let today = L.today(), me = "J";
  try { me = localStorage.getItem("zz-ich") || "J"; } catch (e) {}
  const ui = { grp: {}, openG: null, tab: "heute", seg: { haus: "jetzt", geld: "haushalt" }, kMonat: today.slice(0, 7), kSel: null, editG: null, editV: null, preisV: null,
    bFilter: "alle", bForm: { von: me, fuer: "B", kat: "haushalt" }, editB: null, budgetM: today.slice(0, 7), sammeln: false, sure: {} };

  /* ================= Speicher ================= */
  const uid = c => c.slice(0, 2) + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const LocalStore = {
    key: "zuhause-zu-zweit-v6", demo: true,
    init() {
      let raw = null; try { raw = localStorage.getItem(this.key); } catch (e) {}
      this.db = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(window.SEED || {}));
      this.emit(); banner("Vorschau mit euren Daten: Änderungen bleiben nur auf diesem Gerät. Nach der Einrichtung teilt ihr alles live.", "info");
    },
    save() { try { localStorage.setItem(this.key, JSON.stringify(this.db)); } catch (e) {} },
    emit() { COLS.forEach(c => { S[c] = Object.entries(this.db[c] || {}).map(([id, d]) => Object.assign({ id }, d)); }); schedule(); },
    add(c, o) { const id = uid(c); (this.db[c] = this.db[c] || {})[id] = o; this.save(); this.emit(); return id; },
    set(c, id, o) { (this.db[c] = this.db[c] || {})[id] = o; this.save(); this.emit(); },
    update(c, id, p) { const d = (this.db[c] || {})[id]; if (!d) return; Object.keys(p).forEach(k => { if (p[k] === null) delete d[k]; else d[k] = p[k]; }); this.save(); this.emit(); },
    del(c, id) { if (this.db[c]) delete this.db[c][id]; this.save(); this.emit(); }
  };
  const FireStore = {
    demo: false,
    async init() {
      const base = "https://www.gstatic.com/firebasejs/10.12.2/";
      const [appM, authM, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
      const app = appM.initializeApp(CFG.firebase);
      this.fs = fs; this.root = ["haushalte", CFG.haushalt || "zuhause"];
      this.db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
      const auth = authM.getAuth(app);
      this.login = () => authM.signInWithPopup(auth, new authM.GoogleAuthProvider()).catch(() => authM.signInWithRedirect(auth, new authM.GoogleAuthProvider()));
      this.logout = () => authM.signOut(auth);
      const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, "0")).join("");
      authM.onAuthStateChanged(auth, async u => {
        if (!u) { zeigeLogin(""); return; }
        const p = (CFG.personen || {})[await sha((u.email || "").toLowerCase())];
        if (!p) { zeigeLogin("Das Google-Konto " + u.email + " ist für diese App nicht freigeschaltet."); authM.signOut(auth); return; }
        me = p; $("login").hidden = true; $("app").hidden = false; document.querySelector("nav.tabs").hidden = false;
        $("whoSeg").hidden = true; $("whoName").hidden = false; $("whoName").textContent = NAMES[me];
        this.sub();
      });
    },
    ref(c, id) { return id ? this.fs.doc(this.db, ...this.root, c, id) : this.fs.collection(this.db, ...this.root, c); },
    sub() {
      if (this.subbed) return; this.subbed = true;
      COLS.forEach(c => this.fs.onSnapshot(this.ref(c), snap => {
        S[c] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
        if (c === "einstellungen" && !snap.metadata.fromCache) pruefeStartdaten();
        schedule();
      }, err => banner("Verbindung unterbrochen (" + err.code + "). Bitte die App neu öffnen.", "warn")));
    },
    fail(e) { banner("Speichern hat nicht geklappt (" + (e && e.code || "Fehler") + ").", "warn"); },
    add(c, o) { const r = this.fs.doc(this.ref(c)); this.fs.setDoc(r, o).catch(e => this.fail(e)); return r.id; },
    set(c, id, o) { this.fs.setDoc(this.ref(c, id), o).catch(e => this.fail(e)); },
    update(c, id, p) { const q = {}; Object.keys(p).forEach(k => q[k] = p[k] === null ? this.fs.deleteField() : p[k]); this.fs.updateDoc(this.ref(c, id), q).catch(e => this.fail(e)); },
    del(c, id) { this.fs.deleteDoc(this.ref(c, id)).catch(e => this.fail(e)); },
    async importiere(seed) {
      const fs = this.fs; let batch = fs.writeBatch(this.db), n = 0;
      for (const c of Object.keys(seed)) for (const [id, d] of Object.entries(seed[c])) {
        batch.set(this.ref(c, id), d); n++;
        if (n % 400 === 0) { await batch.commit(); batch = fs.writeBatch(this.db); }
      }
      await batch.commit();
    }
  };
  const store = CFG.firebase && CFG.firebase.apiKey ? FireStore : LocalStore;
  const add = (c, o) => store.add(c, o), upd = (c, id, p) => store.update(c, id, p), del = (c, id) => store.del(c, id);
  const einst = () => S.einstellungen.find(x => x.id === "haushalt") || { grund: 400 };
  const setEinst = p => { if (S.einstellungen.find(x => x.id === "haushalt")) upd("einstellungen", "haushalt", p); else store.set("einstellungen", "haushalt", Object.assign({ grund: 400 }, p)); };
  // Erster Start: bisherige Daten aus der Datei „startdaten.json“ übernehmen (liegt nicht auf dem Server)
  function pruefeStartdaten() {
    if (S.einstellungen.length || store.demo) return;
    banner('Die App ist noch leer. Eure bisherigen Daten übernehmen: <label class="btn small" style="cursor:pointer">Datei „startdaten.json“ wählen<input type="file" id="importFile" accept=".json,application/json" hidden></label>', "info");
  }
  function zeigeLogin(msg) { $("app").hidden = true; document.querySelector("nav.tabs").hidden = true; $("login").hidden = false; $("loginMsg").textContent = msg || ""; }
  function banner(html, art) { const b = $("banner"); if (!html) { b.hidden = true; return; } b.hidden = false; b.innerHTML = html; b.style.color = art === "info" ? "var(--accent-ink)" : ""; b.style.background = art === "info" ? "var(--accent-soft)" : ""; }

  /* ================= Helfer ================= */
  let pending = false;
  function schedule() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); }
  const chip = (p, txt) => '<span class="chip c-' + p + '">' + esc(txt || NAMES[p] || p) + "</span>";
  const fmtK = d => L.dt(d).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  const fmtDay = d => L.dt(d).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  const fmtM = m => new Date(m + "-01T12:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const spanTxt = t => fmtK(t.datum) + (t.bis && t.bis !== t.datum ? " – " + L.dt(t.bis).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" }) : "");
  const nz = x => { if (!x.notiz) return ""; if (x.notiz.includes(" · ")) { const p = x.notiz.split(" · "); return '<details class="n"><summary>Checkliste (' + p.length + ")</summary>• " + p.map(esc).join("<br>• ") + "</details>"; } return '<div class="n">' + esc(x.notiz) + "</div>"; };
  const sure = (key, btn, txt) => { if (ui.sure[key]) { delete ui.sure[key]; return true; } ui.sure[key] = 1; const o = btn.textContent; btn.textContent = txt || "Sicher?"; btn.style.color = "var(--warn)"; setTimeout(() => { delete ui.sure[key]; btn.textContent = o; btn.style.color = ""; }, 3500); return false; };
  const ICON = {
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>', bin: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>', cart: '<svg viewBox="0 0 24 24"><path d="M4 5h2l2 10h10l2-7H7"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/></svg>',
    coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2A3 3 0 0 0 9.5 10c0 3 5 1.5 5 4.4a3 3 0 0 1-5 .9M12 6.5v11"/></svg>', heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    shirt: '<svg viewBox="0 0 24 24"><path d="M8 4 4 7l2 4 2-1v10h8V10l2 1 2-4-4-3a4 4 0 0 1-8 0z"/></svg>', doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/></svg>'
  };
  const gcal = t => {
    const c = s => s.replace(/-/g, ""); let dates;
    if (t.zeit && t.art !== "urlaub" && t.art !== "schulferien") { const e = new Date(t.datum + "T" + t.zeit); e.setHours(e.getHours() + 1); dates = c(t.datum) + "T" + t.zeit.replace(":", "") + "00/" + c(L.iso(e)) + "T" + L.pad(e.getHours()) + L.pad(e.getMinutes()) + "00"; }
    else dates = c(t.datum) + "/" + c(L.addDays(t.bis || t.datum, 1));
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(t.titel) + "&dates=" + dates + "&ctz=Europe/Berlin&details=" + encodeURIComponent((t.notiz ? t.notiz + "\n" : "") + "Für: " + NAMES[t.fuer]);
  };
  const offeneAufgaben = () => S.aufgaben.filter(g => g.frist !== "lang" && !g.done && g.datum);
  const letzterAbschluss = () => S.abschluesse.slice().sort((a, b) => (a.bis || "").localeCompare(b.bis || ""))[S.abschluesse.length - 1];

  /* ================= Heute ================= */
  function hinweise() {
    const hw = [], morgen = L.addDays(today, 1);
    const meine = offeneAufgaben().filter(g => g.datum <= today && (L.wer(g) === me || g.wer === "B" || g.wer === "O"));
    if (meine.length) { const ueber = meine.some(g => g.datum < today); hw.push({ ic: "check", warn: ueber, t: meine.length + (meine.length === 1 ? " Aufgabe" : " Aufgaben") + " heute für dich" + (ueber ? ", davon überfällige" : ""), s: meine.slice(0, 3).map(g => g.titel).join(", ") + (meine.length > 3 ? " …" : ""), go: "haushalt" }); }
    S.abfuhr.filter(a => a.datum === morgen && !a.raus).forEach(a => hw.push({ ic: "bin", warn: true, t: "Heute Abend: " + TONNEN[a.tonne] + " rausstellen", s: "Abfuhr morgen früh", btn: '<button class="done-btn" data-act="raus" data-id="' + a.id + '">✓ Raus</button>' }));
    S.abfuhr.filter(a => a.datum === today).forEach(a => hw.push({ ic: "bin", warn: !a.raus, t: "Heute Abfuhr: " + TONNEN[a.tonne], s: a.raus ? "Rausgestellt von " + NAMES[a.raus.p] : "Noch nicht als rausgestellt markiert", btn: a.raus ? "" : '<button class="done-btn" data-act="raus" data-id="' + a.id + '">✓ Raus</button>' }));
    if (L.dt(today).getDay() === 5 && einst()["waesche" + me] !== today) hw.push({ ic: "shirt", t: "Wäsche-Erinnerung", s: "Eigene Wäsche bis heute Abend erledigt? Am Wochenende kommt Frida mit Schmutzwäsche.", btn: '<button class="done-btn" data-act="waesche">✓ Erledigt</button>' });
    const anfr = S.termine.filter(t => t.art === "anfrage" && t.von !== me && (t.bis || t.datum) >= today);
    if (anfr.length) hw.push({ ic: "cal", warn: true, t: anfr.length + (anfr.length === 1 ? " Terminanfrage wartet" : " Terminanfragen warten") + " auf dich", s: anfr.map(t => t.titel).join(", "), go: "kalender" });
    S.termine.filter(t => t.von === me && t.antwort && !t.antwortGesehen && (t.bis || t.datum) >= L.addDays(today, -7)).forEach(t => {
      const a = t.antwort;
      hw.push({ ic: "cal", warn: !a.ok, t: NAMES[a.p] + (a.ok ? " hat zugesagt: " : " hat abgesagt: ") + t.titel, s: fmtDay(t.datum) + (t.zeit ? ", " + t.zeit + " Uhr" : "") + (a.text ? " · „" + a.text + "“" : ""), btn: '<button class="done-btn" data-act="gesehen" data-id="' + t.id + '">OK</button>' });
    });
    S.termine.filter(t => t.art === "anfrage" && t.von === me && t.datum >= today && t.datum <= L.addDays(today, 2)).forEach(t => hw.push({ ic: "cal", warn: true, t: "Noch keine Antwort von " + NAMES[L.other(me)], s: t.titel + " · " + fmtDay(t.datum), go: "kalender" }));
    const knapp = S.vorrat.filter(v => v.status && v.status !== "ok");
    if (knapp.length) hw.push({ ic: "cart", t: knapp.length + " Vorratsartikel knapp oder leer", s: knapp.map(v => v.name).join(", "), go: "einkauf" });
    const vm = L.monatPlus(today.slice(0, 7), -1), e = einst(), la = letzterAbschluss();
    const k = L.konto(S.buchungen, S.vertraege, e, today);
    if (k.saldo !== 0 && vm >= (e.fixAb || vm) && !(la && la.bis >= vm + "-28")) hw.push({ ic: "coin", t: fmtM(vm).split(" ")[0] + " abschließen", s: "Offen: " + L.richtung(k.saldo) + " " + eur(Math.abs(k.saldo)), go: "geld:abschluss" });
    const zz = L.zuZweit(S.termine).find(z => z.bis >= today && z.datum <= L.addDays(today, 14));
    if (zz) { const n = Math.round((L.dt(zz.datum) - L.dt(today)) / 864e5); hw.push({ ic: "heart", zwei: true, t: n <= 0 ? "Gerade ist Zeit nur für euch zwei" : "In " + n + (n === 1 ? " Tag" : " Tagen") + ": Zeit zu zweit", s: spanTxt(zz), go: "kalender" }); }
    S.vertraege.forEach(v => { if (v.ende && v.ende >= today && v.ende <= L.addDays(today, 60)) hw.push({ ic: "doc", warn: true, t: v.name + " bald kündbar", s: "Zum " + fmtK(v.ende) + (v.frist ? ", Frist " + v.frist : ""), go: "geld:vertraege" }); });
    const nm = L.monatPlus(today.slice(0, 7), 1);
    S.vertraege.forEach(v => { const a = (v.aenderungen || []).find(x => x.ab === nm); if (a) hw.push({ ic: "doc", t: v.name + " ab " + fmtM(nm).split(" ")[0] + ": " + eur(a.betrag), s: "Neuer Beitrag, Budget und Ausgleich passen sich an", go: "geld:vertraege" }); });
    if (S.abfuhr.filter(a => a.datum >= today).length < 4) hw.push({ ic: "bin", t: "Abfuhrtermine gehen zur Neige", s: "Neue Termine unter Haushalt › Müll eintragen", go: "haushalt:muell" });
    const prio = { cal: 0, bin: 1, check: 2, shirt: 3, coin: 4, heart: 5, cart: 6, doc: 7 };
    return hw.sort((x, y) => (prio[x.ic] ?? 9) - (prio[y.ic] ?? 9));
  }
  function renderHeute() {
    const h = new Date().getHours();
    $("hGruss").textContent = (h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend") + ", " + NAMES[me];
    $("hDatum").textContent = fmtDay(today);
    const hw = hinweise();
    $("hinweise").innerHTML = hw.length ? hw.map(x => '<div class="hw' + (x.warn ? " warn" : "") + (x.zwei ? " zwei" : "") + '"' + (x.go ? ' role="button" tabindex="0" data-go="' + x.go + '" style="cursor:pointer"' : "") + '><span class="ic">' + ICON[x.ic] + '</span><div class="main"><div style="font-weight:600">' + esc(x.t) + '</div>' + (x.s ? '<div class="small muted">' + esc(x.s) + "</div>" : "") + "</div>" + (x.btn || (x.go ? '<span class="muted">›</span>' : "")) + "</div>").join("") : '<div class="small muted">Heute steht nichts Besonderes an.</div>';
    const b = hw.filter(x => x.warn).length; $("bdgHeute").hidden = !b; $("bdgHeute").textContent = b;
    const tage = []; for (let i = 0; i < 7; i++) tage.push(L.addDays(today, i));
    const tageIts = tage.map((d, i) => {
      const its = [];
      S.termine.filter(t => t.art !== "abgesagt" && (i === 0 ? L.inRange(t, d) : (t.datum === d || (L.inRange(t, d) && (t.art === "urlaub" || t.art === "schulferien") && false)))).sort((a, b) => (a.zeit || "").localeCompare(b.zeit || ""))
        .forEach(t => its.push('<div class="item"><div class="main"><div class="t">' + esc(t.titel) + '</div><div class="s">' + (t.bis && t.bis !== t.datum ? spanTxt(t) : t.zeit ? t.zeit + " Uhr" : "ganztägig") + (t.art === "anfrage" ? " · Anfrage" : "") + "</div>" + nz(t) + "</div>" + chip(t.fuer) + "</div>"));
      S.abfuhr.filter(a => L.addDays(a.datum, -1) === d).forEach(a => its.push('<div class="item' + (a.raus ? " done" : "") + '"><div class="main"><div class="t">' + TONNEN[a.tonne] + ' rausstellen</div><div class="s">Abfuhr ' + fmtK(a.datum) + (a.raus ? " · erledigt von " + NAMES[a.raus.p] : "") + "</div></div>" + (a.raus ? "" : '<button class="done-btn" data-act="raus" data-id="' + a.id + '">✓ Raus</button>') + "</div>"));
      offeneAufgaben().filter(g => g.datum === d || (i === 0 && g.datum < d)).sort((a, b) => (L.wer(b) === me) - (L.wer(a) === me)).forEach(g => {
        const ctrl = L.istPlan(g) ? '<button class="done-btn' + (offenePunkte(g) ? " gesperrt" : "") + '" data-act="gdone" data-id="' + g.id + '">Erledigen</button>' : '<input type="checkbox" class="check" data-chk="aufgabe" data-id="' + g.id + '" aria-label="Erledigt">';
        its.push('<div class="item"><div class="main"><div class="t">' + esc(g.titel) + '</div><div class="s">' + (g.datum < today ? chip("warn", "überfällig") : esc(g.raum || "Aufgabe")) + "</div>" + nzAufgabe(g) + "</div>" + werSelect(g) + ctrl + "</div>");
      });
      return its;
    });
    // Heute + Morgen als eigene Karten, die übrigen Tage kompakt in einer Karte (nur Tage mit Einträgen)
    const karte = (kopf, its) => '<div class="panel"><h2>' + kopf + '</h2><div class="list" style="margin-top:4px">' + (its.length ? its.join("") : '<div class="empty">Nichts geplant.</div>') + "</div></div>";
    const rest = tage.slice(2).map((d, j) => tageIts[j + 2].length ? '<div class="label" style="margin:12px 0 2px">' + L.dt(d).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" }) + "</div>" + tageIts[j + 2].join("") : "").join("");
    $("woche").innerHTML = karte("Heute", tageIts[0]) + karte("Morgen", tageIts[1]) +
      '<div class="panel"><h2>Nächste Tage</h2><div class="list">' + (rest || '<div class="empty">Sonst nichts geplant.</div>') + "</div></div>";
  }

  /* ================= Kalender ================= */
  const kalTyp = t => t.art === "schulferien" ? "ferien" : t.art !== "urlaub" ? null : t.fuer === "A" ? "bei" : t.fuer === "J" && !t.zuhause ? "jess" : t.fuer === "E" ? "eric" : t.fuer === "J" ? "jess" : "ferien";
  const kwVon = d => { const t = L.dt(d); t.setDate(t.getDate() + 3 - (t.getDay() + 6) % 7); const j = new Date(t.getFullYear(), 0, 4, 12); return 1 + Math.round(((t - j) / 864e5 - 3 + (j.getDay() + 6) % 7) / 7); };
  const montag = d => L.addDays(d, -((L.dt(d).getDay() + 6) % 7));
  function renderWoche(zz) {
    const mo = ui.kWoche || montag(today), so = L.addDays(mo, 6);
    $("wTitel").innerHTML = '<span class="kw">KW ' + kwVon(mo) + "</span> " + L.dt(mo).toLocaleDateString("de-DE", { day: "numeric", month: "short" }) + " – " + L.dt(so).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
    $("woche7").innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = L.addDays(mo, i), e = [];
      if (zz.has(d)) e.push('<div class="e">💛 Zeit zu zweit</div>');
      S.termine.filter(t => t.art !== "abgesagt" && L.inRange(t, d)).sort((a, b) => (a.zeit || "").localeCompare(b.zeit || "")).forEach(t => {
        const typ = kalTyp(t), farbe = typ ? "var(--k-" + typ + ")" : "var(--" + ({ J: "jess", E: "eric", F: "frida" }[t.fuer] || "accent") + ")";
        e.push('<div class="e"><span class="sq" style="background:' + farbe + ';display:inline-block;margin-right:6px"></span>' + esc(t.titel) + (t.zeit ? " <small>" + t.zeit + "</small>" : "") + (t.art === "anfrage" ? " <small>(Anfrage)</small>" : "") + "</div>");
      });
      S.abfuhr.filter(a => a.datum === d).forEach(a => e.push('<div class="e"><small>🗑 ' + TONNEN[a.tonne] + "</small></div>"));
      return '<div class="tag' + (d === today ? " heute" : "") + (zz.has(d) ? " zwei" : "") + '"><div class="dat"><span>' + L.dt(d).toLocaleDateString("de-DE", { weekday: "short" }) + "</span><b>" + L.dt(d).getDate() + '</b></div><div class="ein">' + (e.length ? e.join("") : '<div class="leer">frei</div>') + "</div></div>";
    }).join("");
  }
  function renderKalender() {
    const [y, m] = ui.kMonat.split("-").map(Number);
    $("kTitel").textContent = fmtM(ui.kMonat);
    const zz = new Set(); L.zuZweit(S.termine).forEach(z => L.tage(z.datum, z.bis).forEach(d => zz.add(d)));
    const off = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7, n = new Date(y, m, 0).getDate();
    let html = ["KW", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(w => '<div class="wd">' + w + "</div>").join("");
    html += '<div class="kwn">' + kwVon(y + "-" + L.pad(m) + "-01") + "</div>";
    for (let i = 0; i < off; i++) html += '<div class="d leer"></div>';
    renderWoche(zz);
    for (let dd = 1; dd <= n; dd++) {
      const d = y + "-" + L.pad(m) + "-" + L.pad(dd), wd = (off + dd - 1) % 7;
      if (wd === 0 && dd > 1) html += '<div class="kwn">' + kwVon(d) + "</div>";
      const ty = [...new Set(S.termine.filter(t => kalTyp(t) && L.inRange(t, d)).map(kalTyp))];
      const term = S.termine.some(t => !kalTyp(t) && t.art !== "abgesagt" && L.inRange(t, d)), mu = S.abfuhr.some(a => a.datum === d), au = offeneAufgaben().some(g => g.datum === d);
      html += '<button class="d' + (zz.has(d) ? " zwei" : "") + (d === today ? " heute" : "") + (d === ui.kSel ? " sel" : "") + (wd > 4 ? " we" : "") + '" data-kday="' + d + '" aria-label="' + fmtDay(d) + '"><span class="dn">' + dd + "</span>" +
        ["ferien", "bei", "jess", "eric"].filter(x => ty.includes(x)).map(x => '<span class="kb" style="background:var(--k-' + x + ')"></span>').join("") +
        '<span class="dots">' + (term ? '<span class="dot" style="background:var(--accent)"></span>' : "") + (au ? '<span class="dot" style="background:var(--warn)"></span>' : "") + (mu ? '<span class="dot" style="background:var(--muted)"></span>' : "") + "</span></button>";
    }
    $("kal").innerHTML = html;
    $("kLeg").innerHTML = [["ferien", "Fridas Schulferien"], ["bei", "Frida bei uns"], ["jess", "Jessica unterwegs"], ["eric", "Eric Urlaub"]].map(([k, l]) => '<span><i style="background:var(--k-' + k + ')"></i>' + l + "</span>").join("") +
      '<span><i style="background:var(--k-zwei);height:10px"></i>Zeit zu zweit</span><span><i style="background:var(--accent);width:6px;height:6px;border-radius:50%"></i>Termin</span><span><i style="background:var(--warn);width:6px;height:6px;border-radius:50%"></i>Aufgabe</span><span><i style="background:var(--muted);width:6px;height:6px;border-radius:50%"></i>Müll</span>';
    if (ui.kSel) {
      const d = ui.kSel, its = [];
      if (zz.has(d)) its.push('<div class="item"><div class="main"><div class="t">💛 Zeit zu zweit</div></div></div>');
      S.termine.filter(t => t.art !== "abgesagt" && L.inRange(t, d)).forEach(t => its.push('<div class="item"><div class="main"><div class="t">' + esc(t.titel) + '</div><div class="s">' + (t.zeit ? t.zeit + " Uhr" : t.bis ? spanTxt(t) : "ganztägig") + "</div>" + nz(t) + "</div>" + chip(t.fuer) + "</div>"));
      S.abfuhr.filter(a => a.datum === d).forEach(a => its.push('<div class="item"><div class="main"><div class="t">' + TONNEN[a.tonne] + " Abfuhr</div></div></div>"));
      offeneAufgaben().filter(g => g.datum === d).forEach(g => its.push('<div class="item"><div class="main"><div class="t">' + esc(g.titel) + '</div><div class="s">Aufgabe</div></div>' + chip(L.wer(g)) + "</div>"));
      $("kTag").innerHTML = '<div class="cat">' + fmtDay(d) + '</div><div class="list">' + (its.length ? its.join("") : '<div class="empty">Nichts eingetragen.</div>') + '</div><button class="btn ghost small" data-act="kNeu" data-d="' + d + '">+ Eintrag an diesem Tag</button>';
    } else $("kTag").innerHTML = "";
    const anfr = S.termine.filter(t => t.art === "anfrage" && t.von !== me && (t.bis || t.datum) >= today);
    $("anfragenP").hidden = !anfr.length; $("bdgKal").hidden = !anfr.length; $("bdgKal").textContent = anfr.length;
    $("anfragen").innerHTML = anfr.map(t => '<div class="item"><div class="main"><div class="t">' + esc(t.titel) + '</div><div class="s">' + fmtDay(t.datum) + (t.zeit ? ", " + t.zeit + " Uhr" : "") + " · von " + NAMES[t.von] + "</div>" + nz(t) + '</div><input id="antw-' + t.id + '" placeholder="Kurze Antwort (optional), z. B. „ja, ab 16 Uhr“" style="flex-basis:100%"><button class="btn small" data-act="zusagen" data-id="' + t.id + '">Zusagen</button><button class="btn ghost small" data-act="absagen" data-id="' + t.id + '">Absagen</button></div>').join("");
    const zl = L.zuZweit(S.termine).filter(z => z.bis >= today);
    $("zuzweit").innerHTML = zl.length ? zl.map(z => { const k = L.tage(z.datum, z.bis).length; return '<div class="item"><div class="main"><div class="t">' + spanTxt(z) + "</div></div>" + chip("J", k + (k === 1 ? " Tag" : " Tage")) + "</div>"; }).join("") : '<div class="empty">Tragt Fridas Schulferien ein, dann erscheinen hier eure gemeinsamen Zeiten.</div>';
    const kommend = S.termine.filter(t => t.art !== "urlaub" && t.art !== "schulferien" && (t.bis || t.datum) >= today).sort((a, b) => (a.datum + (a.zeit || "")).localeCompare(b.datum + (b.zeit || "")));
    $("termine").innerHTML = kommend.length ? kommend.map(t => '<div class="item"><div class="main"><div class="t">' + esc(t.titel) + '</div><div class="s">' + fmtDay(t.datum) + (t.zeit ? ", " + t.zeit + " Uhr" : "") + (t.art === "anfrage" ? " · wartet auf " + NAMES[L.other(t.von)] : t.art === "abgesagt" ? " · abgesagt" : "") + "</div>" + (t.antwort ? '<div class="hist">' + NAMES[t.antwort.p] + (t.antwort.ok ? " hat zugesagt" : " hat abgesagt") + (t.antwort.text ? ": „" + esc(t.antwort.text) + "“" : "") + "</div>" : "") + nz(t) + "</div>" + chip(t.fuer) +
      (t.art === "fix" ? '<a class="btn ghost small" href="' + gcal(t) + '" target="_blank" rel="noopener">+ Google</a>' : "") + '<button class="x" data-act="delT" data-id="' + t.id + '" aria-label="Löschen">×</button></div>').join("") : '<div class="empty">Keine kommenden Termine.</div>';
    const fer = S.termine.filter(t => (t.art === "urlaub" || t.art === "schulferien") && (t.bis || t.datum) >= today).sort((a, b) => a.datum.localeCompare(b.datum));
    $("ferien").innerHTML = fer.length ? fer.map(t => { const k = L.tage(t.datum, t.bis).length; return '<div class="item"><span class="sq" style="background:var(--k-' + kalTyp(t) + ')"></span><div class="main"><div class="t">' + esc(t.titel) + '</div><div class="s">' + spanTxt(t) + " · " + k + (k === 1 ? " Tag" : " Tage") + (t.zuhause ? " · zu Hause" : "") + "</div>" + nz(t) + '</div><a class="btn ghost small" href="' + gcal(t) + '" target="_blank" rel="noopener">+ Google</a><button class="x" data-act="delT" data-id="' + t.id + '" aria-label="Löschen">×</button></div>'; }).join("") : '<div class="empty">Noch keine Urlaube.</div>';
  }

  /* ================= Haushalt ================= */
  function werSelect(g) {
    const plan = L.istPlan(g), cur = g.wer === "R" ? "R" + (g.dran || "J") : g.wer, cls = g.wer === "R" ? (g.dran || "J") : g.wer;
    const opts = [["O", "Wer?"], ["J", "Jessica"], ["E", "Eric"], ["B", "Gemeinsam"]].concat(plan ? [["RJ", "⇄ Jessica dran"], ["RE", "⇄ Eric dran"]] : []);
    return '<select class="wer c-' + cls + '" data-wer="' + g.id + '" aria-label="Zuständig">' + opts.map(o => '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select>";
  }
  function wann(g) { if (!g.datum) return ""; if (g.datum < today) return chip("warn", "überfällig"); if (g.datum === today) return chip("warn", "heute"); const n = Math.round((L.dt(g.datum) - L.dt(today)) / 864e5); return n === 1 ? "morgen" : n < 14 ? "in " + n + " Tagen" : "ab " + fmtK(g.datum); }
  function editForm(g) {
    const plan = L.istPlan(g), o = (arr, cur) => arr.map(([v, l]) => '<option value="' + v + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + l + "</option>").join("");
    return '<form class="row" data-form="editG" data-id="' + g.id + '" style="flex-basis:100%;margin-top:6px;padding:10px;background:var(--soft);border-radius:12px">' +
      '<input name="titel" value="' + esc(g.titel) + '" aria-label="Titel" style="flex-basis:100%">' +
      (plan ? '<select name="rep" aria-label="Rhythmus">' + o(Object.entries(L.RYTH), g.rep) + '</select><select name="wtag" aria-label="Wochentag">' + o([["", "kein fester Tag"], [1, "Montag"], [2, "Dienstag"], [3, "Mittwoch"], [4, "Donnerstag"], [5, "Freitag"], [6, "Samstag"], [0, "Sonntag"]], g.wtag == null ? "" : g.wtag) + '</select><select name="mo" aria-label="Monatslogik">' + o([["", "jeweils ab Erledigung"], ["1", "am 1. dieses Wochentags im Monat"]], g.monate && g.monate.length ? "1" : "") + "</select>" : "") +
      '<select name="raum" aria-label="Raum">' + o([["", "Kein Raum"]].concat(RAEUME.map(x => [x, x])), g.raum || "") + "</select>" +
      '<label class="small muted" style="flex-basis:100%;margin-bottom:-4px">' + (plan ? "Nächstes Mal fällig (leer = automatisch)" : "Fällig am") + '</label><input name="datum" type="date" value="' + (g.datum || "") + '">' +
      '<input name="notiz" value="' + esc(g.notiz || "") + '" placeholder="Notiz / Checkliste (Punkte mit · trennen)" style="flex-basis:100%">' +
      '<button class="btn small">Speichern</button><button type="button" class="btn ghost small" data-act="editG" data-id="' + g.id + '">Abbrechen</button></form>';
  }
  // Checkliste einer Runde: einzelne Punkte abhakbar, beim Erledigen wieder leer
  function nzAufgabe(g) {
    if (!g.notiz || !g.notiz.includes(" · ")) return nz(g);
    const p = g.notiz.split(" · "), h = g.haken || [], n = p.filter((_, i) => h.includes(i)).length;
    return '<details class="n"' + (n || ui.openG === g.id ? " open" : "") + '><summary>Checkliste ' + n + "/" + p.length + '</summary><div class="cl">' +
      p.map((x, i) => '<label><input type="checkbox" data-chk="teil" data-id="' + g.id + '" data-i="' + i + '"' + (h.includes(i) ? " checked" : "") + '><span' + (h.includes(i) ? ' class="ok"' : "") + ">" + esc(x) + "</span></label>").join("") + "</div></details>";
  }
  const offenePunkte = g => { if (!g.notiz || !g.notiz.includes(" · ")) return 0; const p = g.notiz.split(" · ").length; return p - (g.haken || []).filter(i => i < p).length; };
  // Hinweis unten am Bildschirm, optional mit Rückgängig
  let toastT = null, undoFn = null;
  function toast(txt, undo) { let el = $("toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
    undoFn = undo || null; el.innerHTML = "<span>" + esc(txt) + "</span>" + (undo ? '<button data-act="undo">Rückgängig</button>' : ""); el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; undoFn = null; }, undo ? 8000 : 3500); }
  // Plan-Aufgabe erledigen: erst alle Punkte, dann Rückfrage, danach Rückgängig möglich
  function planErledigen(g, btn) {
    const rest = offenePunkte(g);
    if (rest) { ui.openG = g.id; renderHeute(); renderHaushalt(); toast("Erst alle Punkte der Checkliste abhaken (noch " + rest + " offen)."); return; }
    if (!btn.classList.contains("sicher")) { btn.classList.add("sicher"); const o = btn.innerHTML; btn.textContent = "Wirklich erledigt?"; setTimeout(() => { if (btn.isConnected) { btn.classList.remove("sicher"); btn.innerHTML = o; } }, 4000); return; }
    const vorher = {}; ["datum", "dran", "verlauf", "haken", "done", "erledigtAm", "erledigtVon"].forEach(k => vorher[k] = g[k] === undefined ? null : JSON.parse(JSON.stringify(g[k])));
    btn.disabled = true; upd("aufgaben", g.id, Object.assign(L.erledigen(g, today, me), { haken: null }));
    toast("„" + g.titel + "“ erledigt.", () => upd("aufgaben", g.id, vorher));
  }
  // Kompakte Zeile: Titel + eine Infozeile. Antippen klappt Details (Checkliste, Zuständig, Bearbeiten) auf.
  const KURZ = { J: "Jessica", E: "Eric", B: "Gemeinsam", O: "offen" };
  function aufItem(g, raumZeigen) {
    const plan = L.istPlan(g), v = (g.verlauf || []).slice(-1)[0], offen = ui.openG === g.id || ui.editG === g.id;
    const hist = plan ? (v ? '<div class="hist">Zuletzt: ' + NAMES[v.p] + ", " + fmtK(v.d) + "</div>" : '<div class="hist">Noch nie erledigt</div>') : (g.done && g.erledigtVon ? '<div class="hist">Erledigt von ' + NAMES[g.erledigtVon] + (g.erledigtAm ? ", " + fmtK(g.erledigtAm) : "") + "</div>" : "");
    const w = L.wer(g), p = g.notiz && g.notiz.includes(" · ") ? g.notiz.split(" · ").length : 0, h = (g.haken || []).length;
    const meta = [wann(g), g.raum && raumZeigen ? esc(g.raum) : "", plan ? "↻ " + L.rhythmus(g) : "", p ? "☑ " + h + "/" + p : ""].filter(Boolean).join(" · ");
    const ctrl = plan ? '<button class="done-btn' + (offenePunkte(g) ? " gesperrt" : "") + '" data-act="gdone" data-id="' + g.id + '">Erledigen</button>' : '<input type="checkbox" class="check" data-chk="aufgabe" data-id="' + g.id + '"' + (g.done ? " checked" : "") + ' aria-label="Erledigt">';
    const det = offen ? '<div class="det">' + nzAufgabe(g) + hist + '<div class="row" style="align-items:center;margin-top:6px">' + werSelect(g) +
      '<button class="btn ghost small" data-act="editG" data-id="' + g.id + '">✎ Bearbeiten</button><button class="btn ghost small" data-act="delG" data-id="' + g.id + '">Löschen</button></div>' + (ui.editG === g.id ? editForm(g) : "") + "</div>" : "";
    return '<div class="item' + (g.done && !plan ? " done" : "") + (offen ? " auf" : "") + '">' + (plan ? "" : ctrl) +
      '<div class="main" role="button" tabindex="0" data-act="openG" data-id="' + g.id + '" style="cursor:pointer"><div class="t">' + esc(g.titel) + ' <span class="muted" style="font-weight:400;font-size:.75em">' + (offen ? "▲" : "▼") + '</span></div><div class="s">' + meta + "</div></div>" +
      '<span class="who c-' + (w || "O") + '">' + (KURZ[w] || "offen") + "</span>" + (plan ? ctrl : "") + det + "</div>";
  }
  // Aufklappbare Gruppe, Zustand bleibt beim Neuzeichnen erhalten
  const gruppe = (key, titel, its, auf) => '<details class="grp" data-grp="' + key + '"' + ((ui.grp[key] != null ? ui.grp[key] : auf) ? " open" : "") + '><summary><span>' + titel + '</span><span class="muted small">' + its.length + "</span></summary><div class=\"list\">" + its.join("") + "</div></details>";
  function renderHaushalt() {
    const flt = $("gFilter").value, by = (a, b) => (a.datum || "9999").localeCompare(b.datum || "9999");
    const match = g => !flt || L.wer(g) === flt || (g.wer === "B" && flt !== "O" && flt !== "B");
    const jetzt = offeneAufgaben().filter(g => g.datum <= L.addDays(today, 7) && match(g)).sort(by);
    $("aufJetzt").innerHTML = jetzt.length ? jetzt.map(g => aufItem(g, true)).join("") : '<div class="empty">Diese Woche ist nichts fällig.</div>';
    const m = today.slice(0, 7), cnt = { J: 0, E: 0, B: 0 };
    S.aufgaben.forEach(g => { (g.verlauf || []).forEach(v => { if (v.d.startsWith(m) && cnt[v.p] != null) cnt[v.p]++; }); if (g.done && (g.erledigtAm || "").startsWith(m) && cnt[g.erledigtVon] != null) cnt[g.erledigtVon]++; });
    $("fair").innerHTML = chip("J", "Jessica: " + cnt.J) + chip("E", "Eric: " + cnt.E) + chip("B", "Gemeinsam: " + cnt.B);
    const plan = S.aufgaben.filter(L.istPlan), view = $("planView").value;
    if (!plan.length) $("aufPlan").innerHTML = '<div class="empty">Noch keine regelmäßigen Aufgaben. Unter „+ Neu“ anlegen.</div>';
    else if (view === "raum") $("aufPlan").innerHTML = RAEUME.concat([""]).map(r => { const its = plan.filter(g => (g.raum || "") === r || (r === "" && g.raum && !RAEUME.includes(g.raum))).sort((a, b) => (+a.rep - +b.rep) || by(a, b)); return its.length ? gruppe("r-" + r, r || "Ohne Raum", its.map(g => aufItem(g, false)), false) : ""; }).join("");
    else $("aufPlan").innerHTML = [["Alle paar Tage bis alle 3 Wochen", [3, 7, 14, 21]], ["Monatlich bis alle 2 Monate", [30, 60]], ["Vierteljährlich bis jährlich", [90, 180, 365]]].map(([n, reps], k) => { const its = plan.filter(g => reps.includes(+g.rep)).sort(by); return its.length ? gruppe("p" + k, n, its.map(g => aufItem(g, true)), k === 0) : ""; }).join("");
    const kurz = S.aufgaben.filter(g => !L.istPlan(g) && g.frist !== "lang").sort((a, b) => (a.done - b.done) || by(a, b));
    const lang = S.aufgaben.filter(g => g.frist === "lang").sort((a, b) => (a.done - b.done) || by(a, b));
    const liste = (arr, leer, key) => { const o = arr.filter(g => !g.done), d = arr.filter(g => g.done);
      return (o.length ? o.map(g => aufItem(g, true)).join("") : '<div class="empty">' + leer + "</div>") + (d.length ? gruppe(key, "Erledigt", d.map(g => aufItem(g, true)), false) : ""); };
    $("aufKurz").innerHTML = liste(kurz, "Keine offenen einmaligen Aufgaben.", "dk");
    $("aufLang").innerHTML = liste(lang, "Keine offenen Projekte.", "dl");
    $("muellOrt").textContent = (einst().adresse || "") + " · Tonne am Vorabend rausstellen";
    const ab = S.abfuhr.filter(a => a.datum >= L.addDays(today, -1)).sort((a, b) => a.datum.localeCompare(b.datum));
    $("muell").innerHTML = ab.length ? ab.map(a => '<div class="item' + (a.raus ? " done" : "") + '"><span class="sq" style="background:var(--' + ({ bio: "k-haushalt", gelb: "k-fix", papier: "k-ferien", rest: "muted" }[a.tonne]) + ')"></span><div class="main"><div class="t">' + TONNEN[a.tonne] + '</div><div class="s">' + fmtDay(a.datum) + (a.raus ? " · rausgestellt von " + NAMES[a.raus.p] : "") + "</div></div>" + (a.raus ? "" : '<button class="done-btn" data-act="raus" data-id="' + a.id + '">✓ Raus</button>') + '<button class="x" data-act="delAb" data-id="' + a.id + '" aria-label="Löschen">×</button></div>').join("") : '<div class="empty">Keine Abfuhrtermine eingetragen.</div>';
  }

  /* ================= Einkauf ================= */
  function renderEinkauf() {
    const offen = S.einkauf.filter(e => !e.done), e = einst(), hw = [];
    if (offen.length && S.vorrat.length && (e.vorratCheck || {}).am !== today) hw.push('<div class="hw"><span class="ic">' + ICON.cart + '</span><div class="main"><div style="font-weight:600">Vor dem Einkaufen: Vorrat prüfen</div><div class="small muted">' + ((e.vorratCheck || {}).am ? "Zuletzt geprüft " + fmtK(e.vorratCheck.am) : "Noch nie geprüft") + '</div></div><button class="done-btn" data-act="vrok">Geprüft</button></div>');
    if (offen.length && (e.pfand || {}).am !== today) hw.push('<div class="hw warn"><span class="ic">♻</span><div class="main"><div style="font-weight:600">Pfandflaschen mitnehmen</div></div><button class="done-btn" data-act="pfand">Eingepackt</button></div>');
    $("eHinweise").innerHTML = hw.join(""); $("eHinweise").hidden = !hw.length;
    $("bdgEink").hidden = !offen.length; $("bdgEink").textContent = offen.length;
    $("quick").innerHTML = QUICK.filter(q => !offen.some(x => x.name === q[0])).map(q => '<button type="button" data-act="quick" data-n="' + esc(q[0]) + '" data-k="' + esc(q[1]) + '">+ ' + esc(q[0]) + "</button>").join("");
    const kats = [...new Set(S.einkauf.map(x => x.kat || "Sonstiges"))].sort();
    $("einkauf").innerHTML = S.einkauf.length ? kats.map(k => '<div class="cat">' + esc(k) + '</div><div class="list">' + S.einkauf.filter(x => (x.kat || "Sonstiges") === k).sort((a, b) => a.done - b.done).map(x => '<label class="item' + (x.done ? " done" : "") + '"><input type="checkbox" class="check" data-chk="einkauf" data-id="' + x.id + '"' + (x.done ? " checked" : "") + '><span class="main t">' + esc(x.name) + "</span></label>").join("") + "</div>").join("") : '<div class="empty">Die Liste ist leer.</div>';
    const kn = S.vorrat.filter(v => v.status && v.status !== "ok").length;
    $("vrStand").textContent = S.vorrat.length ? (kn ? kn + " knapp oder leer" : "alles da") : "";
    $("vorrat").innerHTML = VRKAT.map(k => { const its = S.vorrat.filter(v => (VRKAT.includes(v.kat) ? v.kat : "Sonstiges") === k).sort((a, b) => a.name.localeCompare(b.name)); return its.length ? '<div class="cat">' + esc(k) + "</div>" + its.map(v => '<div class="vr"><span class="main">' + esc(v.name) + '</span><div class="st">' + [["ok", "voll"], ["knapp", "knapp"], ["leer", "leer"]].map(([s, l]) => '<button data-act="vr" data-id="' + v.id + '" data-s="' + s + '" aria-pressed="' + ((v.status || "ok") === s) + '">' + l + "</button>").join("") + '</div><button class="x" data-act="delVr" data-id="' + v.id + '" aria-label="Entfernen">×</button></div>').join("") : ""; }).join("") || '<div class="empty">Noch keine Vorratsartikel.</div>';
  }

  /* ================= Geld ================= */
  const KATLBL = { haushalt: "Haushalt (Einkäufe)", fix: "Fixkosten-Ausgleich", haus: "Anschaffungen Haus", auslage: "Auslagen privat", zahlung: "Bereits gezahlt" };
  function renderGeld() {
    const e = einst(), k = L.konto(S.buchungen, S.vertraege, e, today);
    const teile = ["haushalt", "fix", "haus", "auslage"], pos = teile.map(t => Math.max(0, Math.abs(k.alle[t])));
    const reihen = [["haushalt", "Haushalt (Einkäufe)", k.alle.haushalt, "haushalt"], ["fix", "Fixkosten-Ausgleich", k.alle.fix, "vertraege"], ["haus", "Anschaffungen Haus", k.alle.haus, "haus"], ["auslage", "Zwischen uns: Auslagen", k.alle.auslage, "zwischen"], ["zahlung", "Bereits gezahlt", k.alle.zahlung, "zwischen"]];
    const rest = L.r2(k.saldo - k.alle.haus), wer2 = v => v === 0 ? '<span class="muted">ausgeglichen</span>' : '<span style="font-weight:600;color:var(--' + (v > 0 ? "eric" : "jess") + ')">' + (v > 0 ? "Eric" : "Jessica") + '</span><span class="muted">→</span><span style="font-weight:600;color:var(--' + (v > 0 ? "jess" : "eric") + ')">' + (v > 0 ? "Jessica" : "Eric") + "</span>";
    $("kontoP").innerHTML = '<div class="label">Diesen Monat offen</div>' +
      '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:2px"><span class="big">' + eur(Math.abs(rest)) + "</span>" + wer2(rest) + "</div>" +
      '<div class="grid2" style="margin-top:10px">' + reihen.filter(x => x[0] !== "haus" && (x[2] || x[0] === "haushalt")).map(([kk, l, v, seg]) => '<span role="button" tabindex="0" data-act="geldSeg" data-k="' + seg + '" style="display:flex;align-items:center;gap:8px;cursor:pointer;min-height:36px"><span class="sq" style="background:' + KATFARBE[kk] + '"></span>' + l + '</span><span class="num">' + (v < 0 ? "− " : "") + eur(Math.abs(v)) + "</span>").join("") + "</div>" +
      '<button class="btn ghost full" style="margin-top:12px;width:100%" data-act="geldSeg" data-k="abschluss">Monat abschließen</button>' +
      (k.alle.haus ? '<button class="ans" data-act="geldSeg" data-k="haus"><span>Anschaffungen Haus, separat offen</span><span><b>' + eur(Math.abs(k.alle.haus)) + "</b> ›</span></button>" : "");
    const bm = ui.budgetM, b = L.budget(S.buchungen, S.vertraege, e, bm), um = S.buchungen.filter(x => x.kat === "umbuchung" && (x.datum || "").startsWith(bm)).reduce((t, x) => t + (+x.betrag || 0), 0);
    const rG = L.r2(b.rG + um), td = (v, neg) => '<td' + (neg && v < 0 ? ' style="color:var(--jess-ink)"' : "") + ">" + eur(v) + "</td>";
    $("budgetP").innerHTML = '<div class="between"><button class="x" data-act="bmPrev" aria-label="Vorheriger Monat">‹</button><h2>Haushaltsbudget ' + fmtM(bm) + '</h2><button class="x" data-act="bmNext" aria-label="Nächster Monat">›</button></div>' +
      '<div style="overflow-x:auto;margin-top:8px"><table class="btab"><thead><tr><th></th><th>Jessica</th><th>Eric</th><th>Gesamt</th></tr></thead><tbody>' +
      "<tr><td>Beitragsziel</td>" + td(b.zJ) + td(b.zE) + td(b.zG + um) + "</tr><tr><td>Einkäufe</td>" + td(b.eJ) + td(b.eE) + td(b.eG) + '</tr><tr class="rest"><td>Restbudget</td>' + td(b.rJ, 1) + td(b.rE, 1) + td(rG, 1) + "</tr></tbody></table></div>" +
      '<div class="bar" style="margin-top:8px"><span style="width:' + Math.max(0, Math.min(100, b.eG / Math.max(1, b.zG + um) * 100)) + '%"></span></div>' +
      '<div class="grid2 small" style="margin-top:10px"><span>Zwischenausgleich Einkäufe</span><span class="num">' + L.richtung(b.zwischen) + " " + (b.zwischen ? eur(Math.abs(b.zwischen)) : "") + '</span><span>Fixkosten-Ausgleich</span><span class="num">' + (e.fixImBeitrag ? "im Beitrag enthalten" : L.richtung(b.fixAusgleich) + " " + (b.fixAusgleich ? eur(Math.abs(b.fixAusgleich)) : "")) + "</span>" +
      '<label for="grund">Grundbeitrag je Person</label><span class="num"><input id="grund" type="number" inputmode="decimal" value="' + (+e.grund || 0) + '" style="width:90px;text-align:right;padding:5px 8px"> €</span></div>' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:10px;font-size:.9rem"><input type="checkbox" id="fixImBeitrag"' + (e.fixImBeitrag ? " checked" : "") + ' style="width:24px;height:24px;accent-color:var(--accent)">Fixkosten sind über die Beiträge ausgeglichen (Jessica zahlt ' + eur(Math.abs(b.fixAusgleich)) + ' weniger ein)</label>' +
      (b.kontoFix || b.eK || um ? '<div class="hist" style="margin-top:6px">Enthält vom Haushaltskonto: Einkäufe ' + eur(b.eK) + ", Fixkosten " + eur(b.kontoFix) + (um ? ", aus Tagesgeld " + eur(um) : "") + "</div>" : "") +
      (rG < 0 ? '<div class="note" style="margin-top:10px"><span style="flex:1 1 180px">Budget um <strong>' + eur(-rG) + '</strong> überschritten.</span><button class="btn small" data-act="tagesgeld" data-b="' + (-rG).toFixed(2) + '">Aus Tagesgeld ausgleichen</button></div>' : "");
    renderBuchungen(); renderVertraege(); renderAbschluss();
  }
  function bPicks() {
    const f = ui.bForm, mk = (key, opts) => opts.map(([v, l]) => '<button type="button" data-act="pick" data-key="' + key + '" data-v="' + v + '" aria-pressed="' + (f[key] === v) + '">' + l + "</button>").join("");
    const fm = $("fBuchung");
    fm.querySelector('[data-pick="von"]').innerHTML = mk("von", f.kat === "zahlung" ? [["J", "Jessica gibt Eric"], ["E", "Eric gibt Jessica"]] : [["J", "Jessica"], ["E", "Eric"], ["K", "Haushaltskonto"], ["M", "Mietkonto"], ["T", "Tagesgeld"]]);
    fm.querySelector('[data-pick="fuer"]').innerHTML = mk("fuer", f.kat === "auslage" ? [["J", "für Jessica"], ["E", "für Eric"], ["B", "für beide (halbe-halbe)"]] : [["B", "halbe-halbe"], ["J", "nur für Jessica"], ["E", "nur für Eric"]]);
    fm.querySelector('[data-pick="kat"]').innerHTML = mk("kat", [["auslage", "Etwas ausgelegt / mitgebracht"], ["zahlung", "Geld gegeben"]]);
    fm.querySelector('[data-pick="kat"]').hidden = $("bKatLbl").hidden = !["auslage", "zahlung"].includes(f.kat);
    fm.querySelector('[data-pick="fuer"]').hidden = $("bFuerLbl").hidden = f.kat === "zahlung";
    fm.elements.hauskat.hidden = f.kat !== "haus"; fm.elements.gutschein.hidden = fm.elements.gutscheinVon.hidden = f.kat !== "haus";
    const betrag = parseFloat(String(fm.elements.betrag.value).replace(",", ".")) || 0;
    const w = L.r2(L.wirkung({ betrag, von: f.von, fuer: f.fuer, kat: f.kat, gutschein: parseFloat(String(fm.elements.gutschein.value).replace(",", ".")) || 0, gutscheinVon: fm.elements.gutscheinVon.value }));
    $("bWirk").textContent = w === 0 ? "keine Schuld" : (w > 0 ? "Eric schuldet Jessica " : "Jessica schuldet Eric ") + (f.kat === "zahlung" ? "" : "+ ") + eur(Math.abs(w)) + (f.kat === "zahlung" ? " weniger" : "");
    if (f.kat === "zahlung") $("bWirk").textContent = (f.von === "E" ? "Eric schuldet Jessica " : "Jessica schuldet Eric ") + eur(betrag) + " weniger";
  }
  function buchZeile(b, frozen) {
    const w = L.r2(L.wirkung(b)), fz = frozen(b);
    const meta = [L.dt(b.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }), b.kat === "zahlung" ? NAMES[b.von] + " an " + NAMES[b.an || L.other(b.von)] : b.kat === "umbuchung" ? "aus Tagesgeld" : (b.kat === "haus" ? esc(b.hauskat || "Anschaffung") + " · " : "") + ((b.fuer || "B") === "B" ? "halbe-halbe" : "für " + NAMES[b.fuer]), b.gutschein ? "Gutschein " + eur(b.gutschein) + " (" + NAMES[b.gutscheinVon] + ")" : ""].filter(Boolean).join(" · ");
    return '<div class="item' + (fz ? " frozen" : "") + '"><span class="chip c-' + b.von + '" style="min-width:28px;text-align:center">' + b.von + '</span><div class="main"><div class="t">' + esc(b.text) + '</div><div class="s">' + meta + '</div></div><div style="text-align:right"><div class="num">' + eur(b.betrag) + '</div><div class="hist">' + (w === 0 ? "–" : (w > 0 ? "+ " : "− ") + eur(Math.abs(w))) + "</div></div>" +
      (fz ? '<span class="hist" title="Abgeschlossen">🔒</span>' : '<button class="x" data-act="editB" data-id="' + b.id + '" aria-label="Bearbeiten">✎</button><button class="x" data-act="delB" data-id="' + b.id + '" aria-label="Löschen">×</button>') + "</div>";
  }
  function liste(arr, frozen, nachMonat) {
    const l = arr.slice().sort((a, b) => (b.datum || "").localeCompare(a.datum || "") || (a.id < b.id ? 1 : -1));
    let last = "", html = "";
    l.forEach(b => { const m = (b.datum || "").slice(0, 7); if (nachMonat && m !== last) { html += '<div class="cat">' + fmtM(m) + "</div>"; last = m; } html += buchZeile(b, frozen); });
    return html || '<div class="empty">Noch keine Einträge.</div>';
  }
  function renderBuchungen() {
    bPicks();
    const la = letzterAbschluss(), frozen = b => !!(la && b.datum <= la.bis), e = einst();
    const hh = S.buchungen.filter(b => (b.kat === "haushalt" || b.kat === "umbuchung") && (b.datum || "").startsWith(ui.budgetM));
    $("hhTitel").textContent = "Einkäufe " + fmtM(ui.budgetM);
    $("listHaushalt").innerHTML = liste(hh, frozen, false);
    const haus = S.buchungen.filter(b => b.kat === "haus" || (b.kat === "zahlung" && b.bereich === "haus")), hk = {}; let j = 0, er = 0, sum = 0;
    haus.filter(b => b.kat === "haus").forEach(b => { const x = +b.betrag || 0; sum += x; hk[b.hauskat || "Sonstiges"] = (hk[b.hauskat || "Sonstiges"] || 0) + x; if (b.von === "J") j += x; else if (b.von === "E") er += x; });
    const max = Math.max(1, ...Object.values(hk)), k = L.konto(S.buchungen, S.vertraege, e, today), la2 = letzterAbschluss();
    const hausOffen = la2 ? L.r2((la2.hausOffen || 0) + L.konto(S.buchungen, S.vertraege, e, today, la2.bis).nachKat.haus) : k.alle.haus;
    $("hausP").innerHTML = '<div class="label">Anschaffungen gesamt' + (haus.length ? " seit " + fmtM(haus.map(b => b.datum).sort()[0].slice(0, 7)) : "") + '</div><div class="big">' + eur(sum) + '</div>' +
      '<div class="row" style="margin-top:8px"><div style="flex:1;background:var(--jess-soft);border-radius:10px;padding:9px 11px"><div class="tiny" style="color:var(--jess-ink);font-weight:600">Jessica bezahlt</div><div class="num">' + eur(j) + '</div></div><div style="flex:1;background:var(--eric-soft);border-radius:10px;padding:9px 11px"><div class="tiny" style="color:var(--eric-ink);font-weight:600">Eric bezahlt</div><div class="num">' + eur(er) + "</div></div></div>" +
      '<div class="wirk" style="margin-top:10px;background:var(--frida-soft)"><span>Noch offen aus Anschaffungen</span><span class="num">' + L.richtung(hausOffen) + " " + (hausOffen ? eur(Math.abs(hausOffen)) : "") + "</span></div>" +
      Object.entries(hk).sort((a, b) => b[1] - a[1]).map(([n, v]) => '<div style="margin-top:8px"><div class="between small"><span>' + esc(n) + '</span><span class="num">' + eur(v) + '</span></div><div class="bar" style="height:6px"><span style="width:' + (v / max * 100) + '%;background:var(--k-haus)"></span></div></div>').join("");
    $("listHaus").innerHTML = liste(haus, frozen, true);
    const zw = S.buchungen.filter(b => b.kat === "auslage" || (b.kat === "zahlung" && !b.bereich));
    $("zwP").innerHTML = '<div class="label">Zwischen uns</div><div class="small muted" style="margin-bottom:8px">Kleine Auslagen füreinander und Geld, das ihr euch gebt. Zahlungen verringern den Gesamtbetrag oben.</div>' +
      '<div class="grid2 small"><span>Offene Auslagen</span><span class="num">' + L.richtung(k.alle.auslage) + " " + (k.alle.auslage ? eur(Math.abs(k.alle.auslage)) : "") + "</span><span>Bisher gezahlt (alle Bereiche)</span><span class='num'>" + eur(Math.abs(k.alle.zahlung)) + "</span></div>";
    $("listZw").innerHTML = liste(zw, frozen, true);
  }
  const FORMTITEL = { haushalt: "Einkauf erfassen", haus: "Anschaffung erfassen", zwischen: "Auslage oder Zahlung erfassen" };
  function formPlatzieren(v) {
    const slot = document.querySelector('[data-slot="' + v + '"]'), f = $("buchFormP");
    if (!slot) { $("formPark").appendChild(f); return; }
    slot.appendChild(f); ui.bPane = v;
    if (!ui.editB) { ui.bForm.kat = v === "zwischen" ? (["auslage", "zahlung"].includes(ui.bForm.kat) ? ui.bForm.kat : "auslage") : v; if (v === "zwischen" && ui.bForm.fuer === "B") ui.bForm.fuer = L.other(ui.bForm.von); }
    $("bFormTitel").textContent = ui.editB ? "Eintrag bearbeiten" : FORMTITEL[v];
    $("bSatz").placeholder = v === "haushalt" ? "Schnell: „Aldi 23,45 Eric“" : v === "haus" ? "Schnell: „Hornbach Regal 89 Jessica“" : "Schnell: „Eric hat 12,90 € für Glühbirne für mich ausgelegt“";
    bPicks();
  }
  function renderVertraege() {
    const cm = today.slice(0, 7), fx = L.fix(S.vertraege, cm);
    $("fixP").innerHTML = '<div class="label">Fixkosten pro Monat</div><div class="big">' + eur(fx.gesamt) + '</div><div class="grid2 small" style="margin-top:8px">' + ["J", "E", "K", "M"].map(p => "<span>" + ({ J: "zahlt Jessica privat", E: "zahlt Eric privat", K: "über Haushaltskonto", M: "über Mietkonto" }[p]) + '</span><span class="num">' + eur(fx.by[p]) + "</span>").join("") + "</div>" +
      '<div class="wirk" style="margin-top:10px;background:var(--warn-soft)"><span>Fixkosten-Ausgleich</span><span class="num">' + (einst().fixImBeitrag ? eur(Math.abs(fx.ausgleich)) + " · über die Beiträge" : L.richtung(fx.ausgleich) + " " + (fx.ausgleich ? eur(Math.abs(fx.ausgleich)) : "")) + '</span></div><div class="hist" style="margin-top:6px">Jährliche Beiträge sind auf den Monat umgerechnet. Preisänderungen (€↗) gelten ab dem eingetragenen Monat.</div>';
    const in60 = L.addDays(today, 60);
    $("vertraege").innerHTML = S.vertraege.length ? S.vertraege.slice().sort((a, b) => (a.kat || "").localeCompare(b.kat || "") || a.name.localeCompare(b.name)).map(v => {
      const na = L.naechsteAenderung(v, cm), cur = L.betragIm(v, cm), mon = cur / (+v.intervall || 1);
      const det = [(v.fuer || "B") !== "B" ? "nur für " + NAMES[v.fuer] : "", v.anbieter, eur(cur) + " " + ({ 1: "monatlich", 3: "vierteljährlich", 6: "halbjährlich", 12: "jährlich" }[v.intervall] || ""), "zahlt " + NAMES[v.zahlt], v.ende ? "kündbar zum " + L.dt(v.ende).toLocaleDateString("de-DE") : "", v.frist ? "Frist " + v.frist : ""].filter(Boolean).map(esc).join(" · ");
      const verlauf = (v.aenderungen || []).length ? '<div class="hist">Preisverlauf: anfangs ' + eur(v.betrag) + " → " + v.aenderungen.slice().sort((a, b) => a.ab.localeCompare(b.ab)).map(a => fmtM(a.ab).replace(" 20", " ") + " " + eur(a.betrag)).join(" → ") + "</div>" : "";
      const pf = ui.preisV === v.id ? '<form class="row" data-form="preis" data-id="' + v.id + '" style="margin-top:8px"><input name="betrag" inputmode="decimal" placeholder="Neuer Betrag €" required><input name="ab" type="month" value="' + L.monatPlus(cm, 1) + '" required aria-label="Gültig ab"><button class="btn small">Speichern</button></form>' : "";
      return '<div class="item"><div class="main"><div class="t">' + esc(v.name) + '</div><div class="s">' + esc(v.kat || "") + " · " + det + "</div>" + (na ? '<div class="hist" style="color:var(--warn)">Ab ' + fmtM(na.ab) + ": " + eur(na.betrag) + (na.betrag > cur ? " (teurer)" : " (günstiger)") + "</div>" : "") + verlauf + nz(v) + (v.link ? '<a class="small" href="' + esc(v.link) + '" target="_blank" rel="noopener">Vertrag öffnen ›</a>' : "") + pf + '</div><span class="num">' + eur(mon) + '/M</span><button class="x" data-act="preis" data-id="' + v.id + '" aria-label="Preisänderung">€↗</button><button class="x" data-act="editV" data-id="' + v.id + '" aria-label="Bearbeiten">✎</button><button class="x" data-act="delV" data-id="' + v.id + '" aria-label="Löschen">×</button></div>';
    }).join("") : '<div class="empty">Noch keine Verträge.</div>';
  }
  function renderAbschluss() {
    const e = einst(), la = letzterAbschluss(), seit = la ? la.bis : null, k = L.konto(S.buchungen, S.vertraege, e, today, seit);
    const hausOffen = L.r2((la && la.hausOffen || 0) + k.nachKat.haus);
    const neu = L.r2(k.nachKat.haushalt + k.nachKat.fix + k.nachKat.haus + k.nachKat.auslage + k.nachKat.zahlung);
    const rest = L.r2(k.saldo - neu - (la && la.hausOffen || 0));
    const zahl = L.r2(ui.sammeln ? k.saldo - hausOffen : k.saldo);
    const zeile = (farbe, l, v, s) => '<div class="item"><span class="sq" style="background:' + farbe + ';height:30px;width:8px"></span><div class="main"><div class="t">' + l + "</div>" + (s ? '<div class="s">' + s + "</div>" : "") + '</div><span class="num">' + (v < 0 ? "− " : "") + eur(Math.abs(v)) + "</span></div>";
    const vm = L.monatPlus(today.slice(0, 7), -1), labelM = (+today.slice(8) <= 15 ? vm : today.slice(0, 7));
    $("abschlussP").innerHTML = '<h2>' + fmtM(labelM) + ' abschließen</h2><div class="small muted" style="margin:4px 0 6px">' + (la ? "Seit dem letzten Abschluss am " + L.dt(la.bis).toLocaleDateString("de-DE") : "Erster Abschluss") + ". Alles in einer Überweisung, danach wird der Zeitraum eingefroren.</div>" +
      '<div class="list">' + zeile(KATFARBE.haushalt, "Haushalt (Einkäufe)", k.nachKat.haushalt) + (einst().fixImBeitrag ? "" : zeile(KATFARBE.fix, "Fixkosten-Ausgleich", k.nachKat.fix)) +
      '<div class="item"><span class="sq" style="background:' + KATFARBE.haus + ';height:30px;width:8px"></span><div class="main"><div class="t">Anschaffungen Haus</div><div class="s">' + (ui.sammeln ? "werden weiter gesammelt" : "werden mit ausgeglichen") + '</div></div><span class="num">' + eur(hausOffen) + '</span><button class="switch" data-act="sammeln" aria-pressed="' + !ui.sammeln + '" aria-label="Anschaffungen mit ausgleichen"><span></span></button></div>' +
      zeile(KATFARBE.auslage, "Auslagen privat", k.nachKat.auslage) + (k.nachKat.zahlung ? zeile(KATFARBE.zahlung, "Schon gezahlt", k.nachKat.zahlung) : "") + (Math.abs(rest) >= 0.01 ? zeile("var(--line)", "Rest aus früheren Abschlüssen", rest) : "") + "</div>" +
      '<div class="dark" style="margin-top:12px"><div class="label">Eine Überweisung</div>' + (zahl === 0 ? '<div class="big">Nichts offen</div>' : '<div style="font-size:1rem">' + (zahl > 0 ? "Eric überweist Jessica" : "Jessica überweist Eric") + '</div><div class="big">' + eur(Math.abs(zahl)) + "</div>") + (ui.sammeln && hausOffen ? '<div class="small" style="opacity:.75">Anschaffungen ' + eur(hausOffen) + " bleiben offen.</div>" : "") + "</div>" +
      '<button class="btn full" style="margin-top:12px;width:100%" data-act="abschliessen" data-m="' + labelM + '" data-z="' + zahl + '" data-h="' + (ui.sammeln ? hausOffen : 0) + '"' + (zahl === 0 && !k.saldo ? " disabled" : "") + ">Überwiesen – " + fmtM(labelM).split(" ")[0] + " abschließen</button>";
    $("archiv").innerHTML = S.abschluesse.length ? S.abschluesse.slice().sort((a, b) => b.bis.localeCompare(a.bis)).map(a => '<div class="item"><div class="main"><div class="t">' + fmtM(a.monat) + '</div><div class="s">abgeschlossen am ' + L.dt(a.bis).toLocaleDateString("de-DE") + " von " + NAMES[a.von_user || "J"] + (a.hausOffen ? " · Anschaffungen offen " + eur(a.hausOffen) : "") + '</div></div><span class="num">' + (a.betrag ? L.richtung(a.betrag).replace(" → ", "→") + " " + eur(Math.abs(a.betrag)) : "0 €") + "</span></div>").join("") : '<div class="empty">Noch kein Monat abgeschlossen.</div>';
  }

  /* ================= Rendern & Navigation ================= */
  function render() {
    today = L.today();
    renderHeute(); renderKalender(); renderHaushalt(); renderEinkauf(); renderGeld();
  }
  function zeigeTab(t) {
    const [tab, sub] = t.split(":"); ui.tab = tab;
    document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    ["heute", "kalender", "haushalt", "einkauf", "geld"].forEach(v => $("v-" + v).hidden = v !== tab);
    if (sub) zeigeSeg(tab === "haushalt" ? "haus" : tab, sub);
    window.scrollTo(0, 0);
  }
  function zeigeSeg(seg, v) {
    ui.seg[seg] = v; if (seg === "geld") formPlatzieren(v);
    document.querySelectorAll('[data-seg="' + seg + '"] button').forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v));
    document.querySelectorAll('[data-pane^="' + seg + ':"]').forEach(p => p.hidden = p.dataset.pane !== seg + ":" + v);
  }
  function setMe(p) { me = p; try { localStorage.setItem("zz-ich", p); } catch (e) {} document.querySelectorAll("#whoSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.p === p)); ui.bForm.von = p; schedule(); }
  const num = v => parseFloat(String(v || "").replace(",", ".")) || 0;
  function bResetForm() { const f = $("fBuchung"); f.reset(); f.elements.datum.value = today; ui.editB = null; ui.bForm = { von: me, fuer: "B", kat: "haushalt" }; $("bSave").textContent = "Speichern"; formPlatzieren(ui.bPane || "haushalt"); }

  /* ================= Ereignisse ================= */
  document.addEventListener("click", ev => {
    const nav = ev.target.closest("nav.tabs button"); if (nav) { zeigeTab(nav.dataset.tab); return; }
    const sg = ev.target.closest("[data-seg] button"); if (sg) { zeigeSeg(sg.parentNode.dataset.seg, sg.dataset.v); return; }
    const who = ev.target.closest("#whoSeg button"); if (who) { setMe(who.dataset.p); return; }
    const go = ev.target.closest("[data-go]"); if (go && !ev.target.closest("button")) { zeigeTab(go.dataset.go); return; }
    const kd = ev.target.closest("[data-kday]"); if (kd) { ui.kSel = ui.kSel === kd.dataset.kday ? null : kd.dataset.kday; renderKalender(); return; }
    const t = ev.target.closest("[data-act]"); if (!t) return;
    const id = t.dataset.id, a = t.dataset.act;
    switch (a) {
      case "login": store.login && store.login(); break;
      case "kprev": ui.kMonat = L.monatPlus(ui.kMonat, -1); ui.kSel = null; renderKalender(); break;
      case "wprev": ui.kWoche = L.addDays(ui.kWoche || montag(today), -7); renderKalender(); break;
      case "wnext": ui.kWoche = L.addDays(ui.kWoche || montag(today), 7); renderKalender(); break;
      case "wheute": ui.kWoche = null; renderKalender(); break;
      case "knext": ui.kMonat = L.monatPlus(ui.kMonat, 1); ui.kSel = null; renderKalender(); break;
      case "kNeu": { const f = $("fTermin"); f.elements.datum.value = t.dataset.d; f.elements.titel.focus(); f.scrollIntoView({ behavior: "smooth", block: "center" }); break; }
      case "zusagen": case "absagen": { const ok = a === "zusagen", inp = $("antw-" + id), text = inp ? inp.value.trim() : "";
        upd("termine", id, { art: ok ? "fix" : "abgesagt", antwort: { p: me, ok, text, am: today }, antwortGesehen: false }); break; }
      case "gesehen": upd("termine", id, { antwortGesehen: true }); break;
      case "delT": if (sure("t" + id, t)) del("termine", id); break;
      case "waesche": t.disabled = true; setEinst({ ["waesche" + me]: today }); break;
      case "raus": t.disabled = true; upd("abfuhr", id, { raus: { p: me, am: today } }); break;
      case "delAb": if (sure("a" + id, t)) del("abfuhr", id); break;
      case "gdone": { const g = S.aufgaben.find(x => x.id === id); if (g) planErledigen(g, t); break; }
      case "undo": if (undoFn) { const f = undoFn; undoFn = null; f(); $("toast").hidden = true; } break;
      case "editG": ui.editG = ui.editG === id ? null : id; renderHaushalt(); break;
      case "openG": ui.openG = ui.openG === id ? null : id; if (ui.editG && ui.editG !== ui.openG) ui.editG = null; renderHaushalt(); break;
      case "delG": if (sure("g" + id, t)) del("aufgaben", id); break;
      case "quick": add("einkauf", { name: t.dataset.n, kat: t.dataset.k, done: false }); break;
      case "clearDone": S.einkauf.filter(x => x.done).forEach(x => del("einkauf", x.id)); break;
      case "vrok": setEinst({ vorratCheck: { am: today, p: me } }); break;
      case "pfand": setEinst({ pfand: { am: today, p: me } }); break;
      case "vr": { const v = S.vorrat.find(x => x.id === id); if (!v) break; upd("vorrat", id, { status: t.dataset.s });
        if (t.dataset.s !== "ok" && !S.einkauf.some(x => !x.done && x.name.toLowerCase() === v.name.toLowerCase())) add("einkauf", { name: v.name, kat: VR2EK[v.kat] || "Vorrat", done: false, vorrat: v.id }); break; }
      case "delVr": if (sure("v" + id, t, "?")) del("vorrat", id); break;
      case "geldSeg": zeigeSeg("geld", t.dataset.k); break;
      case "bmPrev": ui.budgetM = L.monatPlus(ui.budgetM, -1); renderGeld(); break;
      case "bmNext": ui.budgetM = L.monatPlus(ui.budgetM, 1); renderGeld(); break;
      case "tagesgeld": add("buchungen", { kat: "umbuchung", text: "Aus Tagesgeld ins Haushaltsbudget", betrag: +t.dataset.b, von: "T", datum: ui.budgetM === today.slice(0, 7) ? today : ui.budgetM + "-28" }); break;
      case "pick": ui.bForm[t.dataset.key] = t.dataset.v; if (t.dataset.key === "kat" && t.dataset.v === "zahlung" && !["J", "E"].includes(ui.bForm.von)) ui.bForm.von = me; bPicks(); break;
      case "bReset": bResetForm(); break;
      case "bSatz": { const p = L.parseSatz($("bSatz").value, me), f = $("fBuchung"); if (p.betrag) f.elements.betrag.value = String(p.betrag).replace(".", ","); f.elements.text.value = p.text;
        const pane = ui.bPane || "haushalt", kat = pane === "zwischen" ? (p.kat === "zahlung" ? "zahlung" : "auslage") : pane;
        ui.bForm = { von: kat === "zahlung" && !["J", "E"].includes(p.von) ? me : p.von, fuer: kat === "auslage" && p.fuer === "B" ? L.other(p.von) : p.fuer, kat }; $("bSatz").value = ""; bPicks(); break; }
      case "editB": { const b = S.buchungen.find(x => x.id === id); if (!b) break; const f = $("fBuchung"); ui.editB = id; f.elements.text.value = b.text; f.elements.betrag.value = String(b.betrag).replace(".", ","); f.elements.datum.value = b.datum; f.elements.hauskat.value = b.hauskat || "Sonstiges"; f.elements.gutschein.value = b.gutschein || ""; f.elements.gutscheinVon.value = b.gutscheinVon || "J";
        ui.bForm = { von: b.von, fuer: b.fuer || "B", kat: b.kat === "umbuchung" ? "haushalt" : b.kat };
        zeigeSeg("geld", b.kat === "haus" ? "haus" : ["auslage", "zahlung"].includes(b.kat) ? "zwischen" : "haushalt"); $("bFormTitel").textContent = "Eintrag bearbeiten"; $("bSave").textContent = "Änderungen speichern"; bPicks(); $("buchFormP").scrollIntoView({ behavior: "smooth" }); break; }
      case "delB": if (sure("b" + id, t)) del("buchungen", id); break;
      case "preis": ui.preisV = ui.preisV === id ? null : id; renderVertraege(); break;
      case "editV": { const v = S.vertraege.find(x => x.id === id); if (!v) break; const f = $("fVertrag"); ui.editV = id; ["name", "anbieter", "intervall", "zahlt", "fuer", "kat", "ende", "frist", "link", "notiz"].forEach(k => { if (f.elements[k]) f.elements[k].value = v[k] == null ? (k === "fuer" ? "B" : "") : v[k]; }); f.elements.betrag.value = String(v.betrag).replace(".", ","); $("vFormTitel").textContent = "Vertrag bearbeiten"; $("vCancel").hidden = false; f.scrollIntoView({ behavior: "smooth" }); break; }
      case "vCancel": ui.editV = null; $("fVertrag").reset(); $("vFormTitel").textContent = "Vertrag hinzufügen"; $("vCancel").hidden = true; break;
      case "delV": if (sure("vv" + id, t)) del("vertraege", id); break;
      case "sammeln": ui.sammeln = !ui.sammeln; renderAbschluss(); break;
      case "abschliessen": {
        if (!sure("abschluss", t, "Wirklich überwiesen? Nochmal tippen")) break;
        const z = +t.dataset.z, m = t.dataset.m;
        if (z) add("buchungen", { kat: "zahlung", text: "Monatsabschluss " + fmtM(m), betrag: Math.abs(z), von: z > 0 ? "E" : "J", an: z > 0 ? "J" : "E", datum: today, abschluss: true });
        add("abschluesse", { monat: m, bis: today, betrag: z, hausOffen: +t.dataset.h || 0, von_user: me });
        ui.sammeln = false; break;
      }
    }
  });
  document.addEventListener("keydown", ev => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches("[data-go]")) { ev.preventDefault(); zeigeTab(ev.target.dataset.go); } });
  document.addEventListener("change", ev => {
    const t = ev.target;
    if (t.dataset.chk === "einkauf") { const it = S.einkauf.find(x => x.id === t.dataset.id); upd("einkauf", t.dataset.id, { done: t.checked });
      if (t.checked && it) { const v = S.vorrat.find(x => x.id === it.vorrat || x.name.toLowerCase() === it.name.toLowerCase()); if (v && v.status !== "ok") upd("vorrat", v.id, { status: "ok" }); } }
    if (t.dataset.chk === "aufgabe") { const g = S.aufgaben.find(x => x.id === t.dataset.id); if (g) { if (t.checked && offenePunkte(g)) { t.checked = false; ui.openG = g.id; renderHaushalt(); toast("Erst alle Punkte der Checkliste abhaken (noch " + offenePunkte(g) + " offen)."); } else { upd("aufgaben", g.id, t.checked ? L.erledigen(g, today, me) : { done: false }); if (t.checked) toast("„" + g.titel + "“ erledigt.", () => upd("aufgaben", g.id, { done: false })); } } }
    if (t.dataset.chk === "teil") { const g = S.aufgaben.find(x => x.id === t.dataset.id); if (g) { const i = +t.dataset.i; let h = (g.haken || []).filter(x => x !== i); if (t.checked) h.push(i);
      const alle = g.notiz.split(" · ").length; upd("aufgaben", g.id, { haken: h }); if (t.checked && h.length >= alle) toast("Alle Punkte erledigt. Jetzt mit ✓ abschließen."); } }
    if (t.dataset.wer) { const v = t.value; upd("aufgaben", t.dataset.wer, v[0] === "R" ? { wer: "R", dran: v[1] } : { wer: v }); }
    if (t.id === "gFilter" || t.id === "planView") renderHaushalt();
    if (t.id === "fixImBeitrag") setEinst({ fixImBeitrag: t.checked });
    if (t.id === "grund") { const v = num(t.value); if (v >= 0) setEinst({ grund: v }); }
    if (t.form && t.form.id === "fBuchung") bPicks();
    if (t.id === "importFile" && t.files[0]) { const fr = new FileReader(); banner("Daten werden übernommen …", "info");
      fr.onload = () => { try { store.importiere(JSON.parse(fr.result)).then(() => banner("Fertig, eure Daten sind da.", "info")).catch(e => banner("Übernahme fehlgeschlagen (" + (e.code || e) + ").", "warn")); } catch (e) { banner("Die Datei ist keine gültige Startdaten-Datei.", "warn"); } };
      fr.readAsText(t.files[0]); }
  });
  document.addEventListener("toggle", ev => { const d = ev.target; if (d.dataset && d.dataset.grp) ui.grp[d.dataset.grp] = d.open; }, true);
  document.addEventListener("input", ev => { if (ev.target.form && ev.target.form.id === "fBuchung") bPicks(); });
  document.addEventListener("submit", ev => {
    const f = ev.target; ev.preventDefault();
    const v = n => (f.elements[n] ? String(f.elements[n].value).trim() : "");
    switch (f.id || f.dataset.form) {
      case "fTermin": { const o = { titel: v("titel"), art: v("art"), fuer: v("fuer"), datum: v("datum"), zeit: v("art") === "urlaub" || v("art") === "schulferien" ? "" : v("zeit"), von: me, notiz: v("notiz") };
        if (v("bis") && v("bis") > o.datum) o.bis = v("bis"); if (f.elements.zuhause.checked) o.zuhause = true; if (o.art === "schulferien") o.fuer = "F";
        add("termine", o); f.reset(); break; }
      case "fAufgabe": { const plan = v("frist") === "plan", o = { titel: v("titel"), frist: v("frist"), wer: plan ? v("wer") : (v("wer") === "R" ? "O" : v("wer")), raum: v("raum"), notiz: v("notiz"), done: false, von: me, rep: plan ? +v("rep") : 0 };
        if (plan) { o.verlauf = []; if (o.wer === "R") o.dran = me; if (v("wtag") !== "") o.wtag = +v("wtag"); o.datum = v("datum") || L.erster(o, today); } else o.datum = v("datum");
        add("aufgaben", o); f.reset(); zeigeSeg("haus", plan ? "plan" : "proj"); break; }
      case "fAbfuhr": add("abfuhr", { tonne: v("tonne"), datum: v("datum") }); f.reset(); break;
      case "fEinkauf": add("einkauf", { name: v("name"), kat: v("kat"), done: false }); f.elements.name.value = ""; break;
      case "fVorrat": add("vorrat", { name: v("name"), kat: v("kat"), status: "ok" }); f.elements.name.value = ""; break;
      case "fBuchung": { const b = ui.bForm, o = { text: v("text"), betrag: L.r2(num(v("betrag"))), von: b.von, kat: b.kat, datum: v("datum") || today, erfasst: me };
        if (!(o.betrag > 0)) break;
        if (b.kat === "zahlung") o.an = L.other(b.von); else o.fuer = b.fuer;
        if (b.kat === "haus") { o.hauskat = v("hauskat"); const g = num(v("gutschein")); if (g > 0) { o.gutschein = L.r2(Math.min(g, o.betrag)); o.gutscheinVon = v("gutscheinVon"); } }
        if (ui.editB) { const alt = S.buchungen.find(x => x.id === ui.editB) || {}; ["an", "fuer", "hauskat", "gutschein", "gutscheinVon"].forEach(k => { if (!(k in o) && k in alt) o[k] = null; }); upd("buchungen", ui.editB, o); } else add("buchungen", o);
        bResetForm(); break; }
      case "fVertrag": { const o = { name: v("name"), anbieter: v("anbieter"), betrag: L.r2(num(v("betrag"))), intervall: +v("intervall"), zahlt: v("zahlt"), fuer: v("fuer"), kat: v("kat"), ende: v("ende"), frist: v("frist"), link: v("link"), notiz: v("notiz") };
        if (ui.editV) upd("vertraege", ui.editV, o); else add("vertraege", o);
        ui.editV = null; f.reset(); $("vFormTitel").textContent = "Vertrag hinzufügen"; $("vCancel").hidden = true; break; }
      case "preis": { const vv = S.vertraege.find(x => x.id === f.dataset.id); if (!vv) break; const ab = v("ab"), list = (vv.aenderungen || []).filter(x => x.ab !== ab).concat([{ ab, betrag: L.r2(num(v("betrag"))) }]); ui.preisV = null; upd("vertraege", vv.id, { aenderungen: list }); break; }
      case "editG": { const g = S.aufgaben.find(x => x.id === f.dataset.id); if (!g) break;
        const p = { titel: v("titel") || g.titel, raum: v("raum"), datum: v("datum"), notiz: v("notiz") };
        if (f.elements.rep) { p.rep = +v("rep"); const wt = v("wtag"); p.wtag = wt === "" ? null : +wt; const mo = v("mo") === "1" && wt !== "" ? L.monateFuer(p.rep, p.datum || today) : null; p.monate = mo;
          if (!p.datum) p.datum = L.erster(Object.assign({}, g, { rep: p.rep, wtag: p.wtag, monate: p.monate }), today); }
        ui.editG = null; upd("aufgaben", g.id, p); break; }
    }
  });

  /* ================= Start ================= */
  $("gRaum").innerHTML += RAEUME.map(r => "<option>" + r + "</option>").join("");
  $("fBuchung").elements.datum.value = today; setMe(me); formPlatzieren("haushalt");
  if (store.demo) { $("login").hidden = true; store.init(); }
  else { $("app").hidden = true; document.querySelector("nav.tabs").hidden = true; store.init().catch(e => { zeigeLogin("Die App konnte nicht starten (" + (e && e.message || e) + "). Bitte Internetverbindung prüfen."); }); }
  if ("serviceWorker" in navigator && !store.demo && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  setInterval(() => { if (L.today() !== today) schedule(); }, 60000);
})();
