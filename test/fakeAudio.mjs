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
 * Header: fakeAudio.mjs
 * Purpose: A Web Audio API good enough to run the real plugins against in Node,
 *   and honest enough to catch a leak.
 * Description: The plugins under libControl/SoundSynth are pure graph builders —
 *   they call ctx.createX(), wire the results together and hand back an input
 *   node. None of that needs a sound card to verify, only an implementation that
 *   records what was asked for. This is that implementation.
 *
 *   THREE THINGS IT DOES THAT A STUB WOULD NOT:
 *
 *   1. It REMEMBERS THE GRAPH. Every connect() and disconnect() is recorded as
 *      an edge, so a test can ask "what is still wired to the destination?" and
 *      get a real answer. That question is the whole leak test: build a hundred
 *      voices, let them all finish, and if the graph is not back where it
 *      started, something is holding on.
 *
 *   2. It ENFORCES THE SPEC'S ERRORS. exponentialRampToValueAtTime(0) throws in
 *      every real browser, and so does it here. A NaN into an AudioParam throws.
 *      These are the failures that reach a user as a dead voice or a stuck gain,
 *      and they are invisible until something rejects them.
 *
 *   3. It HAS A CLOCK YOU CAN TURN. advance(seconds) moves currentTime forward
 *      and fires the 'ended' events the browser would have fired, which is what
 *      lets a test watch the voice registry drain instead of guessing.
 *
 *   It is NOT a DSP simulator. Nothing renders; analysers hand back a
 *   deterministic test tone. Anything that depends on the actual sample values
 *   belongs in a worklet test (see workletHost.mjs), where the real process()
 *   function is run over real arrays.
 */

let SEQ = 0;

const finite = (v, what) => {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`${what}: expected a finite number, got ${v}`);
    }
    return v;
};

// ---------------------------------------------------------------------------
// AudioParam
// ---------------------------------------------------------------------------

/**
 * The automation is recorded, not evaluated — `value` is simply the last thing
 * written. What matters for these tests is that the CALLS are legal, because an
 * illegal one throws in the browser and kills the voice that made it.
 */
class FakeParam {
    constructor(node, name, defaultValue, min, max) {
        this.__node = node;
        this.__name = name;
        this.defaultValue = defaultValue;
        this.minValue = min == null ? -3.4028235e38 : min;
        this.maxValue = max == null ? 3.4028235e38 : max;
        this.__v = defaultValue;
        this.events = [];
    }

    get value() { return this.__v; }
    set value(v) {
        finite(v, `${this.__where()}.value`);
        this.__v = v;
    }

    __where() { return `${this.__node.__type}.${this.__name}`; }

    __time(t, method) {
        finite(t, `${this.__where()}.${method}(time)`);
        if (t < 0) throw new RangeError(`${this.__where()}.${method}: negative time ${t}`);
        return t;
    }

    setValueAtTime(v, t) {
        finite(v, `${this.__where()}.setValueAtTime`);
        this.__time(t, 'setValueAtTime');
        this.events.push({ type: 'set', v, t });
        this.__v = v;
        return this;
    }

    linearRampToValueAtTime(v, t) {
        finite(v, `${this.__where()}.linearRampToValueAtTime`);
        this.__time(t, 'linearRampToValueAtTime');
        this.events.push({ type: 'linear', v, t });
        this.__v = v;
        return this;
    }

    /**
     * The one that bites. An exponential ramp is a multiplication per sample, so
     * it can never arrive at zero and the spec makes a zero target a RangeError.
     * Every decay in this codebase has to ramp to a small floor instead — this
     * is what proves they all do.
     */
    exponentialRampToValueAtTime(v, t) {
        finite(v, `${this.__where()}.exponentialRampToValueAtTime`);
        this.__time(t, 'exponentialRampToValueAtTime');
        if (v === 0) {
            throw new RangeError(`${this.__where()}.exponentialRampToValueAtTime: target must be non-zero`);
        }
        if (this.__v !== 0 && Math.sign(v) !== Math.sign(this.__v)) {
            throw new RangeError(`${this.__where()}.exponentialRampToValueAtTime: cannot cross zero`);
        }
        this.events.push({ type: 'exp', v, t });
        this.__v = v;
        return this;
    }

