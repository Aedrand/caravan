// Caravan trip page — the four switchable views.
const {
  Avatar, AvatarStack, Button, Chip, Stamp, Menu, Poll, Comment, Input,
  ActivityCard, IdeaChip, DayTabs, PresencePill, MapPin,
} = window.CaravanDesignSystem_f409b4;
const Icon = window.CaravanIcon;
const CapLabel = window.CaravanCapLabel;
const Money = window.CaravanMoney;
const MapPane = window.CaravanMapPane;

const CAT_LABEL = { food: 'Food', transport: 'Travel', sight: 'Sight', lodging: 'Stay' };

/* ============================ ITINERARY ============================ */
function DayHeader({ d, idx, isToday, count, expanded, onToggle, mobile }) {
  return (
    <div onClick={onToggle} style={{
      position: 'sticky', top: mobile ? 0 : -2, zIndex: 6, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px',
      background: 'var(--paper)', borderRadius: 'var(--radius-md)',
    }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, color: 'var(--ink)', transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms ease-out' }}>
        <Icon name="chevron" size={20} />
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 'none', whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-xl)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-body)', whiteSpace: 'nowrap' }}>{d.wd} {d.dn}</span>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{d.heading}</span>
      </div>
      {isToday && <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--ink)', background: 'var(--gold-soft)', border: 'var(--border-ink)', borderRadius: 'var(--radius-pill)', padding: '2px 9px' }}>Today</span>}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <CapLabel style={{ color: 'var(--ink-faint)' }}>{count} {count === 1 ? 'stop' : 'stops'}</CapLabel>
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <Button variant="quiet" size="sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="plus" size={15} /> Add</span></Button>
        </span>
      </span>
    </div>
  );
}

function EmptyDayRow({ d }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
      padding: '9px 14px', marginLeft: 38, border: '2px dashed var(--ink-faint)', background: 'transparent',
      borderRadius: 'var(--radius-md)', color: 'var(--ink-soft)', font: 'inherit',
    }}>
      <Icon name="plus" size={15} stroke={2.25} style={{ color: 'var(--ink-faint)' }} />
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-base)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{d.wd} {d.dn}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>· nothing planned — add something</span>
    </button>
  );
}

