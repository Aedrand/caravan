# Enhancement log

A running inbox for ideas as they come up — **not commitments**. Nothing here
is scoped or scheduled until it's promoted into `decisions.md` / `plan.md`
(or the §9 backlog) deliberately. Newest entries at the top; note overlaps
with existing plan tasks so promotion is a merge, not a surprise.

---

## 2026-06-11 — Admin console & instance identity (owner)

Make a self-hosted instance feel like *the group's own*: this isn't a SaaS,
so the admin should be able to brand and shape it.

- **Custom instance name** — shown in the header, page titles, invite/join
  pages ("Join the Riggs Family Caravan"). *Overlap: plan D.3 already lists
  "instance name" as a writable admin setting; this extends it into the UI
  surfaces.*
- **Color palette / theming** — let the admin pick or tune the palette
  (presets and/or a primary-hue picker). *Net-new (Track E defines THE design
  language, not per-instance theming).* Natural implementation: theme tokens
  already live as CSS custom properties (warm OKLCH set), so an
  `instance_settings`-backed theme + a `<style>`/attribute override at the
  shell is cheap; dark mode could ride the same mechanism.
- **Admin console as a real surface** — D.3's scope is utilitarian
  (registration toggle, read-only stats, backup button). The aspiration here
  is a proper "make it yours" console: identity + theme + defaults (e.g.
  default currency) in one place.
- Possible extras when promoted: instance icon/logo upload (favicon + header),
  login-page welcome copy.

**Promotion path:** extend D.3's task definition (Track D) + a small Track E
hook for theme-token overrides; no new milestone needed.
