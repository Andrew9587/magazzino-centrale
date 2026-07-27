# Magazzino Centrale — v2.0.0 (architettura a file separati)

Ripartenza dal **L2 funzionante**, spacchettato in file separati come da Opzione A
del documento di sviluppo. Nessun layer sovrapposto, nessun ID duplicato.

## Struttura

```
index.html            Login + routing (unico punto di ingresso)
level2.html           L2 — Operatore Magazzino  ✅ funzionante
assets/
  mgc-core.js         Libreria condivisa: Utils, Store, Auth, Session
  mgc-theme.css       Variabili colore, reset, stili del login  (comune a tutti)
  level2.css          Stili specifici del L2 (estratti 1:1 dall'originale)
  level2.js           Logica del L2 (estratta 1:1, IIFE)
```

Il L2 è **identico** all'originale: CSS e JS sono stati estratti senza ritocchi.
Le uniche modifiche sono il punto di avvio (`init()` al posto di `window._mgcI2`)
e il logout (`MGC.Session.logout()`).

## Come funziona il login

1. `index.html` verifica le credenziali con `MGC.Auth.verifica(livello, user, pass)`
2. salva la sessione in `sessionStorage` (`mgc-session`)
3. fa `location.href = 'level2.html'`
4. `level2.js` all'avvio chiama `MGC.Session.require(2)`: se la sessione manca o è
   di un altro livello, rimanda subito a `index.html`

Il logout azzera la sessione e torna al login.

## Dati

Una sola chiave localStorage: **`mgc-data-v2`** (prima erano `mgc-l2-v1` +
`mgc-app-v1`, disallineate). Al primo avvio i vecchi dati vengono migrati
automaticamente; se non ce ne sono, `MGC.Store.ensure()` genera i dati demo.

I fornitori demo ora hanno ID stabili `forn01…forn25` e password `f01pass…f25pass`,
così il L4 potrà autenticarsi senza altre modifiche.

## API del core

```javascript
MGC.Utils     // pad, toDateStr, fmtDateLong, timeToMin, addMinutes, uid,
              // escapeHtml, generaSlotsGiorno, durataAppuntamento,
              // slotEffettivamenteLibero, FASCE, TIPO_LABEL …

MGC.Store.ensure()            // carica i dati o genera i demo
MGC.Store.save(DATA)
MGC.Store.reset()             // rigenera i dati demo
MGC.Store.addLog(DATA, tipo, testo, notifica, fornitori)
MGC.Store.fornitoreById(DATA, id)

MGC.Auth.LIVELLI              // credenziali + pagina + flag "attivo"
MGC.Auth.verifica(liv, u, pw)

MGC.Session.require(liv)      // guardia da mettere all'avvio di ogni pagina
MGC.Session.get() / .logout()
```

## Aggiungere un livello (L0, L1, L3, L4)

1. crea `levelN.html` sullo stesso schema di `level2.html`:

```html
<link rel="stylesheet" href="assets/mgc-theme.css">
<link rel="stylesheet" href="assets/levelN.css">
...markup...
<script src="assets/mgc-core.js"></script>
<script src="assets/levelN.js"></script>
```

2. in `assets/levelN.js`:

```javascript
(function(){
  'use strict';
  var U = MGC.Utils;
  var sess = MGC.Session.require(N);
  if (!sess) return;
  var DATA = MGC.Store.ensure();
  // …render…
})();
```

3. in `assets/mgc-core.js` metti `attivo: true` per quel livello dentro `LIVELLI`.
   Finché resta `false`, nel login appare come *(in arrivo)* e non è selezionabile.

Gli ID nel markup non hanno più bisogno di prefissi (`l1-`, `l3-`…): ogni pagina è
un documento a sé.

## Test locale

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Non aprire i file con `file://`: i moduli e i percorsi relativi funzionano solo
via server (GitHub Pages va benissimo).

## Credenziali

| Livello | Utente | Password | Stato |
|---------|--------|----------|-------|
| L0 | `dev` | `dev0000` | da migrare |
| L1 | `direttore` | `dir1111` | da migrare |
| **L2** | **`m.rossi`** | **`mag2222`** | **attivo** |
| L3 | `guardiola` | `grd3333` | da migrare |
| L4 | `forn01`…`forn25` | `f01pass`…`f25pass` | da migrare |

Password di conferma operazioni dentro il L2: `2580`.
