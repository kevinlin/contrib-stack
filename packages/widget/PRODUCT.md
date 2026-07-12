# Product

## Register

product

## Platform

web

## Users

The widget is designed for people who land on a developer's own site (a portfolio, a blog, a docs page) and glance at the embedded heatmap to size that developer up. Recruiters, peers, and readers, mid-browse, giving it a few seconds. Their job is to read fast: how active is this person, and across how many places do they work?

There is a second party who never reads the widget the way visitors do. The profile owner picks which sources show, the theme, the colors, and the range, then embeds it. So the owner configures and the visitor consumes. Design decisions serve the visitor's glance first; the owner's control surface lives in the ContribStack settings UI, not in the widget itself.

## Product Purpose

An embeddable web component that renders a developer's contribution activity as one interactive heatmap. Every connected source (GitHub, GitLab, generic ingest) draws as its own colored layer, overlaid on the same grid and never flattened into a single number. It drops into any external page with two lines of HTML and mounts identically on the ContribStack profile page, so there is one rendering path and no drift between them.

Success: a visitor grasps how much and how broadly a developer ships within the first second, the widget looks like it belongs on whatever site hosts it, and a second look (hover, tap, toggle a layer) pays off with exact per-source detail.

## Positioning

Every source, never merged. One heatmap layers all of a developer's activity with each source kept visibly distinct. The overlay is the thing no single-platform graph can show.

## Brand Personality

Bold, energetic, alive. The energy comes from color confidence, dense data, and contrast, not from decoration. Think Vercel and observability dashboards: engineered, high-contrast, at home in dark mode, technical without feeling cold. The heatmap should read as momentum, activity stacking up across sources, while staying clean enough to sit on someone else's homepage without shouting.

## Anti-references

- **Corporate analytics dashboard.** No Google-Analytics-style KPI cards, filter bars, or enterprise chrome. This is not a reporting tool.
- **A bare GitHub clone.** The green-squares graph copied one-to-one misses the point; the multi-source overlay is what separates this from GitHub's own calendar.
- **Loud or overdesigned.** No gradients, glows, glassmorphism, or decorative motion. It embeds on pages the owner controls, so it must not fight the host's design.

## Design Principles

**Belong on the host page.** The widget renders on sites its author will never see. It has to look deliberate and native wherever it lands, and never hijack the surrounding page. Shadow DOM already isolates styles in both directions; the visual choices should hold up the same way.

**Bold through the data, not the chrome.** Reconcile "energetic" with "not loud" by making color, density, and contrast do the work. Every pull toward a gradient or a glow is a signal to push the data harder instead.

**Keep every source legible as itself.** The overlay only works if no layer gets lost. Source identity rides on color, label, and tooltip together, so two close hues still read as two sources. Best-effort color-blind support falls out of this rather than bolting on as a separate accommodation.

**Make momentum land in a glance; reward the second look.** The viewer is mid-browse and impatient. Breadth and streaks should register instantly. Hover, tap, and layer toggles are there for the ones who lean in.

**Extend the graph everyone already knows.** Build on the contribution-calendar mental model so it is legible on sight, then let the multi-source overlay be the new part. Familiar frame, novel payload.

## Accessibility & Inclusion

Color-blind support is best-effort. Default layer colors are chosen to stay distinguishable, and source identity is always also carried by the legend labels and the hover/tap tooltip, so a viewer who cannot separate two hues can still tell which source is which. The widget is theme-aware, following light, dark, or the host's `prefers-color-scheme` through the `theme` attribute. No formal WCAG conformance level is committed for this pass.
