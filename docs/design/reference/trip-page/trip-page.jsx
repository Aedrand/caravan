// Caravan trip page — the workspace shell + spec board.
const {
  Avatar, AvatarStack, Button, Chip, Stamp, Menu,
} = window.CaravanDesignSystem_f409b4;
const Icon = window.CaravanIcon;
const CapLabel = window.CaravanCapLabel;
const ConnDot = window.CaravanConnDot;
const MapPane = window.CaravanMapPane;
const FeedDrawer = window.CaravanFeedDrawer;
const { CaravanItineraryView: ItineraryView, CaravanDecisionsView: DecisionsView, CaravanExpensesView: ExpensesView, CaravanMembersView: MembersView } = window;

const NAV = [
  { id: 'itinerary', icon: 'route', label: 'Plan' },
  { id: 'decisions', icon: 'vote', label: 'Decide' },
  { id: 'expenses', icon: 'wallet', label: 'Money' },
  { id: 'members', icon: 'users', label: 'Group' },
];
const MOBILE_NAV = [
  { id: 'itinerary', icon: 'route', label: 'Plan' },
  { id: 'map', icon: 'map', label: 'Map' },
  { id: 'decisions', icon: 'vote', label: 'Decide' },
  { id: 'expenses', icon: 'wallet', label: 'Money' },
  { id: 'members', icon: 'users', label: 'Group' },
];

/* ---------- logo chip ---------- */
function LogoChip({ size = 'md' }) {
  const pad = size === 'sm' ? '5px 11px' : '6px 14px';
  const fs = size === 'sm' ? 'var(--text-base)' : 'var(--text-lg)';
  return <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: fs, letterSpacing: '-0.04em', color: 'var(--text-on-primary)', background: 'var(--color-primary)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: pad, flex: 'none' }}>caravan</span>;
}

/* ---------- desktop left rail ---------- */
function RailItem({ item, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: '100%', cursor: 'pointer',
      padding: '11px 4px', borderRadius: 'var(--radius-md)', font: 'inherit',
      background: active ? 'var(--surface-card)' : 'transparent',
      border: active ? 'var(--border-ink)' : '2px solid transparent',
      boxShadow: active ? 'var(--shadow-sm)' : 'none',
      color: active ? 'var(--ink)' : 'var(--ink-soft)',
    }}>
      <Icon name={item.icon} size={22} />
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{item.label}</span>
    </button>
  );
}

/* ---------- top bar ---------- */
function TopBar({ view, onFeed, feedUnread, mobile }) {
  const T = window.CaravanTrip;
  const [menu, setMenu] = React.useState(false);
  const online = T.GROUP.filter((m) => m.online).map((m) => m.name);
  return (
    <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: mobile ? 10 : 14, padding: mobile ? '10px 14px' : '14px 20px', borderBottom: 'var(--border-ink)', background: 'var(--paper-bright)', position: 'relative', zIndex: 30 }}>
      <button aria-label="Back to trips" style={{ flex: 'none', background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', width: mobile ? 34 : 36, height: mobile ? 34 : 36, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--ink)' }}><Icon name="back" size={18} /></button>
      {!mobile && <LogoChip />}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: mobile ? 'var(--text-lg)' : 'var(--text-2xl)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-body)', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '2px dotted transparent' }} title="Tap to rename">{T.TRIP.name}</h1>
          {!mobile && <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm)', color: 'var(--text-body)', background: 'var(--surface-card)', border: 'var(--border-ink)', boxShadow: 'var(--shadow-sm)', padding: '4px 12px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap' }}>{T.TRIP.dates}</span>}
        </div>
        {mobile && <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{T.TRIP.where} · {T.TRIP.dates}</span>}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: mobile ? 8 : 14 }}>
        {!mobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AvatarStack names={online} size={32} max={5} />
            <ConnDot label="Live" />
          </div>
        )}
        {/* feed bell */}
        <button onClick={onFeed} aria-label="What changed" style={{ position: 'relative', flex: 'none', background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', width: mobile ? 34 : 38, height: mobile ? 34 : 38, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--ink)' }}>
          <Icon name="bell" size={mobile ? 18 : 20} />
          {feedUnread > 0 && <span style={{ position: 'absolute', top: -7, right: -7, minWidth: 19, height: 19, padding: '0 4px', borderRadius: 'var(--radius-pill)', background: 'var(--color-primary)', border: '2px solid var(--ink)', color: 'var(--surface-card)', fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: '11px', display: 'grid', placeItems: 'center' }}>{feedUnread}</span>}
        </button>
        {/* trip actions */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenu(!menu)} aria-label="Trip actions" style={{ flex: 'none', background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', width: mobile ? 34 : 38, height: mobile ? 34 : 38, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--ink)' }}><Icon name="kebab" size={18} /></button>
          {menu && <span style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 40 }} onClick={() => setMenu(false)}><Menu items={[{ label: 'Duplicate trip' }, { label: 'Export PDF / calendar' }, { label: 'Archive trip' }, { divider: true }, { label: 'Delete trip', danger: true }]} onSelect={() => setMenu(false)} /></span>}
        </div>
      </div>
    </header>
  );
}

