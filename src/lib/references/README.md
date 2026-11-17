# references

The reference log (#93): what was captured for a slate on other devices, logged by name. 360
HDRIs, 360 video, HDR references of textures and lights, witness camera clips, lidar scans,
textured models, photogrammetry sets, splats. The files stay on those devices. The wrap package
(#95) gives each reference an empty folder in its slate's folder, inside a folder for its kind,
where they land on a laptop: `42A/hdri-360/HDRI_0412/` (docs/export.md, "Layout"). Pure modules,
each with its test beside it.

## Modules

| module | what it does |
|---|---|
| `kinds.ts` | `KINDS`, the built-in kinds. `kindChoices` with the project's own kinds, `kindLabel`, `kindProblem` for a new project kind. |
| `log.ts` | `sortReferences`, `nextReferenceName`, `lastOfKind`, `newReference`, `referenceDetail` (a row), `referenceLine` (a file), `countByKind` (Wrap). |
| `edit.ts` | Not pure: `addReference`, `removeReference`, `setReferenceKind` on the store, with the switches. |

## Switches

A reference of kind HDRI 360, Witness camera or Lidar scan turns on the lighting setup's HDRI, or
the slate's Witness camera or Lidar scan, in the same undo entry, as a take type does (#92). The
app never turns one off: when the last reference of that kind goes (for HDRI, across every slate on
the lighting setup), the notice says the switch stays on and offers Turn Off. Ignored, nothing
changes. The switches stay editable. The rule is `planReferenceEdit` in `model/takeType.ts`, the
words `take/typeText.ts`, the Turn Off `take/typeEdit.ts`.

## Where it lives

- Model: the `reference` scope of the catalogue, under the slate (`slateId`). Fields: kind,
  name (the file or folder), device, card or roll, count, notes, and `loggedAt` for the order.
  Model README, decisions 45 to 50.
- Store: the `reference` table, synced; the `referenceKind` table, `{ id, projectId, name }`,
  synced too since #110 (store README, decision 26). Schema version 4.
- Project kinds in Flow PT: JSON in the Project's "Onset Reference Kinds" field, shared by every
  device of the show and read back at each sync (#110; fpt README, "The shared lists"). A reference
  keeps its kind as text on its own row.
- Flow PT: one row of the project custom entity "Set Reference" per reference, linked to its
  slate, with its client UUID (fpt README, decisions 26 and 27).
- Shown on the slate (`components/references/`), in Wrap (the day's count by kind, the day report),
  in the exports, and as an empty folder in the wrap package (docs/export.md). The folder names
  of the kinds and references are `kindFolderName`, `kindFolders` and `folderName` in
  `export/naming.ts`.
- Project kinds: Settings, project section, Reference kinds.

## Decisions

Made by Claude where the issue and Kevin's decisions of 2026-11-17 are silent. Kevin can
overrule any of them.

1. **Adding is two taps: a kind, then the name.** The kinds are chips under the slate's list. A
   tap opens a sheet with the name; Add or Return files it. The name is suggested after the last
   reference of that kind in the project, as a new slate's name is after the last slate.
2. **The suggestion steps the last run of digits,** zeros kept, so an extension stays:
   `HDRI_0412` → `HDRI_0413`, `IMG_1234.DNG` → `IMG_1235.DNG`. A name with no digits suggests
   nothing: a made-up name would be worse than none.
3. **A new reference carries the device and the card or roll of the last one of its kind,** as a
   new take copies the last. Not the count, not the notes: those belong to one reference.
4. **Project kinds come after the built-in ones and before Other,** in the order added. A project
   kind that spells a built-in kind or label is refused.
5. **The built-in kinds are stored by key, a project kind as typed.** Flow PT gets the same text.
   A deleted project kind stays on the references that used it.
6. **Lidar scan, not LiDAR scan,** in the app: the slate's switch is "Lidar scan"
   (docs/vocabulary.md, one term per concept). Flow PT keeps "LiDAR" for the slate's field.
7. **A reference shows the kind, device, card or roll and count under its name.** The count is
   written `×3`: what it counts is the crew's.
