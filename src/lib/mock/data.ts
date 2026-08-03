import type {
  Deck,
  Flashcard,
  PrereqGraph,
  ReviewUnit,
  Settings,
  Subscription,
} from "@/lib/shared/contracts";

const now = Date.now();
const day = 86_400_000;
const hour = 3_600_000;

export const seedDecks: Deck[] = [
  {
    id: "d-orgchem",
    name: "Organic chemistry",
    description: "Mechanisms, nomenclature, and the rules that keep it honest.",
    cardCount: 42,
    dueCount: 5,
    newCount: 8,
  },
  {
    id: "d-cannabis",
    name: "Cannabis law & patient rights",
    description: "Jurisdiction by jurisdiction, the client comes first.",
    cardCount: 18,
    dueCount: 3,
    newCount: 2,
  },
  {
    id: "d-cardio",
    name: "Cardiovascular physiology",
    description: "Pressures, curves, and the baroreceptor loop.",
    cardCount: 57,
    dueCount: 9,
    newCount: 12,
  },
  {
    id: "d-spanish",
    name: "Spanish verbs",
    description: "Conjugations for the tenses I actually use.",
    cardCount: 33,
    dueCount: 4,
    newCount: 0,
  },
  {
    id: "d-anatomy",
    name: "Anatomy: thorax",
    description: "Heart, great vessels, and the mediastinum.",
    cardCount: 26,
    dueCount: 6,
    newCount: 5,
  },
];

const orgchemCards: Flashcard[] = [
  {
    id: "f-oc-1",
    deckId: "d-orgchem",
    content: { type: "basic", front: "What is a functional group?", back: "A specific group of atoms within a molecule that gives the molecule its characteristic reactivity." },
    tags: ["fundamentals"],
    state: "review",
    dueAt: now - 2 * hour,
    createdAt: now - 40 * day,
  },
  {
    id: "f-oc-2",
    deckId: "d-orgchem",
    content: { type: "basic", front: "Name the five functional groups that most often appear in mechanisms.", back: "Alkene, alcohol, carbonyl, amine, and halogen (alkyl halide)." },
    tags: ["fundamentals"],
    state: "review",
    dueAt: now - 5 * hour,
    createdAt: now - 38 * day,
  },
  {
    id: "f-oc-3",
    deckId: "d-orgchem",
    content: { type: "cloze", text: "A {{c1::carbonyl}} is a carbon double-bonded to an oxygen." },
    tags: ["carbonyl"],
    state: "review",
    dueAt: now - 1 * hour,
    createdAt: now - 30 * day,
  },
  {
    id: "f-oc-4",
    deckId: "d-orgchem",
    content: { type: "basic", front: "What does SN2 stand for?", back: "Substitution, nucleophilic, bimolecular — a single concerted step." },
    tags: ["mechanisms"],
    state: "review",
    dueAt: now - 30 * 60_000,
    createdAt: now - 25 * day,
  },
  {
    id: "f-oc-5",
    deckId: "d-orgchem",
    content: { type: "cloze", text: "In SN2, the nucleophile attacks {{c1::backside}} of the leaving group, inverting stereochemistry." },
    tags: ["mechanisms"],
    state: "review",
    dueAt: now - 4 * hour,
    createdAt: now - 24 * day,
  },
  {
    id: "f-oc-6",
    deckId: "d-orgchem",
    content: { type: "basic", front: "Which substrates react fastest in SN2?", back: "Methyl > primary > secondary. Tertiary barely reacts — steric hindrance blocks the backside attack." },
    tags: ["mechanisms"],
    state: "learning",
    dueAt: now - 15 * 60_000,
    createdAt: now - 3 * day,
  },
  {
    id: "f-oc-7",
    deckId: "d-orgchem",
    content: { type: "basic", front: "What is a carbocation?", back: "A carbon bearing a positive charge and an empty p orbital — a key intermediate in SN1 and E1." },
    tags: ["mechanisms"],
    state: "new",
    dueAt: null,
    createdAt: now - 2 * day,
  },
  {
    id: "f-oc-8",
    deckId: "d-orgchem",
    content: { type: "cloze", text: "Carbocation stability follows {{c1::tertiary}} > secondary > primary > methyl." },
    tags: ["mechanisms"],
    state: "new",
    dueAt: null,
    createdAt: now - 2 * day,
  },
  {
    id: "f-oc-9",
    deckId: "d-orgchem",
    content: { type: "basic", front: "What is Markovnikov's rule?", back: "In an addition to an alkene, the hydrogen attaches to the carbon with the most hydrogens already." },
    tags: ["alkenes"],
    state: "new",
    dueAt: null,
    createdAt: now - 1 * day,
  },
  {
    id: "f-oc-10",
    deckId: "d-orgchem",
    content: { type: "basic", front: "Name the two products of a Markovnikov hydration of an alkene.", back: "An alcohol (from water addition) plus a proton; regiochemistry follows the more substituted carbon." },
    tags: ["alkenes"],
    state: "suspended",
    dueAt: null,
    createdAt: now - 20 * day,
  },
];

