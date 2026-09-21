# Design C responsive height

Date 2026-09-21
Status approved, not yet implemented
Scope design C only, on the prototype page

## Problem

The prototype page can vary player **width** and nothing else. Every card
reports the height it wants and the page obliges. That hides a question the
comparison needs to answer, because a publisher slot does not work that way. A
rail module is handed a fixed width **and** a fixed height by a template, and
the card has to live inside it.

The shipping iHeart embed has no height behaviour at all. Measured at 411 wide
on `iheart.com/podcast/las-culturistas-with-matt-rogers-31090140/?embed=true`,
it draws one layout whose content runs to **520px** and lets the frame clip
whatever does not fit. The body is set to the slot height with
`overflow: visible`. At 150, 300 and 900 the content bottom was 520 every time
and all five episode rows were in the DOM at every height.

That produces a real defect at the shipped homepage height. The first episode
row starts at **y=201** and the homepage slot is **150**, so the entire episode
list and the "Listen to more episodes" link are rendered and permanently
invisible. That slot shows a play button and nothing else, by accident rather
than by decision.

This spec does not fix that. It is scoped to design C on the prototype page.
The separable observation is recorded under Follow-ups.

## Decision

The slot hands design C a height and the card fills it exactly.

Above a threshold the episode list appears inline and the list icon is removed.
Below it the list stays a drawer behind the icon, exactly as today.

### Behaviour

Measured at 411 wide. The list is a fixed 220 and the stage absorbs everything
else.

| Slot height | Stage | List | List icon |
| --- | --- | --- | --- |
| 150 | 234, clipped to 150 | none | shown |
| 234 | 234 | none | shown |
| 300 | 300 | none | shown |
| 439 | 439 | none | shown |
| **440** | **220** | **220 inline** | **hidden** |
| 600 | 380 | 220 inline | hidden |
| 900 | 680 | 220 inline | hidden |

Live radio has no episode list on any design, so a live design C card's stage
fills the whole height at every size and the 234 floor applies throughout.

### Why the stage absorbs and the list does not

The list holds a fixed 220, the same as design B's, and every pixel above the
threshold goes to the artwork. Design C's identity is the artwork, so growth
belongs there. The alternative, a fixed stage with a growing list, was
considered and rejected: it turns design C into a list with a picture on top,
which is the shape design B already occupies.

Note the consequence. Above 440 design C stops being `16 / 9`. The aspect ratio
governs the stage only in drawer mode, where the stage is the whole card.

### Why 440

Stage 220 plus list 220, two equal halves, which is what makes it a clean
number rather than an arbitrary one. It also sits 4px under design B's natural
444, so the two still read as the same size when compared side by side.

440 already appears in this codebase for an unrelated reason. The shipping
podcast embed is rendered at `height: 440px` because that is design B's 444
rounded down by 4. The agreement is a coincidence, not a derivation, but it
means nothing on the page has to move to accommodate the threshold.

### Why the floor is 234

Design C's stage is a 48px top bar, a 40px bottom bar, and a control row that
is absolutely positioned and centred between them. Nothing inside is laid out
against the stage height except that centred row, so the ceiling can never clip
a control and the floor is the only end that can. The true collision point is
**168** = 16 padding + 48 top bar + 64 control row + 40 bottom bar. The existing
`min-height: 234` carries 66px of deliberate slack above that.

That floor is kept. A slot shorter than 234 clips the card, which is what the
shipping widget already does at every height, with the difference that the card
now has an honest minimum instead of clipping at any size.

### The 234 floor does not apply in inline mode

At exactly 440 the stage is `440 - 220 = 220`, which is **below** the 234 floor.
Left alone the two rules fight and the card overflows its slot by 14px at
precisely the threshold.

Resolution: the 234 floor belongs to drawer mode only. Once the inline list is
showing, the stage is `height - 220`, which is 220 or greater by definition, so
no floor is required and none can bind. 220 is still 52px clear of the 168
collision point.

## Mechanism

Pure CSS. No JavaScript, no re-render.

`.shell` currently carries `container-type: inline-size`. When the page sets a
height it gains `container-type: size` and an explicit height, so the default
path is untouched and pages that set no height behave exactly as they do now.
`size` queries both axes, so the existing `max-width` container queries keep
working unchanged.

There are then **two** rules, and the split between them matters.

Whenever a height is set, at every height, the stage drops `aspect-ratio` and
`max-height: 360` and becomes `flex: 1`. This is what makes the card fill its
slot. It is not conditional on the threshold: at a 300 slot a stage still
governed by `16 / 9` would be 231 at 411 wide and leave 69px of dead space,
which is the whole defect being fixed. The `min-height: 234` floor stays.

Then, and only above the threshold:

```css
@container (min-height: 440px) { ... }
```

Inside it the list becomes `flex: 0 0 220px` and is shown, the list icon is
hidden, and the stage's `min-height` is removed so the 14px conflict described
above cannot occur.

`aspect-ratio` and `max-height` therefore govern design C only when no height
is set, which is the page's default and every case that exists today.

Design C's markup gains the inline list alongside the drawer it already has, so
both are in the DOM and CSS shows one. `cMarkup` gains
`${isLive ? '' : listMarkup(d)}`, the same call design B already makes, so the
list is not a second component.

### Why CSS and not a JavaScript threshold

A JS switch means re-rendering the card while the height slider is dragged.
Re-render is what broke the drawer animation and the live track order earlier in
this project, and it would discard drawer state and focus on every crossing. The
cost of the CSS route is that design C carries both the inline list and the
drawer in the DOM and shows one of them. That duplication is contained and
`render()` rebuilds both together, so they cannot drift.

## Prototype page

A Height control beside the existing width slider.

- Default **Auto**, meaning no height is set and the page loads exactly as it
  does today. This is what keeps the change additive.
- Slider from **150** to **900**. 150 is deliberate; it is the shipped homepage
  slot height and the case worth being able to look at.
- A readout beside it, matching the width readout.

## Out of scope

- **Design B stays frozen at 444.** Above 440 the comparison is a card that
  grows beside one that does not. Worth knowing when reading results.
- **Design A** is commented out on the page and is not touched.
- **The shipping player** is not changed.

## Verification

Local headless Chrome, at 411 wide unless stated.

1. With no height set, every card measures exactly as it does today. This is
   the regression guard on the default path.
2. Design C at 150, 234, 300, 439, 440, 600 and 900 matches the behaviour table
   above, stage and list heights measured from `getBoundingClientRect`.
3. At 439 the list icon is present and the inline list is not visible; at 440
   the icon is gone and the inline list is 220. Both asserted on the same load.
4. **At 440 the card height is exactly 440**, not 454. This is the specific
   regression the floor conflict would produce.
5. At 150 the card is 234 and the shell clips it, with no scrollbar and no
   overflow past the shell.
6. Live design C at 150, 300 and 900 is stage only at the full height, floor
   234, no list and no list icon at any height.
7. The drawer still opens, animates and closes below 440, and the pause veil,
   share drawer and row overflow menus are unaffected.
8. Existing width container queries still fire after the `container-type`
   change, checked at the 239px lockup breakpoint.
9. No page errors on any of the above.

## Follow-ups, not in this change

- **The height contract is separable from the design.** "Fill the slot instead
  of clipping" could be applied to the current shipping player with no visual
  change and would fix the invisible list at the shipped 150. Much smaller than
  this change and it does not depend on which card design wins.
- Design B height response, if the comparison above 440 turns out to matter.
