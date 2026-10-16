// Minimal in-memory, per-IP rate limiter for public endpoints (no dependency).
// Limits are per server instance and reset on restart — enough to stop scripted
// form spam without blocking a busy reception desk sharing one IP.
module.exports = function rateLimit({ windowMs, max, message }) {
    const hits = new Map();

    setInterval(() => {
        const cutoff = Date.now() - windowMs;
        for (const [ip, times] of hits) {
            const recent = times.filter((t) => t > cutoff);
            if (recent.length) hits.set(ip, recent);
            else hits.delete(ip);
        }
    }, windowMs).unref();

    return (req, res, next) => {
        const now = Date.now();
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const recent = (hits.get(ip) || []).filter((t) => t > now - windowMs);
        if (recent.length >= max) {
            res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
            return res.status(429).json({ success: false, message });
        }
        recent.push(now);
        hits.set(ip, recent);
        next();
    };
};
