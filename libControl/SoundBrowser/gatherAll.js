// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// Every visual representation in this project is an HOMAGE to classic hardware.
// There is no affiliation with, or endorsement by, any of the original designers
// or manufacturers; their layouts appear here only because they are familiar
// interfaces, and every name they are known by remains the property of its owner.
// ─────────────────────────────────────────────────────────────────────────────

window.gatherAll = async (handle, prefix, files, names, builder, onEmit, depth) => {
    const MAX_FILES = 4000;
    const NAME_MAX = 60000;
    if (depth > 12 || names.length >= NAME_MAX) return;
    const subdirs = [];
    for await (const [n, h] of handle.entries()) {
        if (names.length >= NAME_MAX) break;
        if (h.kind === 'directory') subdirs.push([n, h]);
        else if (window.oaIsFindableAudio(n)) {
            names.push({ name: n, sub: prefix });
            builder.add(n, prefix);
            if (files.length < MAX_FILES) files.push({ name: n, handle: h, sub: prefix });
            if (names.length % 250 === 0) onEmit();   // grow the chip list live
        }
    }
    for (const [n, h] of subdirs) { if (names.length >= NAME_MAX) break; await window.gatherAll(h, prefix ? `${prefix}/${n}` : n, files, names, builder, onEmit, depth + 1); }
};