const cannabisCards: Flashcard[] = [
  {
    id: "f-ca-1",
    deckId: "d-cannabis",
    content: { type: "basic", front: "Which state permits adult-use cannabis but has not legalized home cultivation?", back: "Illinois — sales are legal; cultivation licenses are still tightly restricted." },
    tags: ["state-by-state"],
    state: "review",
    dueAt: now - 3 * hour,
    createdAt: now - 60 * day,
  },
  {
    id: "f-ca-2",
    deckId: "d-cannabis",
    content: { type: "cloze", text: "A {{c1::caregiver}} may cultivate for up to five patients in Michigan's medical program." },
    tags: ["state-by-state"],
    state: "review",
    dueAt: now - 20 * 60_000,
    createdAt: now - 45 * day,
  },
  {
    id: "f-ca-3",
    deckId: "d-cannabis",
    content: { type: "basic", front: "What does HIPAA have to do with cannabis programs?", back: "Patient registry records are PHI; disclosure to employers or law enforcement without consent is a violation." },
    tags: ["privacy"],
    state: "review",
    dueAt: now - 6 * hour,
    createdAt: now - 40 * day,
  },
  {
    id: "f-ca-4",
    deckId: "d-cannabis",
    content: { type: "basic", front: "What is the difference between a delivery license and a dispensary license?", back: "A delivery license allows transport to the patient's home; a dispensary license permits retail storefront sales." },
    tags: ["licensing"],
    state: "new",
    dueAt: null,
    createdAt: now - 4 * day,
  },
  {
    id: "f-ca-5",
    deckId: "d-cannabis",
    content: { type: "cloze", text: "Employers may still enforce {{c1::zero-tolerance}} policies even in adult-use states." },
    tags: ["employment"],
    state: "new",
    dueAt: null,
    createdAt: now - 2 * day,
  },
];

