// Caravan trip page — shared shell pieces (icons, map pane, feed drawer, top bar, left rail).
const {
  Avatar, AvatarStack, Button, Chip, Stamp, Menu,
  ActivityCard, IdeaChip, DayTabs, PresencePill, MapPin,
} = window.CaravanDesignSystem_f409b4;

/* ---------- icons (Lucide paths, stroke 2.25 to match the ink language) ---------- */
const PATHS = {
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  vote: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  kebab: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};
function Icon({ name, size = 20, stroke = 2.25, style }) {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { flex: 'none', ...style }, dangerouslySetInnerHTML: { __html: PATHS[name] },
  });
}

/* ---------- small shared bits ---------- */
function CapLabel({ children, style }) {
  return <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-secondary)', ...style }}>{children}</span>;
}
function ConnDot({ label = 'Live' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--green)', border: '1.5px solid var(--ink)', boxShadow: '0 0 0 3px var(--green-soft)' }}></span>
      {label}
    </span>
  );
}
function Money({ v, big }) {
  return <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-display)', fontSize: big ? 'var(--text-2xl)' : 'inherit' }}>€{v.toLocaleString()}</span>;
}

/* ---------- ambient map pane ---------- */
function MapPane({ day, activeStop, setActiveStop, compact }) {
  const T = window.CaravanTrip;
  const d = T.DAYS[day];
  const pins = d.pins || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{
        position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        background: 'radial-gradient(ellipse 60% 50% at 70% 30%, #F0E6CC 0%, transparent 70%), #EADFC2',
        border: 'var(--border-ink)', boxShadow: 'var(--shadow-lg)', flex: 1, minHeight: compact ? 280 : 420,
      }}>
        <div style={{ position: 'absolute', left: -24, right: -24, bottom: 26, height: 64, background: 'var(--blue)', opacity: .35, borderRadius: '45% 55% 0 0 / 100% 90% 0 0' }}></div>
        {pins.length > 1 && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={pins.map((p) => `${p.left + 2},${p.top + 2}`).join(' ')} fill="none" stroke="var(--color-primary)" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3, strokeDasharray: '9 8' }}></polyline>
          </svg>
        )}
        {pins.map((p, i) => (
          <span key={i} style={{ position: 'absolute', top: `${p.top}%`, left: `${p.left}%` }}>
            <MapPin label={String(i + 1)} active={activeStop === i} onHover={(h) => setActiveStop(h ? i : null)} />
          </span>
        ))}
        {pins.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--ink-soft)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>
            Nothing plotted for this day yet
          </div>
        )}
        {/* recently-edited flash */}
        <div style={{ position: 'absolute', left: 14, bottom: 14, right: 14, background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name="Priya" size={24} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-body)' }}>Priya added <b>Pastéis de Belém</b> · 2m ago</span>
        </div>
        <span style={{ position: 'absolute', right: 8, top: 8, fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--ink-soft)', opacity: .8 }}>© OpenFreeMap · OSM</span>
      </div>
      {/* unplotted list */}
      {d.unplotted && d.unplotted.length > 0 && (
        <div style={{ background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <CapLabel>No location yet</CapLabel>
          {d.unplotted.map((u) => (
            <span key={u} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              <Icon name="pin" size={14} stroke={2.25} style={{ color: 'var(--ink-faint)' }} />{u}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- feed drawer ---------- */
function FeedRow({ ev, isFirstRead }) {
  const T = window.CaravanTrip;
  return (
    <React.Fragment>
      {isFirstRead && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
          <div style={{ flex: 1, borderTop: '2px dotted var(--ink-faint)' }}></div>
          <CapLabel style={{ color: 'var(--ink-soft)' }}>Caught up to here</CapLabel>
          <div style={{ flex: 1, borderTop: '2px dotted var(--ink-faint)' }}></div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '9px 4px' }}>
        <Avatar name={ev.who} size={28} ai={ev.ai} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-body)', lineHeight: 1.4 }}>
            <b style={{ fontWeight: 'var(--weight-bold)' }}>{ev.ai ? 'Scout' : ev.who}</b> {ev.verb} <b style={{ fontWeight: 'var(--weight-bold)' }}>{ev.what}</b>
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-body)', marginTop: 1 }}>{ev.where} · {ev.time} ago</div>
        </div>
      </div>
    </React.Fragment>
  );
}
function FeedDrawer({ open, onClose, embedded }) {
  const T = window.CaravanTrip;
  const panel = (
    <div style={{ width: embedded ? '100%' : 360, maxWidth: '100%', height: '100%', background: 'var(--paper-bright)', borderLeft: embedded ? 'none' : 'var(--border-ink)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: 'var(--border-ink)' }}>
        <Icon name="bell" size={20} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-xl)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-body)' }}>What changed</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-on-primary)', background: 'var(--color-primary)', border: 'var(--border-ink)', borderRadius: 'var(--radius-pill)', padding: '3px 9px' }}>{T.FEED_UNREAD} new</span>
        {!embedded && (
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: 4, background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', width: 34, height: 34, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--ink)' }}>
            <Icon name="x" size={18} />
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 18px' }}>
        {T.FEED.map((ev, i) => <FeedRow key={i} ev={ev} isFirstRead={i === T.FEED_UNREAD} />)}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <CapLabel style={{ color: 'var(--ink-faint)' }}>· that's the start of the trip ·</CapLabel>
        </div>
      </div>
      <div style={{ padding: 14, borderTop: 'var(--border-ink)' }}>
        <Button variant="secondary" size="sm" style={{ width: '100%' }} onClick={onClose}>Mark all as read</Button>
      </div>
    </div>
  );
  if (embedded) return panel;
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--ink)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, boxShadow: 'var(--shadow-xl)' }}>{panel}</div>
    </div>
  );
}

Object.assign(window, { CaravanIcon: Icon, CaravanCapLabel: CapLabel, CaravanConnDot: ConnDot, CaravanMoney: Money, CaravanMapPane: MapPane, CaravanFeedDrawer: FeedDrawer });
