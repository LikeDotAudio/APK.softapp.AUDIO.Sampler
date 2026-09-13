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

window.gatherMatching = async (handle, prefix, out, term, depth) => {
    const DEEP_MAX = 20000;
    if (depth > 12 || out.length >= DEEP_MAX) return;
    const subdirs = [];
    for await (const [n, h] of handle.entries()) {
        if (out.length >= DEEP_MAX) break;
        if (h.kind === 'directory') subdirs.push([n, h]);
        else if (window.oaIsFindableAudio(n) && n.toLowerCase().includes(term)) out.push({ name: n, handle: h, sub: prefix });
    }
    for (const [n, h] of subdirs) { if (out.length >= DEEP_MAX) break; await window.gatherMatching(h, prefix ? `${prefix}/${n}` : n, out, term, depth + 1); }
};
