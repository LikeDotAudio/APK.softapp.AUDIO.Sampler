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

// The page's accent colour, in one place.
//
// Everything visible is keyed to the CSS custom property --accent: inline
// styles say var(--accent) and inherit the change for free. The two things
// that cannot are <canvas>, which needs a real colour string to paint with,
// and <meta name="theme-color">, which the OS reads rather than the page.
// Both are handled here.
//
// Deliberately NOT persisted. The picker changes the running page and nothing
// else — no localStorage, no MQTT, nothing in the service worker's precache —
// so every load comes back at the default below and a stale theme can never
// outlive the session that chose it.

window.OA_ACCENT_DEFAULT = '#f4902c';        // rgb(244, 144, 44)

// The computed accent as a real colour string, for canvas work. Read on demand
// rather than cached: the value changes under us whenever the picker moves.
window.oaAccent = function () {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        return v || window.OA_ACCENT_DEFAULT;
    } catch (e) { return window.OA_ACCENT_DEFAULT; }
};

// A tint of the accent for canvas work, mixed here because a canvas cannot
// evaluate color-mix(). `amount` > 0 lightens toward white, < 0 darkens.
window.oaAccentMix = function (amount) {
    const hex = window.oaAccent();
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.replace(/^#/, '#'));
    if (!m) return hex;
    const to = amount >= 0 ? 255 : 0;
    const t = Math.min(1, Math.abs(amount));
    const ch = [1, 2, 3].map((i) => Math.round(parseInt(m[i], 16) * (1 - t) + to * t));
    return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
};

// The accent as rgba(), for canvas strokes that need to be translucent.
// `amount` lightens (>0) or darkens (<0) first, as oaAccentMix does.
window.oaAccentRgba = function (amount, alpha) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(window.oaAccentMix(amount || 0));
    if (!m) return `rgba(244,144,44,${alpha})`;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
};

/**
 * Set the accent for the running page. Anything drawn into a canvas was painted
 * with the old colour and will not repaint itself, so the change is announced —
 * the components that own a canvas listen for it and redraw.
 */
window.oaSetAccent = function (hex) {
    const v = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : window.OA_ACCENT_DEFAULT;
    document.documentElement.style.setProperty('--accent', v);
    // Kept in step by hand: rgba(var(--accent-rgb), α) is the only form that
    // works where the alpha is itself a calc(), as the pad glow's is.
    document.documentElement.style.setProperty(
        '--accent-rgb',
        [1, 3, 5].map((i) => parseInt(v.substr(i, 2), 16)).join(', '));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', v);
    window.dispatchEvent(new CustomEvent('oa-accent-changed', { detail: { accent: v } }));
    return v;
};

/**
 * Subscribe to accent changes. Returns the unsubscribe function, so a component
 * can hand it straight back out of useEffect.
 */
window.oaOnAccent = function (fn) {
    window.addEventListener('oa-accent-changed', fn);
    return () => window.removeEventListener('oa-accent-changed', fn);
};
