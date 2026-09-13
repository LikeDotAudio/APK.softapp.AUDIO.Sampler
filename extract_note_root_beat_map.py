#!/usr/bin/env python3
# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""
Audio Note Root Key & Beat Marker Map Extractor CLI
Extracts beat markers, root keys, pitch maps, and chunk/slice mappings from audio files (.m4a, .wav, .mp3, etc.).

THIS DOES NOT WRITE A FORMAT OF ITS OWN. What it drops beside the audio is the
ANALYZER's `.PEAK` — the document `sample_analyzer_rs` writes and
`APK:Softapps/SCAN/Web_Front/src/analyzerPeakSchema.json` types — carrying 2 of
its 10 groups, in the analyzer's own spelling. It shares an extension with the
Scanalyzer's downloaded `peak-lens-sidecar` and shares NO field with it; the
enumeration of all four `.PEAK` documents is in that schema's `$comment`.

`Scananalyzers/Musical/note_map.rs` IS THIS FILE, IN RUST, AND IT ALREADY RUNS.
The analyzer emits the same `musicality.note_root_key_beat_marker_map` — 164 of
the 346 records in the 147 tracked `.PEAK` carry one — so this CLI is the second
implementation of a measurement the library already has. It survives because it
takes an arbitrary path with ffmpeg in front of it and the analyzer takes a
library, and because its map is ELEVEN keys wide against the Rust struct's six:
it adds `file_name`, `file_path`, `length_seconds`, `sample_rate` and
`total_chunks`, and `total_chunks` is one `SamplerEditor` reads.

