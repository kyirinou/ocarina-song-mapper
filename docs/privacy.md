# Privacy and local storage

OSM processes imported music files, images, PDFs, recordings, and microphone audio in the browser. The application source contains no remote project upload service, analytics integration, or account sign-in.

The hosted app requests its scripts, sound samples, notation tools, and PDF tools from the same site. GitHub Pages and the browser may keep their own request logs or diagnostic data. Following an external link leaves OSM for the linked service.

## Microphone

OSM requests microphone access when a microphone feature is started. It uses the input to estimate pitch and timing. Stopping a microphone session releases its audio tracks. Leaving the page or hiding it also stops the microphone. OS and browser permission controls remain available.

Recorded note events may be added to a score. OSM does not retain a microphone audio recording as part of a saved song. User-selected audio files are decoded locally for transcription.

## Data kept by the app

Browser storage holds saved scores, recovery snapshots, tab drafts, page formatting, embedded layout images, sound/theme preferences, practice history, pitch statistics, and flashcard review state. Project backups contain the current song and its tab/page design. A song backup does not include the separate practice statistics or flashcard deck.

Data belongs to the browser profile and origin where it was created. A downloaded offline file and the hosted site may use different storage. Browser data clearing, private browsing, storage eviction, disk failure, or losing the profile can remove local work. Recovery snapshots share this storage and have the same limits.

Use **File → Export → Download project backup** for a portable copy. Keep a copy outside the browser before clearing site data or changing devices. Review projects, images, and author credits before sharing a backup publicly.

## Remove data

Use **File → Delete score** or the recent-score context menu to remove a saved song. Browser site-data controls can remove all data belonging to OSM, including practice progress and preferences. Download any work you want to keep first.

## Import limits

OSM checks file content and bounds processing before importing. Current limits are 20 MiB for project JSON, tab PDFs, and images, 10 MiB for MIDI, 1 MiB for MusicXML or pasted notation/tab text, and 50 MiB for WAV/MP3 recordings. Images are limited to 12 megapixels, PDFs to 30 pages, and audio transcription to three minutes. Split a long piece or crop an image to reduce its size.

Malformed MIDI events and XML internal entity declarations are rejected before they replace a score. Standard external MusicXML document-type declarations are removed without fetching their definitions. Image format signatures and decoded dimensions are checked. These limits bound browser memory and processing work, and do not replace a security review of the underlying parsers.

## Custom ocarina recordings

Custom Sound in Settings → Ocarina sound records microphone audio only while its recorder is active. Successful three-second takes are stored in IndexedDB on this browser and used for local playback. They are stored separately from project backups. The microphone stays on between takes and recording advances automatically after each successful save. Closing Settings, leaving the page, choosing Stop, or finishing all 21 notes stops the microphone. Named sound profiles and the current recording stay on this device. Save sound keeps a named version; deleting a saved sound removes that profile and its active draft. Clearing site data removes these recordings.
