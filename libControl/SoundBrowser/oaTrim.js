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

/**
 * The chop: four marks, and the one set of rules they all obey.
 *
 * IN and OUT keep something between them; the fades live inside that region and
 * cannot overlap each other. Getting that wrong is not a cosmetic bug — an OUT
 * dragged past IN is a negative region, which is a BufferSource that plays
 * nothing and says nothing about why.
 *
 * It lives on its own because two places chop the same sound: the browser,
 * before it lands (useSoundBrowseAudio), and the SAMPLER panel on the mixer,
 * after it has (SamplerEditor). One copy of the rules, so a sound cannot be
 * trimmed one way in one place and another way in the other.
 */

const OA_TRIM_MIN = 0.005;      // the kept region always has something in it

/** Read the chop off a pad's sample entry, filling in what it does not carry. */
window.oaTrimOf = function (entry) {
    const dur = (entry && entry.buffer) ? entry.buffer.duration : 0;
    return {
        in: (entry && entry.offset) || 0,
        out: (entry && entry.end != null) ? entry.end : dur,
        fadeIn: (entry && entry.fadeIn) || 0,
        fadeOut: (entry && entry.fadeOut) || 0,
    };
};

/**
 * Move one mark and hand back the whole chop, corrected.
 *
 * `which` is 'in' | 'out' | 'fadeIn' | 'fadeOut'; `sec` is where in the file the
 * handle was dropped. A fade is dragged by its FAR end — the handle is where the
 * fade-in finishes or the fade-out begins — so its length is the gap to the mark
 * it belongs to.
 */
window.oaTrimMove = function (trim, which, sec, duration) {
    const t = {
        in: (trim && trim.in) || 0,
        out: (trim && trim.out != null) ? trim.out : duration,
        fadeIn: (trim && trim.fadeIn) || 0,
        fadeOut: (trim && trim.fadeOut) || 0,
    };
    if (!duration) return t;

    const v = Math.max(0, Math.min(duration, sec));
    if (which === 'in') t.in = Math.min(v, t.out - OA_TRIM_MIN);
    else if (which === 'out') t.out = Math.max(v, t.in + OA_TRIM_MIN);
    else if (which === 'fadeIn') t.fadeIn = Math.max(0, v - t.in);
    else if (which === 'fadeOut') t.fadeOut = Math.max(0, t.out - v);
    else return t;

    // The mark just moved wins the argument for room; the other one gives way.
    const span = Math.max(0, t.out - t.in);
    const first = which === 'fadeOut' ? 'fadeOut' : 'fadeIn';
    const second = first === 'fadeIn' ? 'fadeOut' : 'fadeIn';
    t[first] = Math.max(0, Math.min(t[first], span));
    t[second] = Math.max(0, Math.min(t[second], span - t[first]));
    return t;
};

/** True when the chop is anything other than "the whole file, no fades". */
window.oaTrimmed = function (trim, duration) {
    if (!trim || !duration) return false;
    return trim.in > 0 || trim.out < duration - 0.0005 || trim.fadeIn > 0 || trim.fadeOut > 0;
};
