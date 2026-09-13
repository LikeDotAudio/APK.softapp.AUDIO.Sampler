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
 * Header: OaConsoleSurface.jsx
 * Purpose: The console surface, built once from a plugin's ParamSpec[] instead
 *   of hand-written per mixer. PLAN-18.01, step 5.
 * Description: The 2026-08-27 audio control sweep found FIVE MIXERS IN FOUR
 *   LANGUAGES and 8,419 lines of hand-written control widget with no
 *   declarative frame behind any of it. PLAN-18.01 wrote the join —
 *   oaPluginParamSpecs(id, idx), which projects any registered plugin's params
 *   onto SPOG's ParamSpec — and then stopped, because a function nobody calls
 *   has not made anything generic. This is the caller.
 *
 *   WHAT COMES FROM WHERE, AND WHY IT IS TWO SOURCES.
 *
 *     THE ADAPTER (oaPluginParamSpecs) SAYS WHAT EXISTS. Which controls this
 *     unit has, whether each is a magnitude or a choice, its bounds, its unit,
 *     and — the one that matters — WHETHER IT MAY BE WRITTEN. That is the
 *     contract a remote console would be handed over the bus, so it is the
 *     contract the local surface is built from too. If the two disagreed, the
 *     desk in the room and the desk on the network would be different desks.
 *
 *     THE PLUGIN'S OWN SCHEMA SAYS HOW IT IS ENGRAVED. `label`, `fmt`, `ticks`
 *     and `def` are faceplate concerns — how a number is printed, where the
 *     legend marks fall, what alt-click goes back to. They are deliberately NOT
 *     on the ParamSpec, because a bus does not need to know that the buss
 *     compressor's attack knob has five labels across ten positions. Putting
 *     them on the wire would make the bus contract an authority on the
 *     faceplate, which is the coupling oaPlugin.js exists to prevent.
 *
 *   So the surface joins the two: the adapter decides what controls to draw,
 *   the schema decides what they look like. A panel asks for a key and gets one
 *   descriptor with both halves already reconciled — which is what deletes the
 *   per-mixer `params.find(p => p.key === k)` plumbing that every editor in
 *   this tree had written out for itself.
 *
 *   THE BIT THAT IS NOT A REFACTOR. `writable` is honoured. A descriptor whose
 *   spec is not writable comes back with `writable: false` and a `set` that
 *   does nothing, and the default renderer draws it as a READOUT rather than a
 *   knob. The buss compressor's `mix` is exactly this case: it is still in the
 *   schema so older saved units and presets load, and bussSettings() no longer
 *   reads it. Every hand-written surface in this tree would happily draw it as
 *   a working knob — a control that turns, reports success, and is heard by
 *   nothing, which is this repository's own first law being broken in the one
 *   place a mixing engineer would never think to check.
 */

/**
 * One plugin unit's controls, reconciled. Returns:
 *
 *   list   every control in schema order, as descriptors
 *   by     the same descriptors, keyed — `by.attack` rather than a find()
 *   specs  the raw ParamSpec[] the adapter produced, for anything that wants it
 *
 * A descriptor is everything a control needs and nothing it does not:
 *
 *   key type min max values unit writable    from the ParamSpec
 *   label def ticks fmt step                 from the plugin's own schema
 *   value display pct                        the live reading
 *   set(v)                                   a no-op when not writable
 */
window.useOaConsoleSurface = function (id, idx) {
    const unit = window.useOaState(id, idx);
    const params = window.useOaParams(id, idx);

    // Re-projected whenever the schema changes, which for the drum synth is
    // whenever the pad's engine changes — its knobs are not fixed.
    const specs = React.useMemo(
        () => window.oaPluginParamSpecs(id, idx),
        [id, idx, params],
    );

    return React.useMemo(() => {
        const list = specs.map((spec) => {
            const p = params.find((q) => q.key === spec.name) || {};
            const raw = unit ? unit[spec.name] : p.def;
            const fmt = typeof p.fmt === 'function' ? p.fmt : String;

            // A DISCRETE PARAMETER WHOSE CHOICES ARE NAMES, NOT POSITIONS.
            //
            // Every enum in this tree stores an index except the drum synth,
            // which stores `'sine'` in the patch because its engine table is
            // written that way. The surface used to coerce any non-number to
            // `p.def || 0`, so `wave` arrived as the string, `Math.round('sine')`
            // came out NaN, the <select> showed no selection at all, and writing
            // one put the INDEX into a field the engine reads as a NAME — a
            // control that looks like it worked and silently changes the wrong
            // thing, which is the exact class this surface exists to remove.
            //
            // So a name-valued enum is projected onto its positions here: the
            // control sees 0..n-1 like every other enum, and the writer puts the
            // NAME back. Nothing outside this function has to know. PLAN-18.12.
            const byName = spec.type === 'enum'
                && Array.isArray(spec.values)
                && spec.values.length > 0
                && typeof raw === 'string';

            const min = byName ? 0 : (typeof spec.min === 'number' ? spec.min : 0);
            const max = byName
                ? spec.values.length - 1
                : (typeof spec.max === 'number' ? spec.max : 1);
            const value = raw;
            const v = byName
                ? Math.max(0, spec.values.indexOf(raw))
                : (typeof raw === 'number' ? raw : (typeof p.def === 'number' ? p.def : 0));

            return {
                key: spec.name,
                type: spec.type,
                min: min,
                max: max,
                values: spec.values || null,
                unit: spec.unit || null,
                writable: spec.writable === true,

                label: p.label || spec.name,
                def: byName
                    ? Math.max(0, spec.values.indexOf(p.def))
                    : (typeof p.def === 'number' ? p.def : min),
                ticks: p.ticks || [],
                fmt: fmt,
                // The engraved detent. Faceplate, not bus — the tape echo snaps
                // its heads to whole milliseconds and the bus does not need to
                // know that, exactly as it does not need `ticks`. Carried so a
                // panel taking its controls from the surface does not have to
                // keep a second lookup into `params` just for this. PLAN-18.12.
                step: typeof p.step === 'number' ? p.step : undefined,

                value: v,
                // A name-valued enum prints its NAME, not the position it was
                // projected onto — the position is an implementation detail of
                // the control, and the faceplate should say `sine`.
                display: byName
                    ? String(raw)
                    : (function () { try { return fmt(v); } catch (e) { return String(v); } })(),
                pct: ((v - min) / ((max - min) || 1)) * 100,

                // A control the adapter says is read-only gets a writer that
                // does nothing, so a panel cannot accidentally publish into a
                // parameter whose writes land nowhere.
                set: spec.writable !== true
                    ? function () {}
                    : (byName
                        // Back to the NAME the engine stores, clamped so a
                        // control that overshoots cannot write `undefined`.
                        ? function (nv) {
                            const i = Math.max(0, Math.min(spec.values.length - 1, Math.round(nv)));
                            window.oaPluginSet(id, idx, spec.name, spec.values[i]);
                        }
                        : function (nv) { window.oaPluginSet(id, idx, spec.name, nv); }),
            };
        });

        const by = {};
        list.forEach(function (d) { by[d.key] = d; });
        return { list: list, by: by, specs: specs };
    }, [id, idx, specs, params, unit]);
};