    setTargetAtTime(v, t, tau) {
        finite(v, `${this.__where()}.setTargetAtTime`);
        this.__time(t, 'setTargetAtTime');
        finite(tau, `${this.__where()}.setTargetAtTime(timeConstant)`);
        if (tau < 0) throw new RangeError(`${this.__where()}.setTargetAtTime: negative time constant`);
        this.events.push({ type: 'target', v, t, tau });
        this.__v = v;
        return this;
    }

    setValueCurveAtTime(curve, t, dur) {
        this.__time(t, 'setValueCurveAtTime');
        this.events.push({ type: 'curve', curve, t, dur });
        return this;
    }

    cancelScheduledValues(t) {
        this.__time(t, 'cancelScheduledValues');
        this.events = this.events.filter((e) => e.t < t);
        return this;
    }

    cancelAndHoldAtTime(t) { return this.cancelScheduledValues(t); }
}

// ---------------------------------------------------------------------------
// AudioBuffer
// ---------------------------------------------------------------------------

let BUFFER_BYTES = 0;

class FakeAudioBuffer {
    constructor(numberOfChannels, length, sampleRate) {
        this.numberOfChannels = numberOfChannels;
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this.__chans = [];
        for (let c = 0; c < numberOfChannels; c++) this.__chans.push(new Float32Array(length));
        this.__bytes = numberOfChannels * length * 4;
        BUFFER_BYTES += this.__bytes;
    }
    getChannelData(c) {
        if (c >= this.numberOfChannels) throw new RangeError('channel out of range');
        return this.__chans[c];
    }
    copyFromChannel(dest, c, off = 0) { dest.set(this.__chans[c].subarray(off, off + dest.length)); }
    copyToChannel(src, c, off = 0) { this.__chans[c].set(src, off); }
}

/** Total bytes held by every AudioBuffer ever built. Used by the cache tests. */
export const bufferBytes = () => BUFFER_BYTES;
export const resetBufferBytes = () => { BUFFER_BYTES = 0; };

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

class FakeNode {
    constructor(ctx, type) {
        this.context = ctx;
        this.__type = type;
        this.__id = ++SEQ;
        // Outgoing edges only. A real graph is directed the same way: a node
        // holds its destinations alive, never the other way round.
        this.__out = [];
        this.__disconnected = false;
        this.numberOfInputs = 1;
        this.numberOfOutputs = 1;
        this.channelCount = 2;
        this.channelCountMode = 'max';
        this.channelInterpretation = 'speakers';
        ctx.__register(this);
    }

    connect(dest, output = 0, input = 0) {
        if (dest == null) throw new TypeError(`${this.__type}.connect: destination is ${dest}`);
        if (!(dest instanceof FakeNode) && !(dest instanceof FakeParam)) {
            throw new TypeError(`${this.__type}.connect: not an AudioNode or AudioParam`);
        }
        if (output >= this.numberOfOutputs) {
            throw new IndexSizeError(`${this.__type}.connect: output ${output} of ${this.numberOfOutputs}`);
        }
        if (dest instanceof FakeNode && input >= dest.numberOfInputs) {
            throw new IndexSizeError(`${dest.__type}.connect: input ${input} of ${dest.numberOfInputs}`);
        }
        this.__out.push({ dest, output, input });
        this.context.__edges++;
        return dest instanceof FakeNode ? dest : undefined;
    }

    disconnect(dest) {
        if (dest === undefined) {
            this.context.__edges -= this.__out.length;
            this.__out = [];
        } else {
            const before = this.__out.length;
            this.__out = this.__out.filter((e) => e.dest !== dest);
            this.context.__edges -= before - this.__out.length;
        }
        this.__disconnected = true;
    }
}

