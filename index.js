const express = require("express");
const app = express();

// Function to get client IP from request
const getClientIP = (req) => {
  // Check for IP from proxy headers first
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    // Get the first IP if multiple are present
    return forwardedFor.split(",")[0].trim();
  }

  // Check for other common proxy headers
  const realIP = req.headers["x-real-ip"];
  if (realIP) {
    return realIP;
  }

  // Fall back to remote address
  return req.socket.remoteAddress;
};

app.set("trust proxy", true);

const rateLimiter = (requestsPerWindow, windowInMinutes) => {
  // Store request counts for each IP
  const requests = new Map();

  return (req, res, next) => {
    const clientIP = getClientIP(req);
    const now = Date.now();
    const windowMs = windowInMinutes * 60 * 1000;

    console.log("Client IP:", clientIP);

    // Get or create client's request history
    if (!requests.has(clientIP)) {
      requests.set(clientIP, []);
    }

    // Clean old requests outside time window
    const clientRequests = requests.get(clientIP);
    const validRequests = clientRequests.filter(
      (timestamp) => now - timestamp < windowMs
    );

    if (validRequests.length < requestsPerWindow) {
      // Allow the request
      validRequests.push(now);
      requests.set(clientIP, validRequests);

      // Add rate limit info to response headers
      res.set({
        "X-RateLimit-Limit": requestsPerWindow,
        "X-RateLimit-Remaining": requestsPerWindow - validRequests.length,
      });

      next();
    } else {
      // Calculate time until next available slot
      const oldestRequest = validRequests[0];
      const resetTime = Math.ceil((oldestRequest + windowMs - now) / 1000);

      res.status(429).json({
        error: "Too Many Requests",
        message: `Try again in ${resetTime} seconds`,
        clientIP: clientIP, // Helpful for debugging (remove in production)
      });
    }
  };
};

app.use(rateLimiter(5, 1));

app.get("/api/test", (req, res) => {
  res.json({
    message: "Success",
    yourIP: getClientIP(req),
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