/**
 * The generic console surface: every control a plugin declares, drawn without a
 * line of per-plugin code.
 *
 * `control(descriptor)` lets a faceplate supply its own renderer — the rack
 * panels in this tree pass their engraved knob, so they keep their look while
 * their control LIST stops being hand-written. Without one, the plain default
 * below is used, which is what an unstyled mixer strip or a newly registered
 * plugin gets for free.
 */
window.OaConsoleSurface = function ({ id, idx = 0, control, only, style }) {
    const surface = window.useOaConsoleSurface(id, idx);
    const list = only
        ? only.map((k) => surface.by[k]).filter(Boolean)
        : surface.list;

    if (!list.length) {
        // A registered plugin with no params is a real state, not a lookup
        // miss — `voices` is registered with units=1 and params: []. Say so
        // rather than drawing an empty box.
        return (
            <div style={Object.assign({ fontSize: '9px', color: '#666', padding: '6px' }, style)}>
                {id} declares no controls
            </div>
        );
    }

    return (
        <div style={Object.assign({
            display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px',
        }, style)}>
            {list.map((d) => (
                <React.Fragment key={d.key}>
                    {control ? control(d) : <window.OaConsoleControl d={d} />}
                </React.Fragment>
            ))}
        </div>
    );
};

/**
 * The plain control. Deliberately unstyled next to the rack faceplates — this
 * is what a surface looks like when nobody has drawn one for it, and it should
 * look like a tool rather than pretend to be a panel.
 */
window.OaConsoleControl = function ({ d }) {
    const label = (
        <div style={{
            fontSize: '8px', letterSpacing: '1px', color: '#8a8a8a',
            textTransform: 'uppercase', marginBottom: '2px',
        }}>{d.label}{d.unit ? ' (' + d.unit + ')' : ''}</div>
    );

    // Read-only is shown, not hidden. A parameter that exists and cannot be
    // written is information; a parameter that has quietly vanished from a
    // panel is a question nobody can answer from the panel.
    if (!d.writable) {
        return (
            <div style={{ minWidth: '72px' }} title={`${d.key} — read-only`}>
                {label}
                <div style={{
                    fontSize: '11px', color: '#777', fontVariantNumeric: 'tabular-nums',
                    border: '1px dashed #444', borderRadius: '3px', padding: '3px 6px',
                }}>{d.display}</div>
            </div>
        );
    }

    if (d.type === 'enum') {
        // A discrete param's choices ARE its positions min..max; `values` is the
        // label for each, which is why the option's value is the index and not
        // the string printed on it.
        return (
            <div style={{ minWidth: '92px' }}>
                {label}
                <select
                    value={Math.round(d.value)}
                    onChange={(e) => d.set(Number(e.target.value))}
                    style={{ width: '100%', fontSize: '11px', background: '#111', color: '#ddd', border: '1px solid #444' }}
                >
                    {(d.values || []).map((v, i) => (
                        <option key={i} value={Math.round(d.min) + i}>{v}</option>
                    ))}
                </select>
            </div>
        );
    }

    return (
        <div style={{ minWidth: '92px' }}>
            {label}
            <input
                type="range"
                min={d.min} max={d.max} value={d.value}
                step={(d.max - d.min) / 200}
                onChange={(e) => d.set(Number(e.target.value))}
                style={{ width: '100%' }}
            />
            <div style={{
                fontSize: '9.5px', color: '#aaa', fontVariantNumeric: 'tabular-nums',
            }}>{d.display}</div>
        </div>
    );
};
