/* Einstellungen für eure Installation (diese Datei darf öffentlich auf GitHub liegen).
   Solange "firebase.apiKey" leer ist, läuft die App als Vorschau nur auf diesem Gerät. */
window.CONFIG = {
  haushalt: "hollenbek",
  // Aus der Firebase-Konsole: Projekteinstellungen › Allgemein › Deine Apps › SDK-Konfiguration
  firebase: {
    apiKey: "AIzaSyAOcSITuhaEcv4mgUxo2ukLFsRjNL5RHAU",
    authDomain: "zuhause-zu-zweit.firebaseapp.com",
    projectId: "zuhause-zu-zweit",
    storageBucket: "zuhause-zu-zweit.firebasestorage.app",
    messagingSenderId: "999920438650",
    appId: "1:999920438650:web:fa7c922ccb7da67e245ac3"
  },
  // Wer darf rein: verschlüsselte (SHA-256) Google-Adressen, damit sie nicht öffentlich lesbar sind
  personen: {
    "2709dc5f39bcd32e9cb7a235365a9cd5dedebc64b4d8b936365c27938f3aa8be": "J",
    "b04b2a2c42ea9a8eea080c9df0f008134a9e47ab5e86e2b286d1c3a1b51e1489": "E"
  }
};