class IndexSizeError extends Error {
    constructor(m) { super(m); this.name = 'IndexSizeError'; }
}

/**
 * Anything that starts and stops. The clock is what makes these interesting:
 * `stop(t)` records when the browser would fire 'ended', and advance() fires it.
 */
class FakeSource extends FakeNode {
    constructor(ctx, type) {
        super(ctx, type);
        this.numberOfInputs = 0;
        this.__started = null;
        this.__stopAt = null;
        this.__ended = false;
        this.__listeners = [];
        this.onended = null;
        ctx.__sources.push(this);
    }

    start(when = 0, offset, duration) {
        if (this.__started !== null) throw new Error(`${this.__type}.start called twice`);
        finite(when, `${this.__type}.start(when)`);
        this.__started = when;
        // A source given an explicit duration ends on its own, exactly as one
        // given an explicit stop() does. A looping source without a stop never
        // ends — which is precisely the case a leak test wants to see.
        if (duration != null) this.__stopAt = when + duration;
        return this;
    }

    stop(when = 0) {
        finite(when, `${this.__type}.stop(when)`);
        if (this.__started === null) throw new Error(`${this.__type}.stop before start`);
        this.__stopAt = this.__stopAt == null ? when : Math.min(this.__stopAt, when);
        return this;
    }

    addEventListener(name, fn) { if (name === 'ended') this.__listeners.push(fn); }
    removeEventListener(name, fn) {
        if (name === 'ended') this.__listeners = this.__listeners.filter((f) => f !== fn);
    }

    __fireEnded() {
        if (this.__ended) return;
        this.__ended = true;
        const ev = { type: 'ended', target: this };
        this.__listeners.slice().forEach((f) => f.call(this, ev));
        if (typeof this.onended === 'function') this.onended.call(this, ev);
    }

    /** Still capable of making sound at time t. */
    __activeAt(t) {
        if (this.__started === null) return false;
        if (this.__stopAt != null && this.__stopAt <= t) return false;
        return true;
    }
}

class FakeBufferSource extends FakeSource {
    constructor(ctx) {
        super(ctx, 'AudioBufferSourceNode');
        this.buffer = null;
        this.loop = false;
        this.loopStart = 0;
        this.loopEnd = 0;
        this.playbackRate = new FakeParam(this, 'playbackRate', 1);
        this.detune = new FakeParam(this, 'detune', 0);
    }
    start(when = 0, offset, duration) {
        // A source with no buffer is silent in the browser and almost always a
        // bug in the caller; say so rather than passing it through.
        if (!this.buffer) throw new Error('AudioBufferSourceNode.start with no buffer');
        // Without an explicit duration a one-shot ends when the buffer runs out.
        if (duration == null && !this.loop) {
            const off = offset || 0;
            duration = Math.max(0, this.buffer.duration / (this.playbackRate.value || 1) - off);
        }
        return super.start(when, offset, duration);
    }
}

class FakeOscillator extends FakeSource {
    constructor(ctx) {
        super(ctx, 'OscillatorNode');
        this.type = 'sine';
        this.frequency = new FakeParam(this, 'frequency', 440);
        this.detune = new FakeParam(this, 'detune', 0);
    }
    setPeriodicWave() {}
}

class FakeAnalyser extends FakeNode {
    constructor(ctx) {
        super(ctx, 'AnalyserNode');
        this.fftSize = 2048;
        this.smoothingTimeConstant = 0.8;
        this.minDecibels = -100;
        this.maxDecibels = -30;
        // The value every meter in the app will read. Deterministic on purpose:
        // a test can assert the exact number a needle lands on.
        this.__testPeak = 0;
    }
    get frequencyBinCount() { return this.fftSize / 2; }
    getFloatTimeDomainData(arr) {
        for (let i = 0; i < arr.length; i++) arr[i] = this.__testPeak * Math.sin((i / arr.length) * Math.PI * 2);
    }
    getByteTimeDomainData(arr) {
        for (let i = 0; i < arr.length; i++) arr[i] = 128 + Math.round(127 * this.__testPeak);
    }
    getFloatFrequencyData(arr) { arr.fill(this.__testPeak > 0 ? -20 : -100); }
    getByteFrequencyData(arr) { arr.fill(this.__testPeak > 0 ? 200 : 0); }
}