const cardioCards: Flashcard[] = [
  {
    id: "f-cd-1",
    deckId: "d-cardio",
    content: { type: "basic", front: "What is stroke volume?", back: "The volume of blood ejected by one ventricle per beat — typically 60–100 mL." },
    tags: ["hemodynamics"],
    state: "review",
    dueAt: now - 1 * hour,
    createdAt: now - 90 * day,
  },
  {
    id: "f-cd-2",
    deckId: "d-cardio",
    content: { type: "cloze", text: "Cardiac output equals {{c1::stroke volume}} times {{c2::heart rate}}." },
    tags: ["hemodynamics"],
    state: "review",
    dueAt: now - 40 * 60_000,
    createdAt: now - 88 * day,
  },
  {
    id: "f-cd-3",
    deckId: "d-cardio",
    content: { type: "basic", front: "Where are the baroreceptors located?", back: "The carotid sinus and the aortic arch." },
    tags: ["reflexes"],
    state: "review",
    dueAt: now - 2 * hour,
    createdAt: now - 70 * day,
  },
  {
    id: "f-cd-4",
    deckId: "d-cardio",
    content: { type: "basic", front: "What happens to heart rate when blood pressure falls?", back: "Baroreceptors fire less; the medulla withdraws vagal tone and increases sympathetic drive — heart rate rises." },
    tags: ["reflexes"],
    state: "learning",
    dueAt: now - 25 * 60_000,
    createdAt: now - 6 * day,
  },
  {
    id: "f-cd-5",
    deckId: "d-cardio",
    content: { type: "basic", front: "What is the Frank–Starling law?", back: "The more the ventricle is filled in diastole, the more forcefully it contracts — up to a limit." },
    tags: ["mechanics"],
    state: "new",
    dueAt: null,
    createdAt: now - 3 * day,
  },
  {
    id: "f-cd-6",
    deckId: "d-cardio",
    content: { type: "cloze", text: "End-diastolic volume stretches the {{c1::sarcomeres}}, which raises contractile force." },
    tags: ["mechanics"],
    state: "new",
    dueAt: null,
    createdAt: now - 3 * day,
  },
  {
    id: "f-cd-7",
    deckId: "d-cardio",
    content: { type: "basic", front: "Which valve sits between the left atrium and left ventricle?", back: "The mitral (bicuspid) valve." },
    tags: ["anatomy"],
    state: "review",
    dueAt: now - 8 * hour,
    createdAt: now - 55 * day,
  },
  {
    id: "f-cd-8",
    deckId: "d-cardio",
    content: { type: "basic", front: "What sound does S1 correspond to?", back: "Closure of the atrioventricular valves at the start of systole." },
    tags: ["auscultation"],
    state: "relearning",
    dueAt: now - 10 * 60_000,
    createdAt: now - 30 * day,
  },
];

const spanishCards: Flashcard[] = [
  {
    id: "f-es-1",
    deckId: "d-spanish",
    content: { type: "basic", front: "ir (present, yo)", back: "voy" },
    tags: ["irregulars"],
    state: "review",
    dueAt: now - 5 * hour,
    createdAt: now - 120 * day,
  },
  {
    id: "f-es-2",
    deckId: "d-spanish",
    content: { type: "basic", front: "haber (present, yo)", back: "he" },
    tags: ["irregulars"],
    state: "review",
    dueAt: now - 1 * hour,
    createdAt: now - 118 * day,
  },
  {
    id: "f-es-3",
    deckId: "d-spanish",
    content: { type: "cloze", text: "Ojalá {{c1::estuviera}} aquí (imperfect subjunctive of estar)." },
    tags: ["subjunctive"],
    state: "review",
    dueAt: now - 90 * 60_000,
    createdAt: now - 60 * day,
  },
  {
    id: "f-es-4",
    deckId: "d-spanish",
    content: { type: "basic", front: "traer (preterite, yo)", back: "traje" },
    tags: ["irregulars"],
    state: "review",
    dueAt: now - 3 * hour,
    createdAt: now - 75 * day,
  },
  {
    id: "f-es-5",
    deckId: "d-spanish",
    content: { type: "basic", front: "What does 'llevar' + gerund express?", back: "An ongoing action since a point in the past: 'llevo dos horas estudiando'." },
    tags: ["grammar"],
    state: "review",
    dueAt: now - 6 * hour,
    createdAt: now - 40 * day,
  },
];

