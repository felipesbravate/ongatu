# Okara synchronization — 8 October 2026

Source: [Okara Design System](https://www.figma.com/design/7glNMA9d7iVJFf2CvyrzAb/Okara-Design-System?node-id=0-1).

Reviewed the Components page (49 families), Icons inventory, Color Light/Dark, Primitives, Surface Mobile/Desktop, Typography, Opacity, text styles and local effect/paint styles. `tests/figma-audit.json` retains the component inventory and source variable/style data.

## Changes

- Refresh primitive, semantic color, Surface and text-style snapshots. Regenerate web and native tokens. New roles include logo/indigo, logo/mint, icon/secondary, icon/light, icon/muted, text/notification and border/notification. Retired round-control icon roles are replaced.
- Inputs and dropdowns: 48/36/32px sizes, current Label styles, semantic icon states, 8px corner radius. Rebuilt Input field explicitly uses Surface/Mobile, including at desktop widths.
- Menus: 12px padding, 242px minimum width, 4px row gaps, 16px group gaps, current Heading/Medium group titles, border/default and 0/4/12 Floating shadow. Action menus use 36px rows. Optional option icons render independently from the rotating chevron.
- Buttons: 48/36/32/22px sizes; Micro now uses Label/Nano. Small round button is 36px. Medium Action link uses Label/Small.
- New menu-item-counter with normal/unread roles, available in side and action menus.
- Amount meter: 6px track, 8px separation, 16px currency icon, 6px zero marker. Guard a zero maximum against invalid percentages.
- type-row: Mobile typography and spacing, optional controlled editing state (112px Tiny input; Enter commits, Escape cancels). `AmountMeter` and `TypeRow` exports share the existing Meter/BreakdownRow implementation. Existing dashboard amount-click behavior stays connected to entries; the editing state is available to callers with edit handlers.
- Logo uses the new theme-aware logo roles. Mobile navigation label matches “Profile”. Fixed dark-surface tooltip/Toast close-button colors.
- Component gallery includes a theme switch and interactive examples of updated controls. Duplicate gallery case IDs fixed.

## Component mapping

| Figma families | Code |
| --- | --- |
| Button, Round button, Action-link | `src/ui/Button.jsx` |
| Input field | `src/ui/Field.jsx` |
| Dropdown, dropdown-interaction, drop-item | `src/ui/Dropdown.jsx`, `src/ui/UserNav.jsx` (action menus) |
| menu-item, menu-item-counter, Side menu | `src/ui/SideMenu.jsx` |
| KPI card, Expense card, Amount meter, type-row, progress-bar, Divider | `src/ui/Data.jsx` |
| Balance card | tracker balance view and `.balance-card` shared styles |
| Entry tooltip, Tooltip entry item | `src/ui/Entries.jsx` |
| Label | `src/ui/Label.jsx` |
| Segment tab, sub-segment tab, Segments, Sub-segments | `src/ui/Segments.jsx` |
| Tab, Nav tabs - Add year, Month selector, Nav tabs | `src/ui/Nav.jsx` and tracker navigation layout |
| mobile-nav-item, mobile-bottom-nav | `src/ui/MobileNav.jsx` |
| chip-selector, Step progress, step, Pager, Categories, category-item, info, Info tooltip | `src/ui/Selectors.jsx` |
| Expander | tracker expander and `.ds-expander` shared styles |
| Notification, notification-item, avatar, user, User nav | `src/ui/UserNav.jsx` |
| Toast | `src/ui/Toast.jsx` |
| Modal | `src/ui/Modal.jsx` |
| Toggle, logo_ongatu, Product header | `src/ui/Brand.jsx` |

Existing matching families reuse their shared implementations and refreshed variables. Icon paths are reused from the existing Figma-derived icon library. Card/Floating styles and Card body/Dark remain sourced from the named Figma styles. The app retains the previously requested Figma Medium 500 → CSS 400 mapping; existing legacy text-style names remain as compatibility entries. The structured transparent `surface/gradient` value is not emitted as an invalid CSS color; existing expander gradients use the corresponding transparent surface role.

## Regeneration

After refreshing the snapshots from Figma:

```sh
node scripts/sync-tokens.mjs
node scripts/sync-theme.mjs
node scripts/sync-tokens-native.mjs
npm test
npm run build
```

Preview: `/dev/components` (development only). Native tokens are synchronized; native screens were not run in a simulator during this web audit.

## Icon and illustration exports

Synced the user-provided `icons.zip` and `Illustrations.zip` on October 8:

- 153 icon families (759 exported size variants), including seven previously missing duplicate families. Existing import names remain compatible.
- 108 refreshed illustrations. The five omitted exports—Calendar, Empty, Empty state, Head, and Success—retain their existing artwork, for 113 available illustrations.
- Original SVGs retain their geometry, dimensions, clipping, masks, transforms and coordinate precision. Web assets are served locally with content-versioned URLs; the shared renderer inherits the surrounding theme color. Filled status icons preserve their white details. Dark illustrations use `text/secondary`.
- Numeric icon sizes use the corresponding exported frame. Responsive token sizes keep the existing Surface-driven CSS dimensions. A size absent from an export uses that family's largest drawing.
- Native Home, User, Plus and Arrow Up use the same exported artwork. Three stale native label-token references now use the current `LabelSmall` style.
- The development gallery includes all exported icon variants and all retained illustrations.

Regenerate with `node scripts/sync-icons.mjs` and `node scripts/sync-illustrations.mjs`. Both support `--check` and are covered by the test suite.

Validation: 95 tests passed; production build passed; native TypeScript check passed. Desktop gallery inspected in light and dark themes, including the filled status icons and illustration color. No native simulator run was performed. The final additional mobile-preview check was not completed after the preview server/session restarted.
