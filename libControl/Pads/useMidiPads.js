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

// ---------------------------------------------------------------------------
// Reading a spring-loaded wheel as a LATCHING control.
//
// A pitch wheel is sprung: let go and it flies home to centre. Taken at face
// value that means the bend only exists while a hand is on the wheel, and the
// note snaps back the instant it is released — which is right for an organ and
// wrong for a sampler, where the wheel is how a pad gets tuned by ear and then
// PLAYED at that tuning.
//
// So the return trip is thrown away. A hand cannot move the wheel anywhere near
// as fast as the spring does, so a run toward centre faster than SPRING_SPEED
// is the spring, not the player: those messages are ignored outright, which
// leaves the pitch exactly where it was released. Reaching centre after such a
// run confirms it and changes nothing.
//
// The way back to no bend, then, is to walk the wheel home BY HAND — slowly
// enough that every message is applied on the way, ending at centre with no
// spring run behind it, which zeroes. (The on-screen wheel's ⟲ does it too.)
// ---------------------------------------------------------------------------
const BEND_CENTRE = 8192;      // 14-bit centre
const BEND_DEAD = 200;         // ±this counts as "at centre" (wheels rest imprecisely)
const SPRING_SPEED = 12;       // units per ms toward centre that no hand achieves

window.useMidiPads = (midiBase, toneRootRef, padButtons, triggerPadAt, setVelocities) => {
    const [midiStatus, setMidiStatus] = React.useState('');
    const [midiNote, setMidiNote] = React.useState(null);
    const triggerRef = React.useRef(triggerPadAt); triggerRef.current = triggerPadAt;
    // Where the wheel was last seen, when, and whether the spring has since
    // taken it home (in which case centre must NOT clear the bend).
    const bendRef = React.useRef({ raw: 0, t: 0, sprang: false });

    // Restart the velocity glow on a pad element (bright → fades over sound length).
    const startGlow = (el, idx, i) => {
        if (!el) return;
        const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[idx];
        const durMs = (entry && entry.buffer) ? Math.max(120, Math.min(entry.buffer.duration * 1000, 5000)) : 180;
        el.style.setProperty('--gi', i);
        el.style.animation = 'none';
        void el.offsetWidth;            // reflow → restart on rapid hits
        el.style.animation = `oaPadGlow ${durMs}ms ease-out`;
    };

    React.useEffect(() => {
        if (!navigator.requestMIDIAccess) { setMidiStatus('Web MIDI not supported (use Chrome/Edge)'); return; }
        let access = null;
        const onMsg = (e) => {
            if (window.OA_MIDI_CAPTURED) return;   // Pad Browser (or other modal) owns MIDI right now
            const status = e.data[0], note = e.data[1], vel = e.data[2];
            if ((status & 0xf0) === 0xe0) {                   // pitch-bend wheel → retune sounding voices
                const raw = ((e.data[2] << 7) | e.data[1]) - BEND_CENTRE;   // 14-bit, centred at 0
                const st = bendRef.current;
                const now = (window.performance && performance.now()) ? performance.now() : Date.now();
                const dt = Math.max(1, now - st.t);
                const speed = Math.abs(raw - st.raw) / dt;
                const homing = Math.abs(raw) < Math.abs(st.raw);
                st.t = now; st.raw = raw;

                if (homing && speed > SPRING_SPEED) { st.sprang = true; return; }  // the spring, not the player
                if (Math.abs(raw) <= BEND_DEAD) {
                    // At centre. Cleared only if the wheel was WALKED here.
                    if (!st.sprang && window.oaSetPitchBend) window.oaSetPitchBend(0);
                    return;
                }
                st.sprang = false;
                if (window.oaSetPitchBend) window.oaSetPitchBend((raw / BEND_CENTRE) * (window.OA_BEND_RANGE || 200));
                return;
            }
            if ((status & 0xf0) === 0x90 && vel > 0) {        // note-on
                setMidiNote(note);
                const idx = note - midiBase;
                const velocity = Math.max(1, Math.round(vel / 127 * 100));
                
                // A note played from the keyboard points the wheel at the pad it
                // sounds, the same as striking that pad by hand does — so the
                // bar below the pads reads that pad's tuning before the note
                // starts, and the wheel tunes what is being played.
                const bendPad = toneRootRef.current !== null ? toneRootRef.current
                    : ((idx >= 0 && idx < window.OA_PAD_COUNT) ? idx : null);
                if (bendPad != null && window.oaFocusBendPad) window.oaFocusBendPad(bendPad);

                if (toneRootRef.current !== null) {
                    // In Tone Mode, map ANY note to a pitch relative to midiBase or sampleRoot
                    const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[toneRootRef.current];
                    let semitones = idx; // idx is (note - midiBase)
                    if (entry && entry.sampleRoot != null) {
                        semitones = note - entry.sampleRoot;
                    }
                    if (window.oaTriggerTone) window.oaTriggerTone(toneRootRef.current, semitones, velocity / 100);
                    window.dispatchEvent(new CustomEvent('oa-tone-hit', { detail: { rootIdx: toneRootRef.current, semitones, velocity } }));
                    
                    // Flash the pad if it falls within the 16 visual pads
                    if (idx >= 0 && idx < 16) {
                        setVelocities((prev) => { const n = [...prev]; n[idx] = velocity; return n; });
                        const el = padButtons.current[idx];
                        if (el) {
                            el.style.transform = 'scale(0.95)';
                            el.style.filter = `brightness(1.4)`;
                            startGlow(el, idx, velocity / 100);
                            setTimeout(() => { if (el) { el.style.transform = 'scale(1)'; el.style.filter = 'none'; } }, 90);
                        }
                    }
                } else {
                    if (idx >= 0 && idx < 16) triggerRef.current(idx, velocity);
                }
            }
        };
        const attach = (a) => { const names = []; a.inputs.forEach((inp) => { inp.onmidimessage = onMsg; names.push(inp.name); }); setMidiStatus(names.length ? names.join(', ') : 'No MIDI inputs'); };
        navigator.requestMIDIAccess().then((a) => { access = a; attach(a); a.onstatechange = () => attach(a); }).catch(() => setMidiStatus('MIDI access denied'));
        return () => { if (access) access.inputs.forEach((inp) => { inp.onmidimessage = null; }); };
    }, [midiBase, toneRootRef, setVelocities]);

    return { midiStatus, midiNote };
};
