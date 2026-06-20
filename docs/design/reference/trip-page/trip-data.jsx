// Caravan — trip-page mock data. One trip ("Lisbon → Porto, together"),
// shared by the itinerary, decisions, expenses, members and feed surfaces.

const GROUP = [
  { name: 'Sam',   role: 'owner',  online: true  },
  { name: 'Priya', role: 'editor', online: true  },
  { name: 'Theo',  role: 'editor', online: true  },
  { name: 'Mara',  role: 'editor', online: false },
  { name: 'Nadia', role: 'editor', online: true  },
  { name: 'Wei',   role: 'viewer', online: false },
];

const TRIP = {
  name: 'Lisbon → Porto, together',
  where: 'Portugal',
  dates: 'Jun 12 – 20',
  budget: 2400,
};

// 9-day trip. `today` is index 2 (Sat 14). Empty days carry no acts —
// the timeline renders them as a thin one-line row, not a big box.
const TODAY = 2;

const DAYS = [
  {
    wd: 'Thu', dn: 12, heading: 'Arrival', sub: 'Lisbon',
    acts: [
      { time: '15:40', title: 'Land at LIS', category: 'transport', place: 'TAP 1366 from London', voters: [] },
      { time: '17:30', title: 'Check in: Casa do Castelo', category: 'lodging', place: 'Alfama · code in the feed', voters: [] },
      { time: '20:00', title: 'First-night petiscos', category: 'food', place: 'Somewhere walkable — keep it easy', voters: ['Sam', 'Mara'] },
    ],
    pins: [{ top: 64, left: 56 }, { top: 36, left: 70 }, { top: 44, left: 62 }],
    unplotted: [],
  },
  {
    wd: 'Fri', dn: 13, heading: 'Belém & Alfama', sub: 'Lisbon',
    acts: [
      { time: '9:00', title: 'Pastéis de Belém', category: 'food', place: 'R. de Belém 84', note: '"get the box of six" — Priya', voters: ['Sam', 'Priya', 'Mara'], stamp: 'Must' },
      { time: '11:30', title: 'Tram 28 to Alfama', category: 'transport', place: 'Martim Moniz → Graça', note: 'sit on the right' },
      { time: '18:30', title: 'Miradouro de Santa Catarina', category: 'sight', place: 'Sunset spot — bring the wine', voters: ['Theo', 'Mara'] },
    ],
    pins: [{ top: 78, left: 14 }, { top: 42, left: 52 }, { top: 18, left: 72 }],
    unplotted: ['Lunch — somewhere in Alfama'],
  },
  {
    wd: 'Sat', dn: 14, heading: 'Sintra', sub: 'Day trip',
    acts: [
      { time: '9:15', title: 'Train to Sintra', category: 'transport', place: 'Rossio station · €4.90 return' },
      { time: '11:00', title: 'Pena Palace', category: 'sight', place: 'Tickets booked — 11:30 entry', voters: ['Sam', 'Priya', 'Theo', 'Mara'], stamp: 'Booked' },
      { time: '14:30', title: 'Travesseiros at Piriquita', category: 'food', place: 'Old town · Priya says trust her again', voters: ['Priya'] },
    ],
    pins: [{ top: 80, left: 30 }, { top: 30, left: 44 }, { top: 52, left: 60 }],
    unplotted: [],
  },
  { wd: 'Sun', dn: 15, heading: '', sub: '', acts: [], pins: [], unplotted: [] },
  {
    wd: 'Mon', dn: 16, heading: 'LX & the river', sub: 'Lisbon',
    acts: [
      { time: '11:00', title: 'LX Factory', category: 'sight', place: 'Under the bridge · the bookshop + brunch', voters: ['Nadia', 'Theo'] },
      { time: '20:00', title: 'Time Out Market', category: 'food', place: 'Cais do Sodré · everyone picks a stall', voters: ['Sam', 'Priya', 'Nadia'] },
    ],
    pins: [{ top: 58, left: 30 }, { top: 66, left: 48 }],
    unplotted: ['Fado night?'],
  },
  {
    wd: 'Tue', dn: 17, heading: 'North to Porto', sub: 'Travel day',
    acts: [
      { time: '10:05', title: 'Alfa Pendular to Porto', category: 'transport', place: 'Oriente → Campanhã · 2h55', voters: [], stamp: 'Booked' },
      { time: '15:00', title: 'Check in: Ribeira flat', category: 'lodging', place: 'Right on the river', voters: [] },
    ],
    pins: [{ top: 40, left: 50 }, { top: 50, left: 58 }],
    unplotted: [],
  },
  { wd: 'Wed', dn: 18, heading: '', sub: '', acts: [], pins: [], unplotted: [] },
  {
    wd: 'Thu', dn: 19, heading: 'Douro day', sub: 'Porto',
    acts: [
      { time: '10:30', title: 'Livraria Lello', category: 'sight', place: 'Book the early slot — it gets packed', voters: ['Mara'] },
      { time: '16:00', title: 'Port tasting in Gaia', category: 'food', place: 'Across the bridge · three cellars', voters: ['Sam', 'Theo', 'Nadia'], stamp: 'Must' },
    ],
    pins: [{ top: 36, left: 44 }, { top: 60, left: 56 }],
    unplotted: [],
  },
  {
    wd: 'Fri', dn: 20, heading: 'Home', sub: 'Departure',
    acts: [
      { time: '13:20', title: 'Fly home from OPO', category: 'transport', place: 'TAP 1369 · leave by 11:00', voters: [] },
    ],
    pins: [{ top: 30, left: 64 }],
    unplotted: [],
  },
];

