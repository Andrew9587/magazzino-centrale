/* ============================================================
   MGC CORE — libreria condivisa da tutti i livelli
   ------------------------------------------------------------
   Espone un unico oggetto globale: window.MGC
     MGC.Utils    date, orari, slot, escape…
     MGC.Store    localStorage + dati demo + log
     MGC.Session  sessione di login (sessionStorage)
     MGC.Auth     credenziali e mappa livelli → pagina
   ------------------------------------------------------------
   Nessuna dipendenza. Va caricato PRIMA dello script di livello.
   ============================================================ */
(function (global) {
  'use strict';

  /* =========================================================
     COSTANTI DI DOMINIO
     ========================================================= */
  var FASCE = {
    mattina:    { inizio: '08:30', fine: '12:30', step: 30 },
    pomeriggio: { inizio: '14:00', fine: '16:30', step: 30 }
  };

  var TIPO_LABEL = {
    carico: 'Carico',
    scarico: 'Scarico',
    entrambi: 'Carico/Scarico',
    eccezionale: 'Eccezionale'
  };

  var NOMI_FORNITORI_DEMO = [
    "Logistica Adriatica S.r.l.", "Trasporti Bianchi & Figli", "Eurofresh Distribuzione",
    "Cargo Veneto S.p.A.", "Alimentari del Sole", "Frigo Trans Italia", "Mercurio Spedizioni",
    "Conserve Po Valley", "Lattiero Caseario Rossi", "Tessile Nord S.r.l.",
    "Ferramenta Universale", "Vini e Distillati Colle", "Ortofrutta Mediterranea",
    "Plast Pack Imballaggi", "Carta e Cartoni Esposito", "Surgelati Stella Polare",
    "Bevande Group Italia", "Macelleria Industriale Tosi", "Forno Centrale Distribuzione",
    "Chimica Verde S.r.l.", "Elettroforniture Marini", "Pelletteria Conceria Lux",
    "Carni Pregiate Lombarde", "Detergenza Professionale", "Idrotermosanitaria Bassi"
  ];

  /* =========================================================
     UTILS — identiche a quelle del L2 originale
     ========================================================= */
  function pad(n) { return n.toString().padStart(2, '0'); }
  function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDateLong(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function fmtDateShort(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT',
      { weekday: 'short', day: '2-digit', month: 'short' });
  }
  function isWeekday(dateStr) {
    var day = new Date(dateStr + 'T00:00:00').getDay();
    return day >= 1 && day <= 5;
  }
  function timeToMin(t) { var p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
  function minToTime(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function addMinutes(t, mins) { return minToTime(timeToMin(t) + mins); }
  function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function generaSlotsGiorno() {
    var slots = [], t;
    t = FASCE.mattina.inizio;
    while (timeToMin(t) <= timeToMin(FASCE.mattina.fine)) { slots.push({ ora: t, periodo: 'mattina' }); t = addMinutes(t, 30); }
    t = FASCE.pomeriggio.inizio;
    while (timeToMin(t) <= timeToMin(FASCE.pomeriggio.fine)) { slots.push({ ora: t, periodo: 'pomeriggio' }); t = addMinutes(t, 30); }
    return slots;
  }

  function durataAppuntamento(tipo) { return tipo === 'eccezionale' ? 60 : 30; }
  function numSlotOccupati(tipo) { return durataAppuntamento(tipo) / 30; }

  function eccezionaleConsentitoA(ora, periodo) {
    var ultimo = periodo === 'mattina' ? FASCE.mattina.fine : FASCE.pomeriggio.fine;
    return ora !== ultimo;
  }

  function orariOccupatiDaAppuntamento(appt) {
    var n = numSlotOccupati(appt.tipo), orari = [], t = appt.oraOriginale;
    for (var i = 0; i < n; i++) { orari.push(t); t = addMinutes(t, 30); }
    return orari;
  }

  function slotEffettivamenteLibero(appuntamentiGiorno, ora) {
    for (var i = 0; i < appuntamentiGiorno.length; i++) {
      var a = appuntamentiGiorno[i];
      if (a.stato !== 'confermato') continue;
      if (orariOccupatiDaAppuntamento(a).indexOf(ora) !== -1) return false;
    }
    return true;
  }

  function fasciaOraria(ora) {
    var min = timeToMin(ora);
    if (min >= timeToMin(FASCE.mattina.inizio) && min <= timeToMin(FASCE.mattina.fine)) return 'mattina';
    if (min >= timeToMin(FASCE.pomeriggio.inizio) && min <= timeToMin(FASCE.pomeriggio.fine)) return 'pomeriggio';
    return null;
  }

  var Utils = {
    FASCE: FASCE, TIPO_LABEL: TIPO_LABEL, NOMI_FORNITORI_DEMO: NOMI_FORNITORI_DEMO,
    pad: pad, toDateStr: toDateStr, fmtDateLong: fmtDateLong, fmtDateShort: fmtDateShort,
    isWeekday: isWeekday, timeToMin: timeToMin, minToTime: minToTime, addMinutes: addMinutes,
    uid: uid, escapeHtml: escapeHtml, generaSlotsGiorno: generaSlotsGiorno,
    durataAppuntamento: durataAppuntamento, numSlotOccupati: numSlotOccupati,
    eccezionaleConsentitoA: eccezionaleConsentitoA,
    orariOccupatiDaAppuntamento: orariOccupatiDaAppuntamento,
    slotEffettivamenteLibero: slotEffettivamenteLibero,
    fasciaOraria: fasciaOraria
  };

  /* =========================================================
     STORE — una sola chiave localStorage per tutti i livelli
     ========================================================= */
  var STORAGE_KEY   = 'mgc-data-v2';
  var LEGACY_KEYS   = ['mgc-l2-v1', 'mgc-app-v1'];
  var MAX_LOG       = 80;
  var DATA_VERSION  = '2.0.0';

  function generaDatiDemo(opts) {
    opts = opts || {};
    var daPast = opts.giorniPassati !== undefined ? opts.giorniPassati : 5;
    var daFut  = opts.giorniFuturi  !== undefined ? opts.giorniFuturi  : 10;

    var fornitori = NOMI_FORNITORI_DEMO.map(function (nome, i) {
      var n = pad(i + 1);
      return {
        id: 'forn' + n,
        nome: nome,
        referente: ['Marco', 'Giulia', 'Luca', 'Sara', 'Davide', 'Elena', 'Paolo', 'Chiara'][i % 8] + ' ' +
                   ['Verdi', 'Neri', 'Russo', 'Ferrari', 'Colombo'][i % 5],
        telefono: '3' + (40 + i).toString().padStart(2, '0') + ' ' + (1000000 + i * 137),
        email: nome.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@fornitori-demo.it',
        password: 'f' + n + 'pass'
      };
    });

    var oggi = new Date();
    var appuntamenti = [];
    var slotsBase = generaSlotsGiorno();

    for (var dOffset = -daPast; dOffset <= daFut; dOffset++) {
      var d = new Date(oggi); d.setDate(d.getDate() + dOffset);
      var dateStr = toDateStr(d);
      if (!isWeekday(dateStr)) continue;

      var usati = {}, appuntamentiGiorno = [];
      for (var i = 0; i < slotsBase.length; i++) {
        var slot = slotsBase[i];
        if (!slotEffettivamenteLibero(appuntamentiGiorno, slot.ora)) continue;
        if (Math.random() < 0.32) continue;

        var f, tentativi = 0;
        do { f = fornitori[Math.floor(Math.random() * fornitori.length)]; tentativi++; }
        while (usati[f.id] && tentativi < 8);
        usati[f.id] = true;

        var roll = Math.random();
        var tipo = roll < 0.42 ? 'carico' : roll < 0.78 ? 'scarico' : roll < 0.94 ? 'entrambi' : 'eccezionale';
        if (tipo === 'eccezionale') {
          var next = addMinutes(slot.ora, 30);
          var nextEsiste = slotsBase[i + 1] && slotsBase[i + 1].periodo === slot.periodo;
          var ok = eccezionaleConsentitoA(slot.ora, slot.periodo) && nextEsiste &&
                   slotEffettivamenteLibero(appuntamentiGiorno, next);
          if (!ok) tipo = 'entrambi';
        }

        var appt = {
          id: uid('app'), fornitoreId: f.id, data: dateStr,
          ora: slot.ora, oraOriginale: slot.ora, tipo: tipo,
          ritardoMin: 0, stato: 'confermato', note: '', creatoDa: 'sistema-demo'
        };
        appuntamentiGiorno.push(appt);
        appuntamenti.push(appt);
      }
    }

    return {
      fornitori: fornitori,
      appuntamenti: appuntamenti,
      registro: [{
        id: uid('log'), tipo: 'info',
        testo: 'Sistema inizializzato con dati dimostrativi.',
        meta: new Date().toISOString(), notifica: false
      }],
      chat: {},
      _version: DATA_VERSION,
      _loadedAt: new Date().toISOString()
    };
  }

  /* Normalizza dati vecchi (chiavi v1) al formato corrente */
  function normalizza(data) {
    if (!data || !Array.isArray(data.fornitori)) return null;
    if (!Array.isArray(data.appuntamenti)) data.appuntamenti = [];
    if (!Array.isArray(data.registro)) data.registro = [];
    if (!data.chat || typeof data.chat !== 'object') data.chat = {};
    data.fornitori.forEach(function (f, i) {
      if (!f.password) f.password = 'f' + pad(i + 1) + 'pass';
      if (!f.email) f.email = 'fornitore' + pad(i + 1) + '@fornitori-demo.it';
    });
    data._version = DATA_VERSION;
    return data;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizza(JSON.parse(raw));
      /* migrazione dalle vecchie chiavi del file singolo */
      for (var i = 0; i < LEGACY_KEYS.length; i++) {
        var old = localStorage.getItem(LEGACY_KEYS[i]);
        if (old) {
          var d = normalizza(JSON.parse(old));
          if (d) { save(d); return d; }
        }
      }
    } catch (e) {
      console.warn('MGC: dati locali non leggibili, si riparte dai dati demo.', e);
    }
    return null;
  }

  function save(data) {
    if (!data) return Promise.resolve();
    if (data.registro && data.registro.length > MAX_LOG) data.registro = data.registro.slice(0, MAX_LOG);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { console.error('MGC: errore salvataggio locale', e); }
    return Promise.resolve();
  }

  /* Carica i dati o genera i demo al primo avvio */
  function ensure() {
    var d = load();
    if (!d) { d = generaDatiDemo(); save(d); }
    return d;
  }

  function reset() {
    var d = generaDatiDemo();
    save(d);
    return d;
  }

  function addLog(data, tipo, testo, notificaA, fornitoriCoinvolti) {
    data.registro.unshift({
      id: uid('log'), tipo: tipo, testo: testo,
      meta: new Date().toISOString(),
      notifica: notificaA || null,
      fornitori: fornitoriCoinvolti || null
    });
  }

  var Store = {
    KEY: STORAGE_KEY,
    load: load, save: save, ensure: ensure, reset: reset,
    addLog: addLog, generaDatiDemo: generaDatiDemo,
    fornitoreById: function (data, id) {
      return data.fornitori.filter(function (f) { return f.id === id; })[0];
    }
  };

  /* =========================================================
     AUTH — credenziali e routing verso le pagine di livello
     ========================================================= */
  var LIVELLI = {
    0: { u: 'dev',       pw: 'dev0000', nome: 'L0 — Sviluppatore',        page: 'level0.html', attivo: false },
    1: { u: 'direttore', pw: 'dir1111', nome: 'L1 — Gestore / Capo Area', page: 'level1.html', attivo: false },
    2: { u: 'm.rossi',   pw: 'mag2222', nome: 'L2 — Operatore Magazzino', page: 'level2.html', attivo: true  },
    3: { u: 'guardiola', pw: 'grd3333', nome: 'L3 — Guardiola',           page: 'level3.html', attivo: false },
    4: { u: 'forn01',    pw: 'f01pass', nome: 'L4 — Fornitore',           page: 'level4.html', attivo: false }
  };

  /* Verifica le credenziali. Ritorna {ok, livello, username, fornitoreId} */
  function verifica(livello, username, password) {
    var cfg = LIVELLI[livello];
    if (!cfg) return { ok: false, msg: 'Livello di accesso non valido.' };
    if (!cfg.attivo) return { ok: false, msg: 'Livello non ancora disponibile in questa versione.' };

    if (livello === 4) {
      /* il fornitore si autentica con le credenziali della sua anagrafica */
      var data = ensure();
      var f = data.fornitori.filter(function (x) { return x.id === username; })[0];
      if (!f || f.password !== password) return { ok: false, msg: 'Username o password errati.' };
      return { ok: true, livello: 4, username: f.id, fornitoreId: f.id, nome: f.nome };
    }

    if (cfg.u !== username || cfg.pw !== password) return { ok: false, msg: 'Username o password errati.' };
    return { ok: true, livello: livello, username: username, fornitoreId: null, nome: cfg.nome };
  }

  var Auth = { LIVELLI: LIVELLI, verifica: verifica };

  /* =========================================================
     SESSION — sessionStorage, condivisa tra le pagine
     ========================================================= */
  var SESSION_KEY = 'mgc-session';

  var Session = {
    set: function (sess) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess)); } catch (e) { console.error(e); }
    },
    get: function () {
      try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
      catch (e) { return null; }
    },
    clear: function () { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} },

    /* Da chiamare all'avvio di ogni pagina di livello.
       Se la sessione manca o non corrisponde, rimanda al login. */
    require: function (livello) {
      var s = Session.get();
      if (!s || s.livello !== livello) { location.replace('index.html'); return null; }
      return s;
    },

    logout: function () {
      Session.clear();
      location.href = 'index.html';
    },

    /* Apre la pagina del livello autenticato */
    vaiAlLivello: function (sess) {
      var cfg = LIVELLI[sess.livello];
      Session.set(sess);
      location.href = cfg.page;
    }
  };

  /* =========================================================
     EXPORT
     ========================================================= */
  global.MGC = { Utils: Utils, Store: Store, Auth: Auth, Session: Session, VERSION: DATA_VERSION };

})(window);