class FakeWorkletNode extends FakeNode {
    constructor(ctx, name, opts = {}) {
        super(ctx, `AudioWorkletNode(${name})`);
        if (!ctx.__modules.has(name)) {
            throw new Error(`AudioWorkletNode: processor "${name}" is not registered`);
        }
        this.__processor = name;
        this.numberOfInputs = opts.numberOfInputs != null ? opts.numberOfInputs : 1;
        this.numberOfOutputs = opts.numberOfOutputs != null ? opts.numberOfOutputs : 1;
        if (opts.channelCount) this.channelCount = opts.channelCount;
        if (opts.channelCountMode) this.channelCountMode = opts.channelCountMode;

        const descriptors = ctx.__modules.get(name) || [];
        this.parameters = new Map();
        descriptors.forEach((d) => {
            this.parameters.set(d.name, new FakeParam(this, d.name, d.defaultValue, d.minValue, d.maxValue));
        });

        this.port = {
            onmessage: null,
            __sent: [],
            postMessage(m) { this.__sent.push(m); },
            close() { this.__closed = true; },
        };
    }
    /** Push a message from the "processor" side, the way a real worklet would. */
    __emit(data) {
        if (typeof this.port.onmessage === 'function') this.port.onmessage({ data });
    }
}

const PARAM_NODES = {
    GainNode: { gain: 1 },
    DelayNode: { delayTime: 0 },
    StereoPannerNode: { pan: 0 },
    ConstantSourceNode: { offset: 1 },
};

// ---------------------------------------------------------------------------
// AudioContext
// ---------------------------------------------------------------------------

class FakeAudioContext {
    constructor(opts = {}) {
        this.sampleRate = opts.sampleRate || 48000;
        this.currentTime = 0;
        this.state = 'running';
        this.baseLatency = 0.005;
        this.outputLatency = 0.01;

        this.__all = [];         // every node ever created
        this.__sources = [];     // every source ever created
        this.__edges = 0;
        this.__modules = new Map();
        this.__counts = {};

        this.destination = new FakeNode(this, 'AudioDestinationNode');
        this.destination.numberOfOutputs = 0;

        this.audioWorklet = {
            addModule: async (url) => {
                // The plugins ship their processors as source strings behind a
                // Blob URL. workletHost.mjs registers the descriptors under the
                // processor name before the test builds anything; here we only
                // need to know the module was asked for.
                const names = FakeAudioContext.__registry.get(url);
                if (!names) throw new Error(`addModule: nothing registered for ${url}`);
                names.forEach((n, k) => this.__modules.set(k, n));
            },
        };
    }

    __register(node) {
        this.__all.push(node);
        this.__counts[node.__type] = (this.__counts[node.__type] || 0) + 1;
    }

    createGain() { return this.__withParams(new FakeNode(this, 'GainNode'), 'GainNode'); }
    createDelay(max = 1) {
        const n = this.__withParams(new FakeNode(this, 'DelayNode'), 'DelayNode');
        n.maxDelayTime = max;
        return n;
    }
    createStereoPanner() { return this.__withParams(new FakeNode(this, 'StereoPannerNode'), 'StereoPannerNode'); }
    createConstantSource() {
        const n = new FakeSource(this, 'ConstantSourceNode');
        n.offset = new FakeParam(n, 'offset', 1);
        return n;
    }
    createBufferSource() { return new FakeBufferSource(this); }
    createOscillator() { return new FakeOscillator(this); }
    createAnalyser() { return new FakeAnalyser(this); }