function ItineraryView(props) {
  const { mobile, scrollRef } = props;
  const T = window.CaravanTrip;
  const initialExpanded = () => { const o = {}; T.DAYS.forEach((d, i) => { o[i] = d.acts.length > 0 && i >= T.TODAY; }); o[T.TODAY] = true; return o; };
  const [expanded, setExpanded] = React.useState(initialExpanded);
  // Controlled focus when the desktop shell owns the persistent map; internal on mobile.
  const ctrl = typeof props.setFocusDay === 'function';
  const [iFocus, setIFocus] = React.useState(T.TODAY);
  const [iStop, setIStop] = React.useState(null);
  const focusDay = ctrl ? props.focusDay : iFocus;
  const setFocusDay = ctrl ? props.setFocusDay : setIFocus;
  const activeStop = ctrl ? props.activeStop : iStop;
  const setActiveStop = ctrl ? props.setActiveStop : setIStop;
  const [menuFor, setMenuFor] = React.useState(null);
  const sectionRefs = React.useRef({});
  const ideaCount = T.IDEAS.length;

  const jumpTo = (i) => {
    setFocusDay(i);
    setExpanded((e) => ({ ...e, [i]: true }));
    setActiveStop(null);
    const el = sectionRefs.current[i];
    const sc = scrollRef && scrollRef.current;
    if (el && sc) requestAnimationFrame(() => sc.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' }));
  };

  const railDays = T.DAYS.map((d) => ({ label: `${d.wd} ${d.dn}`, empty: d.acts.length === 0 }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onClick={() => setMenuFor(null)}>
      {/* sticky day-jump rail */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--paper)', paddingBottom: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: mobile ? 'nowrap' : 'wrap', rowGap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
          <DayTabs days={railDays.map((r) => r.label)} active={focusDay} onChange={jumpTo} />
        </div>
        {!mobile && (
          <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
            <Button variant="secondary" size="sm" onClick={() => jumpTo(T.TODAY)}>Today</Button>
            <Button variant="secondary" size="sm" onClick={() => jumpTo(0)}>Trip start</Button>
          </div>
        )}
      </div>

      {/* day-grouped timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {T.DAYS.map((d, i) => {
          const isFocus = i === focusDay;
          if (d.acts.length === 0) return <div key={i} ref={(el) => (sectionRefs.current[i] = el)} style={{ paddingBottom: 4 }}><EmptyDayRow d={d} /></div>;
          const open = expanded[i];
          return (
            <div key={i} ref={(el) => (sectionRefs.current[i] = el)} style={{ paddingBottom: 4 }} onMouseEnter={() => !mobile && setFocusDay(i)}>
              <DayHeader d={d} idx={i} isToday={i === T.TODAY} count={d.acts.length} expanded={open} mobile={mobile} onToggle={() => setExpanded((e) => ({ ...e, [i]: !e[i] }))} />
              {open && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 38, paddingTop: 6 }}>
                  {d.acts.map((a, ai) => (
                    <div key={a.title} style={{ position: 'relative' }}
                      onMouseEnter={() => { setFocusDay(i); setActiveStop(ai); }}
                      onMouseLeave={() => setActiveStop(null)}>
                      <ActivityCard {...a} active={isFocus && activeStop === ai} onClick={() => {}} onMenu={() => setMenuFor(menuFor === a.title ? null : a.title)} />
                      {isFocus && i === T.TODAY && ai === 1 && (
                        <span style={{ position: 'absolute', left: 14, top: -12, zIndex: 4 }}><PresencePill tone="primary">Theo is editing…</PresencePill></span>
                      )}
                      {menuFor === a.title && (
                        <span style={{ position: 'absolute', right: 10, top: 'calc(100% - 8px)', zIndex: 20 }} onClick={(e) => e.stopPropagation()}>
                          <Menu items={[{ label: 'Edit details' }, { label: 'Move to another day', submenu: true }, { label: 'Send to ideas pool' }, { divider: true }, { label: 'Remove from trip', danger: true }]} onSelect={() => setMenuFor(null)} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ideas live in Decide now — Plan keeps a compact pointer */}
      <button onClick={props.onOpenDecide} style={{ marginTop: 8, width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--gold-soft)', border: 'var(--border-ink)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
        <Chip tone="accent">Ideas</Chip>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-body)' }}>{ideaCount} ideas the group’s floating</span>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Vote on them in Decide — top picks become plans</span>
        </span>
        <span style={{ marginLeft: 'auto', flex: 'none', fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-base)', color: 'var(--ink)', whiteSpace: 'nowrap' }}>Open Decide →</span>
      </button>

      {/* map — only inline on mobile (desktop has the persistent pane) */}
      {mobile && <div style={{ height: 320, marginTop: 4 }}><MapPane day={focusDay} activeStop={activeStop} setActiveStop={setActiveStop} compact /></div>}
    </div>
  );
}

/* ============================ DECISIONS ============================ */
function DecisionsView() {
  const T = window.CaravanTrip;
  const [ideas, setIdeas] = React.useState(T.IDEAS);
  const vote = (i) => setIdeas(ideas.map((x, j) => j === i ? { ...x, voted: !x.voted, votes: x.votes + (x.voted ? -1 : 1) } : x));
  const ranked = ideas.map((x, i) => ({ x, i })).sort((a, b) => b.x.votes - a.x.votes);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820, margin: '0 auto' }}>
      <ViewHead icon="vote" title="Decide" sub="Ideas the group’s floating, and the open questions. Vote freely — nothing gets picked for you.">
        <Button size="sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="plus" size={15} /> Add idea</span></Button>
      </ViewHead>

      {/* featured ideas pool */}
      <div style={{ background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-xl)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-body)' }}>Ideas pool</span>
          <CapLabel style={{ color: 'var(--ink-faint)' }}>most-wanted first · vote, then add favorites to a day</CapLabel>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
          {ranked.map(({ x, i }, rank) => (
            <div key={x.label} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--paper-bright)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
              <IdeaChip label={x.label} votes={x.votes} voted={x.voted} tone={x.tone} onVote={() => vote(i)} />
              <span style={{ marginLeft: 'auto', flex: 'none' }}><Button variant="quiet" size="sm">Add to a day →</Button></span>
              {rank === 0 && <span style={{ position: 'absolute', top: -11, left: 10, pointerEvents: 'none' }}><Stamp tone="accent" rotate={-5}>Most wanted</Stamp></span>}
            </div>
          ))}
        </div>
      </div>

      {/* polls */}
      <CapLabel>Open questions</CapLabel>
      {T.POLLS.map((p, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Poll question={p.question} options={p.options} note={p.note} showWinner onVote={p.open ? () => {} : undefined} />
          <div style={{ display: 'flex', gap: 8, paddingLeft: 2 }}>
            {p.open
              ? <React.Fragment><Button variant="secondary" size="sm">Close poll</Button><Button variant="quiet" size="sm">Convert winner to an idea</Button></React.Fragment>
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}><Icon name="route" size={15} style={{ color: 'var(--green)' }} /> Winner is now <b>“Rent a car” on Thu 19</b></span>}
          </div>
        </div>
      ))}
      {/* comments on the open poll */}
      <div style={{ background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <CapLabel style={{ marginBottom: 6 }}>Why people voted</CapLabel>
        {T.POLL_COMMENTS.map((c, i) => <Comment key={i} author={c.ai ? 'Scout' : c.author} time={c.time} ai={c.ai} indent={c.indent} onReply={() => {}}>{c.text}</Comment>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <Avatar name="Sam" size={28} />
          <div style={{ flex: 1 }}><Input placeholder="Add a reason…" /></div>
          <Button size="sm">Send</Button>
        </div>
      </div>
    </div>
  );
}

/* ============================ EXPENSES ============================ */
function ExpensesView() {
  const T = window.CaravanTrip;
  const spent = T.EXPENSES.reduce((s, e) => s + e.amount, 0);
  const pct = Math.min(100, Math.round((spent / T.TRIP.budget) * 100));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 880, margin: '0 auto' }}>
      <ViewHead icon="wallet" title="Money" sub="Who paid, who owes whom — settled to the fewest payments.">
        <Button size="sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="plus" size={15} /> Add expense</span></Button>
      </ViewHead>

      {/* budget + settlement row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 18 }}>
          <CapLabel>Trip budget</CapLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 12px' }}>
            <Money v={spent} big /><span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>of €{T.TRIP.budget.toLocaleString()} · {pct}%</span>
          </div>
          <div style={{ height: 14, background: 'var(--paper)', border: 'var(--border-ink)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', background: 'var(--green)', borderRight: '2px solid var(--ink)' }}></div>
          </div>
          <div style={{ marginTop: 10, fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>€{(T.TRIP.budget - spent).toLocaleString()} left · about €{Math.round((T.TRIP.budget - spent) / T.GROUP.length)} a head</div>
        </div>
        <div style={{ background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 18 }}>
          <CapLabel>Who pays whom</CapLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {T.SETTLEMENT.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Avatar name={s.from} size={26} /><span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{s.from}</span>
                <span style={{ color: 'var(--ink-soft)' }}>→</span>
                <Avatar name={s.to} size={26} /><span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{s.to}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-body)' }}>€{s.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* expense list */}
      <div style={{ background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '6px 16px' }}>
        {T.EXPENSES.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < T.EXPENSES.length - 1 ? 'var(--divider-dotted)' : 'none' }}>
            <Chip tone={e.cat}>{CAT_LABEL[e.cat]}</Chip>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{e.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{e.day} · {e.who}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar name={e.payer} size={24} /><span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>paid</span></div>
            <span style={{ width: 64, textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', letterSpacing: 'var(--tracking-display)', fontSize: 'var(--text-lg)', color: 'var(--text-body)' }}>€{e.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ MEMBERS ============================ */
function MembersView() {
  const T = window.CaravanTrip;
  const roleTone = { owner: 'primary', editor: 'success', viewer: 'info' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640, margin: '0 auto' }}>
      <ViewHead icon="users" title="The group" sub="Six of you on this one. Owners and editors can change the plan; viewers follow along." />
      <div style={{ background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '6px 16px' }}>
        {T.GROUP.map((m, i) => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < T.GROUP.length - 1 ? 'var(--divider-dotted)' : 'none' }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={m.name} size={36} />
              {m.online && <span style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--surface-card)' }}></span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>{m.name}{m.name === 'Sam' && <span style={{ color: 'var(--text-secondary)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}> · you</span>}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{m.online ? 'Online now' : 'Last seen yesterday'}</div>
            </div>
            <Chip tone={roleTone[m.role]}>{m.role}</Chip>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--gold-soft)', border: 'var(--border-ink)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <Icon name="link" size={22} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-body)' }}>Invite the rest of the group</div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>caravan.home/j/lisbon-7f3a · anyone with the link can join as an editor</div>
        </div>
        <Button size="sm">Copy invite link</Button>
      </div>
    </div>
  );
}

/* shared view header */
function ViewHead({ icon, title, sub, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', rowGap: 10 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, background: 'var(--surface-card)', border: 'var(--border-ink)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', color: 'var(--ink)' }}><Icon name={icon} size={22} /></span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-2xl)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-body)' }}>{title}</h2>
        {sub && <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)', color: 'var(--text-secondary)', maxWidth: 520, textWrap: 'pretty' }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { CaravanItineraryView: ItineraryView, CaravanDecisionsView: DecisionsView, CaravanExpensesView: ExpensesView, CaravanMembersView: MembersView });
