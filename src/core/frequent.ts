// The most frequent words of Italian and English: articles, prepositions,
// pronouns, conjunctions and the commonest verbs. Readers recognise them
// almost without looking (the word-frequency effect), so they get less
// time and the difficult words get more.

const ITALIAN = `il lo la i gli le un uno una di a da in con su per tra fra del dello della dei degli delle
al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle col sul sullo sulla
sui sugli sulle e ed o od ma se che chi cui non né anche come più già poi però quando dove mentre perché
quindi così solo ancora sempre mai molto poco tutto tutti tutta tutte ogni io tu lui lei noi voi loro mi ti
si ci vi ne me te sé suo sua suoi sue mio mia miei mie tuo tua nostro nostra questo questa questi queste
quello quella quelli quelle è era sono sei siamo siete fu essere ho hai ha abbiamo avete hanno aveva avere
fare fa detto dice disse qui lì là sì no bene ora oggi dopo prima senza sotto sopra verso fino`

const ENGLISH = `the a an of to in on at by for with from into onto over under about as and or but nor so
yet if then than that this these those there here it its it's he him his she her hers we us our you your
they them their i me my mine is am are was were be been being have has had do does did not no yes all any
some each every more most much many such only also just very too what which who whom whose when where why
how can could will would shall should may might must said says one two up out off down now well`

export const FREQUENT_WORDS = new Set([...ITALIAN.split(/\s+/), ...ENGLISH.split(/\s+/)].filter(Boolean))

/** "Della," → "della": the word as looked up in FREQUENT_WORDS. */
export const bareWord = (text: string) => text.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '')

export const isFrequent = (text: string) => FREQUENT_WORDS.has(bareWord(text))
