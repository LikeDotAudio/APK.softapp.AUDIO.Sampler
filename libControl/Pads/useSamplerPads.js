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

// THE INDEX INVARIANT, and it is load-bearing across three modules:
//
//     pad index (0-15) === Sequencer track index === key into OA_DRUM_SAMPLES
//
// Sequencer.jsx reads window.OA_DRUM_KIT as its TRACKS, TrackSampleMenu.jsx
// edits OA_DRUM_SAMPLES[trkIdx] directly, and the pads here index the same
// array. There is no translation layer anywhere: a pad and a track are the same
// slot, which is what makes a sample loaded on a pad play on its track. Reorder
// or filter the kit in one place and the other two silently address the wrong
// voice. Harvested from the retired export's SamplerDrumkit.js, which was the
// only file that ever wrote this down (PLAN-126.01).

window.useSamplerPads = (
    centerVelocity, edgeVelocity, onHit, toneRoot, midiBaseRef, 
    setVelocities, setToneRoot, padButtons
) => {
    const computeVelocity = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = (Math.min(rect.width, rect.height) / 2) || 1;
        const d = Math.min(dist / radius, 1);
        const v = centerVelocity + (edgeVelocity - centerVelocity) * d;
        return Math.round(Math.max(0, Math.min(100, v)));
    };

    const emitHit = (idx, velocity) => {
        window.dispatchEvent(new CustomEvent('oa-drum-hit', { detail: { idx, velocity } }));
    };

    const hitPad = (e, idx, explicitPadNum = null) => {
        const velocity = computeVelocity(e);
        setVelocities((prev) => { const n = [...prev]; n[idx] = velocity; return n; });
        // The wheel under the pads follows the hand: the sounding pad's own
        // tuning jumps into it, and moving it from here tunes that pad. Before
        // the trigger, so the voice starts at the pitch the wheel is showing.
        // In Tone Mode every pad is the root pad's voice, so that is the pad
        // being tuned however many keys are involved in playing it.
        if (window.oaFocusBendPad) window.oaFocusBendPad(toneRoot !== null ? toneRoot : idx);

        if (toneRoot !== null && explicitPadNum !== null) {
            const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[toneRoot];
            let semitones = explicitPadNum - 1;
            if (entry && entry.sampleRoot != null) {
                semitones = (window.OA_MIDI_BASE + explicitPadNum - 1) - entry.sampleRoot;
            }
            if (window.oaTriggerTone) window.oaTriggerTone(toneRoot, semitones, velocity / 100);
            window.dispatchEvent(new CustomEvent('oa-tone-hit', { detail: { rootIdx: toneRoot, semitones, velocity } }));
        } else {
            if (window.oaTriggerDrum) window.oaTriggerDrum(idx, velocity / 100);
            if (typeof onHit === 'function') onHit(idx + 1, velocity);
            emitHit(idx, velocity);
        }
        
        return velocity;
    };

    const startGlow = (el, idx, i) => {
        if (!el) return;
        const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[idx];
        const durMs = (entry && entry.buffer) ? Math.max(120, Math.min(entry.buffer.duration * 1000, 5000)) : 180;
        el.style.setProperty('--gi', i);
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = `oaPadGlow ${durMs}ms ease-out`;
    };

    const triggerPadAt = (idx, velocity) => {
        const v = Math.max(1, Math.min(100, Math.round(velocity == null ? 100 : velocity)));
        setVelocities((prev) => { const n = [...prev]; n[idx] = v; return n; });
        if (window.oaFocusBendPad) window.oaFocusBendPad(idx);
        if (window.oaTriggerDrum) window.oaTriggerDrum(idx, v / 100);
        if (typeof onHit === 'function') onHit(idx + 1, v);
        emitHit(idx, v);
        const el = padButtons.current[idx];
        if (el) {
            el.style.transform = 'scale(0.95)';
            el.style.filter = `brightness(${0.9 + 0.5 * (v / 100)})`;
            startGlow(el, idx, v / 100);
            setTimeout(() => { if (el) { el.style.transform = 'scale(1)'; el.style.filter = 'none'; } }, 90);
        }
    };

    const triggerPadKey = (idx, explicitPadNum = null, velocity = 100) => {
        if (toneRoot !== null && explicitPadNum !== null) {
            const v = velocity;
            const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[toneRoot];
            let semitones = explicitPadNum - 1;
            if (entry && entry.sampleRoot != null) {
                semitones = (midiBaseRef.current + explicitPadNum - 1) - entry.sampleRoot;
            }
            setVelocities((prev) => { const n = [...prev]; n[idx] = v; return n; });
            if (window.oaFocusBendPad) window.oaFocusBendPad(toneRoot);
            if (window.oaTriggerTone) window.oaTriggerTone(toneRoot, semitones, v / 100);
            window.dispatchEvent(new CustomEvent('oa-tone-hit', { detail: { rootIdx: toneRoot, semitones, velocity: v } }));
            const el = padButtons.current[idx];
            if (el) {
                el.style.transform = 'scale(0.95)';
                el.style.filter = `brightness(1.4)`;
                startGlow(el, idx, v / 100);
                setTimeout(() => { if (el) { el.style.transform = 'scale(1)'; el.style.filter = 'none'; } }, 90);
            }
        } else {
            triggerPadAt(idx, velocity);
        }
    };

    return { hitPad, startGlow, triggerPadAt, triggerPadKey };
};
