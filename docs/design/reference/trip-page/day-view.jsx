// Caravan UI kit — itinerary day view (composes published components from _ds_bundle.js)
const {
  ActivityCard, IdeaChip, DayTabs, PresencePill, MapPin,
  Menu, Dialog, Toast, Avatar, AvatarStack, Button,
} = window.CaravanDesignSystem_f409b4;

const GROUP = ['Sam', 'Priya', 'Theo', 'Mara'];

const DAYS = [
  {
    tab: 'Mon 1', heading: 'Monday · Arrival',
    acts: [
      { time: '15:40', title: 'Land at LIS', category: 'transport', place: 'TAP 1366 from London', voters: [] },
      { time: '17:30', title: 'Check in: Casa do Castelo', category: 'lodging', place: 'Alfama · code in the group chat', voters: [] },
      { time: '20:00', title: 'First-night petiscos', category: 'food', place: 'Somewhere walkable — keep it easy', voters: ['Sam', 'Mara'] },
    ],
    pins: [{ top: 64, left: 56 }, { top: 36, left: 70 }, { top: 44, left: 62 }],
  },
  {
    tab: 'Tue 2', heading: 'Tuesday · Belém & Alfama',
    acts: [
      { time: '9:00', title: 'Pastéis de Belém', category: 'food', place: 'R. de Belém 84', note: '"get the box of six" — Priya', voters: ['Sam', 'Priya', 'Mara'], stamp: 'Must' },
      { time: '11:30', title: 'Tram 28 to Alfama', category: 'transport', place: 'Martim Moniz → Graça', note: 'sit on the right' },
      { time: '18:30', title: 'Miradouro de Santa Catarina', category: 'sight', place: 'Sunset spot — bring the wine', voters: ['Theo', 'Mara'] },
    ],
    pins: [{ top: 78, left: 14 }, { top: 42, left: 52 }, { top: 18, left: 72 }],
  },
  {
    tab: 'Wed 3', heading: 'Wednesday · Sintra',
    acts: [
      { time: '9:15', title: 'Train to Sintra', category: 'transport', place: 'Rossio station · €4.90 return' },
      { time: '11:00', title: 'Pena Palace', category: 'sight', place: 'Book tickets tonight!', voters: ['Sam', 'Priya', 'Theo', 'Mara'], stamp: 'Booked' },
      { time: '14:30', title: 'Travesseiros at Piriquita', category: 'food', place: 'Old town · Priya says trust her again', voters: ['Priya'] },
    ],
    pins: [{ top: 80, left: 30 }, { top: 30, left: 44 }, { top: 52, left: 60 }],
  },
];

const START_IDEAS = [
  { label: 'Fado night', votes: 2, voted: false, tone: 'accent' },
  { label: 'LX Factory', votes: 1, voted: false, tone: 'plain' },
  { label: 'Day trip to Cascais', votes: 2, voted: true, tone: 'info' },
  { label: 'Oceanário', votes: 0, voted: false, tone: 'plain' },
];

function CaravanMap({ day, activeStop, setActiveStop }) {
  const pins = DAYS[day].pins;
  return (
    <div style={{
      position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      background: 'radial-gradient(ellipse 60% 50% at 70% 30%, #F0E6CC 0%, transparent 70%), #EADFC2',
      border: 'var(--border-ink)', boxShadow: 'var(--shadow-lg)', minHeight: 520, height: '100%',
    }}>
      <div style={{ position: 'absolute', left: -24, right: -24, bottom: 26, height: 64, background: 'var(--blue)', opacity: .35, borderRadius: '45% 55% 0 0 / 100% 90% 0 0' }}></div>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          points={pins.map((p) => `${p.left + 2},${p.top + 2}`).join(' ')}
          fill="none" stroke="var(--color-primary)" strokeWidth="0.8"
          strokeDasharray="2 2" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3, strokeDasharray: '9 8' }}
        ></polyline>
      </svg>
      {pins.map((p, i) => (
        <span key={i} style={{ position: 'absolute', top: `${p.top}%`, left: `${p.left}%` }}>
          <MapPin label={String(i + 1)} active={activeStop === i} onHover={(h) => setActiveStop(h ? i : null)} />
        </span>
      ))}
      <div style={{
        position: 'absolute', left: 16, bottom: 16, right: 16,
        background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)', padding: '11px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Avatar name="Priya" size={26} />
        <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-body)' }}>
          Priya added <b>Pastéis de Belém</b> · 2m ago
        </span>
      </div>
    </div>
  );
}