    createBiquadFilter() {
        const n = new FakeNode(this, 'BiquadFilterNode');
        n.type = 'lowpass';
        n.frequency = new FakeParam(n, 'frequency', 350);
        n.Q = new FakeParam(n, 'Q', 1);
        n.gain = new FakeParam(n, 'gain', 0);
        n.detune = new FakeParam(n, 'detune', 0);
        return n;
    }

    createDynamicsCompressor() {
        const n = new FakeNode(this, 'DynamicsCompressorNode');
        n.threshold = new FakeParam(n, 'threshold', -24, -100, 0);
        n.knee = new FakeParam(n, 'knee', 30, 0, 40);
        n.ratio = new FakeParam(n, 'ratio', 12, 1, 20);
        n.attack = new FakeParam(n, 'attack', 0.003, 0, 1);
        n.release = new FakeParam(n, 'release', 0.25, 0, 1);
        // Read-only in the spec, and negative or zero. The meter path depends on
        // that sign; a test can drive it by writing __reduction.
        Object.defineProperty(n, 'reduction', { get: () => n.__reduction || 0 });
        return n;
    }

    createWaveShaper() {
        const n = new FakeNode(this, 'WaveShaperNode');
        n.__curve = null;
        n.oversample = 'none';
        Object.defineProperty(n, 'curve', {
            get: () => n.__curve,
            set: (c) => {
                if (c != null && !(c instanceof Float32Array)) {
                    throw new TypeError('WaveShaperNode.curve must be a Float32Array');
                }
                if (c) for (let i = 0; i < c.length; i++) finite(c[i], `WaveShaperNode.curve[${i}]`);
                n.__curve = c;
            },
        });
        return n;
    }

    createConvolver() {
        const n = new FakeNode(this, 'ConvolverNode');
        n.normalize = true;
        n.buffer = null;
        return n;
    }

    createChannelSplitter(ch = 6) {
        const n = new FakeNode(this, 'ChannelSplitterNode');
        n.numberOfOutputs = ch;
        return n;
    }

    createChannelMerger(ch = 6) {
        const n = new FakeNode(this, 'ChannelMergerNode');
        n.numberOfInputs = ch;
        return n;
    }

    createBuffer(ch, len, rate) { return new FakeAudioBuffer(ch, len, rate || this.sampleRate); }

