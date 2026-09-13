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

window.SoundCloudView = ({ data, rootHandle, onSelectFile }) => {
    // Derived from the accent so the cloud's groups re-colour with the theme.
    const CLOUD_PALETTE = ['var(--accent)', 'var(--accent-t15)', 'var(--accent-s15)', 'var(--accent-t25)',
                           'var(--accent-s25)', 'var(--accent-s15)', 'var(--accent-t15)', 'var(--accent-s25)',
                           'var(--accent-t25)', 'var(--accent-t15)', 'var(--accent-s15)', 'var(--accent-t40)',
                           'var(--accent-t60)', 'var(--accent-s40)', 'var(--accent-s25)', 'var(--accent-s15)', '#fff'];
    const chartRef = React.useRef(null);
    const echartsInst = React.useRef(null);
    const [detail, setDetail] = React.useState(null);   // clicked sample → side panel
    // Two separate graphs: one-shots (≤1 transient) vs loops (>1 transient).
    const [mode, setMode] = React.useState('hits');
    // How to colour/group points: auto, blind K-Means cluster, feature timbre, or name.
    const [colorBy, setColorBy] = React.useState('auto');

    const isLoop = (d) => (d.transients || 0) > 1;
    const hits = React.useMemo(() => data.filter((d) => !isLoop(d)), [data]);
    const loops = React.useMemo(() => data.filter((d) => isLoop(d)), [data]);
    const view = mode === 'loops' ? loops : hits;

    const groupKey = (d) => {
        if (colorBy === 'cluster') return 'Cluster ' + (d.cluster != null ? d.cluster : '?');
        if (colorBy === 'name') return d.group || 'Other';
        if (colorBy === 'timbre') return d.timbre || d.group || 'Other';
        return mode === 'loops' ? (d.group || 'Loop') : (d.timbre || d.group || 'Other');
    };
    const groups = React.useMemo(() => Array.from(new Set(view.map(groupKey))).sort(), [view, mode, colorBy]);
    const colorFor = (g) => CLOUD_PALETTE[Math.max(0, groups.indexOf(g)) % CLOUD_PALETTE.length];

    // Load (decode+play) a sample and show its detail.
    const loadAndDetail = async (d) => {
        setDetail(d);
        try {
            let h = rootHandle;
            if (d.sub) { for (const p of d.sub.split(/[\/\\]/)) { if (p) h = await h.getDirectoryHandle(p); } }
            const fh = await h.getFileHandle(d.name);
            const file = await fh.getFile();
            const folder = rootHandle.name + (d.sub ? '/' + d.sub : '');
            onSelectFile({ name: d.name, folder, file });
        } catch (e) { console.error('Could not load file from cloud:', e); }
    };

    React.useEffect(() => {
        if (!chartRef.current || !window.echarts) return;
        const chart = window.echarts.init(chartRef.current, 'dark');
        echartsInst.current = chart;

        const lengths = view.map((d) => d.length || 0.1);
        const minL = Math.min(...lengths, 0.1), maxL = Math.max(...lengths, 5);
        const sz = (l) => 6 + ((l - minL) / (maxL - minL || 1)) * 18;
        // Loops: X = BPM (fallback pitch), Z = length. One-shots: X = pitch, Z = complexity.
        const xOf = (d) => (mode === 'loops' ? (d.bpm || d.pitch || 0) : (d.pitch || 0));
        const zOf = (d) => (mode === 'loops' ? (d.length || 0) : (d.complexity || 0));
        const xName = mode === 'loops' ? 'BPM' : 'Pitch';
        const zName = mode === 'loops' ? 'Length (s)' : 'Complexity';
        const tip = (p) => {
            const d = p.data.raw; const t = d.transients || 0;
            return `<b>${d.name}</b><br/>${groupKey(d)}${t > 1 ? ' · loop' : ''}<br/>`
                + `Pitch ${(d.pitch || 0).toFixed(0)}Hz · Bright ${((d.brightness ?? d.high) || 0).toFixed(2)} · Harm ${(d.harmonicity || 0).toFixed(2)}<br/>`
                + `${(d.length || 0).toFixed(2)}s · ${t} transient${t === 1 ? '' : 's'}${d.bpm ? ' · ' + d.bpm.toFixed(0) + ' BPM' : ''}`;
        };

        // 3D: X, Y (depth) = group, Z (height).
        chart.setOption({
            backgroundColor: 'transparent',
            legend: { type: 'scroll', top: 4, textStyle: { color: '#ccc', fontSize: 10 }, inactiveColor: '#555' },
            tooltip: { formatter: tip },
            xAxis3D: { name: xName, type: 'value', nameTextStyle: { color: '#888' }, axisLabel: { color: '#666' } },
            yAxis3D: { name: 'Group', type: 'category', data: groups, nameTextStyle: { color: '#888' }, axisLabel: { color: '#aaa', fontSize: 9 } },
            zAxis3D: { name: zName, type: 'value', nameTextStyle: { color: '#888' }, axisLabel: { color: '#666' } },
            grid3D: { boxWidth: 100, boxDepth: 90, viewControl: { distance: 220 }, axisLine: { lineStyle: { color: '#444' } }, splitLine: { lineStyle: { color: '#222' } } },
            series: groups.map((g) => ({
                name: g, type: 'scatter3D',
                itemStyle: { color: colorFor(g), opacity: 0.85 },
                emphasis: { itemStyle: { color: '#fff' } },
                data: view.filter((d) => groupKey(d) === g).map((d) => ({ value: [xOf(d), groups.indexOf(g), zOf(d)], raw: d, symbolSize: sz(d.length || 0.1) })),
            })),
        });

        // If echarts-gl isn't available, grid3D won't exist — fall back to 2D.
        let ok3D = false;
        try { ok3D = !!(chart.getModel().getComponent('grid3D')); } catch (e) { ok3D = false; }
        if (!ok3D) {
            chart.clear();
            chart.setOption({
                backgroundColor: 'transparent',
                legend: { type: 'scroll', top: 4, textStyle: { color: '#ccc', fontSize: 10 }, inactiveColor: '#555' },
                tooltip: { formatter: tip },
                grid: { left: 80, right: 20, top: 42, bottom: 40 },
                xAxis: { type: 'value', name: xName, nameTextStyle: { color: '#888' }, axisLabel: { color: '#666' }, splitLine: { show: false } },
                yAxis: { type: 'category', data: groups, name: 'Group', nameTextStyle: { color: '#888' }, axisLabel: { color: '#aaa', fontSize: 10 }, splitLine: { lineStyle: { color: '#222' } } },
                series: groups.map((g) => ({
                    name: g, type: 'scatter', symbolSize: (v, p) => sz(p.data.raw.length),
                    itemStyle: { color: colorFor(g), opacity: 0.75, borderColor: '#000', borderWidth: 0.3 },
                    emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 2 } },
                    data: view.filter((d) => groupKey(d) === g).map((d) => ({ value: [xOf(d), groups.indexOf(g)], raw: d })),
                })),
            });
        }

        const onClick = (params) => { if (params.data && params.data.raw) loadAndDetail(params.data.raw); };
        chart.on('click', onClick);
        const onResize = () => chart.resize();
        window.addEventListener('resize', onResize);
        return () => { window.removeEventListener('resize', onResize); chart.off('click', onClick); chart.dispose(); };
    }, [data, rootHandle, mode, colorBy]);

    const tab = (m, label, n) => (
        <button onClick={() => setMode(m)} style={{
            background: mode === m ? 'var(--accent)' : '#2a2a2a', color: mode === m ? '#111' : '#bbb',
            border: '1px solid ' + (mode === m ? 'var(--accent)' : '#444'), borderRadius: '4px',
            padding: '3px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
        }}>{label} <span style={{ opacity: 0.7 }}>({n})</span></button>
    );
    const row = (k, v) => (
        <div style={{ marginBottom: '3px' }}>{k}: <b>{v}</b></div>
    );

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ padding: '6px 16px', background: '#222', borderBottom: '1px solid #333', fontSize: '11px', color: '#888', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {tab('hits', '● One-shots', hits.length)}
                    {tab('loops', '◆ Loops', loops.length)}
                    <span style={{ marginLeft: '4px' }}>colour by:</span>
                    <select value={colorBy} onChange={(e) => setColorBy(e.target.value)} style={{ background: '#2a2a2a', color: '#ddd', border: '1px solid #444', borderRadius: '4px', fontSize: '11px', padding: '2px 4px' }}>
                        <option value="auto">Auto</option>
                        <option value="cluster">Cluster (K-Means)</option>
                        <option value="timbre">Timbre</option>
                        <option value="name">Name</option>
                    </select>
                    <span style={{ flexGrow: 1 }} />
                    <span>{mode === 'loops'
                        ? 'X: BPM · Y: Group · Z: Length · drag to orbit · click to play'
                        : 'X: Pitch · Y: Group · Z: Complexity · size: Length · click to play'}</span>
                </div>
                <div ref={chartRef} style={{ flex: 1, width: '100%' }} />
            </div>
            <div style={{ width: '196px', flexShrink: 0, borderLeft: '1px solid #333', padding: '12px', overflowY: 'auto', fontSize: '12px', color: '#ccc' }}>
                {detail ? (
                    <div>
                        <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '4px', wordBreak: 'break-word' }}>{detail.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--accent-t15)', marginBottom: '10px', wordBreak: 'break-word' }}>{detail.sub || '(root)'}</div>
                        <div style={{ marginBottom: '3px' }}>Group: <b style={{ color: colorFor(groupKey(detail)) }}>{detail.group || 'Other'}</b></div>
                        {detail.timbre ? row('Timbre', detail.timbre) : null}
                        {detail.cluster != null && detail.cluster >= 0 ? row('Cluster', '#' + detail.cluster) : null}
                        {row('Pitch', (detail.pitch || 0).toFixed(1) + ' Hz')}
                        {detail.harmonicity != null ? row('Harmonicity', (detail.harmonicity || 0).toFixed(2)) : null}
                        {detail.centroid != null ? row('Brightness', (detail.centroid || 0).toFixed(0) + ' Hz') : null}
                        {row('Complexity', (detail.complexity || 0).toFixed(2))}
                        {detail.attack != null ? row('Attack', (detail.attack || 0).toFixed(3) + ' s') : null}
                        {row('Length', (detail.length || 0).toFixed(2) + ' s')}
                        <div style={{ marginBottom: '3px' }}>Transients: <b>{detail.transients || 0}</b>{(detail.transients || 0) > 1 ? <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}> — loop</span> : <span style={{ color: '#8a8', fontWeight: 'bold' }}> — one-shot</span>}</div>
                        {detail.bpm ? row('BPM', detail.bpm.toFixed(1)) : null}
                        {detail.sample_rate ? row('Format', (detail.sample_rate / 1000).toFixed(1) + ' kHz / ' + (detail.bit_depth || '?') + '-bit') : null}
                        <button onClick={() => loadAndDetail(detail)} style={{ marginTop: '10px', background: '#388e3c', color: '#fff', border: 'none', borderRadius: '3px', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>► Play</button>
                    </div>
                ) : (
                    <div style={{ color: '#666' }}>Click a point to see its details and play it.</div>
                )}
            </div>
        </div>
    );
};
