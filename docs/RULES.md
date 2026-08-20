# Desktop character-generation rules

This document exists so that the web port can be built without opening the C++. It describes what the desktop *BattleTech Character Creator* actually does, not what the published *A Time of War* rulebook says it should do.

## Front matter

### 0. How to read this document

**Role.** This file's entry in the repository's documentation map:

- `docs/RULES.md` — the desktop application's character-generation rules, every claim cited to `Battletech-Character-Creator@a1d8009`.

**Canon.** The C++ at `Battletech-Character-Creator` revision **`a1d8009`** defines the rules. Where the code appears to contradict the published rulebook, **the code wins** and the suspicion is recorded in [§9](#9-desktop-bugs-and-internal-inconsistencies) as an unresolved note — never silently repaired in this text. Cross-checking against the rulebook is out of scope.

**Revision pin.** Every `file:line` below is valid **only** at `a1d8009`. Line citations without a revision are meaningless; if the checkout moves, re-validate before trusting a number.

**Citation convention.** Paths are relative to the root of the `Battletech-Character-Creator` checkout: `mainwindow.cpp:830-833` means lines 830 through 833 of the top-level `mainwindow.cpp`. A range is inclusive at both ends. Where a claim rests on a single statement, a single line is cited.

**Citation guardrail.** Only these sources are cited:

- the flat top-level `.cpp` / `.h` files (`mainwindow.cpp`, `wizard.cpp`, `chardata.cpp`, `stage1_resurce.cpp` … `stage4_resurce.cpp`, `text_resurce.cpp`, `loadresurce.cpp`, the seven dialog pairs, …);
- the **hand-authored** `.ui` FORMS declared in `btnchrcreator.pro:36-49` — `wizard.ui` is one of them (`btnchrcreator.pro:47`);
- the data files under `resource/`.

Never cited, even though they exist and would resolve: the Qt resource blob `qrc_resurce_btnchrcr.cpp` (156,351 lines of compiled-in byte arrays, stamped “WARNING! All changes made in this file will be lost!”), anything under `debug/`, any generated `ui_*.h` header, and the misspelled `resurce/` directory that sits beside the real `resource/`. Note the trap: the stage files are *named* `stageN_resurce.cpp` with the same misspelling, and those **are** real hand-written sources.

**Transcribed vs. cited by shape.** The desktop's bulk data — 154 dispatch blocks across four stage files, a 51-entry trait clamp table, the equipment and weapon catalogues — is **not** reproduced here. [§8](#8-bulk-table-index) gives the enumeration command, the count, and the span for each, so any of it can be regenerated on demand. Exactly one module block is reproduced verbatim, in [§7.4](#74-module-anatomy--shape-plus-one-worked-example), as the worked example that fixes the shape.

**Port divergences.** Where the TypeScript port already implements something differently, this document states the desktop behaviour and names the port file *without* a line number (port files are not in the cited revision). Those divergences are tracked as `docs/PLAN.md` step 10.

#### Subsystem → section map

The sixteen subsystems a port has to reproduce, and where each is specified. §2's master equation (`mainwindow.cpp:830-833`) is the spine the first half of the table hangs from.

| # | Subsystem | Section |
|---|---|---|
| 1 | Creation flow | §7.1, §7.2, §7.3 |
| 2 | Attribute XP | §2.2 |
| 3 | Skill XP → level | §2.3, §5.3 |
| 4 | Trait XP → level | §2.4, §5.2 |
| 5 | Module costs | §7.4 |
| 6 | Flex XP | §4 |
| 7 | `gmxpmod` | §2.5 |
| 8 | `cbillmod` | §3.1 |
| 9 | Affiliation / sub-affiliation / caste | §6.1 |
| 10 | Phenotype caps | §5.1 |
| 11 | Module availability gating | §6.1 |
| 12 | Aging | §2.6 |
| 13 | Prerequisites | §6.2 |
| 14 | Derived stats | §5.4 |
| 15 | Free starting skills | §2.7 |
| 16 | Equipment and weapons | §3.2 |

#### Document map

Five parts. Part I is the record itself (`chardata.h:8-69`); the rest are the rules that fill it in.

| Part | Contents |
|---|---|
| **I** — the model | What a character *is*: the in-memory and on-disk record (§1). |
| **II** — the XP budget | Everything that consumes the 5,000-XP pool (§2). |
| **III** — other economies | Quantities that are *not* drawn from that pool: C-Bills (§3), flex XP (§4), validity caps (§5), availability predicates (§6). |
| **IV** — the wizard | The five-stage lifepath generator (§7). |
| **V** — apparatus | Bulk-table index (§8), defect notes (§9), citation index (§10). |

The partition in Parts II and III is by **which economy pays**. That is the distinction most likely to be got wrong when porting: aging looks like a constraint but is XP-relevant (§2.6), while equipment looks like a purchase and is (§3.2) — but on a different currency.

**Size note.** 886 lines (`wc -l docs/RULES.md`), measured after the final edit.

---

## Part I — the model

### 1. Character data model

The whole character lives in one object, `CharData` (`chardata.h:8-69`), owned by the wizard as `Wizard::chr_dat` (`wizard.h:31`, constructed at `wizard.cpp:18`). When the wizard finishes, `MainWindow::FinishWizard()` (`mainwindow.cpp:364-427`) copies every field out of `chr_dat` into a parallel set of `…Main` members on `MainWindow` (`mainwindow.cpp:368-392`). **From that point the wizard's copy is dead**; the main window's copy is what gets edited, saved, and printed. Two parallel representations of the same character therefore exist, and the port must decide which one it is modelling at any moment.

### 1.1 Scalars, name+xp pairs, the eight attributes, ordered lists

`CharData` declares (`chardata.h:16-51`):

- **Plain scalars** — `xp` (`:16`), `age` (`:17`), `charName` (`:18`), `realLife` (`:28`), `phenotype` (`:29`), `sex` / `hair` / `eye` (`:34-36`), `height` / `weight` (`:37-38`), `startXP` (`:39`), and three career-field booleans `milField` / `policField` / `civField` (`:30-32`), plus `comChk` / `wobChk` for the ComStar / Word of Blake branch (`:50-51`).
- **`QPair<QString,int>` name+index pairs** for every lifepath choice (`:19-27`): `AffName`, `subAffName`, `clanCastName`, `earlyChildName`, `lateChildName`, `schoolName`, `basicSchool`, `advSchool`, `specSchool`. The `int` half is the **combo-box index**, not an XP value — it is what the gating switches in §6.1 dispatch on.
- **The eight attributes** as a `QMap<QString,int>` keyed `STR BOD RFL DEX INT WIL CHA EDG` (`chardata.h:42`), each initialised to **100** by `CharData::Atribute()` (`chardata.cpp:11-32`, values at `:13-20`).
- **Ordered skill and trait lists**, `QList<QPair<QString,int>>` (`chardata.h:43-44`). Order is insertion order, maintained by `changeSkills()` / `changeTraits()` (`chardata.cpp:35-48`, `:62-75`), which look the name up first (`findSkill` `:50-59`, `findTraits` `:78-87`) and **add to the existing XP** rather than replacing it. A miss returns the sentinel `100500` (`chardata.cpp:58`, `:86`) and the pair is appended.
- **Three prerequisite containers** (`chardata.h:46-48`) — see §1.2.

`clearZeroSkills()` / `clearZeroTraits()` (`chardata.cpp:89-113`) rebuild each list keeping only entries whose XP is non-zero. They are called on every back-navigation (`wizard.cpp:159-160`, `:166-167`, `:175-176`, `:184-185`), which is how a fully-refunded grant disappears from the sheet.

`clearChar()` (`chardata.cpp:115-124`) is the reset: it empties all three containers, sets `xp = startXP`, re-runs `Atribute()`, and issues the two free skill grants described in §2.7. `startXP` is **5000**, assigned in the constructor (`chardata.cpp:7`).

**Persisted field checklist.** The authoritative enumeration of what round-trips to disk is `MainWindow::prepSaveFile()` (`mainwindow.cpp:2285-2431`), which emits one `key:value\n` line per field; `saveFileAs()` (`:2262-2283`) is only the file I/O around it. The load side is `openFile()` (`mainwindow.cpp:2037-2259`). Keys, in emission order: `name` `aff` `subaff` `clancaste` `earlychild` `latechild` `schoolname` `basicschool` `advschool` `specschool` `reallife` `phenotype` `nameplanet` `sex` `age` `haircolor` `eyecolor` `height` `weight` `gmxpmod` `cbillmod` (`mainwindow.cpp:2290-2350`), then repeated `attr:` (`:2356`), `skill:` (`:2361`), `trait:` (`:2366`), `equip:` (`:2371`), `preattr:` (`:2384`), `preskill:` (`:2391`), `pretrait:` (`:2396`), `equiploc:` (`:2404`), `weapon:` (`:2412`), `chrweapon:` (`:2422`), and finally a `<notes>` … `</notes>` block (`:2426-2428`). The scalar keys carry a bare value; `attr` / `skill` / `trait` / `pre*` / `equiploc` carry `name=value`; `equip` and `weapon` carry `;`-joined field vectors.

**The name+index pairs lose their index on save.** Only `.first` is written (`mainwindow.cpp:2293-2320`), so the combo-box indices the gating logic depends on are reconstructed from the name on load, not restored.

### 1.2 `pre*` fields are PREREQUISITES, not a baseline snapshot

`preCharAttr`, `preCharSkills`, `preCharTraits` (`chardata.h:46-48`) hold the **minimum** attribute, skill, and trait values the character's chosen lifepath modules *require* — not a "before" copy of the character. They are cleared at `chardata.cpp:29-31` and populated only by `Wizard::PrereqStage()` (`wizard.cpp:277-388`), which max-merges the `s0PreAttr` / `s1PreAttr` / … contributions of the five stages. Full mechanics in §6.2.

They are persisted as `preattr:` / `preskill:` / `pretrait:` (`mainwindow.cpp:2384`, `:2391`, `:2396`) and read back at `openFile()`. `MainWindow::CheckPrereq()` (`mainwindow.cpp:3295-3427`) compares them against the *current* character and reports the shortfall.

> **Port note.** The web port stores this column as `pre_snapshot`, a name that asserts the opposite of what the data is. Nothing reads it as a snapshot, so the defect is a naming error rather than a behavioural one; the rename is `docs/PLAN.md` step 10.

**Attribute prerequisites are stored ×100.** `s1PreAttr["STR"] = 400` means **STR 4+**, matching the tooltip text in the same block (`stage1_resurce.cpp:343-345` against the tooltip at `:309`). Skill and trait prerequisites are stored in raw XP, on the same scale as the character's own skill and trait XP, so they compare directly (`mainwindow.cpp:3340`, `:3357`).

---

## Part II — the XP budget

Everything in this Part consumes the same 5,000-XP pool. §2 states the equation; §2.1–§2.7 are its terms; §2.8 walks one character through it end to end.

### 2. Master equation

`MainWindow::ChangeMain()` (`mainwindow.cpp:827-957`) recomputes the character's remaining XP on every edit. The whole of the budget is three lines:

```cpp
// mainwindow.cpp:830-833
int xpProg = charAttrMain["STR"] + charAttrMain["BOD"] + charAttrMain["RFL"] + charAttrMain["DEX"] + charAttrMain["INT"]
             + charAttrMain["WIL"] + charAttrMain["CHA"] + charAttrMain["EDG"] + SumSkillsXP() + SumTraitsXP();
int XP;
XP = xpMain - xpProg - wizardMod;
```

So, exactly:

**`XP_remaining = xpMain − xpProg − wizardMod`**, where **`xpProg = Σ(all eight attribute values, at face value) + Σ(skill XP) + Σ(trait XP)`**.

`SumSkillsXP()` (`mainwindow.cpp:959-967`) and `SumTraitsXP()` (`mainwindow.cpp:969-977`) are plain unweighted sums over `charSkillsMain` and `charTraitsMain`. The result is written to four separate labels (`mainwindow.cpp:844-850`) — the attribute, skills, traits and free-XP readouts all show the same number.

> **Do not confuse this with the flex-XP dialog's formula.** `s2flexxpdialog.cpp:106-109` computes a superficially similar "free XP" figure by subtracting spends from an initial allowance. That is a **per-module allowance** belonging to a different economy (§4); it is not the character's budget and it never touches `xpMain`. The port's `lib/characters/xp.ts` cites `s2flexxpdialog.cpp:106-109` as its source and implements that system's shape instead of `mainwindow.cpp:830-833`. See §2.2.

### 2.1 `xpMain` = 5000, hardcoded

`xpMain` (`mainwindow.h:97`) is set to the literal `5000` in `MainWindow::on_actionNew_triggered()` (`mainwindow.cpp:2689`). `CharData::startXP` is independently set to the same literal in the wizard's own copy (`chardata.cpp:7`), and `clearChar()` seeds `chr_dat->xp = startXP` (`chardata.cpp:120`). The two literals are independent and must be kept in step.

There **is** a start-XP override, on the wizard's Intro page: a `startXPSpinBox` (`wizard.ui:373`) guarded by a `StartXPcheckBox` labelled `Locked` (`wizard.ui:408`, `wizard.ui:418`) that ships checked (`wizard.ui:421`). Unchecking it enables the spin box (`wizard.cpp:4526-4534`; note the branch is inverted with respect to the label — `checked == false` is what enables editing), and a new value writes `chr_dat->startXP` (`wizard.cpp:4538`). That value reaches the wizard's pool only when `clearChar()` next runs (`chardata.cpp:120`), which happens on every affiliation change (`wizard.cpp:601`). **It never reaches `xpMain`**, which stays at the literal 5000 (`mainwindow.cpp:2689`): the difference is absorbed into `wizardMod` at handover (§2.5), so the displayed remaining XP is preserved while the main window's ceiling is not.

`xpMain` is mutable at run time by exactly one path: the GM tool adds to it (`mainwindow.cpp:4215`, `xpMain += gmchrtool->addXP`, reached from `on_actionAdd_C_Bills_triggered()` at `mainwindow.cpp:4205-4211` through the `accepted()` connection at `mainwindow.cpp:24`). **That increment is not persisted** — `prepSaveFile()` writes no `xpmain` key (`mainwindow.cpp:2285-2431`) — so a GM's XP award survives only until the file is reopened. See §9.

`wizardMod` defaults to `0` on the same reset (`mainwindow.cpp:2692`), which is why a hand-built character carries no residual (§2.5).

### 2.2 Attribute XP — the FULL value is charged

`mainwindow.cpp:830-831` sums `charAttrMain[...]` **at face value**. There is no subtraction of a free baseline anywhere in the expression: the term is the attribute's stored value, not `max(0, value - 100)`.

The consequence is arithmetic. All eight attributes start at **100** (`chardata.cpp:13-20`), so a character who raises nothing at all already shows `xpProg ≥ 800`. **The 8 × 100 floor consumes 800 of the 5,000 outright.** A character with STR 400 is charged 400 for that attribute, not 300.

`scoreStattoStatvalue()` (`mainwindow.cpp:574-583`) enforces the floor from the other direction, returning 1 for any value below 100, and `on_STRSpinBoxMain_valueChanged()` snaps a below-100 entry back to 100 (`mainwindow.cpp:692-694`; the other seven spin boxes follow the same shape).

> **Port divergence (tracked as `docs/PLAN.md` step 10).** `lib/characters/xp.ts` charges `max(0, value - 100)` — the excess over the baseline, not the **full** value. Against an all-100 character the desktop charges **800** and the port charges **0**, so every character in the port has ~800 XP more to spend than the desktop would allow. The port's `ATTRIBUTE_BASE = 100` correctly describes the *starting* value (`chardata.cpp:13-20`); it is not a discount in the desktop's model.

### 2.3 Skill XP, and the `.dat` `cost` field is a Target Number

A skill's XP is its cost: `charSkillsMain[i].second` is raw XP, summed unweighted by `SumSkillsXP()` (`mainwindow.cpp:959-967`) and printed in the sheet's XP column (`mainwindow.cpp:1041-1042`). XP → level is §5.3.

The skill catalogue is `resource/allskills.dat`, 92 entries, parsed by `LoadResurce::loadSkills()` (`loadresurce.cpp:22-43`). Each line is split on `;` into exactly two halves (`loadresurce.cpp:33-36`): the skill name, and a `LINK,TN/CAT` payload — for example `Acrobatics/Free-Fall;RFL,7/SB` (`resource/allskills.dat:1`).

The numeric part of that payload is a **Target Number**, not a price. `MainWindow::PrintSkillsTable()` splits the payload on `,` (`mainwindow.cpp:995`, `mainwindow.cpp:1014`) and puts `linkPart[0]` — the linked attributes — into the sheet's Link column (`mainwindow.cpp:1000-1003`, `mainwindow.cpp:1021-1024`) and `linkPart[1]` — the `TN/CAT` half — into the **TC** column (`mainwindow.cpp:1005-1008`, `mainwindow.cpp:1026-1029`). The character's own XP is a different column (`mainwindow.cpp:1041-1042`), and the catalogue value is never read into any XP arithmetic. `AdvTried()` (`mainwindow.cpp:1055`) may substitute a different link/TN pair once a skill reaches an advanced level, which is meaningful only for a TN.

> **Port divergence (step 10).** `data/rules/skills.json` names this field `cost`, and `lib/validation/catalog.ts` types it as such. Nothing in the app consumes it, so the blast radius is documentation only; the rename to `targetNumber` is step 10.

### 2.4 Trait XP

Traits behave like skills on the budget side — raw XP, summed unweighted by `SumTraitsXP()` (`mainwindow.cpp:969-977`) — with one structural difference: **trait XP is signed**, and negative traits *return* XP to the pool. `Born Mercenary Brat` grants `Illiterate` at −50 and `Reputation` at −50 (`stage1_resurce.cpp:322-323`); both terms reduce `xpProg` and so raise `XP_remaining`.

The trait catalogue is `resource/alltraits.dat`, 76 entries, loaded by `LoadResurce::loadTraits()` (`loadresurce.cpp:45`). XP → level, and the per-trait clamps that cap it, are §5.2.

### 2.5 `wizardMod` / `gmxpmod` — a reconciliation residual

`wizardMod` (`mainwindow.h:132`) is persisted under the key **`gmxpmod`** (write `mainwindow.cpp:2347`, read `mainwindow.cpp:2153-2154`). The name suggests a GM fudge factor. It is not one: it is a **derived residual**, computed once, at the moment the wizard hands the character over.

`MainWindow::FinishWizard()` (`mainwindow.cpp:364-427`) recomputes `xpProg` from the imported stats (`mainwindow.cpp:397-398`, the same expression as `mainwindow.cpp:830-831`) and then:

```cpp
// mainwindow.cpp:400-401
XP = xpMain - xpProg;
wizardMod = XP - wz->chr_dat->xp;
```

Both lines must be read literally. **`mainwindow.cpp:400` carries no `wizardMod` term** — it cannot, because `wizardMod` is what the next line is about to define. And `mainwindow.cpp:401` sets `wizardMod` to the **difference between MainWindow's freshly recomputed remaining XP and the wizard's own running total**, `wz->chr_dat->xp`. Nothing more.

Substituting `mainwindow.cpp:401` back into `mainwindow.cpp:833` gives `XP = xpMain - xpProg - (xpMain - xpProg - wz->chr_dat->xp)`, i.e. `wz->chr_dat->xp`: immediately after `FinishWizard()` the main window displays exactly the number the wizard displayed. `wizardMod` is the term that makes the two accounting systems agree, and it stays fixed while the user edits, so subsequent edits move `XP` by exactly their own cost. For a hand-built character it is `0` (`mainwindow.cpp:2692`) and the equation collapses to `XP = xpMain - xpProg`.

#### Interpretation — why the residual is not Σ(module costs) − Σ(granted stat XP)

It is tempting to gloss `wizardMod` as *the module costs the wizard charged, less the stat XP those modules granted*. That gloss is **interpretation, not what the source states**, and it is wrong in general for three citable reasons:

1. **The free floor sits inside the residual.** The wizard's pool never pays for the 8 × 100 attribute baseline or the two free skill grants (`chardata.cpp:120-123`), but MainWindow's `xpProg` charges all 830 of it. The residual therefore absorbs 830 that has nothing to do with any module.
2. **`wz->chr_dat->xp` is not a clean sum of module costs.** It is mutated by `Wizard::changeXP()` (`wizard.cpp:524-534`; debit at `wizard.cpp:527`, credit at `wizard.cpp:529`) and *additionally* credited outside that function by two rebates: `chr_dat->xp += s2clanfield->s2CFDRebateSum` in `Stage3Main()` (`wizard.cpp:3539`) and `chr_dat->xp += s3RebateXp` in `Stage4Main()` (`wizard.cpp:4086`).
3. **Grants and costs are not the same ledger.** Flex-XP spends (§4) change the character's stats — and therefore MainWindow's `xpProg` — without passing through `changeXP()` at all, and aging (§2.6) mutates `charAttr` directly with no pool transaction.

Port `gmxpmod` as *the number the source computes at `mainwindow.cpp:401`*, not as a reconstruction of it.

> **Port divergence (step 10).** `lib/characters/xp.ts` persists `gmxpmod` but does not read it in the remaining-XP calculation, so the port's figure differs from the desktop's for every wizard-built character. In the desktop it is a load-bearing term, not a display field.

### 2.6 Aging — direct `charAttr` mutation, and why it lands in Part II

Age is accumulated through the wizard rather than chosen: set to **16** entering Stage 3 (`wizard.cpp:3542`), forced to **18** on the two Civilian-Job short-circuits (`wizard.cpp:3559`, `wizard.cpp:3564`, and again at `wizard.cpp:4135`, `wizard.cpp:4140`), advanced by each Stage-3 field's duration (`wizard.cpp:3968`, `wizard.cpp:4002`, `wizard.cpp:4034`, each with a matching subtraction when the field changes at `wizard.cpp:3953`, `wizard.cpp:3990`, `wizard.cpp:4023`), and advanced again by each Stage-4 module (`wizard.cpp:4335`). Past 100 the wizard warns but does not stop (`wizard.cpp:4342-4344`).

The age → attribute effect is a **band table**, `Text_Resurce::AgeAttr(int age, QString affl)` (`text_resurce.cpp:2709-2843`), ten bands: under 25 (`text_resurce.cpp:2713`), 25–30 (`text_resurce.cpp:2723`), 31–40 (`text_resurce.cpp:2732`), 41–50 (`text_resurce.cpp:2746`), 51–60 (`text_resurce.cpp:2756`), 61–70 (`text_resurce.cpp:2770`), 71–80 (`text_resurce.cpp:2783`), 81–90 (`text_resurce.cpp:2798`), 91–100 (`text_resurce.cpp:2813`), 101+ (`text_resurce.cpp:2828`). Each band writes `ageCharAttr[...]` and may append to `ageTraits` — `Slow Learner` at −300 from 61 up (`text_resurce.cpp:2778-2779`) and `Glass Jaw` at −300 from 71 up (`text_resurce.cpp:2793-2794`), plus a Clan-only `Reputations` penalty in two bands (`text_resurce.cpp:2740-2743`, `text_resurce.cpp:2764-2767`; note the plural — see §9). Early bands are *bonuses*: 25–30 gives +50 to six attributes (`text_resurce.cpp:2724-2730`).

Application is `Wizard::ChangeAgeAttr(int age)` (`wizard.cpp:4570-4588`), called at `wizard.cpp:3634` and `wizard.cpp:4452`. It subtracts the previously-applied deltas (`wizard.cpp:4571-4577`), removes the old age traits (`wizard.cpp:4578`), recomputes the band (`wizard.cpp:4579`), re-adds the new age traits (`wizard.cpp:4580`), and applies the new deltas (`wizard.cpp:4581-4587`) — **straight into `chr_dat->charAttr`, with no `changeXP()` call anywhere in the function**.

**Only STR, BOD, RFL, DEX, INT, WIL and CHA are aged.** `EDG` appears in neither the subtract block (`wizard.cpp:4571-4577`) nor the add-back block (`wizard.cpp:4581-4587`), and `AgeAttr` never writes `ageCharAttr["EDG"]` (`text_resurce.cpp:2709-2843`). Edge is age-invariant.

**Why this is an XP subsystem.** Because `mainwindow.cpp:830-831` sums attributes at **face value**, any change to `charAttr` is a change to `xpProg` whether or not a pool transaction accompanied it. An age *bonus* of +50 STR therefore silently **costs** 50 XP, and an age *penalty* of −100 BOD **refunds** 100. Aging has no ledger entry and still moves the budget; a port that files it under "constraints" will mis-cost every character over 24.

### 2.7 Free starting grants

`CharData::clearChar()` issues two skill grants with no charge (`chardata.cpp:122-123`):

- `Language/English` at **20 XP**
- `Perception` at **10 XP**

They go through `changeSkills()`, so they occupy the first two positions of the ordered skill list, and they are applied *after* `xp = startXP` (`chardata.cpp:120`) — the wizard's pool is not debited for them. MainWindow's `SumSkillsXP()` does count them, which is the second component (30 XP) of the 830 the residual absorbs (§2.5).

The eight attributes at 100 (`chardata.cpp:13-20`) are the third free grant, and the largest: 800 XP.

### 2.8 Worked example — one character costed end to end

Construction: a character whose only lifepath grant is Stage 1's `Born Mercenary Brat` (`stage1_resurce.cpp:308-346`, reproduced in §7.4). This is a synthetic minimal case — the UI requires a Stage-0 affiliation as well — chosen because every input is a cited literal.

**Wizard side.** The pool starts at 5000 (`chardata.cpp:7`, `chardata.cpp:120`). Selecting the module charges its cost through `changeXP(stage1->s1XpCost, true)` (`wizard.cpp:2278`), and `s1XpCost = 270` (`stage1_resurce.cpp:312`). The wizard's displayed remaining XP is therefore **4730** (`wizard.cpp:527`, printed at `wizard.cpp:532`).

**Stat deltas granted by the same block:**

| Kind | Entries | Cited at | Sum |
|---|---|---|---|
| Attributes | STR +75, BOD +50, RFL +100, WIL +25, CHA −25, EDG +25 | `stage1_resurce.cpp:314-319` | **+250** |
| Traits | Equipped +50, Illiterate −50, Reputation −50 | `stage1_resurce.cpp:321-323` | **−50** |
| Skills, direct | 10 + 5 + 15 + 10 + 5 + 5 | `stage1_resurce.cpp:325-331` | **+50** |
| Skills, deferred `…/Any` picks | 10 + 10 | `stage1_resurce.cpp:336`, `stage1_resurce.cpp:340` | **+20** |

**MainWindow side, after `FinishWizard()`:**

- attributes: 800 (baseline, `chardata.cpp:13-20`) + 250 = **1050**
- skills: 30 (free, `chardata.cpp:122-123`) + 50 + 20 = **100**
- traits: **−50**
- `xpProg` = 1050 + 100 − 50 = **1100** (`mainwindow.cpp:397-398`)
- `XP` at `mainwindow.cpp:400` = 5000 − 1100 = **3900**
- `wizardMod` at `mainwindow.cpp:401` = 3900 − 4730 = **−830**
- `XP` at `mainwindow.cpp:833` = 5000 − 1100 − (−830) = **4730** — the wizard's figure, restored.

Two properties are worth reading off this. First, **−830 is exactly the free floor**: 800 attribute baseline + 30 free skills, the two grants the wizard's pool never paid for (§2.7). Second, this module's grants sum to 250 + 70 − 50 = **270**, which is precisely its `s1XpCost`.

> **Do not generalise that second property — it fails at the very next block.** `Farm` (`stage1_resurce.cpp:348-391`) declares `s1XpCost = 275` (`stage1_resurce.cpp:352`), but its live literals sum to **270**: attributes 175 (`stage1_resurce.cpp:354-357`), traits 25 (`stage1_resurce.cpp:359-362`), direct skills 25 (`stage1_resurce.cpp:364-365`), one deferred pick worth 5 (`stage1_resurce.cpp:369`), and four `*More` flexible grants of 10 each (`stage1_resurce.cpp:378`, `:382`, `:386`, `:390`). The missing 5 appears only if the label `"Interests/Any two"` (`stage1_resurce.cpp:367`) is read as **two** picks of 5 — an interpretation of a display string, not of any literal, and the block declares only one label/list/value triple. **The sum-equals-cost identity therefore does not hold mechanically across blocks**, and an extractor that derives cost from grants (or validates one against the other) will be wrong from the second Stage-1 module onward.

`Born Mercenary Brat` is unusually clean, which is why it makes a good worked example and a bad template. Measured across all eleven Stage-1 blocks, it is the **only** one with **zero** `*More` flexible grants — the others carry two to four — and one of only two with no commented-out deferred slot. Both of those are exactly where `Farm`'s arithmetic goes astray.

---

## Part III — other economies

Everything in this Part is a quantity that is **not** drawn from the 5,000-XP pool. §3 is a second currency; §4 is a parallel allowance; §5 and §6 are predicates, not prices.

### 3. The C-Bill economy

C-Bills are money. Nothing in `mainwindow.cpp:830-833` refers to them, and nothing in this section moves `XP_remaining`. §3.1 and §3.2 are kept together because they are one 19-line mechanism (`mainwindow.cpp:860-878`) inside `ChangeMain()`: the balance is derived and then spent in the same pass.

### 3.1 `countCBills` / `cbillmod` — balance, save key, GM increment

The balance is recomputed on every edit, from the character's `Wealth` trait plus a stored GM adjustment:

- `sumCBills` is initialised to 0 (`mainwindow.cpp:858`), then set from the **clamped level** of the `Wealth` trait — `CheckTraitLvl(name, xp)`, §5.2 — by scanning the trait list (`mainwindow.cpp:860-864`). A character with no `Wealth` trait keeps `sumCBills = 0`.
- `cbills = CheckCBills(sumCBills) + countCBills;` (`mainwindow.cpp:865`).

`CheckCBills(int)` (`mainwindow.cpp:1921-1973`) is a flat lookup from Wealth level to starting money: level ≤ −1 → 100; 0 → 1,000; 1 → 2,500; 2 → 5,000; 3 → 10,000; 4 → 25,000; 5 → 50,000; 6 → 100,000; 7 → 250,000; 8 → 500,000; 9 → 1,000,000; 10 → 2,000,000 (`mainwindow.cpp:1924-1970`). The parameter is a **level**, not XP, so §5.2's clamp is what bounds the table — `Wealth` is clamped to [−1, 10] at `mainwindow.cpp:1838-1845`.

> **The truncation convention in §5.2 reaches this table.** A `Wealth` trait at −50 XP truncates to level **0** and buys **1,000** C-Bills. A port that floors instead would get level **−1** and **100** C-Bills — a tenfold difference in starting money produced entirely by the rounding direction.

`countCBills` (`mainwindow.h:144`) is the GM adjustment. It is persisted under the key **`cbillmod`** (write `mainwindow.cpp:2350`, read `mainwindow.cpp:2157-2158`), reset to 0 on New (`mainwindow.cpp:2691`), and incremented by the GM tool at `mainwindow.cpp:4214` (`countCBills += gmchrtool->addCBills`). Unlike the GM's XP award (§2.1) this one **is** persisted, so the two halves of the same dialog behave differently across a save/load cycle. `cbills` itself (`mainwindow.h:143`) is the derived working balance and is never written to disk.

The GM tool is `gmchartools` (`gmchartools.h:14-19`), a `MainWindow` member `gmchrtool` (`mainwindow.h:35`), constructed at `mainwindow.cpp:19`, shown at `mainwindow.cpp:4205-4211`, and wired to `AddGmNum()` through the `accepted()` connection at `mainwindow.cpp:24`. It exposes exactly two integers, `addCBills` and `addXP` (`gmchartools.h:18-19`).

### 3.2 Equipment and weapons — purchases debit C-Bills

Purchases are subtracted from the balance in the same pass, and they also accumulate carried mass:

- **Equipment** (`mainwindow.cpp:869-872`): for each row of `equipChar` (`mainwindow.h:128`), `cbills -= equipChar[i][1]` and `massCharSwp += equipChar[i][2]`.
- **Weapons** (`mainwindow.cpp:875-878`): for each row of `weaponChar` (`mainwindow.h:129`), `cbills -= weaponChar[i][4]` and `massCharSwp += weaponChar[i][5]`.

The balance is then displayed on three labels (`mainwindow.cpp:885-889`) and the remaining carry capacity as `massChar - massCharSwp` (`mainwindow.cpp:881-882`), where `massChar` is the STR-derived carry limit of §5.4.

Both vectors are `QVector<QStringList>` — one row per stack, with a **count appended as the last element**. Adding an item that is already carried increments the count and rewrites the row's cost and mass as `unit × count` (equipment `mainwindow.cpp:2915-2935`, count at index 6; weapons `mainwindow.cpp:3090-3110`, count at index 10). Adding a new item appends the row with a count of 1 (`mainwindow.cpp:2926`, `mainwindow.cpp:3101`). Because cost is multiplied into the row rather than multiplied at display time, the `[1]` / `[4]` fields read at `mainwindow.cpp:870` and `mainwindow.cpp:876` are already stack totals.

**Row shape is the catalogue line with the leading category key stripped**, and the loaders say so outright. `LoadResurce::loadEquip()` (`loadresurce.cpp:158-179`) splits each line on `;` and inserts `equipSwp[0]` as the map **key** with `[1]`…`[6]` as the **value** (`loadresurce.cpp:170`); `loadWeapons()` (`loadresurce.cpp:181-202`) does the same with `[0]` as key and `[1]`…`[10]` as value (`loadresurce.cpp:193`). `resource/equiplist.dat:1-8` documents its own columns as key, name, cost, mass in kg, armour location, BAR, notes; `resource/weaponslist.dat:2` is a representative data row.

**Equipment row** (six fields, count appended as the seventh): 0 name, 1 cost, 2 mass, 3 armour location, 4 BAR, 5 notes, 6 count. Fields 0–2 are confirmed behaviourally by `PrintAllEquipTable` (`mainwindow.cpp:160-173`) and by the debit at `mainwindow.cpp:870`.

**Weapon row** (ten fields, count appended as the eleventh). Every index is named by the code itself:

| Idx | Field | Named at | Evidence |
|---|---|---|---|
| 0 | skill | `mainwindow.cpp:250` | `newSkillItem` |
| 1 | name | `mainwindow.cpp:219` | `newNameItem`; printed as `N x name` (`mainwindow.cpp:3963`) |
| 2 | damage | `mainwindow.cpp:3963` | printed under the literal label `Dmg:` |
| 3 | range | `mainwindow.cpp:230` | `newRangeItem`; literal label `Range:` (`mainwindow.cpp:3963`) |
| 4 | cost | `mainwindow.cpp:226` | `newCostItem`; **debited from C-Bills** at `mainwindow.cpp:876` |
| 5 | mass | `mainwindow.cpp:234` | `newMassItem`; literal label `Weight:` (`mainwindow.cpp:3963`); **added to carried mass** at `mainwindow.cpp:877` |
| 6 | shots | `mainwindow.cpp:238` | `newShotsItem`; literal label `Ammo:` (`mainwindow.cpp:3963`) |
| 7 | ammo cost | `mainwindow.cpp:242` | `newAmmoCostItem` — variable name only |
| 8 | ammo mass | `mainwindow.cpp:246` | `newAmmoMassItem` — variable name only |
| 9 | notes | `mainwindow.cpp:254` | `newNotesItem` — variable name only |
| 10 | count | `mainwindow.cpp:3104` | `weaponChar[countPos][10]` read as the stack count; appended at `mainwindow.cpp:3100-3101` |

Indices 4 and 5 are the strongest: the code *spends* and *weighs* them, not merely labels them. Indices 7–9 rest on the variable the value is assigned to and its column position, with no literal label anywhere; they are named here rather than left blank, but that is the weaker tier of evidence.

> **The `.dat` parsing is not positional-safe.** Both loaders split with `QString::SkipEmptyParts` (`loadresurce.cpp:168`, `loadresurce.cpp:191`), so an **empty field silently collapses** and every later index shifts left. A row that loses a field this way also falls below the arity guard — `>= 7` for equipment (`loadresurce.cpp:169`), `>= 11` for weapons (`loadresurce.cpp:192`) — and is **dropped with no warning and no log line**. A port that reads these files positionally, or that round-trips them through a writer which emits an empty field, will lose catalogue rows silently.

Purchases round-trip as `equip:` and `weapon:` lines with `;`-joined fields (`mainwindow.cpp:2371`, `mainwindow.cpp:2412`), plus `equiploc:` for armour placement (`mainwindow.cpp:2404`) and `chrweapon:` for the readied weapon (`mainwindow.cpp:2422`).

### 4. Flex XP — a per-module allowance, not the main pool

Some lifepath modules come with a discretionary allowance the player distributes across skills, traits and attributes. It is **not** deducted from the 5,000: the allowance is a separate counter owned by the dialog.

**One dialog serves three stages.** `S2FlexXPDialog` is a single `Wizard` member, `s2fxpdialog` (`wizard.h:51`), constructed once at `wizard.cpp:23`. `Wizard::S2FlexXpButton()` (`wizard.cpp:2802-2831`) switches on the current page id and re-seeds it per stage:

| Page id | Stage | Allowance seeded from | Cited at |
|---|---|---|---|
| 3 | Stage 2 | `stage2->s2FlexXP` | `wizard.cpp:2810` |
| 4 | Stage 3 | `stage3->s3FlexXP` | `wizard.cpp:2818` |
| 5 | Stage 4 | `stage4->s4FlexXP` | `wizard.cpp:2826` |

Each branch first unwinds the previous spend (`S2DelSkills` / `S2DelTraits` / `S2DelAttr`, `wizard.cpp:2806-2808`, `wizard.cpp:2814-2816`, `wizard.cpp:2822-2824`) so that reopening the dialog does not double-apply. The dialog is also reachable from the Stage-4 button (`wizard.cpp:4148`) and reinitialised at `wizard.cpp:4085` and `wizard.cpp:4348`.

**Stage 1 has no flex XP.** There is no `s1FlexXP` symbol in `stage1_resurce.h`, `stage1_resurce.cpp` or `wizard.cpp` (`grep -c 's1FlexXP'` returns 0 in all three), and `wizard.cpp:2802-2831` has no case for page id 2.

**The allowance arithmetic** is `S2FlexXPDialog::S2FXDChange()` (`s2flexxpdialog.cpp:85-129`):

```
s2FXDFreeXPLabel = s2FXDFreeXPLabelInit
                   - Σ(trait spends) - Σ(skill spends)
                   - STR - BOD - RFL - DEX - INT - WIL - CHA - EDG spin-box values
```

— literally `s2flexxpdialog.cpp:106-109`, with the two sums accumulated at `s2flexxpdialog.cpp:96-104`. `s2FXDFreeXPLabelInit` is the seeded allowance; it is re-read as the reset value at `s2flexxpdialog.cpp:35` and used as the over-spend guard at `s2flexxpdialog.cpp:236` and `s2flexxpdialog.cpp:254`.

**Per-entry caps.** Trait spends are capped at **200** (`s2flexxpdialog.cpp:127`, `s2flexxpdialog.cpp:190`, `s2flexxpdialog.cpp:361`), skill spends at **35** (`s2flexxpdialog.cpp:214`, `s2flexxpdialog.cpp:362`), and each of the eight attribute spin boxes at **200** (`s2flexxpdialog.cpp:364-371`). When the allowance runs out the dialog freezes every control at its current value rather than clamping to a remainder (`s2flexxpdialog.cpp:349-359`). A per-module exclusion list additionally disables entries the selected module already grants (`S2FXDDisableElem`, called at `s2flexxpdialog.cpp:128` with the module name seeded at `wizard.cpp:2811`, `wizard.cpp:2819`, `wizard.cpp:2827`).

**Effect on the main budget.** Flex spends land in `chr_dat` as ordinary skill, trait and attribute values, so after `FinishWizard()` they are counted by `mainwindow.cpp:830-831` like anything else. They are invisible to `Wizard::changeXP()`, which is one of the three reasons the residual in §2.5 is not a clean difference of sums.

### 5. Validity constraints

None of these move XP. They bound what a legal character looks like — the attribute ceilings a phenotype imposes (`mainwindow.cpp:1988-2035`), the per-trait clamps applied to a computed level (`mainwindow.cpp:1358-1847`), the skill thresholds (`mainwindow.cpp:1851-1919`) and the stats derived from all of them (`mainwindow.cpp:574-621`).

### 5.1 Phenotype attribute CAPS

Selecting a phenotype sets the **maximum** of each attribute spin box; it grants nothing. `MainWindow::on_PhenotypeMain_activated(QString)` (`mainwindow.cpp:1988-2035`) starts from a default set and then overrides per phenotype:

| Phenotype | STR | BOD | RFL | DEX | INT | WIL | CHA | EDG | Cited at |
|---|---|---|---|---|---|---|---|---|---|
| default | 800 | 800 | 800 | 800 | 800 | 800 | **900** | **900** | `mainwindow.cpp:1990-1997` |
| `Phenotype/Aerospace` | 700 | 700 | 900 | 900 | 900 | 800 | 800 | 800 | `mainwindow.cpp:1999-2007` |
| `Phenotype/Elemental` | 900 | 900 | 800 | 700 | 800 | 900 | 800 | 800 | `mainwindow.cpp:2009-2016` |
| `Phenotype/MechWarrior` | 800 | 800 | 900 | 900 | 800 | 800 | 900 | 800 | `mainwindow.cpp:2018-2022` |

Each override block writes only the attributes it changes; the rest fall through from the default block, which is why the table above shows 800/900 in the untouched cells. The caps are applied with `setMaximum()` at `mainwindow.cpp:2024-2031`, and the chosen name is stored to `phenotypeMain` at `mainwindow.cpp:2033`.

The four selectable values are `Phenotype/Normal Human`, `Phenotype/Aerospace`, `Phenotype/Elemental` and `Phenotype/MechWarrior` — the first three occupy `resource/phenotype.dat:1-3` and the fourth is the file's unterminated final line; the list is loaded into the combo at `mainwindow.cpp:447-448`. `Phenotype/Normal Human` matches none of the three override blocks and therefore takes the default caps.

Whether the phenotype combo is enabled at all is decided at `mainwindow.cpp:403-407` — see §9, because that predicate never evaluates false.

### 5.2 Trait level, and the clamp table

`MainWindow::CheckTraitLvl(QString nameTrait, int number)` (`mainwindow.cpp:1262-1849`) converts trait XP to a trait level in one line:

```
lvlValue = qFloor(number / 100);      // mainwindow.cpp:1266
```

**That line does not floor, and the distinction matters.** `number` is an `int` (`mainwindow.cpp:1262`) and `100` is an `int` literal, so `number / 100` is **integer division, which truncates toward zero**. `qFloor` receives an already-integral value and is a no-op. The two agree on non-negative input and diverge on negative input:

| trait XP | desktop (`int` division) | a port using `Math.floor` |
|---|---|---|
| −250 | −2 | **−3** |
| −150 | −1 | **−2** |
| −100 | −1 | −1 |
| −50 | **0** | **−1** |
| +50 / +150 / +250 | 0 / 1 / 2 | 0 / 1 / 2 |

Negative trait XP is ordinary — `Illiterate` at −50 and `Reputation` at −50 come from a single Stage-1 module (`stage1_resurce.cpp:322-323`) — so this is not an edge case. **A port must truncate toward zero (`Math.trunc`), not `Math.floor`.** JavaScript's `Math.floor(-0.5)` is `-1` where the desktop yields `0`.

`mainwindow.cpp:1268-1356` is a commented-out legacy ladder that computed the same thing with explicit bands; it is dead and must not be ported.

Everything from `mainwindow.cpp:1358` to `mainwindow.cpp:1847` is a **per-trait clamp table**: a flat sequence of `if (nameTrait == "…") { if (lvlValue < lo) lvlValue = lo; if (lvlValue > hi) lvlValue = hi; }` blocks, one per named trait, applied after the division and before `return lvlValue` at `mainwindow.cpp:1848`. `Alternate ID` is clamped to [0, 2] (`mainwindow.cpp:1358-1365`); `Animal Antipathy` to [−1, 0] (`mainwindow.cpp:1367-1374`). The table holds **51** entries — see §8 for the enumeration command. A trait not named in the table is returned unclamped.

Three clamp entries do something other than bound a range, and a port that copies the table mechanically will inherit them. Recorded, not corrected (§0):

- **`Combat Paralysis`** (`mainwindow.cpp:1412-1419`) sends any positive level to **+1**. Seventeen of the 51 entries test `lvlValue > 0`; the other sixteen all assign 0 — for example `Animal Antipathy` at `mainwindow.cpp:1367-1374`. This is the only one that does not.
- **`Unlucky`** (`mainwindow.cpp:1820-1827`) reads `if(lvlValue > -2) lvlValue = 2;`, so every level from −1 upward becomes **+2** — a positive level for a trait that only takes negative XP. Combined with the truncation above, `Unlucky` at −50 XP truncates to 0 and then clamps to **+2**. Four sibling entries use the same `if(lvlValue > -N)` guard with the sign intact (§9.12).
- **`Natural Aptitude`** (`mainwindow.cpp:1659-1670`) can only ever return 0; see §9.11.

This function is also what feeds the C-Bill lookup: `mainwindow.cpp:862` calls it for `Wealth`, so the money table in §3.1 is indexed by a **clamped** level — and therefore by a **truncated** one. See §3.1 for what that costs.

### 5.3 Skill thresholds, and the Fast/Slow Learner multiplier

`MainWindow::CheckSkillLvl(int number)` (`mainwindow.cpp:1851-1919`) converts skill XP to a level through eleven thresholds scaled by a global multiplier. **Unlike §5.2's, the `qFloor` here does real work:** `Skillmultiplier` is a `double` (`mainwindow.h:101`), so `30 * Skillmultiplier` is a genuine floating-point product and `qFloor` is what converts it to an integer threshold. Same function name, different situation — do not carry §5.2's truncation caveat across.

| Level | XP ≥ | Level | XP ≥ |
|---|---|---|---|
| 0 | below 30 | 6 | 230 |
| 1 | 30 | 7 | 300 |
| 2 | 50 | 8 | 380 |
| 3 | 80 | 9 | 470 |
| 4 | 120 | 10 | 570 |
| 5 | 170 | | |

— each threshold written as `qFloor(T * Skillmultiplier)` at `mainwindow.cpp:1884-1916`, with the explanatory comment at `mainwindow.cpp:1874-1875` noting that `qFloor` is there because the float comparison misbehaved without it.

`Skillmultiplier` starts at 1 (`mainwindow.cpp:1876`) and is adjusted by two traits:

- **Fast Learner** subtracts 0.2 (`mainwindow.cpp:1877-1879`), but **only if the trait's XP is ≥ 300** (`mainwindow.cpp:1859`). Lowering the multiplier lowers every threshold, so levels come sooner.
- **Slow Learner** adds 0.2 (`mainwindow.cpp:1880-1882`), gated on trait XP **≤ −300** (`mainwindow.cpp:1868`).

The gate is on the **raw trait XP**, not on the clamped level from §5.2. Both traits can be present and satisfied at once, in which case the multiplier returns to exactly 1.0 and the thresholds are unmodified. The multiplier is global to the character, not per skill.

**A port can reproduce all of this in integer arithmetic — no floating point required.** The three reachable multipliers give effective thresholds of exactly `T`, `4T/5` (Fast) and `6T/5` (Slow), and every `T` in the ladder is divisible by 5, so `(4*T)/5` and `(6*T)/5` in integer arithmetic reproduce the desktop's values exactly. Checked for all 30 reachable products. Two details make this safe rather than lucky: `1.0 - 0.2` and `1.0 + 0.2` are the nearest doubles to 0.8 and 1.2 rather than those reals, but **every one of the 30 products still lands on an exact integer**, so the `qFloor` at `mainwindow.cpp:1884-1916` never discards a fraction; and applying both adjustments returns the multiplier to **exactly** 1.0, so the Fast+Slow case is bit-for-bit identical to the unmodified ladder. This is the opposite situation from §5.2: there `qFloor` is vestigial and the rounding is a trap, here it is real but never actually rounds anything.

### 5.4 Derived stats

**Attribute score and link modifier.** `scoreStattoStatvalue(int)` (`mainwindow.cpp:574-583`) is `qFloor(number / 100)`, with a floor of 1 below 100. This is textually the same construct as §5.2's and carries none of its risk: the `number < 100` guard at `mainwindow.cpp:575-577` means the division at `mainwindow.cpp:579` only ever sees values of 100 or more, where truncation and flooring agree. No negative can reach it. `StatvaluetoLinkmod(int)` (`mainwindow.cpp:586-621`) maps that score to the link modifier: 1 → −2; 2 and 3 → −1; 4, 5, 6 → 0; 7, 8, 9 → +1; 10 → +2 (`mainwindow.cpp:588-617`; `default` shares the case-4 branch at `mainwindow.cpp:597-600`). Both are recomputed per spin box, e.g. `mainwindow.cpp:688-696` for STR.

**Carry mass.** `calcMassfromSTRscore(double)` (`mainwindow.cpp:624-679`) is a nested band ladder on the raw STR **value**, not its score: below 100 → 0.1 kg; <200 → 5; <300 → 10; <400 → 15; <500 → 20; <600 → 30; <700 → 40; <800 → 55; <900 → 70; <1000 → 85; exactly 1000 → 100 (`mainwindow.cpp:625-667`). Note the gap: a STR value strictly between 1000 and the next check has no branch, so `massChar` keeps its previous value.

**Movement**, all computed in `ChangeMain()`:

| Stat | Formula | Cited at |
|---|---|---|
| Walk | `Score(STR) + Score(RFL)` | `mainwindow.cpp:892-893` |
| Run/Evade | `10 + Walk + level(Running)` | `mainwindow.cpp:895-903` |
| Sprint | `Run × 2` | `mainwindow.cpp:904` |
| Climb | `ceil(Walk / 2) + level(Climbing)` | `mainwindow.cpp:906-919` |
| Crawl | `ceil(Walk / 4)` | `mainwindow.cpp:921-928` |
| Swim | `Walk + level(Climbing)` | `mainwindow.cpp:930-933`, `mainwindow.cpp:947` |

The ceilings are done by hand — integer-truncate, then add 1 if the fractional part was non-zero (`mainwindow.cpp:906-910`, `mainwindow.cpp:921-925`). The Swim row is not a transcription error; see §9.

**Hidden rule — literacy.** Inside the same loop that computes Swim, any skill whose name splits to `Language` on `/` and whose level is **≥ 4** causes the `Illiterate` trait to be removed from the character outright (`mainwindow.cpp:936-944`). This is a silent mutation performed during a *display* refresh, and it removes a trait that may have been granted (at negative XP) by a lifepath module, so it changes `SumTraitsXP()` and therefore the budget.

### 6. Availability predicates

Two questions, answered in different places: *may this character take this module?* — a `switch` over the affiliation index, one per stage (§6.1, entry point `stage1_resurce.cpp:88-139`) — and *does this character meet what the modules it already took require?* — a merge (`wizard.cpp:277-388`) followed by a check (`mainwindow.cpp:3295-3427`), §6.2.

### 6.1 Module gating — by numeric affiliation index

Which lifepath modules a character may choose is decided by a `switch` over the **affiliation index**, not the affiliation name. `CharData::AffName` is a `QPair<QString,int>` (`chardata.h:19`) whose `int` half is the combo-box index; `subAffName` (`chardata.h:20`) and `clanCastName` (`chardata.h:21`) are the same shape.

The index → name mapping is the line order of `resource/affilations.dat` (`resource/affilations.dat:1-12` plus an unterminated thirteenth line), duplicated in code by `Stage1::S1ShortNameAff(int)` (`stage1_resurce.cpp:40-85`): 0 Federated Suns, 1 Cappelan Confederation, 2 Draconis Combine, 3 Free Worlds League, 4 Lyran Alliance, 5 Free Rasalhague Republic, 6 Minor Periphery, 7 Major Periphery State, 8 Deep Periphery, 9 Invading Clan, 10 Homeworld Clan, 11 Terran, 12 Independent. **Any extraction that keys on names must join this file**, or every gate will be off.

Gating entry points, one per stage:

| Stage | Function | Cited at | Shape |
|---|---|---|---|
| 1 | `Stage1::S1ChoiceChillHood(int affVar, int subAffVar, QList<QPair<QString,int>>)` | `stage1_resurce.cpp:88-139` | `switch(affVar)` with `subAffVar` sub-cases |
| 1 | `Stage1::S1HardElem(QList<QPair<QString,int>>)` | `stage1_resurce.cpp:141-160` | trait-conditioned |
| 2 | `Stage2::S2ChoiceLateChildHood(int affVar)` | `stage2_resurce.cpp:42-68` | `switch(affVar)` |
| 2 | `Stage2::S2HardElemAffil(QList<QPair<QString,int>>, int affVar, int subAffVar)` | `stage2_resurce.cpp:71-163` | `switch(affVar)` + trait test |
| 2 | `Stage2::S2ClearListElem(QStringList, QString nameStage1, int affVar)` | `stage2_resurce.cpp:164-236` | subtractive filter |
| 3 | `Stage3::S3ClearAffilation(QString affVar)` | `stage3_resurce.cpp:45-57` | by **name**, two special cases |
| 4 | `Stage4::S4ClearModulesList()` | `stage4_resurce.cpp:43-450` | affiliation + caste conditioned |

Three behaviours are worth calling out, each as an instance of the shape rather than a transcription:

- **The lists are rebuilt, not filtered.** `S1ChoiceChillHood` clears the module list first (`stage1_resurce.cpp:89`) and each case re-emits a full list. `"Fugitives"` appears in every one of those emitted lists (e.g. `stage1_resurce.cpp:93`, `stage1_resurce.cpp:134`) but is **absent** from the default list the constructor builds (`stage1_resurce.cpp:7`), so a module can exist in the dispatch table and be unreachable unless gating adds it. `"Born Mercenary Brat"` is the mirror image: it is offered only for `affVar == 12` with `subAffVar == 4` (`stage1_resurce.cpp:126-128`).
- **A trait can be the gate.** `S1HardElem` (`stage1_resurce.cpp:141-160`) scans the character's traits for `Citizenship/Inner Sphere` or `Citizenship/Clan` (`stage1_resurce.cpp:148`) and, if neither is present, restricts the entire Stage-1 list to `"Slave"` (`stage1_resurce.cpp:156`). It is reached only from `affVar == 7, subAffVar == 3` (`stage1_resurce.cpp:99-100`).
- **Stage 3 gates by name, not index.** `S3ClearAffilation` compares `affVar` against the literal strings `"Franklin Fiefs"` and `"JarnFolk"` (`stage3_resurce.cpp:46`, `stage3_resurce.cpp:51`), the second of which cuts the school list to a single entry (`stage3_resurce.cpp:53`). Stage 3 also branches on `"Invading Clan"` / `"Homeworld Clan"` by name (`stage3_resurce.cpp:168`, `stage3_resurce.cpp:219`). The parameter is a `QString` here and an `int` in stages 1, 2 and 4 — the same concept, two representations.

Affiliation, sub-affiliation and caste **effects** (as opposed to gating) live in `text_resurce.cpp`: `Text_Resurce::rSubAff(int affStrNum)` (`text_resurce.cpp:26-388`) is a `switch` over the affiliation index that sets the sub-affiliation list, languages, the module's XP cost `xpCostModule`, attribute/trait/skill grants and the Stage-0 prerequisites, all after a reset preamble at `text_resurce.cpp:29-68`. `Text_Resurce::subAffAttr(int primPos, int secPos)` (`text_resurce.cpp:511`) applies the sub-affiliation layer, `Text_Resurce::clanCaste(QString nameCaste)` (`text_resurce.cpp:2516`) the caste layer, and `comstarAttr` / `comstarSub` / `WoBSub` (`text_resurce.cpp:424`, `text_resurce.cpp:456`, `text_resurce.cpp:480`) the ComStar and Word of Blake special cases toggled by `CharData::comChk` / `wobChk` (`chardata.h:50-51`).

### 6.2 Prerequisites — max-merge across stages, `CheckPrereq`, ×100 storage

**Collection.** `Wizard::PrereqStage()` (`wizard.cpp:277-388`) runs once, from `MainWindow::FinishWizard()` (`mainwindow.cpp:366`), and merges the five stages' prerequisite declarations into `chr_dat`:

- **Attributes** — five identical `QMapIterator` loops, one per stage, each keeping the **larger** of the running value and the stage's: `txt_res->s0PreAttr` (`wizard.cpp:279-285`), `stage1->s1PreAttr` (`wizard.cpp:287-293`), `stage2->s2PreAttr` (`wizard.cpp:295-301`), `stage3->s3PreAttr` (`wizard.cpp:303-309`), `stage4->s4PreAttr` (`wizard.cpp:311-317`). This is a **max-merge**, not a sum.
- **Traits** — all five lists are appended (`wizard.cpp:320-326`; Stage 4's only if a Real Life module was chosen, `wizard.cpp:324`), then de-duplicated with a max rule at `wizard.cpp:329-351`.
- **Skills** — the same pattern, appended at `wizard.cpp:354-360` and de-duplicated at `wizard.cpp:361-385`.

The de-duplication is defective; see §9.

**Storage scale.** Attribute prerequisites are stored **×100**: `s1PreAttr["STR"] = 400` (`stage1_resurce.cpp:343`) means STR 4+, as the same block's tooltip states in words (`stage1_resurce.cpp:309`). That is the same scale as `charAttr` itself (`chardata.cpp:13-20`), which is why `CheckPrereq` can compare them directly. **Skill and trait prerequisites are stored in raw XP**, again on the same scale as the character's own values. A port that treats `preattr` as a level will be wrong by two orders of magnitude.

**Checking.** `MainWindow::CheckPrereq()` (`mainwindow.cpp:3295-3427`) clears the report dialog's three lists (`mainwindow.cpp:3296-3298`), then:

- records a shortfall wherever the requirement exceeds the character's value. The test is written out once per attribute: `preCharAttrMain["STR"] > charAttrMain["STR"]` at `mainwindow.cpp:3303`, then the same line verbatim for BOD, RFL, DEX, INT, WIL, CHA and EDG — eight near-identical blocks spanning `mainwindow.cpp:3303-3333`;
- for each required skill, records a shortfall if the character has it below the required XP, **or does not have it at all** (`mainwindow.cpp:3337-3351`);
- the same for traits (`mainwindow.cpp:3354-3367`);
- returns `true` if any of the three lists is non-empty (`mainwindow.cpp:3414-3426`).

**Waivers.** Three lifepath-specific escape hatches clear the collected requirements outright: `Nobility` with `Wealth`, `Title` or `Property` at ≥ 500 (`mainwindow.cpp:3369-3383`); `White Collar` with `Wealth` or `Property` at ≥ 300 (`mainwindow.cpp:3385-3395`); `Covert Operations` with `Connections` or `Leadership` at ≥ 150, which clears **both** the trait and the skill lists (`mainwindow.cpp:3397-3409`). The third waiver has an indexing defect; see §9.

**Excluded from the wizard sub-dialog set.** Two dialogs are commonly mistaken for wizard pages and are neither:

- **`preqdial`** is a **`MainWindow`** member of type `PreqDialog` (`mainwindow.h:33`, header included at `mainwindow.h:7`), constructed at `mainwindow.cpp:18` and shown at `mainwindow.cpp:3234-3240`. It is the read-only report surface `CheckPrereq()` populates. `grep -c 'preqdialog' wizard.cpp wizard.h` returns 0 for both files — it is not part of the wizard at all.
- **`gmchartools`** (`gmchartools.h:14-19`) is the GM tool of §3.1, also a `MainWindow` member (`mainwindow.h:35`), not a wizard dialog.

The seven that *are* wizard sub-dialogs are enumerated in §7.5.

---

## Part IV — the wizard

### 7. The lifepath wizard

`Wizard` (`wizard.h:26-272`) is a `QWizard` subclass owning one `CharData` (`wizard.h:31`), one `Text_Resurce` (`wizard.h:40`), four stage resource objects (`wizard.h:42-45`), a `LoadResurce` (`wizard.h:46`) and seven modal sub-dialogs (`wizard.h:49-55`). It is created fresh on every run by `MainWindow` (`mainwindow.cpp:558-571`), which deletes any previous instance first (`mainwindow.cpp:560-562`) and connects `accepted()` to `FinishWizard()` (`mainwindow.cpp:569`).

### 7.1 Page topology

Six pages, declared in order in the hand-authored FORM `wizard.ui` (listed as a FORM at `btnchrcreator.pro:47`). `QWizard` assigns ids by declaration order, so the id is the page's position in the file:

| Id | Page object | Declared at | Distinguishing widget |
|---|---|---|---|
| 0 | `IntroPage` | `wizard.ui:53` | `charNameLine` (`wizard.ui:67`) |
| 1 | `PageStage0` | `wizard.ui:446` | `Aff_ComBox` (`wizard.ui:478`) |
| 2 | `PageStage1` | `wizard.ui:1678` | `S1ChComboBox` (`wizard.ui:2338`) |
| 3 | `PageStage2` | `wizard.ui:2637` | `S2ChComboBox` (`wizard.ui:3283`) |
| 4 | `PageStage3` | `wizard.ui:3608` | `S3SchoolComboBox` (`wizard.ui:4284`) |
| 5 | `PageStage4` | `wizard.ui:4719` | `S4LifeComboBox` (`wizard.ui:5423`) |

The id → stage mapping is confirmed independently by the dispatch at `wizard.cpp:113-127`, inside `Wizard::MainWizard()` (`wizard.cpp:112-152`), the slot wired to the Next button (`wizard.cpp:241`):

```
case 1 -> changeAff(0)   case 2 -> Stage1Main()   case 3 -> Stage2Main()
case 4 -> Stage3Main()   case 5 -> Stage4Main()
```

— `wizard.cpp:114`, `wizard.cpp:117`, `wizard.cpp:120`, `wizard.cpp:123`, `wizard.cpp:126`. There is no `case 0`: arriving at the Intro page by going forward is impossible.

**`currentId()` here is the page being *entered*, not the one being left.** §7.3 and §9.6 both rest on this, so it is established from the checkout rather than from framework behaviour. Three arguments, each checkable at the cited lines:

1. **Every `case N` calls the initialiser for page N.** `Stage3Main()` opens by constructing a fresh `Stage3` (`wizard.cpp:3524-3525`) and clearing `chr_dat->schoolName` and the three school tiers (`wizard.cpp:3531-3534`) — setup for a page about to be shown. It is reached from `case 4` (`wizard.cpp:123-124`), and Stage 3 is the page whose id is 4 (`wizard.ui:3608`). Under the *leaving* reading, `case 4` would fire as the user left `PageStage3` and would erase the school they had just selected on it.
2. **`case 1` would be destructive on exit.** It calls `changeAff(0)` (`wizard.cpp:114-115`), and `changeAff()` (`wizard.cpp:537`) calls `chr_dat->clearChar()` at `wizard.cpp:601`, which resets the eight attributes, empties the skill and trait lists and re-seeds the pool (§7.2). Under the leaving reading every press of Next on `PageStage0` would discard the affiliation work just done there. Under the entering reading it populates the page about to be displayed, which is what `changeAff()` is written to do (`wizard.cpp:602-617`).
3. **`case 5` asks a question that only makes sense on arrival.** It runs `Stage4Main()` and then tests whether `chr_dat->schoolName.first` is still empty (`wizard.cpp:126-128`), offering *Skip STAGE3?* and, on No, calling `back()` (`wizard.cpp:143`). That is a check on the *previous* stage's output, run as the next one opens — and `Stage4Main()` itself applies Stage 3's rebate on entry (`wizard.cpp:4086`).

(The framework mechanism, for completeness rather than as the basis of the claim: `QWizard` connects its own `next()` to the Next button inside its constructor, before `wizard.cpp:241` attaches `MainWizard()`, and Qt invokes slots in connection order — so the page has already advanced by the time `MainWizard()` reads `currentId()`. This explains *why* the three observations above hold; they do not depend on it.)

### 7.2 Per page: inputs, data source, skippability

| Page | Inputs | Data source | Skippable |
|---|---|---|---|
| **Intro** (id 0) | name (`wizard.ui:67`), sex / hair / eye combos, height and weight spin boxes, and the `Locked` start-XP override (§2.1, `wizard.ui:373`, `wizard.ui:408`) | `resource/haircolor.dat`, `resource/eyecolor.dat` via `LoadResurce` (`loadresurce.cpp:7-8`) | no |
| **Stage 0 — Affiliation** (id 1) | affiliation, sub-affiliation, starting language, ComStar / Word of Blake radio group, plus `S0MoreButton` (`wizard.ui:1641`) for the deferred picks | `resource/affilations.dat` and `Text_Resurce::rSubAff()` (`text_resurce.cpp:26-388`) | no |
| **Stage 1 — Early Childhood** (id 2) | one module from `S1ChComboBox`, up to four deferred `…/Any` element combos, `S1MoreButton` | `Stage1::S1ChildHood()` (`stage1_resurce.cpp:162-808`), gated by `S1ChoiceChillHood()` (`stage1_resurce.cpp:88-139`) | no |
| **Stage 2 — Late Childhood** (id 3) | one module from `S2ChComboBox`, three element combos, `S2MorePushButton`, `S2FlexXPPushButton` | `Stage2::S2LateChildhood()` (`stage2_resurce.cpp:245-826`), gated by `S2ChoiceLateChildHood()` (`stage2_resurce.cpp:42-68`) | no |
| **Stage 3 — School** (id 4) | school, then basic / advanced / specialist field combos each with an Add button (`wizard.cpp:3595-3597`), `S3MorePushButton`, `S3FlexXPPushButton` | `Stage3::S3SchoolChange()` (`stage3_resurce.cpp:67-466`) and `S3FieldChange()` (`stage3_resurce.cpp:478-799`) | **yes** |
| **Stage 4 — Real Life** (id 5) | one module from `S4LifeComboBox`, an Add button that commits it (`wizard.ui:5407`), `S4MorePushButton`, `S4FlexXPPushButton` | `Stage4::S4ChooseLife()` (`stage4_resurce.cpp:459-2615`), gated by `S4ClearModulesList()` (`stage4_resurce.cpp:43-450`) | **yes**, and **repeatable** |

**Stage 3 is skippable** by walking past it: arriving at Stage 4 with `chr_dat->schoolName` still empty raises a *Skip STAGE3?* prompt, and answering No calls `back()` (`wizard.cpp:128-149`).

**Stage 4 is skippable** at the end: `Wizard::accept()` (`wizard.cpp:249-275`) raises *Skip STAGE4?* when `chr_dat->realLife` is empty and only calls `QWizard::accept()` on Yes (`wizard.cpp:262-263`); otherwise the wizard stays open.

**Stage 4 is repeatable.** `S4LifeAddButton` commits the selected module — charging its cost (`wizard.cpp:4438`), advancing age by `stage4->s4Age` (`wizard.cpp:4335`), recording `chr_dat->realLife` (`wizard.cpp:4346`), and setting `stage4->s4repeat = true` (`wizard.cpp:4349`) — then removes that module from the offered list so it cannot be taken twice (`wizard.cpp:4269-4300` handles three such special cases explicitly). Past age 100 the wizard warns and continues (`wizard.cpp:4342-4344`).

**Stage 0 is destructive.** `Wizard::changeAff(int)` (`wizard.cpp:537`) calls `chr_dat->clearChar()` at `wizard.cpp:601` — resetting attributes to 100, clearing skills and traits, and re-seeding `xp` — before applying the new affiliation's grants and charging `txt_res->xpCostModule` (`wizard.cpp:618`). Changing the affiliation therefore discards the whole character, not just Stage 0's contribution.

### 7.3 Back-navigation discards later-stage choices

The Back button is replaced at construction with a plain `QPushButton`, initially disabled (`wizard.cpp:30-33`). `Wizard::back()` (`wizard.cpp:193-222`, declared `virtual` at `wizard.h:256`) first raises a confirmation box whose text is explicit — *"If you change your stage module, all selections you have already made for any later stages are lost."* (`wizard.cpp:196`) — and only on Yes calls `QWizard::back()` followed by `BackChange()` (`wizard.cpp:208-209`).

Because `QWizard::back()` runs **first**, `BackChange()` (`wizard.cpp:155-191`) sees the **destination** id, exactly as `MainWizard()` does. Each case therefore refreshes the page being returned to and unwinds the stage being left:

| Destination id | Unwinds | Also runs | Cited at |
|---|---|---|---|
| 1 (`PageStage0`) | `S1RemoveOldParam()` | `clearZeroSkills/Traits`, `change()` | `wizard.cpp:157-163` |
| 2 (`PageStage1`) | `S2RemoveOldParam()` | + `S2DelSkills` / `S2DelTraits` / `S2DelAttr`, `S1Change()` | `wizard.cpp:164-172` |
| 3 (`PageStage2`) | `S3RemoveOldParam()` | + the same three flex-XP unwinds, `S2Change()` | `wizard.cpp:173-181` |
| 4 (`PageStage3`) | `S4RemoveOldParam()` | + the same three flex-XP unwinds, `S3Change()` | `wizard.cpp:182-190` |

The three `S2Del*` calls (`wizard.cpp:168-170`, `wizard.cpp:177-179`, `wizard.cpp:186-188`) are what refund a flex-XP spend; without them the stats granted in §4 would survive the removal of the module that funded them. `clearZeroSkills()` / `clearZeroTraits()` (`chardata.cpp:89-113`) then drop any entry the unwind reduced to zero.

**There is no case for destination id 0.** Going back from `PageStage0` to `IntroPage` unwinds nothing, and no `S0RemoveOldParam()` exists anywhere in the tree. See §9.

### 7.4 Module anatomy — shape plus one worked example

Every lifepath module is an `if (<name-parameter> == "<module name>") { … }` block inside a single large function per stage, preceded by a **reset preamble** that clears every field the blocks write. For Stage 1 the function is `Stage1::S1ChildHood(QString nameChild)` (`stage1_resurce.cpp:162-808`) and the preamble is `stage1_resurce.cpp:164-208`. The preamble matters: a block's meaning is *its writes against a known-zero background*, so a purely textual extractor that reads a block in isolation will miss every default.

The name parameter differs per stage — `nameChild` in Stage 1, `nameLChild` in Stage 2, `nameElem` in Stages 3 and 4 (`stage2_resurce.cpp:245`, `stage3_resurce.cpp:478`, `stage4_resurce.cpp:459`) — so no single regex covers all four files. Counts and spans are in §8.

The smallest complete Stage-1 block is `"Born Mercenary Brat"`, brace to brace 39 lines. It is reproduced here in full, and it is the **only** module block reproduced in this document. (The superlative is backed by the gap-to-gap span list in §8.)

```cpp
// stage1_resurce.cpp:308-346
    if (nameChild == "Born Mercenary Brat") {
        s1toolTip = "The child born to mercenary parents (or adopted by a\npassing mercenary command early in life) is an army brat\nof the most transient nature, whose family travels to distant\nand foreign realms with regularity, and who knows no\ntrue nationality or culture beyond the confines of military\nDropShips and field bases.\nPrerequisites: Independent/Mercenary affiliation; STR 4+, BOD 4+, WIL 4+";

        s1ChildHoodNumber = 2;
        s1XpCost = 270;

        s1Attr["STR"] = 75;
        s1Attr["BOD"] = 50;
        s1Attr["RFL"] = 100;
        s1Attr["WIL"] = 25;
        s1Attr["CHA"] = -25;
        s1Attr["EDG"] = 25;

        S1AddTraits("Equipped", 50);
        S1AddTraits("Illiterate", -50);
        S1AddTraits("Reputation", -50);

        S1AddSkills("Career/Soldier", 10);
        S1AddSkills("Interests/Military History", 5);
//        S1AddSkills("Language/Any", 10); // SEE RULEZ!
        S1AddSkills("Martial Arts", 15);
        S1AddSkills("Melee Weapons", 10);
        S1AddSkills("Negotiation", 5);
        S1AddSkills("Perception", 5);
//        S1AddSkills("Streetwise/Any", 10); // SEE RULEZ!

        s1ChildHoodLabel1 = "Language/Any";
        s1ChildHoodAttr1 = CreateSubSkillList("Language");// << "Language/English" << "Language/Mandarin Chinese" << "Language/Russian" << "Language/Cantonese" << "Language/Vietnamese" << "Language/Japanese" << "Language/Arabic" << "Language/Swedenese" << "Language/French" << "Language/German" << "Language/Hindi" << "Language/Greek" << "Language/Italian" << "Language/Mongolian" << "Language/Romanian" << "Language/Slovak" << "Language/Spanish" << "Language/Urdu" << "Language/Scots Gaelic" << "Language/Swedish";
        s1ChildHoodSkills1 = 10;

        s1ChildHoodLabel2 = "Streetwise/Any";
        s1ChildHoodAttr2 = CreateSubSkillList("Streetwise");// << "Streetwise/Periphery" << "Streetwise/Clan" << "Streetwise/Combine" << "Streetwise/FedSuns" << "Streetwise/Lyran" << "Streetwise/Rim Collection" << "Streetwise/Magistracy" << "Streetwise/Outworlds" << "Streetwise/Taurian" << "Streetwise/Rasalhague";
        s1ChildHoodSkills2 = 10;

        // prerq
        s1PreAttr["STR"] = 400;
        s1PreAttr["BOD"] = 400;
        s1PreAttr["WIL"] = 400;
    }
```

Field by field:

| Field | Line | Meaning |
|---|---|---|
| `s1toolTip` | `stage1_resurce.cpp:309` | UI hover text. It restates the prerequisites in **rulebook units** ("STR 4+"), which is how the ×100 storage below can be cross-checked. |
| `s1ChildHoodNumber` | `stage1_resurce.cpp:311` | A stable per-block id: the block's 0-based position in **source order**, running 0–10 across the eleven blocks. It is **not** an index into `s1ChildHoodList` (`stage1_resurce.cpp:7`), which omits `"Fugitives"` and so diverges from block 5 onward, and it is **not** the number of deferred slots — it equals that count for this block by coincidence and for no other. One live consumer: `wizard.cpp:2548` tests `== 6` to special-case `"Slave"`. |
| `s1XpCost` | `stage1_resurce.cpp:312` | What the module costs. Charged through `changeXP(stage1->s1XpCost, true)` (`wizard.cpp:2278`) and refunded with `direct == false` on removal (`wizard.cpp:2303`). |
| `s1Attr[...]` | `stage1_resurce.cpp:314-319` | Attribute deltas **in raw XP**, on the same 100-per-point scale as `charAttr` (`chardata.cpp:13-20`). A bare `100` is therefore **+1 point**, and `-25` is a quarter-point penalty. Only the six attributes the module touches appear; DEX and INT are absent and unchanged. |
| `S1AddTraits(name, xp)` | `stage1_resurce.cpp:321-323` | Signed trait grants (`stage1_resurce.cpp:31-33`). `Illiterate` at −50 and `Reputation` at −50 are *credits* to the budget (§2.4). |
| `S1AddSkills(name, xp)` | `stage1_resurce.cpp:325-331` | Skill grants (`stage1_resurce.cpp:35-37`). Note the two entries commented out at `stage1_resurce.cpp:327` and `stage1_resurce.cpp:332` with the marker `// SEE RULEZ!` — they are the deferred picks, re-expressed below. |
| `s1ChildHoodLabelN` / `s1ChildHoodAttrN` / `s1ChildHoodSkillsN` | `stage1_resurce.cpp:334-340` | A deferred `"…/Any"` pick: a label, the candidate list, and the XP the chosen entry receives. The candidate list is built by `CreateSubSkillList()` (`stage1_resurce.cpp:15-28`), which prefixes each value from `resource/subskill.dat` with the family name and sorts the result (`stage1_resurce.cpp:21-25`). |
| `s1PreAttr` / `s1PreTraits` / `s1PreSkills` | `stage1_resurce.cpp:343-345` | Prerequisites, merged by `PrereqStage()` (§6.2). **Attribute prerequisites are stored ×100**: `s1PreAttr["STR"] = 400` is the tooltip's "STR 4+". |

Prerequisites are *declared*, not *enforced* at selection time: nothing in this block prevents the module being chosen. Enforcement is `CheckPrereq()` after the wizard finishes (§6.2).

### 7.5 The seven modal wizard sub-dialogs

Exactly seven, and they are the seven `Wizard` members declared at `wizard.h:49-55`. All seven are constructed in the `Wizard` constructor (`wizard.cpp:20-26`).

### 7.5.1 `s0moredial` — `S0MoreDialog`

Declared `wizard.h:49`, constructed `wizard.cpp:20`, opened from `on_S0MoreButton_clicked()` (`wizard.cpp:392`, shown at `wizard.cpp:440`), connected at `wizard.cpp:245-246`. Resolves Stage 0's deferred picks: it returns three lists — `s0MoreDialAttr`, `s0MoreDialTraits`, `s0MoreDialSkills` (`s0moredialog.h:38-40`) — and the opener unwinds the previous set before reopening (`wizard.cpp:394-397`).

### 7.5.2 `s1moredial` — `S1MoreDialog`

Declared `wizard.h:50`, constructed `wizard.cpp:21`, opened from `on_S1MoreButton_clicked()` (`wizard.cpp:2132`, shown at `wizard.cpp:2180`), connected at `wizard.cpp:2214-2215`. The Stage-1 equivalent, with the same three-list interface (`s1moredialog.h:32-34`) plus the owning module's name (`s1moredialog.h:30`).

### 7.5.3 `s2fxpdialog` — `S2FlexXPDialog`

Declared `wizard.h:51`, constructed `wizard.cpp:23`, connected at `wizard.cpp:2798-2799`. The flex-XP allowance dialog of §4 — the only one of the seven shared across stages, re-seeded per page id at `wizard.cpp:2810`, `wizard.cpp:2818` and `wizard.cpp:2826`. Its arithmetic is `s2flexxpdialog.cpp:106-109`; it is **not** the main budget.

### 7.5.4 `s2advdial` — `S2AdvDialog`

Declared `wizard.h:52`, constructed `wizard.cpp:22`, shown at `wizard.cpp:2962` and `wizard.cpp:3011`, connected at `wizard.cpp:2795-2796`. Stage 2's advanced picks: up to several labelled element slots, each with a candidate list and separate skill and trait allowances (`s2advdialog.h:29-47`). Cancelling negates the grants rather than dropping them (`wizard.cpp:2937-2939`).

### 7.5.5 `s2clanfield` — `S2ClanFieldDialog`

Declared `wizard.h:53`, constructed `wizard.cpp:24`, shown at `wizard.cpp:2931`, connected at `wizard.cpp:2797` — to the **same** slot as `s2advdial`. The Clan sibko variant of the Stage-2 advanced dialog: it offers basic and advanced field lists (`s2clanfielddialog.h:25-26`) with their own XP, step-XP and rebate figures (`s2clanfielddialog.h:27-34`), seeded at `wizard.cpp:2909-2913`. Its `s2CFDRebateSum` is one of the two out-of-band credits to `chr_dat->xp` (`wizard.cpp:3539`; see §2.5).

### 7.5.6 `s3fielddial` — `S3FieldDialog`

Declared `wizard.h:54`, constructed `wizard.cpp:25` (note: with no parent, unlike the other six), connected at `wizard.cpp:3601`, initialised at `wizard.cpp:4060` and shown at `wizard.cpp:4065`. Resolves the sub-skill choices inside a Stage-3 career field, returning `s3FieldDialSkills` (`s3fielddialog.h:31`), which `S3FieldDialogAccept()` applies one by one (`wizard.cpp:4072-4077`).

### 7.5.7 `s4advdial` — `S4AdvDial`

Declared `wizard.h:55`, constructed `wizard.cpp:26`, connected at `wizard.cpp:4150-4151`, opened from `S4AdvButton()` (`wizard.cpp:4155`) which seeds eight element slots from `stage4` (`wizard.cpp:4195-4238`), calls `S4AdvDialInit()` (`wizard.cpp:4241`) and shows it (`wizard.cpp:4243`). It is a fully implemented dialog, not a stub: `s4advdial.cpp` is 676 lines defining fifteen members — `S4AdvDialClearAll()` at `s4advdial.cpp:75`, `S4AdvDialClearZero()` at `s4advdial.cpp:160`, its own additive `changeSkills` / `changeTraits` / `changeAttr` at `s4advdial.cpp:186`, `s4advdial.cpp:201` and `s4advdial.cpp:216`, the signal wiring at `s4advdial.cpp:242` and `S4AdvDialInit()` at `s4advdial.cpp:257` — `s4advdial.h` is 110 lines, and all three artefacts are registered in the project file (`btnchrcreator.pro:26` HEADERS, `btnchrcreator.pro:46` FORMS, `btnchrcreator.pro:65` SOURCES).

Its interface is three result lists — `s4AdvDialAttr`, `s4AdvDialSkills`, `s4AdvDialTraits` (`s4advdial.h:34-36`) — plus eight `…Elem` slots, each a label, a skill candidate list, a trait candidate list and an allowance (`s4advdial.h:40-60`). On accept, `S4AdvDialAcceptButton()` (`wizard.cpp:4248-4260`) funnels the three lists through the same `AddAffilAttr` / `AddAfillSkill` / `AddAfillTraits` helpers the rest of the wizard uses (`wizard.cpp:4256-4258`). On cancel it simply clears them (`wizard.cpp:4262-4267`). Reopening it first unwinds the previous grants (`wizard.cpp:4157-4189`) — with a defect; see §9.

Because Stage 4 is repeatable, this dialog runs once per Real Life module. It is part of the stage, not an optional extra.

### 7.6 Completion — what is written back, and where `wizardMod` is set

`Wizard::accept()` (`wizard.cpp:249-275`) is the gate: it either prompts to skip Stage 4 or calls `QWizard::accept()` directly (`wizard.cpp:273`). The base implementation emits `accepted()`, which `MainWindow` connected to `FinishWizard()` at `mainwindow.cpp:569`.

`MainWindow::FinishWizard()` (`mainwindow.cpp:364-427`) then, in order:

1. **Merges prerequisites** — `wz->PrereqStage()` (`mainwindow.cpp:366`), §6.2. This is the only call site, so prerequisites do not exist until the wizard completes.
2. **Copies every field** out of `wz->chr_dat` into the `…Main` members (`mainwindow.cpp:368-392`), including the three `pre*` containers (`mainwindow.cpp:390-392`).
3. **Refreshes the widgets** from the copied values — `SetWigetValue()` (`mainwindow.cpp:395`, defined `mainwindow.cpp:429-468`).
4. **Computes the residual** — `xpProg` at `mainwindow.cpp:397-398`, `XP = xpMain - xpProg` at `mainwindow.cpp:400`, and `wizardMod = XP - wz->chr_dat->xp` at `mainwindow.cpp:401`. **This is the only place `wizardMod` is assigned from the wizard** (§2.5); the only other writes are the reset to 0 (`mainwindow.cpp:2692`) and the load from file (`mainwindow.cpp:2154`).
5. **Sets the phenotype combo's enabled state** (`mainwindow.cpp:403-407`) — see §9.
6. **Writes a summary into the Notes field** (`mainwindow.cpp:409-422`), a plain text block listing affiliation, sub-affiliation, caste, both childhoods, school, the three school tiers and the Real Life module. This is the *only* record of the lifepath choices that survives into the saved file, via the `<notes>` block (`mainwindow.cpp:2426-2428`) — the individual module names are not persisted as structured fields.
7. **Recomputes everything** — `ChangeMain()` (`mainwindow.cpp:424`).

Cancelling instead runs `CancelWizard()` (`mainwindow.cpp:470`), wired at `mainwindow.cpp:570`.

---

## Part V — apparatus

### 8. Bulk table index

The desktop's rules data is 154 dispatch blocks plus a 51-entry clamp table. None of it is transcribed here. What follows is the **enumeration command, the count it returns at `a1d8009`, and the span**, so any of it can be regenerated on demand. Commands are run from the root of the checkout.

The eight enumeration rows split into two classes, because they are not the same kind of thing. **Class M** rows are one block per selectable lifepath module. **Class G** rows *select among* or *modify* modules and are not themselves modules. An extractor that merges the two will emit sibko attribute picks and school-change branches as if they were lifepath modules.

#### Table M — module blocks

One row per stage file. Each command counts the `if (<parameter> == "<name>")` lines that open a module block — the shape reproduced in §7.4 (`stage1_resurce.cpp:308-346`).

| File | Command | Lines | What |
|---|---|---|---|
| `stage1_resurce.cpp` | `grep -c 'nameChild ==' stage1_resurce.cpp` | **11** | Early Childhood modules |
| `stage2_resurce.cpp` | `grep -c 'nameLChild ==' stage2_resurce.cpp` | **13** | Late Childhood modules |
| `stage3_resurce.cpp` | `grep -c 'nameElem ==' stage3_resurce.cpp` | **78** | field + school modules |
| `stage4_resurce.cpp` | `grep -c 'nameElem ==' stage4_resurce.cpp` | **25** | Real Life modules |
| | **subtotal** | **127** | |

#### Table G — gating and branch blocks

Same form, different meaning: these blocks choose among or modify modules rather than being modules. The clan branch at `stage2_resurce.cpp:848` is the clearest example.

| File | Command | Lines | What |
|---|---|---|---|
| `stage2_resurce.cpp` | `grep -c 'nameAttr ==' stage2_resurce.cpp` | **11** | sibko attribute picks |
| `stage2_resurce.cpp` | `grep -c 'nameClan ==' stage2_resurce.cpp` | **2** | clan-specific branches |
| `stage3_resurce.cpp` | `grep -c 'school == "' stage3_resurce.cpp` | **10** | school-change branches |
| `stage3_resurce.cpp` | `grep -c 'affVar == "' stage3_resurce.cpp` | **4** | affiliation gating |
| | **subtotal** | **27** | |

**Grand total, all eight rows: 154.**

#### Occurrences are not distinct names

The counts above are **line** counts, which is the right unit for a dispatch block because one `if` can carry two names via `||`. Two rows depend on that: `stage2_resurce.cpp:848` tests `nameClan` against both `"Ghost Bear"` and `"Hell's Horses"` on one line, and `stage3_resurce.cpp:168` and `stage3_resurce.cpp:219` each test `affVar` against both `"Invading Clan"` and `"Homeworld Clan"`. Counting occurrences instead of lines inflates `nameClan` to 3 and `affVar` to 6.

Stage 3's 78 needs the same care in the other direction:

| Command | Result |
|---|---|
| `grep -o 'nameElem == "[^"]*"' stage3_resurce.cpp \| wc -l` | **78** occurrences |
| `grep -o 'nameElem == "[^"]*"' stage3_resurce.cpp \| sort -u \| wc -l` | **66** distinct |

The nine school names declared in `S3SChoolList` (`stage3_resurce.cpp:9-10`) each appear on **two** `nameElem` lines, accounting for 18 of the 78 and 9 of the 66. The remaining **57 distinct names over 60 lines** are field modules. Occurrences and distinct counts must be reported separately; conflating them yields the wrong module inventory.

#### Spans and exceptions

| File | Enumeration | First / last match | Cited exceptions |
|---|---|---|---|
| `stage1_resurce.cpp` | `nameChild ==` | `stage1_resurce.cpp:210` / `stage1_resurce.cpp:750` | `"Fugitives"` (`stage1_resurce.cpp:393`) has a block but is **absent** from the constructor's default list (`stage1_resurce.cpp:7`) — it is only ever added by gating. `"Born Mercenary Brat"` (`stage1_resurce.cpp:308`) is offered by exactly one gate branch (`stage1_resurce.cpp:126-128`). |
| `stage2_resurce.cpp` | `nameLChild ==` | `stage2_resurce.cpp:299` / `stage2_resurce.cpp:794` | `"Civilian Job"` (`stage2_resurce.cpp:794`) is the module that short-circuits Stages 3 and 4 for two affiliations (`wizard.cpp:3557-3565`, `wizard.cpp:4133-4141`). The sibko modules pair with Table G's `nameAttr` blocks (`stage2_resurce.cpp:862`, `stage2_resurce.cpp:954`), which are a second dispatch inside the module. |
| `stage3_resurce.cpp` | `nameElem ==` | `stage3_resurce.cpp:479` / `stage3_resurce.cpp:891` | The list straddles three functions: field modules in `S3FieldChange()` (`stage3_resurce.cpp:478`), schools in `S3SchoolEnter()` (`stage3_resurce.cpp:800`) and `S3SetSchool()` (`stage3_resurce.cpp:850`). `"Officer Candidate School"` (`stage3_resurce.cpp:444`, `stage3_resurce.cpp:891`) is a tenth school not present in `S3SChoolList` (`stage3_resurce.cpp:9-10`). |
| `stage4_resurce.cpp` | `nameElem ==` | `stage4_resurce.cpp:521` / `stage4_resurce.cpp:2547` | `"None"` (`stage4_resurce.cpp:521`) is a real block with zero cost, not a sentinel. Availability is caste-conditioned, not just affiliation-conditioned (`stage4_resurce.cpp:50-57`). |

**Stage-1 block sizes**, from `grep -n 'if (nameChild == "' stage1_resurce.cpp` → starts at 210, 262, 308, 348, 393, 454, 519, 595, 651, 708, 750, with the function ending at `stage1_resurce.cpp:808`. Gap-to-gap: 52, 46, **40**, 45, 61, 65, 76, 56, 57, 42, 58. The third is the smallest, which is why `"Born Mercenary Brat"` is §7.4's worked example; brace to brace it is `stage1_resurce.cpp:308-346`, 39 lines.

#### Module cost ranges

Derived with `grep -o 's1XpCost = [0-9]*' stage1_resurce.cpp | sort -u` and its three siblings — a sanity range for an extractor, not a substitute for the per-module values:

| Stage | File | Distinct literals assigned |
|---|---|---|
| 1 | `stage1_resurce.cpp` | 0, 45, 170, 210, 215, 225, 250, 270, 275, 290, 300 |
| 2 | `stage2_resurce.cpp` | 0, 400, 490, 500, 600, 950, 1500, 1600 |
| 3 | `stage3_resurce.cpp` | 0, 550, 560, 600, 680, 700, 710, 720, 760, 830 |
| 4 | `stage4_resurce.cpp` | 0, 400, 600, 700, 800, 825, 900, 1000, 1200 |

The `0` in each row is a reset, not a free module — the constructor initialisers at `stage1_resurce.cpp:11`, `stage2_resurce.cpp:10`, `stage3_resurce.cpp:8` and `stage4_resurce.cpp:15`, plus the per-selection preamble resets at `stage3_resurce.cpp:73` and `stage4_resurce.cpp:506`. The one genuine exception is Stage 4's `"None"` module, which really does cost 0 and add 0 years (`stage4_resurce.cpp:521-525`). Note that Stages 1 and 2 deliberately do **not** reset the cost in their preamble: the wizard refunds the *previous* value first (`wizard.cpp:2303`) and only then lets the new module overwrite it (`wizard.cpp:2278` charges the new one).

Stage 3 additionally charges **30 XP per field skill** on top of the school cost (`wizard.cpp:3975`, `wizard.cpp:4009`, `wizard.cpp:4041`), refunded symmetrically when the field changes (`wizard.cpp:3954`, `wizard.cpp:3991`, `wizard.cpp:4024`).

#### The trait clamp table

| Command | Result |
|---|---|
| `awk 'NR>=1358 && NR<=1847' mainwindow.cpp \| grep -oc 'nameTrait == "'` | **51** entries |

Span `mainwindow.cpp:1358-1847`, inside `CheckTraitLvl()` (`mainwindow.cpp:1262-1849`). Each entry is a `nameTrait ==` test wrapping a lower clamp, an upper clamp, or both — see §5.2 for the shape and two cited examples. The 490-line span is mostly the commented-out legacy ladder's neighbour; the live table is these 51 blocks and nothing else.

#### Catalogue files

| File | Command | Entries | Parsed by |
|---|---|---|---|
| `resource/allskills.dat` | `wc -l resource/allskills.dat` | **92** | `loadresurce.cpp:22-43` |
| `resource/alltraits.dat` | `wc -l resource/alltraits.dat` | **76** | `loadresurce.cpp:45` |
| `resource/affilations.dat` | `wc -l resource/affilations.dat` | **12** + an unterminated final line = 13 affiliations | `loadresurce.cpp:5` |
| `resource/phenotype.dat` | `wc -l resource/phenotype.dat` | **3** + an unterminated final line = 4 phenotypes | `loadresurce.cpp:6` |

### 9. Desktop bugs and internal inconsistencies

Recorded, not repaired. Per §0 the desktop is canon: each entry below is a place where the C++ looks wrong on its own terms, left standing so that a port can make an explicit decision about it. Nothing here is a rulebook comparison.

**9.1 — The phenotype gate is a tautology, and `mainwindow.cpp:406` is dead code.**
`mainwindow.cpp:403` reads `if (affNameMain.first != "Invading Clan" || affNameMain.first != "Homeworld Clan")`. A string cannot equal both literals, so at least one inequality always holds and the condition is always true. `ui->PhenotypeMain->setEnabled(true)` at `mainwindow.cpp:404` always runs and `setDisabled(true)` at `mainwindow.cpp:406` never does. The apparent intent — restrict Clan phenotypes to Clan characters — is not achieved: any character can select `Phenotype/Elemental` and inherit its caps (§5.1). `&&` was presumably meant.

**9.2 — Swim reads the `Climbing` skill.**
The block is `mainwindow.cpp:930-933`: `mainwindow.cpp:930` declares `int swimSkill=0`, and `mainwindow.cpp:932` then tests `charSkillsMain[i].first == "Climbing"`, assigning its level to `swimSkill` at `mainwindow.cpp:933`. The Swim readout at `mainwindow.cpp:947` is therefore `Walk + level(Climbing)`. The string `"Swimming"` does appear in the skill lists (for example `text_resurce.cpp:29`) but nowhere in the movement code. Climbing consequently contributes to two derived stats (§5.4) and Swimming to none.

**9.3 — The age table appends a `Reputations` trait; every other table says `Reputation`.**
`text_resurce.cpp:2741` builds `QString tmptrait = "Reputations";` inside the 31–40 band (block `text_resurce.cpp:2740-2743`), and `text_resurce.cpp:2765` repeats it in the 51–60 band (block `text_resurce.cpp:2764-2767`). The singular `"Reputation"` is what the stage tables grant — for instance `stage1_resurce.cpp:323` — and what the trait catalogue carries (`resource/alltraits.dat:63`). Because `CharData::changeTraits()` matches on the exact string (`chardata.cpp:82`), the plural creates a **second, separate trait** rather than modifying the existing one, and the clamp table (§5.2) has no entry for it.

**9.4 — The prerequisite de-duplication indexes by a match count.**
In `PrereqStage()`, the trait pass counts matches into `traitCount` (`wizard.cpp:335-341`) and then uses `chr_dat->preCharTraits[traitCount-1]` as the element to update (`wizard.cpp:346-347`). `traitCount` is a *count*, not a position: after one match it is 1, so the code always updates index 0 regardless of where the duplicate actually sits. The skill pass is identical (`wizard.cpp:369-375`, `wizard.cpp:380-381`). The result is correct only when the duplicate is the first element; otherwise the wrong prerequisite is raised and the real duplicate keeps its lower value.

**9.5 — The GM's XP award is never persisted.**
`AddGmNum()` increments both `countCBills` (`mainwindow.cpp:4214`) and `xpMain` (`mainwindow.cpp:4215`), but `prepSaveFile()` emits `cbillmod` for the former (`mainwindow.cpp:2350`) and **no key at all** for the latter (`mainwindow.cpp:2285-2431`). Reopening the file restores `countCBills` (`mainwindow.cpp:2157-2158`) while `xpMain` reverts to the hardcoded 5000 (`mainwindow.cpp:2689`). The two halves of one dialog therefore behave differently across a save/load cycle, and the character silently loses the granted XP.

**9.6 — `BackChange()` has no case for the Intro page, so Stage 0 is never unwound.**
`MainWizard()` dispatches page ids 1 through 5 (`wizard.cpp:114`, `wizard.cpp:117`, `wizard.cpp:120`, `wizard.cpp:123`, `wizard.cpp:126`); `BackChange()` dispatches only 1 through 4 (`wizard.cpp:157`, `wizard.cpp:164`, `wizard.cpp:173`, `wizard.cpp:182`). Since `BackChange()` reads the **destination** id (§7.3), the entry that is missing is `case 0` — returning from `PageStage0` to `IntroPage`. There is no `S0RemoveOldParam()` in the codebase to call, either. Stage 0's affiliation, sub-affiliation and caste grants therefore survive a return to the Intro page, contradicting the confirmation dialog's own promise at `wizard.cpp:196`. In practice the damage is bounded, because re-entering Stage 0 calls `chr_dat->clearChar()` (`wizard.cpp:601`) and rebuilds from scratch — but only if the affiliation combo is actually re-activated.

**9.7 — `S4AdvButton()`'s unwind assigns where it should subtract, and both branches of its `if` are identical.**
`wizard.cpp:4161` reads `chr_dat->charAttr[...] = -s4advdial->s4AdvDialAttr[i].second;` — an **assignment** of the negated delta, not a subtraction of it. An attribute previously at 375 that received +25 from the dialog becomes `-25`, not 350. The neighbouring skill and trait unwinds at `wizard.cpp:4165` and `wizard.cpp:4171` correctly pass a negated delta to the additive `changeSkills` / `changeTraits` (`chardata.cpp:43`, `chardata.cpp:70`), which makes the attribute line's shape look right at a glance. Separately, the `if` at `wizard.cpp:4158` and its `else` at `wizard.cpp:4174` contain the same three loops with the same bodies (`wizard.cpp:4160-4172` against `wizard.cpp:4175-4187`), so the guard has no effect.

**9.8 — The `Covert Operations` prerequisite waiver indexes the skill list with the trait loop's counter.**
The waiver loops over `charTraitsMain` (`mainwindow.cpp:3398`) and inside it tests `charSkillsMain[i].first == "Leadership"` at `mainwindow.cpp:3404`, reusing `i`. The two lists are independent and of different lengths, so the test reads an arbitrary skill — and indexes out of bounds whenever the character has more traits than skills. The sibling waivers at `mainwindow.cpp:3369-3383` and `mainwindow.cpp:3385-3395` stay within the trait list and are unaffected.

**9.9 — `Illiterate` is removed during a display refresh, and the removal loop skips an element.**
`ChangeMain()` deletes the `Illiterate` trait when any `Language/*` skill reaches level 4 (`mainwindow.cpp:936-944`). Two things follow. The mutation happens inside a *repaint* function, so a trait a lifepath module granted at negative XP (for example `stage1_resurce.cpp:322`) can vanish as a side effect of an unrelated edit, changing `SumTraitsXP()` and therefore the budget (§2). And `charTraitsMain.removeAt(j)` at `mainwindow.cpp:940` does not decrement `j` (`mainwindow.cpp:938`), so the element after a removal is skipped — harmless while at most one `Illiterate` exists, which §9.3's near-miss shows is not something the codebase guarantees in general.

**9.10 — The New handler prints `xpMain` before resetting it.**
`mainwindow.cpp:2687` writes the *current* `xpMain` into the status label; `mainwindow.cpp:2689` then sets `xpMain = 5000`. After a GM award (§9.5) the label therefore shows the pre-reset figure until the next `ChangeMain()`. Cosmetic, but it is the same ordering slip that makes §9.5 hard to notice.

**9.11 — `Natural Aptitude` can only ever return 0.**
Its clamp entry is two consecutive blocks (`mainwindow.cpp:1659-1670`). The first is `if(lvlValue >= 3) lvlValue = 3; else lvlValue = 0;`, so afterwards `lvlValue` is either 3 or 0. The second is `if(lvlValue >= 5) lvlValue = 5; else lvlValue = 0;` — and neither 3 nor 0 satisfies `>= 5`, so both fall to the `else`. **Every input yields 0**, including the maximum. No other entry in the 51-row table has this shape; the second block reads like a copy of the first with its threshold edited and its predecessor's result not accounted for.

**9.12 — `Unlucky` resolves a negative-only trait to a positive level.**
`mainwindow.cpp:1820-1827` reads `if(lvlValue > -2) lvlValue = 2;` followed by a lower clamp of −10. Every level from −1 upward therefore becomes **+2**, so a trait that is only ever granted at negative XP reports a positive level on the sheet. With §5.2's truncation, `Unlucky` at −50 XP truncates to 0 and clamps to +2.

Four other entries use the identical guard shape with the sign intact — `Handicap` (`mainwindow.cpp:1596`), `Lost Limb` (`mainwindow.cpp:1650`), `Poor Hearing` (`mainwindow.cpp:1703`) and `Poor Vision` (`mainwindow.cpp:1712`). `Poor Vision` (`mainwindow.cpp:1712-1719`) is the exact structural twin: the same `if(lvlValue > -2)` condition, bounding to `-2` where `Unlucky` bounds to `2`. A dropped minus sign is the obvious reading and the four siblings make it more than a guess — but per §0 the code as written is canon, and a port that silently negates it is diverging from the desktop, not fixing it.

`Combat Paralysis` (`mainwindow.cpp:1412-1419`) is the milder form of the same shape: it is the only one of the seventeen entries testing `lvlValue > 0` that assigns something other than 0 (§5.2).

### 10. Citation index

Every `file:line` used above, grouped by source file and sorted — from `chardata.cpp:7` to `wizard.ui:5423`. All paths are relative to the root of `Battletech-Character-Creator` at `a1d8009`. Collected mechanically from §§0–9 of this document by a scratchpad script, not by hand: **707 citation tokens**, resolving to **556 distinct spans across 29 files**. The entries below list the distinct spans, so they sum to 556, not 707 — the same occurrences-versus-distinct distinction §8 draws for the stage tables. Every one resolves at `a1d8009`; none points at a generated or decoy path. Scanning the whole file rather than §§0–9 yields 709, because this paragraph names its own two endpoints.

**`chardata.cpp`** — 124 lines; 14 distinct citations: `7`, `11-32`, `13-20`, `29-31`, `35-48`, `43`, `58`, `70`, `82`, `89-113`, `115-124`, `120`, `120-123`, `122-123`

**`chardata.h`** — 71 lines; 9 distinct citations: `8-69`, `16-51`, `19`, `20`, `21`, `42`, `43-44`, `46-48`, `50-51`

**`gmchartools.h`** — 30 lines; 2 distinct citations: `14-19`, `18-19`

**`loadresurce.cpp`** — 271 lines; 14 distinct citations: `5`, `6`, `7-8`, `22-43`, `33-36`, `45`, `158-179`, `168`, `169`, `170`, `181-202`, `191`, `192`, `193`

**`mainwindow.cpp`** — 4964 lines; 167 distinct citations: `18`, `19`, `24`, `160-173`, `219`, `226`, `230`, `234`, `238`, `242`, `246`, `250`, `254`, `364-427`, `366`, `368-392`, `390-392`, `395`, `397-398`, `400`, `400-401`, `401`, `403`, `403-407`, `404`, `406`, `409-422`, `424`, `429-468`, `447-448`, `470`, `558-571`, `560-562`, `569`, `570`, `574-583`, `574-621`, `575-577`, `579`, `586-621`, `588-617`, `597-600`, `624-679`, `625-667`, `688-696`, `692-694`, `827-957`, `830-831`, `830-833`, `833`, `844-850`, `858`, `860-864`, `860-878`, `862`, `865`, `869-872`, `870`, `875-878`, `876`, `877`, `881-882`, `885-889`, `892-893`, `895-903`, `904`, `906-910`, `906-919`, `921-925`, `921-928`, `930`, `930-933`, `932`, `933`, `936-944`, `938`, `940`, `947`, `959-967`, `969-977`, `995`, `1000-1003`, `1005-1008`, `1014`, `1021-1024`, `1026-1029`, `1041-1042`, `1055`, `1262`, `1262-1849`, `1266`, `1268-1356`, `1358`, `1358-1365`, `1358-1847`, `1367-1374`, `1412-1419`, `1596`, `1650`, `1659-1670`, `1703`, `1712`, `1712-1719`, `1820-1827`, `1838-1845`, `1847`, `1848`, `1851-1919`, `1859`, `1868`, `1874-1875`, `1876`, `1877-1879`, `1880-1882`, `1884-1916`, `1921-1973`, `1924-1970`, `1988-2035`, `1990-1997`, `1999-2007`, `2009-2016`, `2018-2022`, `2024-2031`, `2033`, `2037-2259`, `2153-2154`, `2154`, `2157-2158`, `2285-2431`, `2290-2350`, `2293-2320`, `2347`, `2350`, `2371`, `2384`, `2404`, `2412`, `2422`, `2426-2428`, `2687`, `2689`, `2691`, `2692`, `2915-2935`, `2926`, `3090-3110`, `3100-3101`, `3101`, `3104`, `3234-3240`, `3295-3427`, `3296-3298`, `3303`, `3303-3333`, `3337-3351`, `3340`, `3354-3367`, `3369-3383`, `3385-3395`, `3397-3409`, `3398`, `3404`, `3414-3426`, `3963`, `4205-4211`, `4214`, `4215`

**`mainwindow.h`** — 248 lines; 10 distinct citations: `7`, `33`, `35`, `97`, `101`, `128`, `129`, `132`, `143`, `144`

**`s0moredialog.h`** — 85 lines; 1 distinct citations: `38-40`

**`s1moredialog.h`** — 74 lines; 2 distinct citations: `30`, `32-34`

**`s2advdialog.h`** — 78 lines; 1 distinct citations: `29-47`

**`s2clanfielddialog.h`** — 58 lines; 2 distinct citations: `25-26`, `27-34`

**`s2flexxpdialog.cpp`** — 579 lines; 14 distinct citations: `35`, `85-129`, `96-104`, `106-109`, `127`, `128`, `190`, `214`, `236`, `254`, `349-359`, `361`, `362`, `364-371`

**`s3fielddialog.h`** — 52 lines; 1 distinct citations: `31`

**`s4advdial.cpp`** — 676 lines; 7 distinct citations: `75`, `160`, `186`, `201`, `216`, `242`, `257`

**`s4advdial.h`** — 110 lines; 2 distinct citations: `34-36`, `40-60`

**`stage1_resurce.cpp`** — 808 lines; 48 distinct citations: `7`, `11`, `15-28`, `21-25`, `31-33`, `35-37`, `40-85`, `88-139`, `89`, `93`, `99-100`, `126-128`, `134`, `141-160`, `148`, `156`, `162-808`, `164-208`, `210`, `308`, `308-346`, `309`, `311`, `312`, `314-319`, `321-323`, `322`, `322-323`, `323`, `325-331`, `327`, `332`, `334-340`, `336`, `340`, `343`, `343-345`, `348-391`, `352`, `354-357`, `359-362`, `364-365`, `367`, `369`, `378`, `393`, `750`, `808`

**`stage2_resurce.cpp`** — 1092 lines; 11 distinct citations: `10`, `42-68`, `71-163`, `164-236`, `245`, `245-826`, `299`, `794`, `848`, `862`, `954`

**`stage3_resurce.cpp`** — 894 lines; 17 distinct citations: `8`, `9-10`, `45-57`, `46`, `51`, `53`, `67-466`, `73`, `168`, `219`, `444`, `478`, `478-799`, `479`, `800`, `850`, `891`

**`stage4_resurce.cpp`** — 2628 lines; 9 distinct citations: `15`, `43-450`, `50-57`, `459`, `459-2615`, `506`, `521`, `521-525`, `2547`

**`text_resurce.cpp`** — 2843 lines; 26 distinct citations: `26-388`, `29`, `29-68`, `424`, `456`, `480`, `511`, `2516`, `2709-2843`, `2713`, `2723`, `2724-2730`, `2732`, `2740-2743`, `2741`, `2746`, `2756`, `2764-2767`, `2765`, `2770`, `2778-2779`, `2783`, `2793-2794`, `2798`, `2813`, `2828`

**`wizard.cpp`** — 4588 lines; 156 distinct citations: `18`, `20`, `20-26`, `21`, `22`, `23`, `24`, `25`, `26`, `30-33`, `112-152`, `113-127`, `114`, `114-115`, `117`, `120`, `123`, `123-124`, `126`, `126-128`, `128-149`, `143`, `155-191`, `157`, `157-163`, `159-160`, `164`, `164-172`, `168-170`, `173`, `173-181`, `177-179`, `182`, `182-190`, `186-188`, `193-222`, `196`, `208-209`, `241`, `245-246`, `249-275`, `262-263`, `273`, `277-388`, `279-285`, `287-293`, `295-301`, `303-309`, `311-317`, `320-326`, `324`, `329-351`, `335-341`, `346-347`, `354-360`, `361-385`, `369-375`, `380-381`, `392`, `394-397`, `440`, `524-534`, `527`, `529`, `532`, `537`, `601`, `602-617`, `618`, `2132`, `2180`, `2214-2215`, `2278`, `2303`, `2548`, `2795-2796`, `2797`, `2798-2799`, `2802-2831`, `2806-2808`, `2810`, `2811`, `2814-2816`, `2818`, `2819`, `2822-2824`, `2826`, `2827`, `2909-2913`, `2931`, `2937-2939`, `2962`, `3011`, `3524-3525`, `3531-3534`, `3539`, `3542`, `3557-3565`, `3559`, `3564`, `3595-3597`, `3601`, `3634`, `3953`, `3954`, `3968`, `3975`, `3990`, `3991`, `4002`, `4009`, `4023`, `4024`, `4034`, `4041`, `4060`, `4065`, `4072-4077`, `4085`, `4086`, `4133-4141`, `4135`, `4140`, `4148`, `4150-4151`, `4155`, `4157-4189`, `4158`, `4160-4172`, `4161`, `4165`, `4171`, `4174`, `4175-4187`, `4195-4238`, `4241`, `4243`, `4248-4260`, `4256-4258`, `4262-4267`, `4269-4300`, `4335`, `4342-4344`, `4346`, `4348`, `4349`, `4438`, `4452`, `4526-4534`, `4538`, `4570-4588`, `4571-4577`, `4578`, `4579`, `4580`, `4581-4587`

**`wizard.h`** — 276 lines; 14 distinct citations: `26-272`, `31`, `40`, `42-45`, `46`, `49`, `49-55`, `50`, `51`, `52`, `53`, `54`, `55`, `256`

**`wizard.ui`** — 5805 lines; 18 distinct citations: `53`, `67`, `373`, `408`, `418`, `421`, `446`, `478`, `1641`, `1678`, `2338`, `2637`, `3283`, `3608`, `4284`, `4719`, `5407`, `5423`

**`btnchrcreator.pro`** — 75 lines; 5 distinct citations: `26`, `36-49`, `46`, `47`, `65`

**`resource/affilations.dat`** — 12 lines; 1 distinct citations: `1-12`

**`resource/allskills.dat`** — 92 lines; 1 distinct citations: `1`

**`resource/alltraits.dat`** — 76 lines; 1 distinct citations: `63`

**`resource/equiplist.dat`** — 229 lines; 1 distinct citations: `1-8`

**`resource/phenotype.dat`** — 3 lines; 1 distinct citations: `1-3`

**`resource/weaponslist.dat`** — 227 lines; 1 distinct citations: `2`
