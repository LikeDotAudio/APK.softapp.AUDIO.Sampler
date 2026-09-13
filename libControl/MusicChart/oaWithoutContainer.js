// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE CONTAINER, AND ONLY THE CONTAINER.
 *
 * Every surface of this app that has to answer a question about a file's
 * container extension asks it here. There are three such questions, they are
 * genuinely different questions, and the whole point of this file is that the
 * ANSWERS ARE ORDERED rather than independent.
 *
 * ── The three questions ──────────────────────────────────────────────────────
 *
 *   NAMEABLE   `OA_AUDIO_CONTAINER` — "if this suffix is on the end of a
 *              sound's name, is it a container extension rather than part of
 *              the name?" A pure string question. Nothing is decoded, and the
 *              sound may have arrived by ANY route: a folder walk, a drop, a
 *              recording, a .PEAK sidecar, a URL.
 *
 *   FINDABLE   `OA_AUDIO_FINDABLE` / `oaIsFindableAudio(name)` — "walking a
 *              directory, is this entry a file we would try to decode?" Also a
 *              name-only question, because a FileSystemDirectoryHandle entry is
 *              a name and nothing else — there is no MIME type to consult.
 *
 *   DROPPABLE  `oaIsDroppableAudio(file)` — "this File was handed to us by a
 *              human; do we take it?" The ONE question with a real File behind
 *              it, so it asks the OS first (`type` starts with `audio/`) and
 *              falls back to the name. The MIME branch is why this is a
 *              predicate and not a regex; the extension branch is what catches
 *              everything an OS labels `video/*` or hands over with no type.
 *
 * ── THE LAW: droppable ≡ findable ⊆ nameable ─────────────────────────────────
 *
 * These were three hand-maintained lists in seven copies, and no two of the
 * three agreed (PLAN-705.01). The disagreements were not stylistic:
 *
 *   · `.mov` was findable and droppable and NOT nameable, so a dropped movie
 *     kept its extension in every name it was given and the exporter wrote
 *     `Take 3.mov.PEAK`.
 *   · `.opus`, `.oga` and `.wave` were findable and NOT droppable, so a file
 *     the browser listed was refused by the pad it was dragged onto.
 *   · `.aifc` was nameable and NOT findable, while `oaDecodeAudio` in
 *     oaDrumkitAudio.js carries a hand-written AIFC parser precisely because
 *     Chromium has none — the app could decode a format it could not find.
 *
 * So the vocabulary collapses from three lists to TWO, held to an order:
 *
 *   findable is the set we will ATTEMPT TO DECODE. Droppable is the same set,
 *   reached through a predicate that consults the OS first. There is no reason
 *   for a hand-delivered file to be judged more harshly than a walked one.
 *
 *   nameable is a STRICT SUPERSET of findable, and it must be, because a name
 *   can arrive without the file: `w64`, `caf` and `wma` are containers nothing
 *   here decodes — not Chromium, not our AIFF parser — so nothing should walk
 *   to them; but a sound that reaches a pad already CALLED `Kick.w64` still has
 *   to lose that suffix when it is named.
 *
 * Anything findable and not nameable is the `Take 3.mov.PEAK` bug by
 * construction. test/containers.test.mjs asserts the containment both ways and
 * asserts that no fifth copy of either list has appeared in libControl/.
 *
 * ── Why an explicit list at all ──────────────────────────────────────────────
 *
 * The expression this replaces was `name.replace(/\.[^/.]+$/, "")`, which reads
 * as "drop the extension" and means "drop everything after the last dot". A
 * sound legitimately called `Kick 90.5 Loop` came back as `Kick 90` — on a
 * download name (PLAN-573.01) and on all sixteen pads (PLAN-602.01).
 *
 * So the list is explicit, and a dot the list does not recognise is part of the
 * name. That is the safe way round: an unstripped extension is visible — in the
 * downloads folder, on the pad tooltip — and a truncated name is silently a
 * different sound.
 *
 * IT LIVES IN ITS OWN FILE BECAUSE TWO COPIES DRIFT. `LensesView.jsx` held the
 * only copy and `oaDeepScanner.js` held the old regex, which is exactly how one
 * fix left one live site behind. Consumers take these from `window` AT CALL
 * TIME — never into a module-level `const` — because this file sits below the
 * SoundBrowser and Pad entries in sources.json, so a top-level read would bind
 * `undefined`. That is also why findable is exposed as `oaIsFindableAudio` and
 * not only as the bare regex.
 *
 * NEITHER REGEX IS GLOBAL, on purpose. A `/g` regex carries `lastIndex` between
 * `.test()` calls, and these single instances are shared by every caller in the
 * bundle; a `/g` here would make every second call on the same name lie.
 *
 * NOT EVERY NAME IS A FILE NAME. The `[ti:]` tag of an exported .lrc titles the
 * source file and keeps its extension on purpose — that is a caller's decision,
 * which is why this is a helper and not a filter applied to everything.
 */

// What we will attempt to decode. The video containers are here because the
// browser pulls the audio track out of them, which is the app's cheapest route
// from a screen recording to a pad.
window.OA_AUDIO_FINDABLE = /\.(wav|wave|aif|aiff|aifc|flac|mp3|m4a|aac|ogg|oga|opus|webm|mp4|m4v|mov|mkv|avi|3gp|flv)$/i;

// Everything above, plus the three containers we can name but not open.
window.OA_AUDIO_CONTAINER = /\.(wav|wave|w64|aif|aiff|aifc|caf|flac|mp3|m4a|aac|wma|ogg|oga|opus|webm|mp4|m4v|mov|mkv|avi|3gp|flv)$/i;

window.oaIsFindableAudio = (name) =>
    window.OA_AUDIO_FINDABLE.test(String(name == null ? '' : name));

// The OS first, the name second. A File the platform already calls `audio/*`
// is taken whatever it is named — that branch is the one that accepts a format
// this list has never heard of, and it is why droppable is a function.
window.oaIsDroppableAudio = (file) =>
    !!file && (String(file.type || '').startsWith('audio/') || window.oaIsFindableAudio(file.name));

window.oaWithoutContainer = (name) =>
    String(name == null ? '' : name).replace(window.OA_AUDIO_CONTAINER, '');