const IDEAS = [
  { label: 'Fado night', votes: 4, voted: true, tone: 'accent' },
  { label: 'Day trip to Cascais', votes: 3, voted: true, tone: 'info' },
  { label: 'Surf lesson — Caparica', votes: 2, voted: false, tone: 'plain' },
  { label: 'Oceanário', votes: 1, voted: false, tone: 'plain' },
];

const POLLS = [
  {
    question: 'Where should we eat on Sat night?',
    options: [
      { label: 'Cervejaria Ramiro — seafood', voters: ['Sam', 'Priya', 'Nadia'] },
      { label: 'A Cevicheria — small plates', voters: ['Theo'] },
      { label: 'Cook at the flat', voters: ['Mara'] },
    ],
    note: 'Wei hasn’t voted · closes tonight',
    open: true,
  },
  {
    question: 'Rent a car for the Douro?',
    options: [
      { label: 'Yes — more freedom', voters: ['Sam', 'Theo', 'Mara', 'Nadia'] },
      { label: 'No — train + tour', voters: ['Priya'] },
    ],
    note: 'Closed · winner became a trip activity',
    open: false,
  },
];

const POLL_COMMENTS = [
  { author: 'Priya', time: '3h', text: 'Ramiro has a wait but it moves fast — worth it for the tiger prawns.' },
  { author: 'Theo', time: '2h', text: 'Either works for me, just not another petiscos night 😅', indent: true },
  { author: 'Scout', time: '1h', ai: true, text: 'Both are a 12-min walk from the flat. Ramiro takes no bookings; A Cevicheria does — want me to hold a table for 6?' },
];

// Expenses — single currency (€). Splits are equal unless noted.
const EXPENSES = [
  { title: 'Casa do Castelo — 3 nights', cat: 'lodging', amount: 640, payer: 'Sam', who: 'Split 6 ways', day: 'Thu 12' },
  { title: 'Ribeira flat — 2 nights', cat: 'lodging', amount: 410, payer: 'Nadia', who: 'Split 6 ways', day: 'Tue 17' },
  { title: 'Alfa Pendular tickets', cat: 'transport', amount: 174, payer: 'Priya', who: 'Split 6 ways', day: 'Tue 17' },
  { title: 'First-night petiscos', cat: 'food', amount: 96, payer: 'Mara', who: 'Split 5 — Wei was out', day: 'Thu 12' },
  { title: 'Sintra train + tickets', cat: 'transport', amount: 88, payer: 'Theo', who: 'Split 6 ways', day: 'Sat 14' },
  { title: 'Pastéis (the box of six)', cat: 'food', amount: 9, payer: 'Priya', who: 'On Priya', day: 'Fri 13' },
];

// Net settlement, simplified to minimum transactions.
const SETTLEMENT = [
  { from: 'Theo', to: 'Sam', amount: 84 },
  { from: 'Mara', to: 'Sam', amount: 41 },
  { from: 'Wei', to: 'Nadia', amount: 68 },
  { from: 'Priya', to: 'Nadia', amount: 12 },
];

const PER_PERSON = [
  { name: 'Sam', paid: 640, share: 268 },
  { name: 'Priya', paid: 183, share: 256 },
  { name: 'Theo', paid: 88, share: 268 },
  { name: 'Mara', paid: 96, share: 256 },
  { name: 'Nadia', paid: 410, share: 268 },
  { name: 'Wei', paid: 0, share: 201 },
];

// Attributed change log. `unreadFrom` is the first index the viewer hasn't seen.
const FEED = [
  { who: 'Priya', verb: 'added', what: 'Pastéis de Belém', where: 'Fri 13', time: '2m', cat: 'food' },
  { who: 'Scout', verb: 'flagged a tight connection on', what: 'Alfa Pendular to Porto', where: 'Tue 17', time: '18m', ai: true },
  { who: 'Theo', verb: 'voted for', what: 'Fado night', where: 'Ideas', time: '40m' },
  { who: 'Nadia', verb: 'paid', what: '€410 for the Ribeira flat', where: 'Expenses', time: '1h' },
  { who: 'Sam', verb: 'closed the poll', what: 'Rent a car for the Douro?', where: 'Decisions', time: '3h' },
  { who: 'Mara', verb: 'moved', what: 'Livraria Lello', where: 'to Thu 19', time: 'yesterday' },
];
const FEED_UNREAD = 3; // first 3 are new

Object.assign(window, {
  CaravanTrip: { GROUP, TRIP, DAYS, TODAY, IDEAS, POLLS, POLL_COMMENTS, EXPENSES, SETTLEMENT, PER_PERSON, FEED, FEED_UNREAD },
});