    decodeAudioData(ab) {
        // Enough of a WAV reader to hand back something the right size; the
        // sample values are not what any of this is testing.
        return Promise.resolve(new FakeAudioBuffer(2, Math.max(1, Math.floor(ab.byteLength / 4)), this.sampleRate));
    }

    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }

    __withParams(node, type) {
        const spec = PARAM_NODES[type] || {};
        Object.keys(spec).forEach((k) => { node[k] = new FakeParam(node, k, spec[k]); });
        return node;
    }

    // -----------------------------------------------------------------------
    // The clock, and the questions a leak test asks
    // -----------------------------------------------------------------------

    /**
     * Move time forward and fire every 'ended' the browser would have fired.
     * Sources are handled in stop order so a listener that starts another voice
     * (the sequencer does) still sees a consistent clock.
     */
    advance(seconds) {
        const target = this.currentTime + seconds;
        const due = this.__sources
            .filter((s) => !s.__ended && s.__stopAt != null && s.__stopAt <= target)
            .sort((a, b) => a.__stopAt - b.__stopAt);
        this.currentTime = target;
        due.forEach((s) => s.__fireEnded());
        return this;
    }

    /** Every node ever built, by constructor name. */
    created() { return Object.assign({}, this.__counts); }

    /** How many nodes have been built in total. */
    createdCount() { return this.__all.length; }

    /**
     * The nodes that can still put a sample into the destination: reachable
     * BACKWARDS from the destination, and fed by a source that has not ended.
     *
     * This is the number that must not grow. Persistent gear — a reverb bus, a
     * compressor strip — has no live source behind it once the room goes quiet,
     * so it drops out of this count and leaves a clean zero to assert against.
     * Anything still here after every voice has ended is being held by
     * something, and that something is the leak.
     */
    retained() {
        const reachesDest = new Set();
        const byId = new Map(this.__all.map((n) => [n.__id, n]));
        // Reverse edges once, then walk back from the destination.
        const incoming = new Map();
        this.__all.forEach((n) => {
            n.__out.forEach((e) => {
                const target = e.dest instanceof FakeParam ? e.dest.__node : e.dest;
                if (!incoming.has(target.__id)) incoming.set(target.__id, []);
                incoming.get(target.__id).push(n);
            });
        });
        const stack = [this.destination];
        while (stack.length) {
            const n = stack.pop();
            if (reachesDest.has(n.__id)) continue;
            reachesDest.add(n.__id);
            (incoming.get(n.__id) || []).forEach((p) => stack.push(p));
        }

        // Forward from every still-active source.
        const fedByLive = new Set();
        const live = this.__sources.filter((s) => s.__activeAt(this.currentTime));
        const fwd = [...live];
        while (fwd.length) {
            const n = fwd.pop();
            if (fedByLive.has(n.__id)) continue;
            fedByLive.add(n.__id);
            n.__out.forEach((e) => {
                const target = e.dest instanceof FakeParam ? e.dest.__node : e.dest;
                fwd.push(target);
            });
        }

        let count = 0;
        byId.forEach((n, id) => {
            if (id === this.destination.__id) return;
            if (reachesDest.has(id) && fedByLive.has(id)) count++;
        });
        return count;
    }

    /**
     * Nodes still WIRED into the destination, whether or not anything is
     * feeding them.
     *
     * This is the count that catches a chain nobody disconnected, and it is a
     * different question from retained(): once a voice's source ends, retained()
     * stops counting its chain because nothing live feeds it any more — so a
     * chain that was never disconnected looks identical to one that was. It is
     * the right measure for "is anything still audible", and useless for "is
     * anything still attached".
     *
     * Attached is what matters for a leak. Every node here is one the browser
     * has to keep in its graph and consider on every render quantum, and the
     * pile only grows.
     */
    connectedToDestination() {
        const incoming = new Map();
        this.__all.forEach((n) => {
            n.__out.forEach((e) => {
                const target = e.dest instanceof FakeParam ? e.dest.__node : e.dest;
                if (!incoming.has(target.__id)) incoming.set(target.__id, []);
                incoming.get(target.__id).push(n);
            });
        });
        const seen = new Set();
        const stack = [this.destination];
        while (stack.length) {
            const n = stack.pop();
            if (seen.has(n.__id)) continue;
            seen.add(n.__id);
            (incoming.get(n.__id) || []).forEach((p) => stack.push(p));
        }
        return seen.size - 1;      // the destination itself is not a leak
    }

    /** Sources that started and never ended — a looping voice nobody stopped. */
    danglingSources() {
        return this.__sources.filter((s) => s.__started !== null && !s.__ended
            && (s.__stopAt == null || s.__stopAt > this.currentTime));
    }
}

// Blob URL -> Map(processorName -> parameterDescriptors). Filled by workletHost.
FakeAudioContext.__registry = new Map();

class FakeOfflineAudioContext extends FakeAudioContext {
    constructor(ch, len, rate) {
        super({ sampleRate: rate });
        this.length = len;
        this.numberOfChannels = ch;
        this.__renderRate = rate;
    }
    startRendering() {
        // Advance past the whole render so scheduled sources end, exactly as
        // they would when a real offline render completes.
        this.advance(this.length / this.__renderRate + 1);
        return Promise.resolve(new FakeAudioBuffer(this.numberOfChannels, this.length, this.__renderRate));
    }
}

export {
    FakeAudioContext,
    FakeOfflineAudioContext,
    FakeAudioBuffer,
    FakeParam,
    FakeNode,
    FakeSource,
    FakeAnalyser,
    FakeWorkletNode,
};
