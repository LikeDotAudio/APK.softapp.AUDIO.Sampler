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

window.makeChipBuilder = () => {
    const map = new Map(); // lowerToken -> { display, count, folders:Set }
    return {
        add(name, sub) {
            const base = name.replace(/\.[^.]+$/, '');
            const parts = base.split(/[^A-Za-z0-9]+/).filter((t) => t.length >= 2 && !/^\d+$/.test(t));
            const seen = new Set();
            parts.forEach((p) => {
                const k = p.toLowerCase();
                if (seen.has(k)) return; seen.add(k);
                let e = map.get(k); if (!e) { e = { display: p, count: 0, folders: new Set() }; map.set(k, e); }
                e.count++; e.folders.add(sub || '');
            });
        },
        top() {
            return Array.from(map.values())
                .filter((e) => e.count >= 2)
                .sort((a, b) => (b.folders.size - a.folders.size) || (b.count - a.count))
                .slice(0, 28);
        },
    };
};