function CaravanDayView() {
  const [day, setDay] = React.useState(1);
  const [activeStop, setActiveStop] = React.useState(null);
  const [ideas, setIdeas] = React.useState(START_IDEAS);
  const [menuFor, setMenuFor] = React.useState(null);
  const [confirmFor, setConfirmFor] = React.useState(null);
  const [removed, setRemoved] = React.useState({});
  const [toast, setToast] = React.useState(null);

  const d = DAYS[day];
  const acts = d.acts.filter((a) => !(removed[day] || []).includes(a.title));

  const vote = (i) => setIdeas(ideas.map((x, j) => j === i ? { ...x, voted: !x.voted, votes: x.votes + (x.voted ? -1 : 1) } : x));
  const doRemove = () => {
    setRemoved({ ...removed, [day]: [...(removed[day] || []), confirmFor] });
    setToast(`Removed "${confirmFor}" — the group can see it now`);
    setConfirmFor(null);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div data-screen-label="Itinerary day view" style={{ maxWidth: 1380, margin: '0 auto', padding: '26px 30px 34px', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative', overflow: 'hidden', minHeight: '100vh' }} onClick={() => setMenuFor(null)}>
      {/* sun deco */}
      <div style={{ position: 'absolute', top: -84, right: -64, width: 210, height: 210, borderRadius: '50%', background: 'var(--gold)', border: 'var(--border-ink)', opacity: .85 }}></div>

      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', flexWrap: 'wrap', rowGap: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-xl)', letterSpacing: '-0.03em', color: 'var(--text-on-primary)', background: 'var(--color-primary)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '6px 14px' }}>caravan</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'clamp(24px, 2.6vw, 34px)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-body)', lineHeight: 1.05, whiteSpace: 'nowrap' }}>Lisbon, together</span>
        </div>
        <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm)', color: 'var(--text-body)', background: 'var(--surface-card)', border: 'var(--border-ink)', boxShadow: 'var(--shadow-md)', padding: '5px 13px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap' }}>Jun 12–18</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AvatarStack names={GROUP} size={32} />
          <PresencePill>Sam is editing…</PresencePill>
        </div>
      </header>

      {/* day controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', flexWrap: 'wrap', rowGap: 10 }}>
        <DayTabs days={DAYS.map((x) => x.tab)} active={day} onChange={(i) => { setDay(i); setActiveStop(null); setMenuFor(null); }} />
        <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{d.heading}</span>
        <Button size="sm" style={{ marginLeft: 'auto' }}>+ Add activity</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 1.3fr) minmax(320px, 1fr)', gap: 22, flex: 1, position: 'relative', alignItems: 'start' }}>
        {/* itinerary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {acts.map((a, i) => (
            <div key={a.title} style={{ position: 'relative' }}>
              <ActivityCard
                {...a}
                active={activeStop === i}
                onClick={() => {}}
                onMenu={() => setMenuFor(menuFor === a.title ? null : a.title)}
              />
              {menuFor === a.title && (
                <span style={{ position: 'absolute', right: 10, top: 'calc(100% - 8px)', zIndex: 20 }} onClick={(e) => e.stopPropagation()}>
                  <Menu
                    items={[
                      { label: 'Edit details' },
                      { label: 'Move to another day', submenu: true },
                      { label: 'Send to ideas pool' },
                      { divider: true },
                      { label: 'Remove from trip', danger: true },
                    ]}
                    onSelect={(item) => {
                      setMenuFor(null);
                      if (item.danger) setConfirmFor(a.title);
                    }}
                  />
                </span>
              )}
            </div>
          ))}

          {/* ideas pool */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>Ideas ↓</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ideas.map((x, i) => (
                <IdeaChip key={x.label} label={x.label} votes={x.votes} voted={x.voted} tone={x.tone} onVote={() => vote(i)} />
              ))}
            </div>
          </div>
        </div>

        {/* map */}
        <CaravanMap day={day} activeStop={activeStop} setActiveStop={setActiveStop} />
      </div>

      {/* toast */}
      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 60 }}>
          <Toast onDismiss={() => setToast(null)}>{toast}</Toast>
        </div>
      )}

      {/* confirm dialog */}
      {confirmFor && (
        <Dialog
          title={`Remove "${confirmFor}"?`}
          cancelLabel="Keep it" confirmLabel="Remove" danger
          onCancel={() => setConfirmFor(null)} onConfirm={doRemove}
        >The group will see it's gone — anyone who voted gets a heads-up.</Dialog>
      )}
    </div>
  );
}

Object.assign(window, { CaravanDayView });
