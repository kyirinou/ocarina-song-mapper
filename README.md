# Ocarina Song Mapper

Avilable on Windows, MacOS, Linux, and Android/IOS

Ocarina Song Mapper is a browser-based tool for learning, transcribing, editing, and sharing songs for a 12-hole Alto C ocarina. Play a melody into your microphone, build a score by hand, or import one you already have. Keep in mind that this app is still in development and there may be bugs. Please click Issues → New issue to report anything that may disrupt the user experience!

## Features!! (Including but not limited to)

- **Convert ocarina sound into a score**
  Play a melody one note at a time into your microphone. Review the detected pitches, then add them to the editor with their captured timing. Leave a short break between repeated pitches and correct any misheard notes in the editor.

- **Play Along with your ocarina.**
  Follow the fingering cards at your own pace. A blue outline marks the next fingering and the card turns green when you play the matching pitch.

- **Tune your ocarina.** Play a steady note to see its pitch, frequency, how sharp or flat it is, and the matching fingering when it falls within the instrument’s range.

- **Upload your own ocarina fingering tabs.** Add a clear PNG or an OSM fingering PDF. OSM matches the open and filled holes in PNG diagrams and reads numbered pitch labels in PDFs. Open the detected notes as an editable score or play them in **Practice**. Imported notes start at one beat each.

- **Play back and record rhythm**
Press Enter to step through a score, or use **Play all** to hear the full rhythm while the notation highlights in sync. Change the playback speed or loop a song. Record the intervals between Enter taps and apply either the exact timing or the edited notation durations.

- **Export music and fingering tabs**
Download the engraved music score as PDF or editable ABC. Customize the tab title, credit, spacing, and line breaks. Export a fingering PDF with the written rhythm under each diagram, or copy tab codes into [Ocarina Tabs Creator](https://panzi.github.io/ocarina_tabs/).

- **Explore the instrument.**
The **Playable notes** page has all 21 pitches from A4 to F6 with keyboard shortcuts and fingering diagrams. **Help** includes a guided visual tutorial.

## Get started

1. Open the published app, or open `index.html` in your browser.
2. Choose **Make new score**, **Import**, or **View existing scores**.
3. Give your score a title and optional source or author credit, then select **Save score**.

For the tuner, Play Along, and Convert sound, open the app over HTTPS and allow microphone access when prompted. The app processes microphone input in the browser.

Saved scores live in the browser profile and site where you created them. To move a score or keep a backup, choose **Export → Project backup**. Restore it through **Import → Import project backup**.

## Credits and license

Original app by **kiri**. You may use, modify, and share the app for free. If you share a modified version, include a visible credit such as “This is a modified version of Ocarina Song Mapper by kiri.” See [LICENSE](LICENSE) for the terms.

Ocarina Song Mapper is an independent project and is not affiliated with, sponsored by, or endorsed by Ocarina Tabs Creator. The copy-and-paste export uses a format its editor accepts.

The ocarina fingering diagrams are drawn from [Open 12 Hole Ocarina 1](https://github.com/panzi/ocarina_tabs), copyright © 2016 Mathias Panzenböck, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/). The same font supplies the fingering outlines in the app and its PDF exports. The bundled font includes its copyright and license notice.

The bundled abcjs, jsPDF, and svg2pdf.js libraries retain their own licenses and notices.

## Artifical Intelligence Disclaimer

All ideas and the overall code structure were developed by kiri. GPT‑6.1 Sol assisted with debugging, implementing new features, and revising the otherwise existing code.

## Source and builds

Edit the `source-*.js` feature files and run `python3 build.py` to rebuild the browser entry point. Serve this directory with a static file server to preview the hosted app. Run `python3 build-offline.py` after building to regenerate `osm-offline.html`. Open that file directly for offline use.

The hosted app loads notation, PDF tools, and sound samples on demand. Keep the files alongside `index.html` when deploying.
