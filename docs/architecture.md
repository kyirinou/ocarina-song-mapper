# Architecture and project files

## Source layout

| Area | Responsibility |
| --- | --- |
| `lib/domain.mjs` | Pure pitch, transposition, rhythm, and project validation/migration rules |
| `lib/project-store.mjs` | Versioned local storage, integrity checking, interrupted-write recovery, and recovery snapshots |
| `lib/custom-sound.mjs`, `source-custom-sound.js` | Three-second tuner qualification, recorded sample loops, IndexedDB persistence, and custom sound settings |
| `source-core.js` | Score state, synthesized/sample playback, keyboard stepping, Enter timing |
| `source-projects.js` | Project UI, saved library, importing backups, and editing entry points |
| `source-editor.js`, `source-note-actions.js`, `source-piano-roll.js` | Editing operations, selection, undo/redo, and piano-roll interaction |
| `source-abc.js`, `source-formats.js`, `source-notation.js` | Text/ABC/MIDI/MusicXML interchange and staff engraving |
| `source-tab-*.js`, `source-page-layout.js`, `source-score-paper.js`, `source-preview-editor.js` | Fingering recognition, tab drafts, page layout, and matching preview/PDF output |
| `source-practice*.js`, `source-recognition.js`, `source-tuner-graphs.js` | Microphone practice, pitch recognition, statistics, and flashcards |
| `index.html`, `osm.css`, `workspace.css` | Page structure, shared styles, and workspace styles |
| `tests/unit`, `tests/browser` | Pure logic and normal browser-entry regression checks |

The pure modules have explicit ES module interfaces and can be imported directly by Node tests. The Python build incorporates those modules into the browser bundle. UI feature files still execute in an ordered shared scope inside the generated app wrapper. The order is declared in `build.py`.

`app.js` and `osm-offline.html` are generated outputs. `build-offline.py` embeds the same app, libraries, fonts, sound samples, and PDF worker in the offline HTML. Python builds preserve the offline download without requiring a runtime server.

A future module migration should move one bounded area at a time while retaining the same public behavior and regression checks. Document new dependencies at their module boundary.

## Score model

The active score has one ordered event sequence. Each event has a MIDI pitch or `null` for a rest, a written duration in sixteenth-note ticks, optional exact milliseconds, optional velocity, and an optional muted flag.

- `notes` stores pitches as MIDI integers from C0 through G9. Alto C ocarina fingerings cover A4–F6.
- `lengths` stores positive written durations. Four ticks equal one quarter-note beat.
- `intervals` stores exact playback milliseconds or `null` to use the written duration and tempo.
- `tempo` is the base quarter-note BPM. `tempoMap` stores ordered changes by tick offset.
- `meter`, `key`, `performance`, `activity`, and `tabDraft` retain notation, playback, history, and page-design details.

Selection and playback position are UI state. Editing operations should keep pitches, durations, and performance metadata together. A structural edit invalidates affected timing captures. Staff rendering and fingering output read the same event sequence, while an independently edited tab draft can have its own sequence.

## Project compatibility

Versioned project JSON includes `schemaVersion`. Unversioned files from earlier OSM releases are treated as legacy input and migrated through the current validation boundary. Unsupported future versions are rejected with an actionable message. Validation happens before imported data replaces an open song.

Round-trip tests must preserve written durations, exact timing, tempo changes, title, author, performance data, tab spacing, page layouts, and embedded images. Any schema change needs an old-file fixture and a tested migration.

## Persistence

The storage module owns serialization and recovery. Its envelope includes a schema version, revision, payload, and checksum for accidental corruption detection. The checksum is not authentication. It keeps pending and previous writes so a newer complete pending save can be recovered after interruption, and rejects a stale writer after another tab has saved. The UI reports a failed save and keeps the in-memory song available for export. Edits schedule recovery snapshots after a short pause. **File → Recovery snapshots** can restore a copy with a new project identifier or download the snapshot as a project backup. They use the same browser storage as the library and do not survive browser data clearing.

Treat the local library, current draft, and portable backup as distinct operations. Avoid writing partly validated objects to the library or reporting success before the storage operation has completed. See the module tests for interrupted-write and storage-failure cases.
