// The interface in Italian, addressing the reader as "tu".

import { readingTime as splitReadingTime } from '../../core/stats'
import type { Messages } from './en'
import { formatters } from './format'

const LOCALE = 'it-IT'
const { count, number, plural } = formatters(LOCALE)

const readingTime = (seconds: number) => {
  const time = splitReadingTime(seconds)
  if (!time) return '< 1 min'
  const { hours, minutes } = time
  if (hours === 0) return `≈ ${minutes} min`
  return minutes === 0 ? `≈ ${hours} h` : `≈ ${hours} h ${minutes} min`
}

/** "Rimanente" agrees with the leading figure: "≈ 1 min rimanente", "≈ 5 min rimanenti". */
const timeLeft = (seconds: number) => {
  const time = splitReadingTime(seconds)
  const one = !time || (time.hours === 0 ? time.minutes === 1 : time.hours === 1 && time.minutes === 0)
  return `${readingTime(seconds)} ${one ? 'rimanente' : 'rimanenti'}`
}

export const it: Messages = {
  locale: LOCALE,

  // Tabs and app-wide
  tabs: { library: 'Libreria', stats: 'Statistiche', settings: 'Impostazioni' },
  sections: 'Sezioni',
  updateReady: 'È pronta una nuova versione di Mono.',
  update: 'Aggiorna',
  ok: 'OK',
  cancel: 'Annulla',
  readingTime,
  timeLeft,
  words: n => count(n, 'parola', 'parole'),

  // Library
  library: 'Libreria',
  add: 'Aggiungi',
  importFileMenu: 'Importa file…',
  importFile: 'Importa file',
  pasteText: 'Incolla testo',
  rename: 'Rinomina',
  startOver: 'Ricomincia',
  delete: 'Elimina',
  more: 'Altro',
  moreActionsFor: title => `Altre azioni per ${title}`,
  searchPlaceholder: 'Titoli e autori',
  sortBy: 'Ordina per',
  sort: { recent: 'Letti di recente', added: 'Aggiunti di recente', title: 'Titolo' },
  noResultsFor: query => `Nessun risultato per “${query}”`,
  noResultsHint: 'Controlla l’ortografia o prova un’altra ricerca.',
  importing: 'Importazione…',
  importingPage: (done, total) => `Importazione · Pagina ${done} di ${total}`,
  dropToImport: 'Rilascia i file per importarli',
  wordsToday: n => `${count(n, 'parola', 'parole')} oggi`,
  dayStreak: n => count(n, 'giorno di fila', 'giorni di fila'),
  resumeReading: title => `Riprendi la lettura di ${title}`,
  continueReading: 'Continua a leggere',
  finished: 'Finito',
  deleted: title => `“${title}” eliminato`,
  undo: 'Annulla',
  emptyTitle: 'Una parola alla volta',
  emptyMessage: 'Importa un file di testo, PDF o EPUB, o incolla un testo, per leggere veloce con il metodo RSVP.',
  newText: 'Nuovo testo',
  titleOptional: 'Titolo (facoltativo)',
  textPlaceholder: 'Incolla o scrivi un testo…',
  paste: 'Incolla',
  save: 'Salva',
  title: 'Titolo',
  untitled: 'Senza titolo',

  // Statistics
  statistics: 'Statistiche',
  today: 'Oggi',
  streak: 'Serie',
  total: 'Totale',
  averageSpeed: 'Velocità media',
  wordsUnit: n => plural(n, 'parola', 'parole'),
  daysUnit: n => plural(n, 'giorno', 'giorni'),
  wpm: 'WPM',
  lastSevenDays: 'Ultimi 7 giorni',
  lastSevenDaysLabel: 'Parole lette negli ultimi 7 giorni',
  statsEmpty: 'Qui compariranno le tue sessioni di lettura.',

  // Settings
  settings: 'Impostazioni',
  appearance: 'Aspetto',
  appearances: { system: 'Automatico', light: 'Chiaro', dark: 'Scuro' },
  appearanceFootnote: 'Automatico segue il dispositivo. La lettura usa lo stesso tema.',
  language: 'Lingua',
  automatic: 'Automatica',
  languageFootnote: 'Automatica segue la lingua del dispositivo.',
  textSize: 'Dimensione testo',
  textSizeOnSide: 'Dimensione testo in orizzontale',
  points: n => `${n} pt`,
  previewWord: 'comprensione',
  textSizeFootnote:
    'Ogni parola compare alla stessa dimensione, fino a quando le parole brevi riempiono lo schermo. Le parole troppo lunghe per la dimensione scelta compaiono un gruppo di sillabe alla volta. Sul telefono la dimensione resta separata in verticale e in orizzontale, dove c’è spazio per parole più grandi.',
  focusLetter: 'Lettera focale',
  highlights: { red: 'Rossa', subtle: 'Tenue', none: 'Nessuna' },
  focusLetterFootnote:
    'La lettera su cui si posano gli occhi resta al centro del mirino. Scegli quanto deve risaltare rispetto al resto della parola.',
  font: 'Carattere',
  bold: 'Grassetto',
  reading: 'Lettura',
  speed: 'Velocità',
  slower: 'Più lento',
  faster: 'Più veloce',
  gradualStart: 'Partenza graduale',
  gradualStartFootnote: 'Dopo ogni pausa le prime parole scorrono più lente, così riprendi il filo.',
  tickSound: 'Ticchettio',
  tickSoundFootnote:
    'Un leggero tic a ogni parola. Suona più basso prima di una virgola, ancora più basso a fine frase e al minimo prima di un titolo, così senti il ritmo del testo.',
  resumeBack: 'Riprendi qualche parola prima',
  holdToRead: 'Tieni premuto per leggere',
  readingGestures: 'Gesti di lettura',
  resumeFootnote:
    'Dopo una pausa di più di un secondo o due, la lettura riparte fino a quattro parole prima, mai prima dell’inizio della frase. Tenendo premuto, le parole scorrono solo mentre il dito è sullo schermo (o mentre tieni premuta la barra spaziatrice).',
  keepTextVisible: 'Mostra sempre il testo',
  keepTextFootnote:
    'Mostra il testo sotto la parola anche durante la lettura, seguendola. Puoi scorrerlo liberamente per guardare avanti o saltare a un altro paragrafo o capitolo.',
  exportBackup: 'Esporta backup',
  restoreBackup: 'Ripristina backup…',
  backupFootnote:
    'I tuoi testi, i progressi e le statistiche restano solo in questo browser. Esporta un backup per tenerli al sicuro o spostarli su un altro dispositivo; il ripristino aggiunge quello che manca e tiene i progressi più recenti.',
  backupFileName: date => `Backup Mono ${date}.json`,
  backupRestored: 'Backup ripristinato',
  alreadyUpToDate: 'La tua libreria era già aggiornata.',
  textsRestored: n =>
    plural(n, `${number(n)} testo aggiunto o aggiornato.`, `${number(n)} testi aggiunti o aggiornati.`),
  app: 'App',
  installed: 'Mono è installata',
  installMono: 'Installa Mono',
  installedFootnote:
    'Stai usando l’app installata: si apre a schermo intero, funziona offline e protegge la libreria dalla pulizia automatica.',
  installFootnote:
    'Installata, Mono si apre a schermo intero, funziona offline e protegge la libreria dalla pulizia automatica.',
  installFootnoteFiles:
    'Installata, Mono si apre a schermo intero, funziona offline, protegge la libreria dalla pulizia automatica e può aprire e ricevere file da altre app.',

  // Installing
  installInvite: computer => `Aggiungi Mono ${computer ? 'al computer' : 'alla schermata Home'} per leggere al meglio.`,
  installBenefits: {
    fullScreen: 'Si apre a schermo intero, come qualsiasi altra app',
    offline: 'Funziona offline, con la libreria sempre a portata di mano',
    safe: 'I tuoi testi sono al sicuro dalla pulizia automatica del browser',
  },
  installSteps: {
    ios: 'In Safari, tocca Condividi, poi “Aggiungi alla schermata Home”.',
    android: 'Apri il menu del browser (⋮) e scegli “Installa app” o “Aggiungi alla schermata Home”.',
    other: 'Usa il pulsante di installazione nella barra degli indirizzi, o “Installa Mono” nel menu del browser.',
  },
  done: 'Fine',
  installApp: 'Installa app',
  continueInBrowser: 'Continua nel browser',
  installLater: 'Puoi installare Mono quando vuoi da Impostazioni.',

  // Gestures
  gestures: {
    hold: 'Tieni premuto',
    holdDetail: 'Le parole scorrono mentre il dito è sullo schermo; sollevalo per mettere in pausa.',
    tap: 'Tocca',
    tapDetail: 'Avvia o metti in pausa. In pausa compaiono tutto il testo e i comandi.',
    swipeH: 'Scorri a sinistra o a destra',
    swipeHDetail: 'Frase, paragrafo o capitolo successivo o precedente.',
    swipeV: 'Scorri in su o in giù',
    swipeVDetail: 'Più veloce o più lento, 25 parole al minuto alla volta.',
    pinch: 'Pizzica',
    pinchDetail: 'Ingrandisci o rimpicciolisci le parole.',
    word: 'Tocca una parola nel testo',
    wordDetail: 'Continua a leggere da lì.',
  },
  gesturesFootnote:
    'Dopo una pausa, la lettura riparte qualche parola prima così non perdi il filo. In Impostazioni puoi cambiare questa opzione e passare alla lettura tenendo premuto.',
  gotIt: 'Ho capito',

  // Reader
  units: { sentence: 'Frase', paragraph: 'Paragrafo', chapter: 'Capitolo' },
  nextUnit: { sentence: 'Frase successiva', paragraph: 'Paragrafo successivo', chapter: 'Capitolo successivo' },
  previousUnit: { sentence: 'Frase precedente', paragraph: 'Paragrafo precedente', chapter: 'Capitolo precedente' },
  position: 'Posizione',
  skipBy: 'Salta per',
  chapters: 'Capitoli',
  close: 'Chiudi',
  play: 'Avvia',
  text: 'Testo',
  keepTextBeside: 'Tieni il testo accanto alla parola',
  emptyText: 'Testo vuoto',
  readingSpeed: 'Velocità di lettura',
  rotateHint: 'Ruota il telefono per parole più grandi',

  // Errors
  libraryUnavailable: 'Libreria non disponibile',
  libraryNotOpened: reason => `Non è stato possibile aprire la libreria: ${reason}`,
  nothingToRead: 'Niente da leggere',
  noWebPages:
    'Mono non può ancora scaricare pagine web. Condividi il testo dell’articolo, oppure salva la pagina e importa il file.',
  importFailed: 'Importazione non riuscita',
  restoreFailed: 'Ripristino non riuscito',
  notSaved: 'Non salvato',
  libraryNotSaved: reason => `Non è stato possibile salvare la libreria: ${reason}`,
  importProblems: {
    empty: 'Non è stato trovato testo leggibile.',
    unreadable: 'Non è stato possibile leggere il file.',
    invalidEPUB: 'Questo file EPUB è danneggiato o usa un formato non supportato.',
    worker: 'L’importazione si è interrotta.',
  },
  backupProblems: {
    notBackup: 'Questo file non è un backup di Mono.',
    newer: 'Questo backup è stato creato da una versione più recente di Mono. Aggiorna l’app e riprova.',
  },
}
