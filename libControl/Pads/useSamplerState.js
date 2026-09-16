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
//
// WHAT THIS OWNS: pad-level sampler state -- tone root, per-pad velocities, the
// browse/assign modes, the MIDI base note -- and the two bus edges that carry a
// pad's sample assignment off this machine.
//
// WHY THE TOPIC IS `APK.audio/Gui/DrumKit/<pad>/sample` AND NOT `APK.audio/Gui/Display/…`
// The app's display.json declares `APK.audio/Gui/Display/Sampler`, which is the shell's
// grammar for a window. This is not that: it is a per-pad assignment, and the
// grammar is DELIBERATE because two things outside this application already
// speak it and neither is ours to rename from here --
//   · APK:OS/DataBus/reading/read-bus-event.js  files `Gui/DrumKit/{n}/sample`
//     as a measurement, so the shell's bus reader would stop classifying it.
//   · APK:PODS/APK:BareMetal/backend/Core/orchestrator/src/services/spog_bridge.rs maps
//     console strips onto `APK.audio/Gui/DrumKit/<pad>/eq/<key>` on the same
//     prefix, so the EQ half would part company with the sample half.
// Migrating is a three-tree change with retained state on the old prefix, not a
// rename. The manifest's `topic` names the WINDOW; this names the PADS.

window.useSamplerState = (setSampleNames) => {
    const [toneRoot, setToneRoot] = React.useState(null);
    const toneRootRef = React.useRef(toneRoot); toneRootRef.current = toneRoot;
    
    const [velocities, setVelocities] = React.useState(Array(window.OA_PAD_MAX).fill(0));
    const [browsePad, setBrowsePad] = React.useState(null);
    const [pendingAssign, setPendingAssign] = React.useState(null); // { file, meta }
    const [showPadBrowse, setShowPadBrowse] = React.useState(false);
    
    const [midiBase, setMidiBase] = React.useState(36);
    const midiBaseRef = React.useRef(36); midiBaseRef.current = midiBase;
    React.useEffect(() => { window.OA_MIDI_BASE = midiBase; }, [midiBase]);
    
    const mqttMessages = window.useMqttMessages ? window.useMqttMessages() : {};
    const kitMeta = React.useMemo(() => {
        const m = {};
        for (let i = 0; i < window.OA_PAD_COUNT; i++) {
            const raw = mqttMessages[`APK.audio/Gui/DrumKit/${i}/sample`];
            if (raw) { try { const o = JSON.parse(raw); if (o && o.name) m[i] = o; } catch (e) {} }
        }
        return m;
    }, [mqttMessages]);
    
    const [restoreMsg, setRestoreMsg] = React.useState('');
    const missingCount = Object.keys(kitMeta).filter((i) => !(window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[i])).length;
    
    const restoreSounds = async () => {
        if (!window.oaRestoreKit) return;
        setRestoreMsg('restoring…');
        const res = await window.oaRestoreKit(kitMeta);
        if (res.ok) {
            setRestoreMsg(`restored ${res.restored}`);
            setSampleNames((prev) => { const n = [...prev]; for (let i = 0; i < window.OA_PAD_COUNT; i++) { const e = window.OA_DRUM_SAMPLES[i]; if (e) n[i] = e.name || '(loaded)'; } return n; });
        } else setRestoreMsg(res.reason === 'no-folder' ? 'pick a folder first' : 'permission denied');
        setTimeout(() => setRestoreMsg(''), 2500);
    };
    
    const mqttPublish = window.useMqttPublish ? window.useMqttPublish() : null;
    const publishSample = (idx, name, folder) => {
        if (mqttPublish) mqttPublish(`APK.audio/Gui/DrumKit/${idx}/sample`, { name, folder: folder || '' });
    };

    const handleFile = async (index, file, meta) => {
        if (!file) return;
        try {
            // Decode and chop happen in oaLoadSampleToPad, which every loader in
            // the app shares; what is left here is the Sampler's own bookkeeping.
            await window.oaLoadSampleToPad(index, file, meta);
            setSampleNames((prev) => { const n = [...prev]; n[index] = file.name; return n; });
            publishSample(index, file.name, meta && meta.folder);
        } catch (e) {
            console.error('🛑 [Sampler] Could not decode audio:', e);
        }
    };

    return {
        toneRoot, setToneRoot, toneRootRef, velocities, setVelocities, browsePad, setBrowsePad,
        pendingAssign, setPendingAssign, showPadBrowse, setShowPadBrowse, midiBase, setMidiBase, midiBaseRef,
        kitMeta, restoreMsg, missingCount, restoreSounds, handleFile, publishSample
    };
};
