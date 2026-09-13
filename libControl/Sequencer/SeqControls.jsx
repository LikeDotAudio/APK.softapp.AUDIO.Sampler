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

// A few one-click hues beside the picker. A colour well takes two taps and a
// system dialog on a phone, which is a lot of ceremony for "try it in blue".
const THEME_SWATCHES = [
    { hex: '#f4902c', name: 'Orange — the default' },
    { hex: '#4aa3ff', name: 'Blue' },
    { hex: '#3ecf8e', name: 'Green' },
    { hex: '#c77dff', name: 'Violet' },
    { hex: '#ff5c7a', name: 'Red' },
    { hex: '#e8e8e8', name: 'Bone' },
];

window.SeqControls = ({
    recording, toggleRecording,
    clickVol, setClickVol,
    isPlaying, togglePlayback,
    bpm, setBpm, swing = 50, setSwing, tapping, tapTempo,
    steps, setSteps, doubleTo,
    rendering, renderLoop,
    savePattern, clearPattern,
    configOpen, setConfigOpen
}) => {
    const SeqButton = window.SeqButton;
    const SeqKnob = window.SeqKnob;
    const STEP_OPTIONS = window.OA_STEP_OPTIONS;
    const [footerNode, setFooterNode] = React.useState(null);
    const [configBtnNode, setConfigBtnNode] = React.useState(null);
    const [showSwingGuide, setShowSwingGuide] = React.useState(false);
    // The grid size is a plain global, so read it back through the hook that
    // re-renders on a change rather than holding a second copy of it.
    const padLayout = window.useOaPadGrid() && window.OA_PAD_LAYOUT;
    const setPadLayout = (key) => window.oaSetPadLayout(key);
    // The transport and the ⚙ live in the app's FOOTER, which is a different
    // component's DOM — hence the lookup by id rather than a prop.
    //
    // A HOST WITHOUT A FOOTER IS NOT A HOST WITHOUT A TRANSPORT. APK:OS mounts
    // <Sequencer> on its own into a Midi window and renders no Footer at all,
    // so both slots came back null: the ⚙ rendered nowhere, and the drop-up it
    // is the only opener for stayed shut — taking Play, Rec, Tap, Save, the
    // tempo and the pattern length with it. Sequencer draws a bar of its own for
    // exactly this case; fall back to it, and the panel carries its own controls
    // wherever the footer is not.
    React.useEffect(() => {
        const slot = (id) => document.getElementById(id)
            || document.getElementById('seq-standalone-bar');
        setFooterNode(slot('seq-footer-slot'));
        setConfigBtnNode(slot('config-footer-slot'));
    }, []);

    // Seeded from the default rather than from storage, because there is no
    // storage — see the Theme block below. Tracked through the event rather
    // than only from this control's own onChange, so the well and the swatch
    // ring stay right no matter who moved the colour.
    const [accent, setAccent] = React.useState(window.OA_ACCENT_DEFAULT);
    React.useEffect(() => window.oaOnAccent((e) => setAccent(e.detail.accent)), []);

    // ---- Cached app files -------------------------------------------------
    // The service worker (sw.js) installs a FOUR-ENTRY shell — the page, the
    // manifest and the bundle — and folds every sample in as it is fetched, so
    // it warms up rather than arriving whole. The cost is that a stale shell
    // stays put, and the only way out used to be clearing the browser's
    // history, which is a blunt instrument that also signs the user out of
    // everything else. This button is the targeted version.
    //
    // It deletes CACHE STORAGE ONLY. Patterns, kits, samples and every mixer
    // setting live in localStorage and are deliberately left alone — this is a
    // "re-download the app" button, not a "throw my work away" button.
    const [cacheBusy, setCacheBusy] = React.useState(false);
    const [cacheMsg, setCacheMsg] = React.useState(null);
    const [cacheHeld, setCacheHeld] = React.useState(null);

    // What the browser is currently holding, so the button says something more
    // useful than "clear cache" — a number is what tells you it is worth doing.
    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if (!navigator.storage || !navigator.storage.estimate) return;
                const { usage } = await navigator.storage.estimate();
                if (alive && usage) setCacheHeld(usage);
            } catch (e) {}
        })();
        return () => { alive = false; };
    }, []);

    const mb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';

    const clearCache = async () => {
        const ok = window.confirm(
            'Clear the cached app files?\n\n'
            + 'The app re-downloads itself and reloads.\n\n'
            + 'Your patterns, kits, samples and mixer settings are stored separately '
            + 'and are NOT touched.'
        );
        if (!ok) return;
        setCacheBusy(true);
        setCacheMsg('Clearing…');
        try {
            let n = 0;
            if (window.caches) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
                n = keys.length;
            }
            // Unregister the worker too. Deleting its caches alone leaves the
            // old worker installed and it simply refills them on the next load,
            // which looks exactly like the button doing nothing.
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
            }
            setCacheMsg(`Cleared ${n} cache${n === 1 ? '' : 's'} — reloading…`);
            // A beat so the message is readable, then straight back to the
            // network: with no worker and no caches, an ordinary reload is a
            // cold start. (reload(true) is ignored by every current browser.)
            setTimeout(() => window.location.reload(), 500);
        } catch (e) {
            setCacheBusy(false);
            setCacheMsg('Could not clear: ' + ((e && e.message) || 'unknown error'));
        }
    };

    // Every footer button shares this footprint so the row reads as one set of controls.
    const FOOTER_BTN = window.OA_FOOTER_BTN;

    const playbackControls = (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <SeqButton
                label={recording ? '● Rec ●' : '● Rec'}
                onClick={toggleRecording}
                active={recording}
                color="#5a1f1f" activeColor="#d32f2f" textColor="#fff"
                title="Record: while playing, hit the Sampler pads to write them into the pattern at their velocity"
                style={Object.assign({}, FOOTER_BTN, { border: recording ? '1px solid #ff8a80' : '1px solid #722', boxShadow: recording ? '0 0 8px rgba(211,47,47,0.85)' : 'none' })}
            />
            <SeqButton
                label={isPlaying ? '■ Stop' : '► Play'}
                onClick={togglePlayback}
                color={isPlaying ? '#ffb300' : '#388e3c'} textColor="#fff"
                style={Object.assign({}, FOOTER_BTN, { border: 'none' })}
            />
            <SeqButton label="TAP" onClick={tapTempo} active={tapping} title="Tap to set tempo" style={Object.assign({}, FOOTER_BTN)} />
            <SeqButton
                label="⭳ Save Pattern"
                onClick={savePattern}
                color="#1565c0" textColor="#fff"
                style={Object.assign({}, FOOTER_BTN, { border: 'none' })}
            />
        </div>
    );

    // Picking something in the drop-up is a decision, so the panel closes once
    // it is made. Continuous controls (the tempo slider) deliberately do not.
    const chose = (fn) => (...args) => { fn(...args); setConfigOpen(false); };

    // Config lives alone at the far right of the footer.
    const configButton = (
        <SeqButton
            label={configOpen ? "✖ Close" : "⚙ Config"}
            onClick={() => setConfigOpen(!configOpen)}
            active={configOpen}
            color="#444" textColor="#fff"
            style={Object.assign({}, FOOTER_BTN, { border: '1px solid #666' })}
        />
    );

    const getSwingFeel = (pct) => {
        if (pct <= 51) return '50% (Straight Grid)';
        if (pct <= 64) return `${pct}% (Light / MPC Swing)`;
        if (pct <= 70) return `${pct}% (Perfect Triplet)`;
        return `${pct}% (Hard Shuffle)`;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '10px' }}>
            {footerNode
                ? ReactDOM.createPortal(playbackControls, footerNode)
                : playbackControls}
            {configBtnNode && ReactDOM.createPortal(configButton, configBtnNode)}

            {/* Tempo and Swing sit together at the top of the config panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#1c1e22', padding: '10px', borderRadius: '6px', border: '1px solid #333' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Tempo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
                        <span style={{ fontSize: '12px', color: '#aaa', fontWeight: 'bold' }}>Tempo</span>
                        <input
                            type="range" min={40} max={300} step={1} value={bpm}
                            onChange={(e) => setBpm(Number(e.target.value))}
                            title="Drag to set the tempo"
                            style={{ flex: 1, minWidth: '100px', accentColor: tapping ? '#fff' : 'var(--accent)', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: tapping ? '#fff' : 'var(--accent)', fontVariantNumeric: 'tabular-nums', minWidth: '56px', textAlign: 'right' }}>
                            {bpm} <span style={{ fontSize: '9px', color: '#888' }}>BPM</span>
                        </span>
                    </div>

                    <span style={{ width: '1px', height: '24px', background: '#444' }} />

                    {/* Swing percentage right next to tempo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
                        <span style={{ fontSize: '12px', color: '#aaa', fontWeight: 'bold' }}>Swing</span>
                        <input
                            type="range" min={50} max={75} step={1} value={swing}
                            onChange={(e) => setSwing && setSwing(Number(e.target.value))}
                            title="Adjust swing percentage (50% = Straight, 54-62% = MPC, 66% = Triplet, 75% = Hard)"
                            style={{ flex: 1, minWidth: '100px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', minWidth: '42px', textAlign: 'right' }}>
                            {swing}%
                        </span>
                        <button
                            onClick={() => setShowSwingGuide(!showSwingGuide)}
                            title="Toggle Swing Groove Guide"
                            style={{ background: showSwingGuide ? 'var(--accent)' : '#333', color: showSwingGuide ? '#000' : '#ccc', border: '1px solid #555', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}
                        >
                            ℹ Math
                        </button>
                    </div>
                </div>

                {/* Quick Swing Presets */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '2px' }}>
                    <span style={{ fontSize: '10px', color: '#888' }}>Presets:</span>
                    {[
                        { label: '50% Off', val: 50 },
                        { label: '58% MPC', val: 58 },
                        { label: '66% Triplet', val: 66 },
                        { label: '75% Hard', val: 75 },
                    ].map((p) => (
                        <button
                            key={p.val}
                            onClick={() => setSwing && setSwing(p.val)}
                            style={{
                                background: swing === p.val ? 'var(--accent)' : '#2a2a2a',
                                color: swing === p.val ? '#111' : '#ccc',
                                border: '1px solid #444',
                                borderRadius: '3px',
                                padding: '2px 6px',
                                fontSize: '10px',
                                fontWeight: swing === p.val ? 'bold' : 'normal',
                                cursor: 'pointer'
                            }}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Math Behind the Groove Guide */}
                {showSwingGuide && (
                    <div style={{ background: '#141518', padding: '10px', borderRadius: '4px', border: '1px solid #3a3d45', fontSize: '11px', color: '#ccc', marginTop: '4px' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--accent)', marginBottom: '6px' }}>
                            The Math Behind the Groove ({getSwingFeel(swing)})
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #444', color: '#888' }}>
                                    <th style={{ padding: '4px' }}>Swing %</th>
                                    <th style={{ padding: '4px' }}>Rhythmic Feel</th>
                                    <th style={{ padding: '4px' }}>Grid Offset Ratio</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style={{ background: swing === 50 ? 'rgba(244,144,44,0.15)' : 'transparent', borderBottom: '1px solid #282828' }}>
                                    <td style={{ padding: '4px', fontWeight: 'bold' }}>50%</td>
                                    <td style={{ padding: '4px' }}>Straight Grid</td>
                                    <td style={{ padding: '4px' }}>Equal length downbeat & upbeat (1:1)</td>
                                </tr>
                                <tr style={{ background: swing >= 54 && swing <= 62 ? 'rgba(244,144,44,0.15)' : 'transparent', borderBottom: '1px solid #282828' }}>
                                    <td style={{ padding: '4px', fontWeight: 'bold' }}>54-62%</td>
                                    <td style={{ padding: '4px' }}>Light / MPC Swing</td>
                                    <td style={{ padding: '4px' }}>Subtle upbeat delay (House & Hip-Hop bounce)</td>
                                </tr>
                                <tr style={{ background: swing === 66 ? 'rgba(244,144,44,0.15)' : 'transparent', borderBottom: '1px solid #282828' }}>
                                    <td style={{ padding: '4px', fontWeight: 'bold' }}>66%</td>
                                    <td style={{ padding: '4px' }}>Perfect Triplet</td>
                                    <td style={{ padding: '4px' }}>2/3 downbeat : 1/3 upbeat (Blues Shuffle)</td>
                                </tr>
                                <tr style={{ background: swing >= 75 ? 'rgba(244,144,44,0.15)' : 'transparent' }}>
                                    <td style={{ padding: '4px', fontWeight: 'bold' }}>75%</td>
                                    <td style={{ padding: '4px' }}>Hard Swing</td>
                                    <td style={{ padding: '4px' }}>3/4 downbeat : 1/4 upbeat (Dotted note timing)</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* How many pads the kit has. One choice resizes the pad grid, the
                mixer strips and the sequencer rows together — they are all one
                voice list. Growing appends voices; shrinking only hides the
                tail, so anything loaded onto pad 25 is still there if the grid
                comes back. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#aaa' }}>Pads</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {window.OA_PAD_LAYOUTS.map((l) => (
                        <SeqButton
                            key={l.key}
                            label={l.label}
                            onClick={() => setPadLayout(l.key)}
                            active={padLayout === l.key}
                            title={`${l.cols * l.rows} pads, mixer channels and sequencer tracks`}
                            style={{ padding: '5px 10px' }}
                        />
                    ))}
                </div>
            </div>

            {/* The theme colour. One CSS custom property on :root that every
                accent-coloured thing in the app is keyed to, so this repaints
                the pads, the mixer, the sequencer and the browser at once.

                Nothing about it is stored — not in localStorage, not over MQTT,
                not in the service worker's cache. Every load starts from the
                default below, which is the only reason a bad colour can never
                strand someone in a UI they cannot read. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#aaa' }}>Theme</span>
                <input
                    type="color"
                    value={accent}
                    onChange={(e) => window.oaSetAccent(e.target.value)}
                    title="Set the accent colour for this session"
                    style={{
                        width: '44px', height: '28px', padding: 0, cursor: 'pointer',
                        background: '#222', border: '1px solid #666', borderRadius: '4px',
                    }}
                />
                <div style={{ display: 'flex', gap: '4px' }}>
                    {THEME_SWATCHES.map((c) => (
                        <button
                            key={c.hex}
                            onClick={() => window.oaSetAccent(c.hex)}
                            title={c.name}
                            style={{
                                width: '20px', height: '20px', padding: 0, borderRadius: '50%',
                                background: c.hex, cursor: 'pointer',
                                border: accent.toLowerCase() === c.hex ? '2px solid #fff' : '1px solid #555',
                            }}
                        />
                    ))}
                </div>
                <SeqButton
                    label="↺ Default"
                    onClick={() => window.oaSetAccent(window.OA_ACCENT_DEFAULT)}
                    disabled={accent.toLowerCase() === window.OA_ACCENT_DEFAULT}
                    title={`Back to ${window.OA_ACCENT_DEFAULT} — rgb(244, 144, 44)`}
                    style={{ padding: '5px 10px' }}
                />
                <span style={{ fontSize: '10px', color: '#777' }}>
                    this session only — never saved, resets to orange on reload
                </span>
            </div>

            {/* Cached app files. Sits at the bottom of the drop-up because it
                reloads the page — it is the last thing you want to hit by
                accident while reaching for the tempo. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#aaa' }}>Storage</span>
                <SeqButton
                    label={cacheBusy ? '⟳ Clearing…' : '⟳ Clear Cache'}
                    onClick={clearCache}
                    disabled={cacheBusy}
                    title="Delete the app files this browser has cached and reload. Patterns, kits, samples and mixer settings are kept."
                    style={{ padding: '5px 10px' }}
                />
                <span style={{ fontSize: '10px', color: cacheMsg ? 'var(--accent)' : '#777' }}>
                    {cacheMsg
                        || (cacheHeld != null
                            ? `holding ${mb(cacheHeld)} — clears the app files only, your work is kept`
                            : 'clears the app files only, your work is kept')}
                </span>
            </div>

            {/* HOW LONG THE PATTERN IS.

                This lived in the Patterns section of SONG, next to Render and
                Clear, on the reasoning that they belong beside the patterns they
                act on. Render and Clear still do. The LENGTH does not: it is a
                property of the bars on screen right now, and SONG is a tab that
                can be shut — APK:OS opens this component with SEQ alone, so the
                one control that decides how wide the grid is was in a panel that
                window has no way to draw. Render and Clear stay where they are.
                Steps comes here, where the ⚙ reaches it from either host. */}
            {window.SeqStepsRow && (
                <window.SeqStepsRow
                    steps={steps}
                    setSteps={chose(setSteps)}
                    doubleTo={chose(doubleTo)}
                    clearPattern={clearPattern}
                />
            )}
        </div>
    );
};
