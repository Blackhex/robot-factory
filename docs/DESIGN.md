# Robot Factory — Game Design Document

A 3D browser-based educational game built with Three.js where young learners (ages 10–14) design robot manufacturing processes using MakeCode-style visual programming blocks. Players place machines, connect them with conveyor belts, and write block programs that control machines in the factory — learning programming concepts (sequences, loops, conditionals, variables, functions, events) while optimizing production across speed, cost, and quality.

**Tech stack**: TypeScript + Vite + Three.js + Microsoft PXT + i18next (CZ/EN)
**Scope**: MVP — campaign (8–10 levels) + sandbox mode

---

## Core Game Loop

1. **Read the brief** — each level presents a robot order (e.g., "Build 5 explorer robots, each with a light chassis, a basic drivetrain, and a standard power unit").
2. **Place machines** — double-click empty grid cells to place machines (default type, changeable in properties panel). Single-click to select, drag to move, DEL key or Delete button to remove.
3. **Connect with belts** — drag from a machine’s I/O slot to another machine; the system auto-routes belts through the grid with collision avoidance (see [Machine & Belt Placement Rules](#machine--belt-placement-rules)).
4. **Program the factory** — open a PXT editor to write the control program: which parts to make, routing logic, conditional quality checks, loop-based batches.
5. **Run & observe** — press Start in toolbar; the 3D factory animates: parts slide on belts, machines process, robots assemble. A simulation info panel appears top-left showing live metrics, broken down so the player can see exactly what their factory has produced: **Parts** delivered (single-component items such as wheels, batteries, chassis, and circuits), **Assemblies** delivered (multi-component sub-assemblies such as drivetrains and power units), **Robots** delivered (fully-completed robots), **Time** elapsed, and **Quality** — the percentage of items that arrived at the Shipper non-defective. The Quality reading stays meaningful even in a parts-only run (it does not require any robots to compute); a clean stream reads near 100% and falls as defective items reach the Shipper. Use the Pause button (which toggles to Resume while paused) and the Restart button in the toolbar to control playback. Restart clears all in-flight items from belts and resets machine runtime state while preserving the placed factory layout.
6. **Score** — rated on 3 stars: ⚡ Speed (robots/min), 💰 Cost (waste, energy), ✅ Quality (defect rate). All three shown on a radar chart.

---

## Robot Parts (Functional)

| Part | Variants | Produced by |
| ---- | -------- | ----------- |
| Wheel | Small / Medium / Large | Wheel Press |
| Battery | Standard / High-capacity | Battery Assembly |
| Chassis | Light / Heavy | Chassis Stamper |
| Circuit Board | Basic / Advanced | Circuit Printer |

---

## Machines

| Machine | Input → Output | Block-control? |
| ------- | -------------- | -------------- |
| **Fabricator** | (no inputs) → Part | Recipe selection via blocks |
| **Assembler** | Up to 3 input parts → Sub-assembly / Robot | Assembly order via blocks |
| **Painter** | Item → Painted item | Color selection via blocks |
| **Recycler** | Item → recovered components, emitted one per tick at its output. A valid assembly returns all of its original components; a defective assembly returns all but one (randomly chosen). A defective basic part (with no components) is repaired and returned as a non-defective item of the same type; a valid basic part passes through unchanged. Every item the Recycler emits is non-defective. | Started/stopped via blocks; no recipe required |
| **Splitter** | Route items across one or more of three outputs (Left, Forward, Right — named from the perspective of an observer standing at the Splitter's input and looking into it, so Right is the side at that observer's right hand) | Player sets a persistent multiplexed output configuration with a "route items of" block. With multiple outputs enabled, items round-robin across them. Default: all three outputs enabled. A configured output side with no connected downstream belt is silently skipped from the round-robin, so a partially-wired Splitter routes everything through its connected sides instead of stalling on the unwired ones. If none of the configured sides are connected, the Splitter blocks until the player wires one of them or changes the configuration. Inside an "on item arrives" handler at a Splitter the player has two routing tools: "route items of" rewrites the persistent configuration (affecting this item and every later item until changed), while "route current item of <splitter> to <side>" routes only the item that just arrived and leaves the persistent configuration untouched. The per-item form is the right tool when fast-arriving items need different sides — it cannot be overwritten by a later arrival in the same tick. |
| **Shipper** | Items → Delivered (consumed) | Start/stop only; terminal sink while running |

All machines start in a **stopped** state at the beginning of each simulation run and remain stopped until the player's program explicitly starts them with a "start machine" block. A stopped machine holds its configuration (recipe, splitter routing rules, machine speed) but does not consume inputs, advance any internal timer, or produce output. A "stop machine" block pauses the machine without erasing its configuration, so a later "start machine" block resumes it with the same recipe. Restarting the simulation returns every machine to the stopped state. This includes the Shipper: it only accepts deliveries while running.

A recipe-driven machine (Fabricator, Assembler, Painter) only accepts an arriving item from a belt when its input slots still have room **and** the machine is not already holding a full batch of that item type for the current recipe. Concretely, if the recipe needs 2 Small Wheels and 1 Basic Circuit, the assembler will accept Small Wheels until it is holding 2 of them, and Basic Circuits until it is holding 1 — beyond that, additional items of the same type stay parked on the upstream belt and back-pressure propagates to the producing machine. This guarantees that a fast over-producer of one input type cannot fill the entire input buffer with its own output and lock the assembler into permanent idle while another required input type is missing. Items of a type the recipe does not list at all still trigger the unconsumable-delivery game over (see below) — the per-batch limit only governs how much of a *valid* input the machine will buffer at once.

A Fabricator is a special case because its recipe has no inputs at all. To make Fabricators safe to chain in a line — for example, when the player routes the output of one Fabricator past another Fabricator configured for the same part on its way to an Assembler — a Fabricator also accepts arriving items whose type **exactly matches the part its own recipe produces**. Matching arrivals queue in the Fabricator's input slots like any normal input (so a short burst of matching parts can buffer there instead of immediately back-pressuring the upstream belt). On each tick, a Fabricator with an empty output slot **prefers consuming a queued matching part over starting a fresh production cycle**: it moves the oldest matching part from its input queue to its output slot in FIFO order, without consuming any resources, without running its production timer, and without any chance of damaging the part (no defect roll). Only when the input queue holds no matching part does the Fabricator start a fresh production cycle. Once the input queue is full, further matching arrivals stay parked on the upstream belt; items of any other type arriving at a configured Fabricator still trigger the unconsumable-delivery game over, exactly as before.

Every machine that currently has a recipe configured shows a small **recipe-status badge** floating above its body. The badge is colored to match the recipe's output item and carries a small shape glyph that suggests the item family (wheel, battery, chassis, circuit, drivetrain, power unit, robot), so two machines configured for different recipes show two visibly different badges and the player can read each machine's job at a glance. The badge appears as soon as a recipe is set — including during the build phase, before the simulation has been started, so the player can confirm the program's recipe assignments by closing the editor — and disappears when the recipe is cleared. The badge is **white** when the program and the current belt layout together supply every required input type: for each input the recipe needs, some upstream machine (possibly several hops away through belts and splitters) is configured with a recipe that produces that input. A Fabricator's badge is always white because Fabricator recipes need no inputs. The badge is **red** as soon as at least one required input type has no upstream producer in the player's program and wiring. The color is derived statically from the program and the belt graph, not from the items currently sitting in input slots: once a simulation is running, the badge does not flicker between cycles, and it only changes color in response to the player editing the program (a new recipe assignment) or the belt layout. A persistently red badge means the player's plan is incomplete and they should add an upstream producer or wire one up. The badge always faces the camera as the view is rotated.

Each machine also has a **production-speed multiplier** that the player sets with a "set machine speed" block. The multiplier is an integer from 1 to 10 (default 1) that scales how quickly the machine produces a part: at speed 1 a recipe takes its full base processing time, and at speed N the same recipe finishes in approximately 1/N of that time (rounded up, never less than one tick). Speed is configuration — it survives starting and stopping the machine and is preserved when restarting the simulation only insofar as the program reapplies it on the next run, mirroring how "set belt speed" already works for conveyor belts.

**Speed has a quality cost: defective parts.** Each time a Fabricator, Assembler, or Painter produces a part, there is a chance the result is *defective*. The chance is determined entirely by the machine's current production-speed setting and rises linearly with speed: at speed 1 it is 2%, at speed 10 it is 35%, with intermediate speeds interpolated linearly between those endpoints. Defective parts are visibly distinct on belts (rendered red) so the player can spot them flowing through the factory. Defects propagate through downstream construction: an Assembler or Painter that consumes any defective input produces a defective output regardless of its own speed roll. The Recycler explicitly clears the defect — every item it emits is non-defective, whether it is a repaired basic part or a component recovered from an assembly. The Splitter is a pass-through machine: it preserves the defect flag on every item it routes. Defective parts that reach the Shipper are silently discarded: they do not count as delivered output and do not count as produced robots, but they do count as defects against the Quality metric — so an unmanaged defect stream visibly degrades the player's Quality star score even when the Speed star looks high. Programs that want to exploit high speed must include in-factory handling (use the "on item arrives" handler on a Splitter to route defective items to a Recycler, for instance) to keep them out of the Shipper. The defect roll is deterministic for a given simulation run so the same program produces the same results across replays.

---

## Programming Concepts → Block Mapping

| Concept | Blocks | Example in-game |
| ------- | ------ | --------------- |
| **Action** | "start machine", "stop machine", "set recipe", "set machine speed", "set belt speed" | Enable a Fabricator, pick the part it makes, and tune how fast it produces. The "set recipe" block's recipe dropdown is filtered by the machine currently selected in the same block: a Fabricator only offers fabricator recipes (no-input parts), an Assembler only offers assembler recipes (parts and robots that take input items). When the player changes the machine slot to a different machine type and the currently-selected recipe is no longer valid for the new type, the recipe field automatically resets to the first valid recipe for that type (when the new and old types share recipes, the selection is preserved). When no machine is selected, or the selected machine takes no recipe, the dropdown falls back to listing every recipe so the block remains usable. Every machine/belt picker keeps its identity across edits to the factory: deleting one machine while others remain does not silently re-bind a block to a different machine, and any block whose referenced machine has just been deleted is automatically re-pointed to the next available machine; when the last machine (or belt) is removed, the picker displays a localized "(no machine)" / "(no belt)" placeholder until a new one is placed. |
| **Sequence** | "do A, then B, then C" | Stamp chassis → attach wheels → attach battery |
| **Loop** | "repeat N times", "while belt not empty" | Produce 10 wheels in a loop |
| **Wait** | "wait N ms", "wait N ticks" | Delay the next block for a fixed amount of time (in milliseconds or in simulation ticks) before reconfiguring or stopping a machine |
| **Conditional** | "if/else", "current item is defective", "current item is &lt;part&gt;" | Branch on a runtime condition — e.g. inside an "on item arrives" handler at a Splitter, check whether the current item is defective and use "route current item of" to send it to a Recycler instead of forward |
| **Variable** | "set count to 0", "change count by 1" | Track produced robots, switch recipe after N units |
| **Function** | "define make-explorer-bot" | Reusable sub-program for a robot type |
| **Event** | "when order arrives", "when belt jams", "when machine idle", "on item arrives" (at any machine) | React to runtime events — e.g. flip a Fabricator's recipe the moment it finishes its current cycle, or rewrite a Splitter's output configuration based on the item that just arrived at it |

---

## Optimization Metrics (Multi-objective)

- **Speed** — robots produced per minute (target varies per level)
- **Cost** — raw materials used + energy (machines running idle = waste)
- **Quality** — % of items reaching the Shipper successfully versus items lost as defects. Defects originate at the Fabricator, Assembler, or Painter when they run at high speed; defective items are silently discarded at the Shipper and counted against the Quality metric. A clean factory raises the Quality star; a high-speed factory that ships its defects through the Shipper loses Quality stars.
- Displayed as a 3-star radar chart per axis; total 1–3 stars per metric = up to 9 stars
- **End of run.** A campaign run ends automatically the moment the player's factory delivers enough output to meet the level's production goal; the game then shows the Score Screen for that run. There is no manual "finish" button — the player either reaches the goal and is scored, or stays in the running simulation. Sandbox sessions never reach a Score Screen because they have no goals.
- **Restart while running.** The toolbar's Restart button while the simulation is running does NOT score the run. It resets the simulation to its pre-Start state — in-flight items are cleared, machine runtime state (running/idle, current cycle, queued inputs) is reset, the player's placed machines, belts, and program are preserved — and the player presses Start again to re-run. This behaves the same way in both campaign and sandbox modes.
- **Zero-output rule.** When the Score Screen does run, if for some reason the run is scored without ever delivering an item (e.g. an in-simulation Game Over interrupts before the first delivery), the score is 0 stars across every axis and the cost value is reported as a finite `0` (never `Infinity`).

---

## Level Progression (Campaign)

| # | Name | Teaches | Unlocks | Goal |
| - | ---- | ------- | ------- | ---- |
| 1 | First Part | Place a machine, set recipe, run simulation | Action blocks, Fabricator | Produce 3 small wheels |
| 2 | Assembly Line | Connect machines with belts, assembler | Assembler | Produce 3 explorer robots |
| 3 | Mass Production | Loops: "repeat 10 times" | Loop blocks | Produce 10 small wheels |
| 4 | Quality Matters | Conditionals: if/else for defect routing; the "route items of" and "route current item of" actions; the "on item arrives" event hat | Splitter, conditional blocks, "route items of", "route current item of", "on item arrives" | Produce 5 explorer robots, ≥80% quality |
| 5 | Smart Routing | Variables: count produced, switch recipe | Variable blocks | Produce 3 explorers + 3 workers |
| 6 | Custom Robots | Functions: define make-X-bot | Function blocks | Produce 2 explorers and 4 workers |
| 7 | Rush Order! | Events: "when order arrives" | Event blocks, Painter | Produce 10 workers under time limit |
| 8 | Optimize Everything | Free optimization: all 3 metrics matter | Recycler, all machines | Produce 10 explorers, ≥90% quality |
| 9 | Robot Expo (bonus) | Showcase: build a small mixed fleet | — | Produce 3 explorers and 3 workers, ≥50% quality |
| 10 | Factory Tycoon (bonus) | Multi-line production | All machines | Produce 5 explorers and 10 workers, ≥85% quality |

---

## Sandbox Mode

- All machines/blocks unlocked.
- No predefined goals; players set own targets.
- Sandbox sessions never reach the Score Screen (no goals to meet).
- **Projects panel.** While in Sandbox mode the toolbar shows a **Projects** action next to the **Code** action. Activating Projects opens a dockable side panel — visually mirroring the code editor panel, including a draggable resize handle — that lists every project the player has saved.
  - Each saved project is shown as a row labeled with its name. An always-visible "+ New project" placeholder sits at the end of the list.
  - **Renaming.** A saved project's name can be edited in place by clicking the name on its row and typing. Each keystroke is saved immediately — there is no separate confirm step. Pressing **Enter** while editing also commits the rename and clears the focus, giving players the familiar "I'm done" gesture. Clicking the name does not select or load the project; only clicks on the rest of the row do. The editable area sits flush to the right of the row's drag handle and shares the same left edge across every saved row, so the project names read as a clean vertical column. The editable area always offers a comfortable minimum click target (so even a two-letter name remains easy to click and focus) and grows wider as the name lengthens. The "+ New project" placeholder is not editable.
  - Each project row exposes inline **Save** and **Delete** actions. Pressing a row's Save overwrites that project with the current factory and program; pressing the "+ New project" row's Save prompts the player for a name and creates a new project. All confirmations use in-game dialogs styled to match the rest of the UI (no native browser prompts).
  - Double-clicking a project loads it: the factory grid, belts, and program in the editor are replaced by the saved state.
  - Double-clicking the "+ New project" placeholder asks the player to confirm starting a fresh project; on confirm the factory grid and the program in the editor are both cleared back to an empty starting state. On cancel nothing changes.
  - Each project row's **Delete** action asks for an in-game confirmation showing the project's name before removing it.
  - **Multi-selection.** A plain click selects a single project. Holding Ctrl (or Cmd on macOS) and clicking toggles a project in or out of a multi-selection. Selecting the "+ New project" placeholder clears any multi-selection.
  - **Import** opens a file picker that accepts one or more files. Every exported file carries the project name (or names), so importing always silently creates a new project for each entry, preserving the embedded names — the player is never asked to name an imported project.
  - **Export** writes the currently selected projects to a JSON file. The file always carries each project's name. Selecting one project exports a file named after that project. Selecting two or more projects exports a single shareable file containing all selected projects. With no selection, Export writes the live factory: if a project is currently loaded, it is exported under that project's name with no prompt; otherwise the player is asked to name the export, and cancelling or leaving the name empty aborts the export silently.
  - **Reordering.** Each saved project row carries a drag handle on its left side. Players reorder the list by dragging that handle to a new position; while dragging, the row visibly moves through the list to show its would-be position live, so the player sees the actual end state before releasing. Holding Ctrl (or Cmd on macOS) to multi-select multiple projects and dragging the group keeps the relative order of the selected rows. As an alternative, focusing a row with the keyboard and pressing **Alt+Up** or **Alt+Down** moves it one position; consecutive presses keep moving the same row without losing focus. The "+ New project" placeholder always stays at the bottom of the list and cannot be moved or dropped through. Newly saved projects are added at the bottom. The chosen order is saved immediately and persists across sessions. Releasing the pointer outside the panel cancels the drag and restores the original order.
  - **Dismissal.** Clicking anywhere outside the Projects panel — or pressing Escape — closes the panel. Clicks on the panel itself, on the toolbar **Projects** action, on the panel's resize handle, or inside any in-game dialog opened from the panel do not dismiss it. If a dialog is open, Escape closes the dialog first and a second Escape closes the panel.
- **Persistent edits.** Once the player has saved or loaded a project in the current Sandbox session, ongoing edits to the factory and program continue to be persisted to that project automatically. If
  the player has not yet saved or loaded a project in the session, no automatic persistence happens — the player must save explicitly to start tracking. Re-entering Sandbox mode restores the project that was most recently loaded or saved.
- **Sandbox-only.** The Projects panel and its actions are not shown in campaign levels; campaign progress is persisted through the per-level autosave described elsewhere.

---

## UI Shell, Localization & Responsive Layout

- **Global language toggle.** A single language-toggle control is
  reachable from every screen — Main Menu, Level Select, in-level
  (build and play phases), and Score Screen.
  Activating it switches the UI between English and Czech and re-renders
  every visible string in the new language without a page reload.
- **Default language follows the browser.** On the player's first visit
  the UI opens in the language matching their browser's preferred
  language when it is one of the supported languages (English or
  Czech); otherwise it opens in English. Once the player picks a
  language with the toggle, that choice is remembered across reloads
  and overrides the browser preference on subsequent visits.
- **Visual block editor follows the active language.** The visual
  programming editor renders in the active language end-to-end:
  toolbox category names, block labels (including built-in loops,
  logic, variables, and functions blocks as well as factory-specific
  blocks), dropdown values, flyout labels, and editor chrome (the
  Make-a-Variable / Make-a-Function buttons and dialogs). When the
  player opens the editor the first time, it opens in whatever
  language the rest of the UI is currently in. This translation must
  be fully functional from the very first load after a clean install
  — no separate post-install translation step or manual asset
  regeneration is required.
- **Mid-session language change is announced for the editor.** When the
  player switches the language while the editor is open, the rest of
  the UI re-renders immediately and the editor shows a brief,
  non-blocking notice that the change will apply to the editor on the
  next time it is opened or on the next page reload. Pressing Escape
  while the notice is visible dismisses the notice without leaving
  the level — Escape's normal "back to main menu" behaviour is
  suppressed for as long as the notice is on screen, so the player
  cannot accidentally exit the level by trying to dismiss the
  notice.
- **Locale exposure to assistive tech.** The active language is mirrored
  to the document so screen readers and search engines report the
  correct locale at all times.
- **Keyboard focus visibility.** Every interactive control shows a
  visible focus ring when reached via keyboard navigation, so players
  using only a keyboard can always tell which element is focused.
- **Consistent visual theme across the editor.** Dialogs and panels
  surfaced by the visual programming editor — including the function
  definition dialog opened when the player creates a reusable
  sub-program — use the same dark surface, accent colour, typography,
  and rounded corners as the rest of the game, so opening an editor
  dialog never feels like jumping into a different application.
- **Responsive reflow with the editor open.** Opening the PXT editor at
  small viewports (down to 1024×768) must not clip or hide essential
  in-level UI: the level brief / objective panel, the toolbar, the
  Shipper machine, and the tutorial pointer must all remain reachable
  and unobstructed by the editor panel.
- **Side panels shrink the game area instead of overlaying it.** Opening
  the code editor or the Projects panel narrows the 3D game area to the
  side opposite the panel; closing them restores the game area to full
  width. The 3D scene is never hidden behind a side panel — the visible
  game area always matches the area not occupied by panels, whether a
  panel is opened, closed, or resized via its drag handle.
- **Tutorial dimming respects open side panels.** When the tutorial
  highlights an action the player must take inside the code editor, the
  darkened tutorial backdrop must not cover the open editor (or
  Projects panel). The player can always see the editor content the
  tutorial is asking them to interact with, while the rest of the
  screen remains darkened to keep focus on the current step.
- **Game-area panels follow the visible game area.** In-game overlay
  panels that float over the 3D scene — the simulation info panel
  (top-left, shown while a run is playing) and the machine and belt
  properties panels (bottom-left, shown when the player selects a
  placed machine or belt) — are anchored to the visible game area, not
  to the viewport edge. When a side panel opens or its resize handle is
  dragged, these in-game panels slide along with the visible game area
  so they always sit inside it and are never covered by, and never
  obscure clickable controls of, a side panel.
- **Default camera orientation.** The first time the player enters the
  game area, the camera frames the factory so the west-south corner of
  the board is closest to the player (front of the view) and the
  east-north corner is farthest (back of the view).
- **Camera refits to the visible game area.** Whenever a side panel is
  opened, closed, or its resize handle is dragged, the 3D camera refits
  to the new game area so the factory stays fully framed and
  pointer-to-cell selection stays accurate at every panel width. The
  refit changes only zoom and pan (the board is re-centered in the
  visible region at a fitting distance) — whatever orbit angle the
  player has chosen with the mouse is preserved.
- **View action.** A toolbar **View** button re-frames the factory so
  the whole board fits the current visible game area, re-centering the
  view and resetting any manual pan or zoom. The player's current
  orbit angle is preserved — the View action only resets zoom and pan,
  it does not snap the camera back to the default orientation.
- **Keyboard camera pan (W / A / S / D).** While the game area has
  keyboard focus the player can pan the camera over the factory with
  the W / A / S / D keys: W pans forward into the scene, S pans back, A
  pans left, D pans right. The pan is relative to the current camera
  orientation (W always moves "into the screen" no matter how the
  camera is rotated). Holding two adjacent keys pans diagonally.
  Holding two opposite keys cancels out and the camera does not move.
  Pan speed scales with the current zoom so the same key-press feels
  consistent whether the player is zoomed close in or pulled all the
  way out. The keys are bound by physical position so the same keys
  work on Czech, QWERTY, AZERTY, Dvorak, and other keyboard layouts.
  The camera does NOT pan while the player is typing in any text input
  (so typing a project name or other text never accidentally moves the
  camera) and does NOT pan when a modifier key (Ctrl / Cmd / Alt) is
  held (so keyboard shortcuts like Ctrl+S are never re-interpreted as
  camera moves). Starting a manual pan immediately overrides any
  in-progress automatic camera move (such as the auto-fit that runs
  when the player opens or resizes a side panel), so the player always
  has the final say over where the camera is looking.
- **Keyboard side-panel toggles (E and Q).** While the game area has
  keyboard focus, single-key shortcuts toggle each side panel exactly
  as if the player had clicked its toolbar action. Pressing **E**
  toggles the code editor (available in level mode and Sandbox mode).
  Pressing **Q** toggles the Sandbox **Projects** panel (Sandbox mode
  only — the Projects panel does not exist outside Sandbox, so Q does
  nothing in level mode or on the main menu). Both shortcuts are
  suppressed while the player is typing in any text input (so typing
  the letter `e` or `q` into a project name, dialog field, or code
  editor never opens or closes a panel). Toggling a panel by shortcut
  produces the exact same visual outcome as clicking its toolbar
  action — the same panel slide, the same canvas reflow, the same
  camera refit, the same UI click sound — so toggles can be freely
  mixed between the keyboard and the toolbar without any drift in the
  resulting state.
- **Keyboard simulation and view shortcuts (F, R, Space, Esc).** While
  the game area has keyboard focus, four additional single-key
  shortcuts trigger the same actions as the matching toolbar buttons.
  **F** starts the simulation, pauses it while running, and resumes it
  while paused — like a media-player play/pause button. **R** restarts
  the current run. **Space** triggers the same View action as the
  toolbar button — it re-frames the factory to the visible game area
  (resetting zoom and pan, preserving the current orbit angle), without
  scrolling the page. **Esc** returns
  the player to the main menu, but only after first letting any open
  dialog or the Sandbox **Projects** panel close — pressing Esc with
  one of those overlays open closes the overlay first, and a second
  Esc takes the player to the main menu. All four shortcuts are
  suppressed while the player is typing in any text input or while a
  modifier key (Ctrl / Cmd / Alt) is held. Space additionally yields
  to focused buttons and links, so keyboard navigation of the toolbar
  still activates buttons normally with Space rather than moving the
  camera. Triggering an action by shortcut produces the exact same
  visible outcome as clicking its toolbar button — the same panel
  changes, the same camera move, the same UI click sound — so the
  player can freely mix keyboard and toolbar control without any
  drift.

---

## Game Over

A run ends in **Game Over** in any of these situations:

1. **Unconsumable delivery.** A conveyor belt delivers an item to a machine that cannot consume it — for example, a `wheel_small` arriving at a `part_fabricator` with no recipe set, at an `assembler` whose recipe does not list `wheel_small` as an input, or at a stopped Shipper that has not been started yet. Started pass-through machines (Splitter, Recycler) accept any item type, and a started Shipper accepts any non-defective delivered item.
2. **Recipe-required machine started without a recipe.** Starting a recipe-driven machine (Fabricator, Assembler, Painter) before a recipe has been set on it ends the run immediately, on the same tick the start command is processed. The Recycler, Splitter, and Shipper are *not* recipe-driven and may be started without configuring a recipe.
3. **Starvation.** A started recipe-driven machine has received at least one item but cannot ever start processing because one of its required input types is missing AND no machine reachable upstream through the conveyor-belt graph is positioned to produce that missing type. Reachability follows belts backwards from the starved machine through every machine that pushes onto a belt feeding it, recursively. An upstream machine only counts as a reachable producer when it has been started AND has a recipe configured whose outputs include the missing type — a stopped machine, even one with the right recipe already set, does not rescue a starved downstream machine, because configuration alone does not produce parts. The check fires immediately on the tick the missing input is first observed; transient backpressure where the missing input simply has not arrived yet (because some upstream chain still produces it) does not count as starvation.

When triggered:

- The simulation pauses (`sim.paused === true`) and `sim.tick()` becomes a no-op until reset.
- A single `game_over` event is emitted with `{ reason, machineId, tick, ... }`. For unconsumable deliveries the event also carries `itemId` and `itemType`; for the started-without-recipe case those item fields are omitted because no item was involved.
- For unconsumable deliveries, the offending item stays parked at the end of the belt (it is **not** added to the machine's input slots and no delivery counters increment).
- The UI shows a Game Over modal offering **Restart Level**. The modal renders above every other UI element, including the open code editor — the player can always read it and reach the Restart button without first dismissing the editor. Its message explains the failure in player-facing language using the machine and (when relevant) item names the player sees in the game; when the problem is that a destination machine was never started, the message states that the machine is stopped and tells the player which machine to start; when the problem is a started machine without a recipe, the message names the offending machine and tells the player to set a recipe before starting it. Internal identifiers are never shown.
- Restarting clears in-flight state (including the game-over flag) and the player resumes from the build phase.

---

## Machine & Belt Placement Rules

### Grid & Belts

- 2D grid, default 20×20, coordinates `(x, z)` with `0 ≤ x < width`, `0 ≤ z < height`. Each cell is 1 unit; all placement snaps to integer coordinates. A cell holds at most one machine.
- Belts form a continuous directional path from an output slot to an input slot, made of straight (H/V) or corner segments (4 orientations). Belts only pass through empty cells and never cross themselves, other belts, or machines.
- A belt's **segment count** equals the number of intermediate cells it occupies (excluding the source and destination machine cells). The path internally includes both machine endpoints for connection metadata, but machines occupy their cells entirely — belt segments are only the cells between them.

### Machine I/O Slots

- **Default machines** (Fabricator, Painter, Recycler): one input + one output on opposite sides; the other two sides are blank and cannot accept belts.
- **Splitter**: one input + three outputs, one per remaining side. The three outputs are addressable in player programs as **Left**, **Forward**, and **Right** relative to an observer standing at the Splitter's input and looking into it — so for a Splitter whose input faces south (i.e. front faces north), Right points east on the map and Left points west.
- **Assembler**: three inputs + one output (one per side).
- **Shipper**: four inputs (back, right, left, front), no outputs; delivered items are consumed and counted.

### Slot-Blocking Constraint

A machine's slot must not point directly at a neighboring machine, and no neighbor's slot may point at this machine's cell. This applies symmetrically to **placement**, **rotation**, and **movement** (destination cell). Splitters and Assemblers (slots on all 4 sides) therefore cannot be placed adjacent to any other machine.

### Machine Placement

- **Double-click** an empty in-bounds cell to place a machine (default type: Fabricator; default orientation: input facing west, output facing east). The cell must be empty (no machine or belt). If the default orientation would violate the slot-blocking constraint, the next clockwise rotation is tried; if none of the four rotations satisfy the constraint, no machine is placed.
- The newly placed machine is selected and the **machine details panel** opens for type change.

### Belt Placement

Drag from a machine's input or output slot to another machine. The clicked slot is the **explicit source slot**. The **target machine is never auto-rotated** — its current orientation is preserved on every belt drop. As the cursor moves the system continuously recomputes the path:

1. **Resolve the target slot**:
   - **Slot-targeted** (cursor over a specific target slot): that slot is *preferred*. If no valid placement exists at it (wrong type, occupied, or unreachable), fall back to machine-body picking on the same target machine.
   - **Machine-body** (cursor over the body, or fallback from slot-targeted): pick the target's free slot of the complementary type (output↔input). For machines with multiple slots of the same kind (Splitter, Assembler), pick the free slot closest to the source slot.
   - If no target slot can be resolved, the path cannot be created.
2. **Resolve the source rotation** (only if the source machine has no existing belts; otherwise its rotation is locked):
   - All four rotations are evaluated; the shortest non-colliding placement wins.
   - Rotations whose source slot would point at a neighboring machine are **skipped** (same slot-blocking rule). Two adjacent machines can never be connected by a straight zero-segment belt; the planner routes around via an L-shaped 2-segment path (two corner cells) instead.
   - If no rotation yields a valid placement, the originally-derived rotation is kept and the ghost renders red.
3. **Reverse-slot fallback** (only when the player explicitly clicked a source slot): the explicit slot has precedence. If — and only if — no placement is possible **because the target has no free slot of the complementary type** (no sibling slot to fall back to either), the system falls back as a **last resort** to the opposite direction (source↔target swapped, slot type flipped). The fallback does NOT fire when the target has a free complementary slot but no rotation/path works (ghost stays red).
4. **Resolve the shortest path** from source slot to target slot. When no collision-free path exists (red ghost), the planner prefers a path that correctly exits the output slot and enters the input slot (slot-direction-aligned) over a shorter path that ignores slot directions.
5. **Live preview while dragging**: transparent ghost = valid placement; transparent **red** ghost = no valid path. When the planner determines a source rotation, the source machine **visually rotates during the drag** (animated ~150 ms tween) so the player sees the planned orientation before committing. If the cursor moves to a position where no rotation is needed or no valid path exists, the source reverts to its original rotation. On drop, the belt is committed and the source rotation is applied to the game layer (no additional animation needed since the preview already matches).

### Selection

- **Single-click** on a machine body or belt selects it (only one selection at a time). Single-click on an empty cell deselects.
- Selection highlights the entity and opens the corresponding **details panel** (machine or belt).
- **Double-click** on a belt has no effect.

### Machine Details Panel

When a placed machine is selected, the details panel opens with an editable **name field** at the top — the player can give the machine a custom name (e.g. "Main Mixer") that is saved on every keystroke; pressing **Enter** also commits the rename and clears the focus. Below the name, the panel shows live diagnostic information that updates every frame while the simulation runs:

- **Recipe** — the recipe currently set on the machine (localized name), or a placeholder when no recipe is set.
- **Needs** — the inputs the current recipe requires, grouped by type and counted (e.g. "2× Small Wheel, 1× Basic Circuit"). Hidden when no recipe is set or when the recipe needs no inputs (e.g. a Fabricator recipe).
- **Makes** — the outputs the current recipe produces, grouped by type and counted (e.g. "1× Basic Drivetrain"). Hidden when no recipe is set.
- **State** — whether the machine is *idle*, *processing*, or *blocked* (output full).
- **Produced** — the running count of items the machine has produced this run.
- **Inputs** — the items currently sitting in the machine's input slots, grouped by type and counted (e.g. "2× Small Wheels, 1× Basic Circuits"), or a placeholder when the slots are empty.

These rows let the player diagnose why a machine isn't producing — for example, a machine permanently in *idle* with the wrong mix of items in *Inputs* tells the player the upstream feed is unbalanced.

The Belt Details Panel works the same way for selected belts: an editable **name field** at the top (saved per keystroke; **Enter** commits and clears focus), with read-only diagnostic rows showing the belt's segment count, source, and destination.

### Machine Rotation

- **Double-click** an existing machine rotates it 90° clockwise. If the target rotation violates the slot-blocking constraint, it is skipped and the next clockwise rotation is tried; if none is valid, the machine stays put.
- The rotation is **animated** over ~150 ms (smooth tween using shortest-path interpolation). Slot indicators, arrows, and the machine icon follow the body rotation in sync.
- All connected belts are recomputed for the new slot positions; other connected machines are never rotated. Belts that cannot be recomputed are removed.
- Same rules apply to Splitter and Assembler.

### Machine Movement

- **Drag** from a machine body to move it. The destination must be in-bounds, empty, and satisfy the slot-blocking constraint.
- Connected belts are continuously recomputed during the drag (same belt placement rules). Belts that cannot be reconnected with both machines' rotations locked are hidden from the preview — matching the final outcome where those belts are removed.
- **Live preview**: transparent ghost = valid; transparent **red** ghost = invalid (collision or slot violation for the machine). Ghost belt paths only appear for belts that will survive the move.
- A drop on a valid destination is committed even if some belts cannot be recomputed — those belts are removed.

### Deletion

- **`Delete` key** or the details panel's **delete button** removes the currently selected machine or belt.
- Deleting a machine also deletes all belts connected to it.

### Editing during a running simulation

Machine movement, rotation, deletion, and belt deletion are allowed at any time while the simulation is running. The requirements below ensure these edits stay deterministic and visually smooth.

- **Live-edit pause boundary.** Drags do not pause the simulation while the pointer is held; the drag preview is non-committal. Only a valid drop that commits a move and belt recomputation pauses the simulation atomically for the commit, captures and adjusts in-flight belt inventory against the new topology, then resumes. Cancelled, invalid, and no-op drops never pause. All belt-inventory migration runs at the edit boundary, never mid-tick, so the simulation stays deterministic.
- **Belt cell topology.** Each belt cell holds up to two items at once. Two items on the same cell are always separated by at least half the cell's length, so they remain visually distinct as the back item trails the front item along the cell. A logical belt's inventory capacity is therefore twice its segment count. Adjacent cells join continuously at shared boundary midpoints with no half-cells, so a stream traverses a chain without visual gaps or overlaps regardless of whether neighbouring cells are straight or corner.
- **Uniform cell time.** Every belt cell is traversed in the same number of ticks regardless of its world-space arc length; raising belt speed scales every cell's traversal proportionally. Items emitted at a uniform rate from a single source travel as an evenly-spaced stream — actual spacing is determined by the producing machine's output rate and the belt speed, not by cell shape or position along the chain. With two-item-per-cell capacity, a fast producer fills a chain twice as densely as a slow one, and back-pressure pads the back of the chain item-by-item rather than cell-by-cell.
- **Constant-rate handover.** A belt-to-belt boundary never stalls or accelerates a stream. Items advance across long chains at a uniform per-tick rate independent of where boundaries fall, with no extra tick consumed at any boundary. Handover into a partially-occupied downstream cell is allowed only when the receiving entry zone is clear of any existing item; otherwise the upstream item parks at the cell exit and waits.
- **Drift cap.** An item that has reached its cell's exit awaits handover or delivery; it never accumulates further travel distance while waiting, so back-pressure cannot cause unbounded drift. A back item on the same cell respects the same cap relative to the front item, so the front item's parking location upper-bounds the back item's progress.
- **Live-edit migration — slot-identity gated, source-anchored.** Every belt path carries source/destination slot identity. Items migrate as ordered belt inventory ONLY when a removed chain is replaced by a recomputed chain with the exact same source machine, destination machine, source slot, and destination slot; lanes that cannot be recomputed for the same slot pair are removed and their items destroyed (never rehomed onto unrelated belts by grid-cell overlap). Belts with missing or unknown slot identity never qualify as exact matches. On a matched migration, an item that was N cells from the source on the old chain stays N cells from the source on the new chain (source-anchored projection), and two items that shared an old cell remain on the same target cell when the cell-spacing rule allows it; items whose source-distance exceeds the new chain's length are dropped (capacity); collisions at the same target cell are resolved deterministically in flow order, with the colliding item advancing to the next free cell forward. Item identity is preserved across migration so visual interpolation and pause-hold survive the edit; items never visually shift unless their target cell is past the new chain's end. The player-set belt speed migrates under the same slot-identity rule: when a removed belt is replaced by a recomputed belt with the same source/destination/slot pair, the new belt inherits the previous belt's speed so a "set belt speed" block applied earlier in the program continues to apply after the move; belts that cannot be recomputed for the same slot pair fall back to the default belt speed, mirroring how their items are dropped.
- **Renderer co-motion with simulation truth.** The renderer must keep belt visuals locked to simulation truth at every belt speed:
  - The animated chevron texture on each belt scrolls at a rate proportional to that belt's current speed, so chevrons travel under items at the same apparent rate at every speed and at every frame rate. Two belts with different speeds in the same factory scroll at correspondingly different rates. Chevrons freeze whenever the simulation is paused or has not been started.
  - During continuous on-belt interpolation (frame-by-frame advance along a segment, including the cross-segment hand-over to the next cell in the same chain), items render smoothly: there must be no visible jump, teleport, or stutter when an item hands off from one segment to the next, at any belt speed, and the rendered position must stay within one simulation tick of truth on the active belt.
  - Outside continuous interpolation the renderer matches truth directly: it snaps to truth on first sight of an item and on non-chain belt transitions (live-edit migrations, deletions, teleports).
  - Pausing the simulation must not cause a visible jump on the click-to-pause transition: the first paused frame holds each item at its last rendered position so the layout looks identical to the last running frame. From the next paused frame onward the renderer settles every item to its simulation-truth position, so the player inspects a stable, evenly-spaced layout for as long as the simulation stays paused.

---

## Technical Architecture

### Key Library Choices

| Concern | Library | Rationale |
| ------- | ------- | --------- |
| 3D Rendering | **Three.js** (r170+) | Required per spec; mature, excellent TS types |
| Visual Programming | **Microsoft PXT** ([github.com/Microsoft/pxt](https://github.com/Microsoft/pxt)) | Best fit for ages 10–14, MakeCode-style UX, blocks + TypeScript dual editor, extensive docs, code generation, localization support |
| Build tool | **Vite 6** | Three.js recommended, fast HMR, TS out of box |
| Localization | **i18next** | Lightweight, JSON-based, works without framework |
| Camera controls | **three/examples/jsm/controls/OrbitControls** | Built into Three.js |
| Testing | **Vitest** | Vite-native, fast, TS support |
| E2E Testing | **Playwright** | Cross-browser E2E tests, auto-wait, built-in assertions, Vite webServer integration |
| UI overlays | **Plain HTML/CSS** | No framework needed for MVP; overlays on top of canvas |

### Simulation Engine

The factory runs as a **discrete tick-based simulation** (not real-time physics):

```text
Simulation loop (10 ticks/second, configurable):
  1. Run PXT program interpreter (produces commands)
  2. For each Machine:
     - If idle + has input → start processing (set timer)
     - If processing + timer done → output item
     - If blocked (output full) → stall
  3. For each ConveyorBelt:
     - Each belt models a single cell-to-cell segment and holds at most
       one item at a time (one-item-per-cell contract).
     - Advance the held item along the segment by belt.speed * dt
     - If item reaches end → hand off to the next segment or deliver to
       the connected machine input
  4. After each item is delivered to any machine input, fire the player's
     "on item arrives" handler for that machine (if registered). Any
     reconfiguration commands the handler emits (e.g. "route items of")
     are queued for the next tick.
  5. For each Splitter holding an item: route it to one of its enabled
     outputs in round-robin order over the configured set
     (Left / Forward / Right or any combination). Default: all three
     enabled. The route is determined by the Splitter's own persistent
     configuration at the moment of the route — the player can rewrite
     that configuration from any "on item arrives" handler.
  6. Update scoring accumulators (items delivered to Shipper, defects, cost)
  7. Emit events (order complete, belt jam, etc.) → trigger event blocks
```

Simulation runs in pure logic (no Three.js dependency). Rendering observes simulation state each frame and interpolates 3D positions for smooth visuals at 60fps even though simulation ticks at 10/s.

### PXT Integration

The project uses a **custom PXT target** to provide the full MakeCode editor experience. **Do not import Blockly directly** — all visual programming is provided through the PXT framework, which uses Blockly internally but exposes its own higher-level APIs.

#### Architecture

1. **PXT target** (`pxt-target/`) defines custom Robot Factory blocks using PXT's TypeScript annotation syntax (`//% block`). The target is built with `pxt staticpkg` into a self-contained editor served from `public/pxt-editor/`.
2. **PXT editor** is embedded as an `<iframe>` in the game UI (right panel or bottom drawer), providing both Blocks and TypeScript editing modes out of the box — the hallmark MakeCode dual-editor experience.
3. **PxtEditor.ts** (`src/editor/PxtEditor.ts`) manages the iframe lifecycle and communicates via PXT's `postMessage`-based Controller API:
   - Sends: `importproject`, `switchblocks`, `setToolboxDefinition`
   - Receives: compiled TypeScript source, workspace save state, editor ready events
4. **BlockInterpreter.ts** executes the PXT-compiled TypeScript via `new Function()` and collects simulation commands. Namespace objects (`machines`, `belts`, `loops`, `logic`, `variables_`, `functions_`, `events`) and enum objects (`Machine`, `PartType`, `Recipe`, `Belt`, `FactoryCondition`) are injected into the execution scope. Each namespace method produces `SimulationCommand` objects (e.g., `START_MACHINE`, `SET_RECIPE`). The `recipes` namespace is kept as a backward-compatible alias that forwards to `machines`. Supports both PXT-inlined numeric enum values and string enum names from the fallback textarea. Enforces strict mode, 10,000 operation limit, and 100-level call depth limit.
5. **Pluggable machine/belt selection on every consumer block**: PXT enum types (`Machine`, `Belt`) compile to static `const enum` values (0–7). Every consumer block — `set recipe`, `start machine`, `stop machine`, `set machine speed`, `set belt speed`, and the `on machine idle` event hat — declares its machine/belt parameter as a **typed pluggable value input** (the parameter is declared `number` in the API so PXT will compile any expression for it, then a `//% machine.shadow="factory_pick_machine"` / `//% belt.shadow="factory_pick_belt"` directive supplies the default reporter shadow). Players can leave the default machine/belt picker in place, drop a free-standing `factory_pick_machine` / `factory_pick_belt` reporter into the slot, or attach a Blockly variable holding a machine/belt selection. The `factory_pick_machine` and `factory_pick_belt` reporter blocks themselves still render as a `Blockly.FieldDropdown`, and `PxtEditor` runtime-patches `Blockly.FieldDropdown.prototype.getText`/`getOptions` to substitute live machine/belt display names for fields named `machine` or `belt`, falling back to a localized empty-state label when no machines/belts are placed. When the toolbox flyout is open and the player places or removes a machine/belt without closing the editor, the flyout blocks update their displayed names immediately — no need to close and reopen the category. The `BlockInterpreter` stores a dynamic machine/belt list (`setMachineList()`, `setBeltList()`) and resolves machine references by slot index (for PXT-inlined numeric values), enum name (for `Machine.X` strings), or display name (for user-typed machine names). Factory change notifications from `GridInteraction.onFactoryChanged` trigger `syncFactoryToEditor()` in main.ts, which maps factory state to the editor. **Hat-shape preservation for `on machine idle`**: PXT requires `//% handlerStatement=1` on `events.onMachineIdle` so its handler body decompiles correctly when the block also has a non-handler value input (the pluggable `machine` slot); that directive forces both `previousConnection` and `nextConnection` notches, which would visually break the event-block hat shape. `src/editor/hatBlockShape.ts` patches `Workspace.prototype.newBlock` and the `Xml.domToWorkspace` / `appendDomToWorkspace` / `domToBlock` loaders to call `setPreviousStatement(false)` / `setNextStatement(false)` on `factory_on_machine_idle` blocks after construction, so the block stays a free-standing hat while keeping its decompilable handler body.
6. **On-idle simulation→interpreter event bridge**: `Machine` carries a `firstIdleAfterStartPending` flag set on the false→true edge of `start()` and cleared in `stop()` / `clearRuntimeState()`. After each `Machine.tick()`, `Simulation.updateMachines` emits a synthetic `machine_cycle_completed` event (payload `{ machineId }` only, intent-honest) when a freshly-started machine remains idle without producing anything — covering the case of an Assembler with no inputs, where no real cycle event would otherwise fire. `wireSimulationEffects` subscribes to both `machine_state_changed { to: 'idle' }` and `machine_cycle_completed`, calls `pxtEditor.triggerEvent('machine_idle_<id>')`, and enqueues the resulting `SimulationCommand`s back onto the simulation queue, so the user's `on machine idle` handler body actually executes.
7. Commands are fed into the Simulation each tick.

#### Block Definitions (PXT target)

Blocks live in `pxt-target/libs/robot-factory/factory.ts` and use PXT's annotation-based syntax:

```typescript
//% color=217 weight=100 icon="\uf0e7" block="Factory"
namespace factory {
    export enum PartType {
        //% block="Small Wheel"
        WheelSmall,
        //% block="Standard Battery"
        BatteryStandard,
    }

    //% block="set recipe of %machine to %recipe"
    //% blockId=factory_set_recipe
    //% machine.shadow="factory_pick_machine"
    //% group="Actions"
    export function setRecipe(machine: number, recipe: Recipe): void { }

    //% block="repeat %count times"
    //% blockId=factory_repeat_times
    //% group="Loops" color=120
    export function repeatTimes(count: number, body: () => void): void { }

    //% block="if quality < %threshold then"
    //% blockId=factory_if_quality
    //% group="Conditionals" color=60
    export function ifQuality(threshold: number, body: () => void): void { }
}
```

#### Controller Communication

```typescript
// PxtEditor.ts — simplified flow
const iframe = document.createElement('iframe')
iframe.src = '/pxt-editor/index.html#controller=1'
container.appendChild(iframe)

window.addEventListener('message', (ev) => {
  const msg = ev.data
  if (msg.type === 'pxteditor' && msg.action === 'workspacesync') {
    // Extract TypeScript source from the response
    const tsSource = msg.resp.main
    commands = blockInterpreter.parseTypeScript(tsSource)
  }
})
```

### 3D Rendering Strategy

- **Grid floor**: PlaneGeometry with grid shader or GridHelper.
- **Machines**: Low-poly GLTF models (can start with colored BoxGeometry placeholders).
- **Conveyor belts**: Flat PlaneGeometry segments between adjacent grid cells, rendered per segment with directional shading.
- **Items on belts**: InstancedMesh — one per item type, updated each frame from simulation state.
- **Camera**: Isometric-ish perspective (45° elevation), OrbitControls with constrained rotation.
- **Performance target**: 60fps with 200+ items on screen (InstancedMesh handles this easily).

### Save/Load

Factory state serialized as JSON:

```typescript
interface FactorySave {
  version: number
  grid: { x: number; z: number; machineType: string; rotation: number }[]
  belts: { from: [number, number]; to: [number, number]; speed: number }[]
  pxtWorkspace: string  // PXT project serialization
  levelId?: string
}
```

Stored in `localStorage`; exportable as `.json` file for sharing.

### Project Structure

```text
robot-factory/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── pxt-target/                  # PXT custom target (built separately)
│   ├── pxtarget.json            # Target configuration
│   ├── targetconfig.json        # Editor theme & features
│   ├── libs/
│   │   └── robot-factory/
│   │       ├── pxt.json          # Library metadata
│   │       ├── factory.ts        # Block definitions (//% block annotations)
│   │       ├── enums.d.ts        # Shared enums for blocks
│   │       └── _locales/         # PXT i18n strings (en, cs)
│   └── built/                    # Build output (gitignored)
├── public/
│   ├── pxt-editor/              # Built PXT editor (via pxt staticpkg, gitignored)
│   ├── models/                  # GLTF machine & robot part models
│   ├── textures/                # Material textures
│   └── audio/                   # Optional audio assets (project currently uses procedural UI/error/success SFX)
├── src/
│   ├── main.ts                  # Entry point, bootstrap
│   ├── game/
│   │   ├── GameManager.ts       # Top-level state machine (menu → level → play → score)
│   │   ├── Factory.ts           # Factory grid, machine/belt placement, simulation tick
│   │   ├── Machine.ts           # Base machine class + subclasses per type
│   │   ├── ConveyorBelt.ts      # Belt path, item transport logic
│   │   ├── Item.ts              # Part / sub-assembly / robot entity
│   │   ├── Recipe.ts            # Input→Output definitions
│   │   ├── Simulation.ts        # Discrete-event simulation engine (tick-based)
│   │   ├── Scoring.ts           # Speed/Cost/Quality calculation
│   │   └── Level.ts             # Level definitions, goals, unlock rules
│   ├── editor/
│   │   ├── PxtEditor.ts         # PXT iframe controller (postMessage API)
│   │   ├── BlockInterpreter.ts  # Executes PXT-compiled TypeScript via runtime injection → simulation commands
│   │   └── FactoryToolbox.ts    # Sends toolbox config to PXT editor per level
│   ├── rendering/
│   │   ├── SceneManager.ts      # Three.js scene, camera, renderer, lights
│   │   ├── FactoryRenderer.ts   # Renders grid, machines, belts in 3D
│   │   ├── ItemRenderer.ts      # InstancedMesh for items on belts
│   │   ├── RobotPreview.ts      # 3D preview of assembled robot
│   │   └── CameraController.ts  # Orbit + pan + zoom controls
│   ├── ui/
│   │   ├── HUD.ts               # In-game HUD (speed, cost, quality meters)
│   │   ├── LevelSelect.ts       # Level selection screen (HTML overlay)
│   │   ├── ScoreScreen.ts       # Post-level star rating display
│   │   ├── TutorialOverlay.ts   # Step-by-step tutorial tooltips
│   │   └── MainMenu.ts          # Title screen
│   ├── i18n/
│   │   └── i18n.ts              # i18next initialization
│   ├── audio/
│   │   └── AudioManager.ts      # Procedural UI/error/success SFX
│   └── utils/
│       ├── SaveLoad.ts          # Serialize/deserialize factory state to JSON
│       ├── GridUtils.ts         # Grid coordinate utilities
│       └── MathUtils.ts         # Common math helpers
└── tests/
    ├── unit/
    │   ├── simulation.test.ts
    │   ├── interpreter.test.ts
    │   └── scoring.test.ts
    └── e2e/
        ├── Navigation.spec.ts       # Screen transitions
        ├── FactoryBuild.spec.ts     # Machine placement, belt drawing
        ├── PxtEditor.spec.ts        # PXT editor interaction
        ├── SimulationPlay.spec.ts   # Play/pause/stop, HUD updates
        ├── LevelFlow.spec.ts        # Full level completion
        ├── SaveLoad.spec.ts         # Save/reload/restore cycle
        ├── Localization.spec.ts     # Language switch verification
        ├── Responsive.spec.ts       # Viewport size testing
        └── CrossBrowser.spec.ts     # Chromium, Firefox, WebKit
└── playwright.config.ts             # Playwright configuration
```

---

## Design Decisions

- **PXT over raw Blockly or Rete.js** — PXT's MakeCode-style UX is proven for ages 10–14 (used in MakeCode Arcade, micro:bit). PXT is built on Blockly internally but provides a polished editor, TypeScript compilation, built-in localization, and a dual blocks/TypeScript editing mode. **Do not import Blockly directly** — use PXT's target system and controller API. Rete.js is better for advanced users but too complex for this audience.
- **Tick-based simulation over continuous physics** — simpler to reason about, easier to score deterministically, no physics engine dependency.
- **Grid-based placement** — snap-to-grid is intuitive for young players, simplifies belt routing, avoids floating-point alignment issues.
- **HTML overlay UI over in-3D-scene UI** — PXT requires DOM; keeping all UI in HTML keeps things simple and accessible.
- **No ECS framework** — the entity count is moderate (<1000 items); a simple class-based model (Machine, Item, Belt) is clearer for MVP. Can migrate to bitECS later if perf needs grow.
- **No React/Vue** — plain HTML/CSS overlays are sufficient for MVP UI complexity. Avoids framework dependency for a game.
- **InstancedMesh for items** — single draw call per item type, handles 1000+ items at 60fps.
- **Functional robot parts** (wheels, batteries, chassis, circuits) chosen over humanoid — aligns better with programming/engineering educational theme.

## Further Considerations

1. **3D Asset Pipeline** — placeholder box meshes are fine for early phases. For polish, consider Kenney.nl free game assets or simple Blender models. If time is short, stylized low-poly boxes with distinct colors/decals work well for the target age group.
2. **Infinite Loop Protection** — the BlockInterpreter must enforce a max iteration count (e.g., 10,000 operations per tick) to prevent student programs from freezing the browser. Show a friendly "Your program ran too long! Try using fewer loops." message. PXT also has built-in infinite loop detection that can be leveraged.
3. **Future Multiplayer** — the current design is single-player. The JSON save format could be extended for a future "share & compete" mode where players upload factory designs and compare scores on a leaderboard. This is explicitly out of MVP scope.
