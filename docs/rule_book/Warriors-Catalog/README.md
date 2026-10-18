# The Warrior’s Catalog — Table Data

Source: `Battletech a Time of War.pdf`, printed pages 260–325 (PDF pages 262–327).

One UTF-8 JSON file per table title. Continuation pages are combined in the same file.
The two Drug Creation Tables share their printed title and file, with separate parts
for their different column sets. Three separately titled stealth rules tables are included.
`MECHWARRIOR KITS` and `SPECIAL COMBAT KITS` inherit the armor-column headings above them.

## Schema

- `table_name`: original printed table title.
- `source`: book filename, chapter, printed page numbers, and PDF page numbers (one-based).
- `parts`: page/table segments, each with columns, rows, and footnotes in `notes`.
- `_section` within a row: applicable skill, faction, armor family, or other section label.
- `shared_notes`: rules printed across a section rather than inside an individual item row.
- `row_notes`: a merged note attached to a particular row.
- `row_count`: number of data rows across all parts.

## Data Preservation

Cell values are strings, preserving units, dice expressions, signs, ranges, em dashes,
footnote markers, and the book’s printed values. Source typography line breaks and
obvious split ligatures are normalized. No numerical rules or source typos are corrected.
For personal armor, family rows retain their shared BAR/rating values; em dashes on
individual variants are preserved as printed. Header and section bands are not data rows.

## Filenames

Filenames match the table titles plus `.json`, except that `/` is replaced by `-` because `/`
is a filesystem path separator. The original title remains in `table_name`.

## Files

| File | Row count | Printed pages |
| --- | ---: | --- |
| `ARCHAIC MELEE WEAPONS.json` | 16 | 261 |
| `ARCHAIC RANGED WEAPONS.json` | 12 | 261 |
| `MODERN MELEE WEAPONS.json` | 14 | 264 |
| `BALLISTIC WEAPONS.json` | 39 | 265, 266 |
| `ENERGY WEAPONS.json` | 28 | 267 |
| `FLECHETTE WEAPONS.json` | 12 | 268 |
| `GAUSS WEAPONS.json` | 5 | 268 |
| `GYROJET WEAPONS.json` | 8 | 269 |
| `MISCELLANEOUS RANGED WEAPONS.json` | 8 | 269 |
| `MACHINE GUN SUPPORT WEAPONS.json` | 9 | 273 |
| `GRENADE LAUNCHERS AND MORTARS.json` | 7 | 273 |
| `MISSILE LAUNCHERS.json` | 9 | 274 |
| `RECOILLESS RIFLES.json` | 3 | 274 |
| `SUPPORT ENERGY WEAPONS.json` | 17 | 275 |
| `SUPPORT GAUSS WEAPONS.json` | 5 | 275 |
| `STANDARD EXPLOSIVES.json` | 10 | 278 |
| `DEMOLITIONS.json` | 4 | 278 |
| `ORDNANCE.json` | 50 | 282, 283, 284 |
| `SPECIALTY AMMUNITION.json` | 14 | 285 |
| `WEAPON ACCESSORIES.json` | 20 | 286 |
| `PERSONAL ARMOR.json` | 36 | 288, 289 |
| `COMBAT ARMOR ACCESSORIES.json` | 19 | 290 |
| `STANDARD ARMOR KITS (BY FACTION).json` | 48 | 292, 293, 294 |
| `MECHWARRIOR KITS.json` | 10 | 294 |
| `SPECIAL COMBAT KITS.json` | 7 | 295 |
| `EXOTIC ARMOR.json` | 5 | 295 |
| `HOSTILE ENVIRONMENT GEAR.json` | 18 | 296 |
| `STEALTH GEAR.json` | 11 | 297 |
| `NON-COMBAT ATTIRE.json` | 30 | 299 |
| `COMMUNICATIONS EQUIPMENT.json` | 17 | 301 |
| `AUDIO-VIDEO-TRIDEO EQUIPMENT.json` | 14 | 302 |
| `COMPUTERS.json` | 11 | 303 |
| `SURVEILLANCE GEAR.json` | 12 | 304 |
| `OPTICS.json` | 7 | 304 |
| `REMOTE SENSORS.json` | 12 | 305 |
| `POWER PACKS.json` | 18 | 306 |
| `RECHARGERS.json` | 6 | 307 |
| `ESPIONAGE GEAR AND SECURITY SYSTEMS.json` | 20 | 308 |
| `REPAIR-SALVAGE GEAR.json` | 18 | 310 |
| `MISCELLANEOUS GEAR.json` | 18 | 312 |
| `MEDICAL EQUIPMENT.json` | 16 | 313 |
| `LIMB AND ORGAN REPLACEMENTS.json` | 25 | 315 |
| `ELECTIVE IMPLANTS.json` | 6 | 317 |
| `SAMPLE DRUGS AND POISONS.json` | 38 | 319, 320 |
| `DRUG CREATION TABLES.json` | 34 | 322, 323 |
| `PERSONAL VEHICLES.json` | 29 | 324, 325 |
| `VEHICULAR FUELS (TYPICAL).json` | 6 | 325 |
| `ECM Stealth Effects in Tactical Combat.json` | 4 | 298 |
| `IR Stealth Effects in Tactical Combat.json` | 5 | 298 |
| `Camo Stealth Effects in Tactical Combat.json` | 6 | 298 |
