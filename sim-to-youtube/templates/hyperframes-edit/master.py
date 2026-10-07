"""BS.1770-4 loudness meter and a look-ahead true-peak limiter (numpy, fully vectorized)."""
from __future__ import annotations

import numpy as np
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import lfilter, resample_poly

SR = 48000
K1_B = [1.53512485958697, -2.69169618940638, 1.19839281085285]
K1_A = [1.0, -1.69065929318241, 0.73248077421585]
K2_B = [1.0, -2.0, 1.0]
K2_A = [1.0, -1.99004745483398, 0.99007225036621]


def _as2d(x):
    return x[:, None] if x.ndim == 1 else x


def block_loudness(x, block=0.4, overlap=0.75):
    x = _as2d(x)
    y = lfilter(K2_B, K2_A, lfilter(K1_B, K1_A, x, axis=0), axis=0)
    size = int(block * SR)
    hop = int(size * (1 - overlap))
    csum = np.concatenate([np.zeros((1, y.shape[1])), np.cumsum(y ** 2, axis=0)])
    starts = np.arange(0, len(y) - size + 1, hop)
    z = (csum[starts + size] - csum[starts]) / size          # mean square per channel
    return z.sum(axis=1), starts


def integrated(x):
    zs, _ = block_loudness(x)
    lk = -0.691 + 10 * np.log10(zs + 1e-20)
    abs_gate = zs[lk > -70]
    if not len(abs_gate):
        return -np.inf
    rel = -0.691 + 10 * np.log10(abs_gate.mean()) - 10
    keep = zs[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(keep.mean())


def true_peak_db(x):
    up = resample_poly(_as2d(x), 4, 1, axis=0)
    return 20 * np.log10(np.abs(up).max() + 1e-20)


def limit(x, ceiling_db=-1.8, lookahead=0.003, release_db_per_s=60.0):
    x2 = _as2d(x)
    up = np.abs(resample_poly(x2, 4, 1, axis=0)).max(axis=1)
    n = len(x2)
    up = up[: n * 4].reshape(n, 4).max(axis=1)
    c = 10 ** (ceiling_db / 20)
    req_db = np.minimum(0.0, 20 * np.log10(c / np.maximum(up, 1e-12)))
    L = max(1, int(lookahead * SR))
    # forward-looking min so the gain is already down when the peak arrives, then a box ramp
    fwd = minimum_filter1d(req_db, size=L, origin=-(L // 2) if L % 2 else -(L // 2) + 1, mode="nearest")
    fwd = np.minimum(fwd, req_db)
    ramp = uniform_filter1d(fwd, size=L, origin=(L - 1) // 2 if L > 1 else 0, mode="nearest")
    ramp = np.minimum(ramp, fwd)
    # linear-in-dB release: g[n] = min_k (ramp[k] + R (n-k))  ==  R n + cummin(ramp - R k)
    R = release_db_per_s / SR
    idx = np.arange(n)
    rel = R * idx + np.minimum.accumulate(ramp - R * idx)
    g_db = np.minimum(0.0, np.minimum(rel, ramp))
    out = x2 * (10 ** (g_db / 20))[:, None]
    return (out[:, 0] if x.ndim == 1 else out), g_db


def master(x, target_lufs=-16.0, tp_db=-1.5, margin=0.35, iterations=3):
    y = x.copy()
    report = []
    for it in range(iterations):
        I = integrated(y)
        y = y * 10 ** ((target_lufs - I) / 20)
        y, g = limit(y, tp_db - margin)
        report.append(dict(iter=it, pre_I=round(I, 2), post_I=round(integrated(y), 2),
                           tp=round(true_peak_db(y), 2), max_gr=round(-g.min(), 2)))
    I = integrated(y)
    y = y * 10 ** ((target_lufs - I) / 20)
    report.append(dict(final_I=round(integrated(y), 2), final_tp=round(true_peak_db(y), 2)))
    return y, report
