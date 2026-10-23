/* Zuhause zu zweit – Logik-Kern (ohne Oberfläche, testbar) */
(function (G) {
  "use strict";
  const L = {};
  const pad = n => String(n).padStart(2, "0");
  const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const dt = s => new Date(s + "T12:00");
  const addDays = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const r2 = x => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100; // kaufmännisch runden
  L.pad = pad; L.iso = iso; L.dt = dt; L.addDays = addDays; L.r2 = r2;
  L.today = () => iso(new Date());
  L.other = p => (p === "J" ? "E" : "J");

  /* ---------- Daten aus Zeiträumen ---------- */
  L.tage = (von, bis) => { const out = []; let d = von; const e = bis || von; while (d <= e) { out.push(d); d = addDays(d, 1); } return out; };
  L.inRange = (t, d) => t.datum <= d && (t.bis || t.datum) >= d;
  L.monatsTage = m => { const [y, mo] = m.split("-").map(Number); const n = new Date(y, mo, 0).getDate(); return L.tage(m + "-01", m + "-" + pad(n)); };
  L.monatPlus = (m, k) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + k, 1, 12); return iso(d).slice(0, 7); };

  /* ---------- Zeit zu zweit ---------- */
  // Fridas Schulferien minus: Frida bei euch (fuer A) oder einer allein unterwegs (Urlaub J/E ohne "zuhause")
  L.zuZweit = (termine) => {
    const weg = new Set();
    termine.filter(t => t.art === "urlaub" && (t.fuer === "A" || ((t.fuer === "J" || t.fuer === "E") && !t.zuhause)))
      .forEach(t => L.tage(t.datum, t.bis).forEach(x => weg.add(x)));
    const frei = new Set();
    termine.filter(t => t.art === "schulferien").forEach(t => L.tage(t.datum, t.bis).forEach(x => { if (!weg.has(x)) frei.add(x); }));
    const u = [...frei].sort(), ranges = [];
    u.forEach(x => { const l = ranges[ranges.length - 1]; if (l && addDays(l.bis, 1) === x) l.bis = x; else ranges.push({ datum: x, bis: x }); });
    return ranges;
  };

  /* ---------- Rhythmus der Haushaltsaufgaben ---------- */
  L.inSaison = (s, sa) => { if (!sa) return s; const d = dt(s); const m = d.getMonth() + 1; if (m >= sa[0] && m <= sa[1]) return s; const y = d.getFullYear() + (m > sa[1] ? 1 : 0); return y + "-" + pad(sa[0]) + "-01"; };
  L.ersterWt = (y, m, wt) => { const d = new Date(y, m - 1, 1, 12); while (d.getDay() !== wt) d.setDate(d.getDate() + 1); if (m === 1 && d.getDate() === 1) d.setDate(8); return iso(d); };
  L.naechster = (g, von) => {
    const f = dt(von);
    if (g.monate && g.monate.length) {
      let y = f.getFullYear(), m = f.getMonth() + 1;
      for (let i = 0; i < 24; i++) { m++; if (m > 12) { m = 1; y++; } if (g.monate.includes(m)) return L.ersterWt(y, m, g.wtag == null ? 5 : g.wtag); }
    }
    f.setDate(f.getDate() + (+g.rep || 7));
    if (g.wtag != null) { const diff = ((g.wtag - f.getDay()) + 7) % 7; f.setDate(f.getDate() + (diff > 3 ? diff - 7 : diff)); }
    return L.inSaison(iso(f), g.saison);
  };
  L.erster = (g, heute, ab) => {
    let t = heute; if (ab) t = addDays(t, ab);
    if (g.monate && g.monate.length) {
      const d0 = dt(t), m = d0.getMonth() + 1, wt = g.wtag == null ? 5 : g.wtag;
      if (g.monate.includes(m)) {
        const f = L.ersterWt(d0.getFullYear(), m, wt);
        if (f >= t) return f;
        if (g.monate.length <= 2) { const d = dt(addDays(t, 7)); while (d.getDay() !== wt) d.setDate(d.getDate() + 1); if (d.getMonth() + 1 === m) return iso(d); }
      }
      return L.naechster(g, t);
    }
    if (g.wtag != null) { const d = dt(t); while (d.getDay() !== g.wtag) d.setDate(d.getDate() + 1); t = iso(d); }
    return L.inSaison(t, g.saison);
  };
  L.monateFuer = (rep, start) => { const m = dt(start).getMonth() + 1; const step = { 30: 1, 60: 2, 90: 3, 180: 6, 365: 12 }[rep]; if (!step) return null; const out = []; for (let i = 0; i < 12; i += step) out.push(((m - 1 + i) % 12) + 1); return out.sort((a, b) => a - b); };
  const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"], MON = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
  const RYTH = { 3: "alle 3 Tage", 7: "wöchentlich", 14: "alle 2 Wochen", 21: "alle 3 Wochen", 30: "monatlich", 60: "alle 2 Monate", 90: "alle 3 Monate", 180: "halbjährlich", 365: "jährlich" };
  L.RYTH = RYTH; L.WT = WT; L.MON = MON;
  L.rhythmus = g => {
    const wt = g.wtag != null ? WT[g.wtag] : "";
    if (g.monate && g.monate.length) {
      const n = g.monate.length;
      const b = n === 12 ? "monatlich" : n === 6 ? "alle 2 Monate" : n === 4 ? "vierteljährlich" : n === 2 ? "halbjährlich (" + g.monate.map(x => MON[x - 1]).join("/") + ")" : n === 1 ? "jährlich im " + MON[g.monate[0] - 1] : "in " + g.monate.map(x => MON[x - 1]).join(", ");
      return b + (wt ? ", 1. " + wt : "");
    }
    return (RYTH[g.rep] || "alle " + g.rep + " Tage") + (wt ? ", " + wt : "");
  };
  L.istPlan = g => g.frist === "plan" || (g.rep && g.frist !== "lang");
  L.wer = g => (g.wer === "R" ? (g.dran || "J") : g.wer);
  L.erledigen = (g, heute, wer) => {
    if (!L.istPlan(g)) return { done: true, erledigtVon: g.wer === "B" ? "B" : wer, erledigtAm: heute };
    const p = { datum: L.naechster(g, heute), verlauf: (g.verlauf || []).concat([{ d: heute, p: g.wer === "B" ? "B" : wer }]).slice(-12) };
    if (g.wer === "R") p.dran = L.other(wer);
    return p;
  };

  /* ---------- Verträge ---------- */
  L.betragIm = (v, m) => { let b = +v.betrag || 0, best = ""; (v.aenderungen || []).forEach(a => { if (a.ab <= m && a.ab >= best) { best = a.ab; b = +a.betrag || 0; } }); return b; };
  L.naechsteAenderung = (v, m) => (v.aenderungen || []).filter(a => a.ab > m).sort((a, b) => a.ab.localeCompare(b.ab))[0];
  L.fix = (vertraege, m) => {
    const by = { K: 0, M: 0, J: 0, E: 0 }; let ausgleich = 0;
    vertraege.forEach(v => {
      const mon = L.betragIm(v, m) / (+v.intervall || 1); by[v.zahlt] = (by[v.zahlt] || 0) + mon;
      if (v.zahlt === "J" || v.zahlt === "E") { const f = v.fuer || "B"; const a = f === "B" ? mon / 2 : (f !== v.zahlt ? mon : 0); ausgleich += v.zahlt === "J" ? a : -a; }
    });
    Object.keys(by).forEach(k => by[k] = r2(by[k]));
    return { by, gesamt: r2(by.K + by.M + by.J + by.E), ausgleich: r2(ausgleich) }; // ausgleich > 0: Eric schuldet Jessica
  };

  /* ---------- Gemeinsames Geldkonto ---------- */
  // Wirkung einer Buchung auf den Saldo; > 0 heißt: Eric schuldet Jessica
  L.wirkung = b => {
    const x = +b.betrag || 0;
    if (b.kat === "zahlung") return b.von === "J" ? x : -x;
    if (b.von !== "J" && b.von !== "E") return 0; // Haushalts-, Miet- oder Tagesgeldkonto: keine Schuld
    const g = Math.min(+b.gutschein || 0, x), c = { J: 0, E: 0 };
    c[b.von] += x - g; if (g) c[b.gutscheinVon || b.von] += g;
    const f = b.fuer || "B", anteilJ = f === "B" ? x / 2 : f === "J" ? x : 0;
    return c.J - anteilJ; // ungerundet, gerundet wird erst die Summe
  };
  L.KATS = { haushalt: "Haushalt", fix: "Fixkosten-Ausgleich", haus: "Anschaffungen Haus", auslage: "Auslagen privat", zahlung: "Zahlungen" };
  L.fixMonate = (fixAb, bisMonat) => { const out = []; if (!fixAb) return out; let m = fixAb; while (m <= bisMonat) { out.push(m); m = L.monatPlus(m, 1); } return out; };
  // Saldo gesamt und nach Kategorie, optional nur Buchungen nach einem Stichtag
  L.konto = (buchungen, vertraege, einst, heute, seit) => {
    const leer = () => ({ haushalt: 0, fix: 0, haus: 0, auslage: 0, zahlung: 0 });
    const alle = leer(), nachKat = leer();
    buchungen.forEach(b => {
      const w = L.wirkung(b), kk = b.kat === "zahlung" && b.bereich ? b.bereich : b.kat, k = kk in alle ? kk : "auslage"; alle[k] += w;
      if (!seit || b.datum > seit) nachKat[k] += w;
    });
    const cm = heute.slice(0, 7);
    L.fixMonate(einst.fixAb, cm).forEach(m => { const a = L.fix(vertraege, m).ausgleich; alle.fix += a; if (!seit || m > seit.slice(0, 7)) nachKat.fix += a; });
    let saldo = 0;
    Object.keys(alle).forEach(k => { alle[k] = r2(alle[k]); nachKat[k] = r2(nachKat[k]); saldo += alle[k]; });
    return { saldo: r2(saldo), nachKat, alle };
  };
  // Haushaltsbudget eines Monats (euer Abrechnungsblatt)
  L.budget = (buchungen, vertraege, einst, m) => {
    const g = +einst.grund || 0, fx = L.fix(vertraege, m);
    const geteilt = buchungen.filter(b => b.kat === "haushalt" && (b.fuer || "B") === "B" && (b.datum || "").startsWith(m));
    const sum = f => r2(geteilt.filter(f).reduce((t, b) => t + (+b.betrag || 0), 0));
    const eJ = sum(b => b.von === "J"), eE = sum(b => b.von === "E"), eK = sum(b => b.von !== "J" && b.von !== "E");
    const zJ = r2(g - fx.ausgleich), zE = r2(g + fx.ausgleich), zG = r2(zJ + zE);
    const eG = r2(eJ + eE + eK + fx.by.K);
    const zwischen = r2(eJ - (eJ + eE) / 2); // > 0: Eric → Jessica
    return { zJ, zE, zG, eJ, eE, eK, eG, rJ: r2(zJ - eJ), rE: r2(zE - eE), rG: r2(zG - eG), zwischen, fixAusgleich: fx.ausgleich, kontoFix: fx.by.K };
  };
  L.richtung = s => (s === 0 ? "ausgeglichen" : (s > 0 ? "Eric → Jessica" : "Jessica → Eric"));

  /* ---------- Satz-Eingabe (ohne KI, nach Regeln) ---------- */
  // z. B. "Eric hat 12,90 € für eine Glühbirne für mich ausgelegt", "Aldi 23,45 Jessica", "Tabak 13 Eric halbe"
  L.parseSatz = (s, ich) => {
    const t = " " + s.toLowerCase() + " ";
    const m = s.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euro)?/i);
    const betrag = m ? parseFloat(m[1].replace(",", ".")) : null;
    let von = null;
    if (/\b(eric)\b/.test(t)) von = "E"; if (/\b(jessica|jessy|jess)\b/.test(t)) von = von && t.indexOf("jess") > t.indexOf("eric") ? von : "J";
    if (/\bich\b|\bhabe\b/.test(t) && !von) von = ich;
    if (/haushaltskonto|vom konto/.test(t)) von = "K";
    let fuer = "B";
    if (/für mich|fuer mich/.test(t)) fuer = von && von !== ich ? ich : ich;
    if (/für dich|fuer dich/.test(t)) fuer = L.other(ich);
    if (/für eric/.test(t)) fuer = "E"; if (/für jessica|für jessy/.test(t)) fuer = "J";
    if (/halbe|geteilt|für uns|für beide|zusammen/.test(t)) fuer = "B";
    let kat = "haushalt";
    if (/ausgelegt|mitgebracht|für mich|für dich|für eric|für jessica/.test(t) && fuer !== "B") kat = "auslage";
    if (/möbel|baumarkt|hornbach|ikea|garten|lampe|regal|anschaffung|werkzeug/.test(t)) kat = "haus";
    let typ = "kauf";
    if (/überwiesen|gegeben|zurückgezahlt|bezahlt an|geld an/.test(t)) typ = "zahlung";
    let text = s.replace(m ? m[0] : "", " ").replace(/\b(eric|jessica|jessy|hat|habe|ich|mir|für|fuer|mich|dich|uns|beide|halbe-halbe|halbe|ausgelegt|mitgebracht|eine|einen|ein|den|die|das|vom|haushaltskonto|bezahlt|gekauft|euro|eur)\b/gi, " ").replace(/[€,.]/g, " ").replace(/\s+/g, " ").trim();
    if (typ === "zahlung") text = "Geld gegeben";
    if (!text) text = "Einkauf";
    text = text.charAt(0).toUpperCase() + text.slice(1);
    return { betrag, von: von || ich, fuer, kat: typ === "zahlung" ? "zahlung" : kat, text };
  };

  G.L = L;
  if (typeof module !== "undefined") module.exports = L;
})(typeof window !== "undefined" ? window : globalThis);
