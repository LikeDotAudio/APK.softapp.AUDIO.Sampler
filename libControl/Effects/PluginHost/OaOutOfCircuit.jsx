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
 * Header: OaOutOfCircuit.jsx
 * Purpose: The badge every effect panel wears while the rack is bypassed.
 * Description: Arming RECORD takes every effect out of the signal path (see
 *   OA_FX_BYPASS in ../FxBus/oaFxBus.js). The panels grey themselves out, which
 *   says "you cannot touch this" — this says WHY, and it has to, because a
 *   greyed panel with no explanation is indistinguishable from a broken one.
 *
 *   It lives here rather than in each faceplate for the reason the hooks do:
 *   six copies of one sentence is six chances for five of them to go stale, and
 *   the sentence is the part that has to be identical everywhere. The panels
 *   keep their own LOOK; what they must not each invent is the WORDING of a
 *   state they all share.
 *
 *   Paired with `window.useOaFxBypass()` and `window.oaBypassVeil()` in
 *   useOaPlugin.js — the hook that reports the state and the style that shows it.
 */

window.OaOutOfCircuit = ({ compact }) => (
    <span
        title="RECORD is armed, so the whole effects rack is out of the signal path — nothing here is processing. Disarm record to put it back."
        style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: compact ? '2px 6px' : '3px 9px',
            borderRadius: '10px', whiteSpace: 'nowrap',
            background: 'rgba(183,28,28,0.9)', border: '1px solid #ff8a80',
            fontSize: compact ? '8px' : '9px', fontWeight: '700',
            letterSpacing: '1px', color: '#fff',
        }}
    >
        <i style={{
            width: '6px', height: '6px', borderRadius: '50%', background: '#ff8a80',
            display: 'inline-block', flex: '0 0 auto',
        }}></i>
        {compact ? 'OUT OF CIRCUIT' : 'RECORD ARMED — OUT OF CIRCUIT'}
    </span>
);
