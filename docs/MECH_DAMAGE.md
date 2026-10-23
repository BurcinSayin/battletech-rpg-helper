# Mech damage tracking

Open a character's **Mech** tab in view mode to track damage without entering **Edit**. The character owner and its campaign GM can update it; database authorization enforces that access.

## Mark a batch, then Apply

- **Armor:** use − to damage and + to repair. Each front or rear armor entry shows remaining points / its saved maximum. Remaining armor cannot fall below zero or exceed that maximum.
- **Structure:** choose **Track structure** to enter a maximum manually for each critical-slot section, then use −/+ to record damage or repairs. **Done configuring structure** hides maximum inputs and untracked locations; **Configure structure** reopens setup. With no positive maxima, the STRUCTURE panel is hidden unless setup is open. No setup action appears without critical-slot locations or in a read-only view. Structure values are not supplied by the catalog or inferred from tonnage. A blank or zero maximum leaves that section untracked. Lowering a maximum clamps its damage to the new maximum; raising it keeps the recorded loss. Rear armor entries do not create extra structure tracks.
- **Critical slots:** tap a slot to mark or clear a hit. Repeated equipment names, empty slots and their order remain distinct; marking a hit does not change the base equipment list. On phones, expand a location to reach its slots.
- **Heat and pilot hits:** use their −/+ controls to adjust the counters manually.
- **Cool heat:** subtract the leading positive whole-number heat-sink count, stopping at zero. `10 Single` removes 10 heat; `11 IS Double` removes 11, not 22. Cooling does not model sink type, critical damage or combat dissipation rules. Missing, malformed, nonpositive or unsafe-size counts disable cooling but leave the manual counters available. Cooling joins the same Apply/Discard batch and is locked while applying or stale.

Changes stay local until **Apply**. You can mark several locations and counters before applying one batch. **Discard** returns to the stored state. Apply or discard pending damage before entering Edit. Reloading before Apply loses the local batch.

Opening or closing structure setup does not change, apply or discard damage. Setup stays open through Apply, Discard and incoming damage updates until you close it or leave the view. Clearing and retyping a maximum during one focused typing session preserves the original recorded loss, bounded by the new maximum.

After Apply, the server stores the batch and other open views receive the update. If anyone changes the character after you begin a batch—even an unrelated character edit—your pending batch becomes stale and cannot be applied. **Discard, load latest** loads the current record; then mark a new batch. Pending damage is never silently merged with someone else's changes. A stale full character save also conflicts instead of overwriting damage.

The **Heat & Pilot** panel also shows read-only **Mech piloting** and **Mech gunnery** information from the acknowledged character sheet: trait-adjusted RPG level and the same complexity/target metadata as Sheet. This is not a tabletop combat-roll conversion. Legacy Mech skill aliases are recognized; multiple matching rows remain separate and in their original order. An absent skill shows **N/A**, while a present zero-XP skill shows **Lvl 0**. Edit skills and learner traits on Sheet, then Save to refresh these cards; damage-control locks do not hide them.

## Repair and Reset all

Repair individual armor/structure points or clear individual critical hits as needed. **Reset all** clears armor damage, structure damage, critical hits, heat **and pilot hits**, but keeps the manually configured structure maxima. Reset is another local batch change: press Apply to persist it, or Discard to undo it.

## Editing or replacing the base mech

Saving **any distinct change to the base mech record** resets its armor/structure damage, structure maxima, critical hits and heat. This includes changing a name or stat, lowering armor, removing a slot/section, replacing from the catalog, and removing the mech. The editor warns when such a change would discard stored mech-specific state. A normal character save with an unchanged mech does not reset damage.

**Pilot hits are kept** across base mech edits, replacement and removal. When there is no mech, the damage controls—including pilot hits—are hidden. Retained pilot hits reappear when a mech is added. To clear pilot hits explicitly, use their repair control or Reset all while a mech is attached.

## Limits and compatibility

This is a manual record sheet, not combat automation: it does not calculate damage transfer, critical effects, shutdown, consciousness or injury rules. Heat and pilot-hit counters have technical bounds of **0–999**; structure maxima are **1–999** (blank/0 means untracked). Armor and structure losses are bounded by their maxima. These limits are not BattleTech combat rules.

Damage is stored separately from the base mech and character sheet. It does **not** change `.btcc` import/export or desktop round-trip compatibility; `.btcc` files do not carry this damage state. Applying changes requires an online connection.