const anatomyCards: Flashcard[] = [
  {
    id: "f-an-1",
    deckId: "d-anatomy",
    content: { type: "image-occlusion", imageRef: "/mock/thorax.svg", occlusions: [{ id: "R1", label: "Right atrium" }, { id: "R2", label: "Left atrium" }, { id: "R3", label: "Right ventricle" }, { id: "R4", label: "Left ventricle" }, { id: "R5", label: "Interventricular septum" }, { id: "R6", label: "Apex" }] },
    tags: ["heart"],
    state: "review",
    dueAt: now - 2 * hour,
    createdAt: now - 50 * day,
  },
  {
    id: "f-an-2",
    deckId: "d-anatomy",
    content: { type: "basic", front: "What structures lie in the superior mediastinum?", back: "Aorta, superior vena cava, trachea, esophagus, thymus, and the phrenic and vagus nerves." },
    tags: ["mediastinum"],
    state: "review",
    dueAt: now - 4 * hour,
    createdAt: now - 45 * day,
  },
  {
    id: "f-an-3",
    deckId: "d-anatomy",
    content: { type: "basic", front: "Which nerve runs with the pericardiacophrenic vessels?", back: "The phrenic nerve." },
    tags: ["mediastinum"],
    state: "review",
    dueAt: now - 30 * 60_000,
    createdAt: now - 40 * day,
  },
  {
    id: "f-an-4",
    deckId: "d-anatomy",
    content: { type: "cloze", text: "The {{c1::azygos}} vein drains the posterior intercostal veins into the SVC." },
    tags: ["vessels"],
    state: "learning",
    dueAt: now - 12 * 60_000,
    createdAt: now - 10 * day,
  },
  {
    id: "f-an-5",
    deckId: "d-anatomy",
    content: { type: "basic", front: "What is the ligamentum arteriosum?", back: "The remnant of the ductus arteriosus, running from the pulmonary trunk to the aorta." },
    tags: ["vessels"],
    state: "new",
    dueAt: null,
    createdAt: now - 2 * day,
  },
];

export const seedGraph: PrereqGraph = {
  nodes: [
    { id: "f-oc-1", label: "Functional groups", state: "secured" },
    { id: "f-oc-2", label: "Five key groups", state: "secured" },
    { id: "f-oc-3", label: "Carbonyl", state: "secured" },
    { id: "f-oc-4", label: "SN2", state: "secured" },
    { id: "f-oc-5", label: "SN2 backside attack", state: "secured" },
    { id: "f-oc-6", label: "SN2 substrate speed", state: "ready" },
    { id: "f-oc-7", label: "Carbocation", state: "ready" },
    { id: "f-oc-8", label: "Carbocation stability", state: "locked" },
    { id: "f-oc-9", label: "Markovnikov's rule", state: "locked" },
  ],
  edges: [
    { id: "e-1", prereqId: "f-oc-1", dependentId: "f-oc-2" },
    { id: "e-2", prereqId: "f-oc-1", dependentId: "f-oc-3" },
    { id: "e-3", prereqId: "f-oc-2", dependentId: "f-oc-4" },
    { id: "e-4", prereqId: "f-oc-3", dependentId: "f-oc-4" },
    { id: "e-5", prereqId: "f-oc-4", dependentId: "f-oc-5" },
    { id: "e-6", prereqId: "f-oc-4", dependentId: "f-oc-6" },
    { id: "e-7", prereqId: "f-oc-4", dependentId: "f-oc-7" },
    { id: "e-8", prereqId: "f-oc-7", dependentId: "f-oc-8" },
    { id: "e-9", prereqId: "f-oc-7", dependentId: "f-oc-9" },
  ],
};

export const seedSettings: Settings = {
  theme: "system",
  reviewQueueLimit: 20,
  newCardsPerDay: 10,
  keybindings: [],
};

export const seedSubscription: Subscription = {
  plan: "free",
  status: "none",
  aiAllowanceUsed: 2,
  aiAllowanceMonthly: 50,
  currentPeriodEnd: null,
};

export function buildReviewUnits(
  deckId: string | null,
  limit = 20,
): ReviewUnit[] {
  const cards = deckId
    ? allCards.filter((c) => c.deckId === deckId && c.state !== "suspended")
    : allCards.filter((c) => c.state !== "suspended");
  const due = cards
    .filter((c) => c.state === "review" || c.state === "relearning" || c.state === "learning")
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  return due.slice(0, limit).map((c) => ({
    id: `u-${c.id}`,
    flashcardId: c.id,
    deckId: c.deckId,
    deckName: seedDecks.find((d) => d.id === c.deckId)?.name ?? "Deck",
    content: c.content,
    state: c.state,
  }));
}

export const allCards: Flashcard[] = [
  ...orgchemCards,
  ...cannabisCards,
  ...cardioCards,
  ...spanishCards,
  ...anatomyCards,
];