SO IT MUST NOT CLOBBER. Writing a two-group stub over a full analyzer sidecar
would delete `classification`, `envelope`, `spectral_features`, `ucs`,
`regions`, `unsupervised` and `preview` — every measurement the scan took — and
the loss is silent, because the truncated file is still a valid analyzer record
and still opens. When a sidecar with a `metadata.analyzer_version` is already
there, the map is MERGED into it and nothing else is touched. PLAN-907.01.
"""

import sys
import os
import math
import json
import argparse
import subprocess
import tempfile
import numpy as np

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

def midi_to_name(midi):
    if midi < 0 or midi > 127:
        return ""
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"

def hz_to_note(hz):
    if hz <= 0.0:
        return -1, "", 0.0
    midi_f = 69.0 + 12.0 * math.log2(hz / 440.0)
    midi = int(round(midi_f))
    if midi < 0 or midi > 127:
        return -1, "", 0.0
    cents = (midi_f - midi) * 100.0
    return midi, midi_to_name(midi), cents

def decode_audio_ffmpeg(file_path, target_sr=44100):
    """Decode audio file to float32 mono PCM using ffmpeg."""
    command = [
        "ffmpeg", "-y", "-i", file_path,
        "-f", "f32le", "-ac", "1", "-ar", str(target_sr), "pipe:1"
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0 or len(result.stdout) == 0:
        raise RuntimeError(f"FFmpeg decoding failed: {result.stderr.decode('utf-8', errors='ignore')}")
    audio = np.frombuffer(result.stdout, dtype=np.float32)
    return audio, target_sr

def extract_root_hps(audio, sr):
    """Harmonic Product Spectrum root note extraction."""
    n = min(len(audio), 65536)
    if n < 1024:
        return 0.0, "", 0.0
    
    start = (len(audio) - n) // 2
    segment = audio[start:start + n]
    window = np.hanning(n)
    fft_specification = np.abs(np.fft.rfft(segment * window))
    
    # HPS order 3
    hps = fft_specification.copy()
    for downsample in [2, 3]:
        ds = fft_specification[::downsample]
        hps[:len(ds)] *= ds
        
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    min_index = np.searchsorted(freqs, 50.0)
    max_index = np.searchsorted(freqs, 2000.0)
    
    if min_index >= max_index or max_index >= len(hps):
        return 0.0, "", 0.0
        
    peak_idx = min_index + np.argmax(hps[min_index:max_index])
    hz = float(freqs[peak_idx])
    midi, name, cents = hz_to_note(hz)
    return hz, name, cents, midi

def estimate_bpm_onsets(audio, sr):
    """Estimate BPM from onset envelope autocorrelation."""
    hop_size = 512
    frame_len = 2048
    number_frames = (len(audio) - frame_len) // hop_size
    if number_frames < 10:
        return 120.0
    
    environment = []
    previous_energy = 0.0
    for i in range(number_frames):
        frame = audio[i * hop_size : i * hop_size + frame_len]
        energy = np.sum(frame * frame)
        difference = max(0.0, energy - previous_energy)
        environment.append(difference)
        previous_energy = energy
        
    environment = np.array(environment)
    if np.max(environment) > 0:
        environment /= np.max(environment)
        
    # Autocorrelation over BPM range 60 to 200
    fps = sr / hop_size
    min_lag = int(round(fps * 60.0 / 200.0))
    max_lag = int(round(fps * 60.0 / 60.0))
    
    autocorr = np.correlate(environment, environment, mode='full')
    autocorr = autocorr[len(environment)-1:]
    
    if max_lag >= len(autocorr):
        return 120.0
        
    best_lag = min_lag + np.argmax(autocorr[min_lag:max_lag])
    bpm = 60.0 * fps / best_lag
    return float(round(bpm * 10.0) / 10.0)

def detect_regions(audio, sr, frame_ms=50, threshold_decibels=-35.0, min_dur_s=0.2):
    """Detect sounding regions bounded by silence."""
    frame_len = int(sr * frame_ms / 1000)
    hop_len = frame_len // 2
    number_frames = (len(audio) - frame_len) // hop_len
    
    energies = []
    for i in range(number_frames):
        frame = audio[i * hop_len : i * hop_len + frame_len]
        rms = math.sqrt(np.mean(frame * frame))
        decibels = 20.0 * math.log10(rms + 1e-9)
        energies.append(decibels)
        
    regions = []
    in_region = False
    start_s = 0.0
    
    for i, decibels in enumerate(energies):
        t_s = (i * hop_len) / sr
        if not in_region and decibels > threshold_decibels:
            in_region = True
            start_s = t_s
        elif in_region and (decibels <= threshold_decibels or i == len(energies) - 1):
            in_region = False
            dur = t_s - start_s
            if dur >= min_dur_s:
                regions.append((start_s, t_s, dur))
                
    if not regions and len(audio) > 0:
        total_dur = len(audio) / sr
        regions.append((0.0, total_dur, total_dur))
        
    return regions

def extract_map(file_path):
    file_path = os.path.abspath(file_path)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    print(f"[*] Extracting audio data from: {file_path}")
    audio, sr = decode_audio_ffmpeg(file_path)
    total_sec = len(audio) / sr
    
    hz, global_note, cents, global_midi = extract_root_hps(audio, sr)
    bpm = estimate_bpm_onsets(audio, sr)
    
    # Generate beat markers
    spb = 60.0 / bpm
    total_beats = int(math.ceil(total_sec / spb))
    beat_markers = []
    for b in range(total_beats):
        ts = b * spb
        if ts > total_sec:
            break
        beat_markers.append({
            "index": b,
            "timestamp_seconds": round(ts, 3),
            "sample_index": int(ts * sr),
            "is_downbeat": (b % 4 == 0),
            "bar": (b // 4) + 1,
            "beat": (b % 4) + 1
        })
        
    # Detect regions / chunks
    raw_regions = detect_regions(audio, sr)
    chunk_maps = []
    
    for i, (st, et, dur) in enumerate(raw_regions):
        selected_index = int(st * sr)
        e_index = int(et * sr)
        chunk_audio = audio[selected_index:e_index]
        
        c_hz, c_note, c_cents, c_midi = extract_root_hps(chunk_audio, sr)
        c_peak = float(np.max(np.abs(chunk_audio))) if len(chunk_audio) > 0 else 0.0
        
        # Nearest beat marker
        nearest_b = min(range(len(beat_markers)), key=lambda index: abs(beat_markers[index]["timestamp_seconds"] - st)) if beat_markers else 0
        
        chunk_maps.append({
            "chunk_index": i,
            "start_seconds": round(st, 3),
            "end_seconds": round(et, 3),
            "duration_seconds": round(dur, 3),
            "root_note_name": c_note or global_note or "C3",
            "root_midi_note": c_midi if c_midi >= 0 else global_midi,
            "root_frequency_hz": round(c_hz, 2),
            "pitch_hz": round(c_hz, 2),
            "cents_offset": round(c_cents, 1),
            "peak_amplitude": round(c_peak, 3),
            "nearest_beat_index": nearest_b
        })
        
    result_map = {
        "file_name": os.path.basename(file_path),
        "file_path": file_path,
        "length_seconds": round(total_sec, 3),
        "sample_rate": sr,
        "global_root_note": global_note or "C3",
        "global_midi_note": global_midi if global_midi >= 0 else 60,
        "global_bpm": bpm,
        "total_beats": len(beat_markers),
        "total_chunks": len(chunk_maps),
        "beat_markers": beat_markers,
        "chunk_maps": chunk_maps
    }
    
    # Save .PEAK sidecar — the ANALYZER's format, 2 of its 10 groups.
    peak_path = os.path.splitext(file_path)[0] + ".PEAK"
    musicality = {
        "pitch_hz": round(hz, 2),
        "root_note_name": global_note or "C3",
        "root_frequency_hz": round(hz, 2),
        "root_cents_offset": round(cents, 1),
        "beats_per_minute": bpm,
        "root_midi_note": global_midi if global_midi >= 0 else 60,
        "note_root_key_beat_marker_map": result_map,
    }
    peak_sidecar = {
        "metadata": {
            "name": os.path.basename(file_path),
            "path": file_path,
            "length_seconds": round(total_sec, 3),
            "sample_rate": sr,
            "channels": 1
        },
        "musicality": musicality
    }

    # MERGE, NEVER CLOBBER. A full analyzer sidecar is nine groups of measurement
    # and this CLI measures two of them; overwriting it deletes the other seven
    # and leaves a file that still parses, still opens, and has silently lost the
    # scan. Only a document that is already the analyzer's is merged into — a
    # `peak-lens-sidecar` shares the extension and no field, so merging into one
    # would build a chimera that validates as neither.
    existing = None
    if os.path.exists(peak_path):
        try:
            with open(peak_path) as f:
                candidate = json.load(f)
            if isinstance(candidate, dict) and "analyzer_version" in (candidate.get("metadata") or {}):
                existing = candidate
        except (OSError, ValueError) as err:
            print(f"[!] Existing sidecar at {peak_path} is unreadable ({err}); "
                  f"it is left alone and nothing is written.")
            return result_map

    if existing is not None:
        # The analyzer's own numbers win on every key both writers spell — its
        # pitch and tempo come from the full DSP pipeline, this one's from an
        # HPS over 65,536 samples. Only the map is contributed, and only the
        # keys the Rust struct does not carry are added to a map already there.
        target = existing.setdefault("musicality", {})
        prior = target.get("note_root_key_beat_marker_map")
        if isinstance(prior, dict):
            for key, value in result_map.items():
                prior.setdefault(key, value)
        else:
            target["note_root_key_beat_marker_map"] = result_map
        peak_sidecar = existing
        print(f"[+] Merged note root key beat marker map into the existing "
              f"analyzer sidecar: {peak_path}")
    else:
        print(f"[+] Written note root key beat marker map to sidecar: {peak_path}")

    with open(peak_path, "w") as f:
        json.dump(peak_sidecar, f, indent=2)

    return result_map

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract note root key beat marker map from audio file.")
    parser.add_argument("file_path", help="Path to audio file (e.g. /home/anthony/Downloads/01 Track 01.m4a)")
    args = parser.parse_args()
    
    res = extract_map(args.file_path)
    print(json.dumps(res, indent=2))