function ActiveView({ view, scrollRef, mobile, onOpenDecide }) {
  if (view === 'decisions') return <DecisionsView />;
  if (view === 'expenses') return <ExpensesView />;
  if (view === 'members') return <MembersView />;
  if (view === 'map') return <div style={{ height: '100%', padding: 14 }}><MapPane day={window.CaravanTrip.TODAY} activeStop={null} setActiveStop={() => {}} /></div>;
  return <ItineraryView scrollRef={scrollRef} mobile={mobile} onOpenDecide={onOpenDecide} />;
}

/* ============================ DESKTOP ============================ */
function TripPageDesktop() {
  const [view, setView] = React.useState('itinerary');
  const [feed, setFeed] = React.useState(false);
  const [focusDay, setFocusDay] = React.useState(window.CaravanTrip.TODAY);
  const [activeStop, setActiveStop] = React.useState(null);
  const scrollRef = React.useRef(null);
  const isItin = view === 'itinerary';

  return (
    <div data-screen-label="Trip page — desktop" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)', overflow: 'hidden', position: 'relative' }}>
      <TopBar view={view} onFeed={() => setFeed(true)} feedUnread={window.CaravanTrip.FEED_UNREAD} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* left rail */}
        <nav style={{ flex: 'none', width: 88, borderRight: 'var(--border-ink)', background: 'var(--paper-bright)', display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 10px', alignItems: 'center' }}>
          {NAV.map((n) => <RailItem key={n.id} item={n} active={view === n.id} onClick={() => setView(n.id)} />)}
          <div style={{ marginTop: 'auto', width: 40, height: 40, borderRadius: '50%', background: 'var(--gold)', border: 'var(--border-ink)', display: 'grid', placeItems: 'center', color: 'var(--ink)', opacity: .9 }}><Icon name="sun" size={20} /></div>
        </nav>

        {/* content */}
        {isItin ? (
          <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
            <div ref={scrollRef} style={{ flex: '1.35', minWidth: 0, overflowY: 'auto', padding: '18px 22px 40px' }}>
              <ItineraryView scrollRef={scrollRef} focusDay={focusDay} setFocusDay={setFocusDay} activeStop={activeStop} setActiveStop={setActiveStop} onOpenDecide={() => setView('decisions')} />
            </div>
            <div style={{ flex: '1', minWidth: 320, maxWidth: 520, padding: '18px 22px 18px 4px' }}>
              <div style={{ position: 'sticky', top: 0, height: '100%' }}><MapPane day={focusDay} activeStop={activeStop} setActiveStop={setActiveStop} /></div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px' }}>
            <ActiveView view={view} />
          </div>
        )}
      </div>
      <FeedDrawer open={feed} onClose={() => setFeed(false)} />
    </div>
  );
}

/* ============================ MOBILE ============================ */
function TripPageMobile() {
  const [view, setView] = React.useState('itinerary');
  const [feed, setFeed] = React.useState(false);
  const scrollRef = React.useRef(null);
  return (
    <div data-screen-label="Trip page — mobile" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)', overflow: 'hidden', position: 'relative' }}>
      <TopBar mobile view={view} onFeed={() => setFeed(true)} feedUnread={window.CaravanTrip.FEED_UNREAD} />
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: view === 'map' ? 0 : '14px 14px 96px', WebkitOverflowScrolling: 'touch' }}>
        <ActiveView view={view} scrollRef={scrollRef} mobile onOpenDecide={() => setView('decisions')} />
      </div>

      {/* thumb-reachable add */}
      {(view === 'itinerary' || view === 'expenses' || view === 'decisions') && (
        <button aria-label="Add" style={{ position: 'absolute', right: 16, bottom: 80, zIndex: 20, width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary)', border: 'var(--border-ink)', boxShadow: 'var(--shadow-lg)', color: 'var(--text-on-primary)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="plus" size={26} stroke={2.5} /></button>
      )}

      {/* bottom tab nav */}
      <nav style={{ flex: 'none', display: 'flex', borderTop: 'var(--border-ink)', background: 'var(--paper-bright)', paddingBottom: 4 }}>
        {MOBILE_NAV.map((n) => {
          const active = view === n.id;
          return (
            <button key={n.id} onClick={() => setView(n.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 2px 7px', background: 'transparent', border: 'none', cursor: 'pointer', color: active ? 'var(--color-primary)' : 'var(--ink-soft)', font: 'inherit', borderTop: active ? '3px solid var(--color-primary)' : '3px solid transparent', marginTop: -2 }}>
              <Icon name={n.icon} size={21} />
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: '10px', letterSpacing: '0.03em', textTransform: 'uppercase' }}>{n.label}</span>
            </button>
          );
        })}
      </nav>
      {feed && <div style={{ position: 'absolute', inset: 0, zIndex: 60 }}><FeedDrawer embedded onClose={() => setFeed(false)} /><button onClick={() => setFeed(false)} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', width: 34, height: 34, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--ink)' }}><Icon name="x" size={18} /></button></div>}
    </div>
  );
}

Object.assign(window, { CaravanTripPageDesktop: TripPageDesktop, CaravanTripPageMobile: TripPageMobile });
