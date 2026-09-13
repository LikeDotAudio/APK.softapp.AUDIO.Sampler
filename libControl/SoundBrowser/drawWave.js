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

window.drawWave = (canvas, buffer, color) => {
    if (!canvas) return;
    canvas.width = canvas.clientWidth || 120;
    canvas.height = canvas.clientHeight || 48;
    const cx = canvas.getContext('2d');
    cx.fillStyle = '#0a0a0a'; cx.fillRect(0, 0, canvas.width, canvas.height);
    if (!buffer) return;
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.ceil(data.length / canvas.width));
    const amp = canvas.height / 2;
    // A canvas cannot evaluate var(--accent), so the live value is read here.
    cx.strokeStyle = color || window.oaAccent(); cx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
        let mn = 1, mx = -1;
        for (let j = 0; j < step; j++) { const d = data[x * step + j]; if (d === undefined) break; if (d < mn) mn = d; if (d > mx) mx = d; }
        cx.moveTo(x, (1 + mn) * amp); cx.lineTo(x, (1 + mx) * amp);
    }
    cx.stroke();
};
