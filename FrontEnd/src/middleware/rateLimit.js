/** Tiny in-memory limiter (per IP) for login/registration attempts. */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 5000) hits.clear();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      const err = new Error('محاولات كثيرة. يرجى الانتظار قليلًا ثم إعادة المحاولة.');
      err.status = 429;
      return next(err);
    }
    recent.push(now);
    hits.set(req.ip, recent);
    return next();
  };
}

module.exports = rateLimit;
