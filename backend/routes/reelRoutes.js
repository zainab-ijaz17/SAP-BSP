// backend/routes/reelRoutes.js
// Proxies the Reel Receiving DLV/RECV OData services through this backend so the
// browser never calls SAP API Management directly (that gateway has no CORS
// headers configured, which is why direct fetches from the frontend fail).
const express = require("express");
const axios = require("axios");
const https = require("https");

const router = express.Router();

// The reel-dlv/reel-rcv API Management proxies' target endpoints already point
// at the full backend service root (/sap/opu/odata/sap/ZREEL_..._SRV) — the
// service itself works fine when hit directly on the backend at that path
// (confirmed via SAP Gateway Client), but going through the proxy with that
// path repeated on top produces "Resource not found for the segment 'sap'"
// (a duplicated path segment). So no extra service path is appended here.
const REEL_DLV_URL = process.env.SAP_API_MGMT_REEL_DLV_URL || "https://devspace.test.apimanagement.eu10.hana.ondemand.com/reel-dlv";
const REEL_DLV_SERVICE_PATH = process.env.REEL_DLV_SERVICE_PATH || "";
const REEL_RCV_URL = process.env.SAP_API_MGMT_REEL_RCV_URL || "https://devspace.test.apimanagement.eu10.hana.ondemand.com/reel-rcv";
const REEL_RCV_SERVICE_PATH = process.env.REEL_RCV_SERVICE_PATH || "";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const getUserFromHeaders = (req) => {
  const userAuthHeader = req.headers["x-user-auth"];
  const userEnvironment = req.headers["x-user-environment"] || "dev";
  if (!userAuthHeader) throw new Error("User credentials required");

  let username, password;
  try {
    const decoded = Buffer.from(userAuthHeader, "base64").toString();
    [username, password] = decoded.split(":");
    if (!username || !password) throw new Error();
  } catch {
    throw new Error("Invalid user credentials");
  }
  return { username, password, environment: userEnvironment };
};

const handleAuthError = (res, error) => {
  if (error.message === "User credentials required" || error.message === "Invalid user credentials") {
    res.status(401).json({ error: error.message });
    return true;
  }
  return false;
};

// GET delivery items for a DN (DLV service, read-only)
router.get("/dlv/delivery/:dn", async (req, res) => {
  const { dn } = req.params;
  if (!dn) return res.status(400).json({ error: "Delivery number is required" });

  try {
    const { username, password } = getUserFromHeaders(req);
    const url = `${REEL_DLV_URL}${REEL_DLV_SERVICE_PATH}/DeliveryItemSet?$filter=DeliveryNumber eq '${encodeURIComponent(dn)}'&$format=json`;

    const response = await axios.get(url, {
      httpsAgent,
      auth: { username, password },
      headers: { Accept: "application/json" },
      validateStatus: () => true,
      timeout: 30000,
    });

    if (response.status !== 200) {
      console.error("Reel DLV lookup failed:", { status: response.status, data: response.data });
      return res.status(response.status).json({ error: "Error fetching delivery items from SAP", data: response.data });
    }

    res.json(response.data);
  } catch (error) {
    if (handleAuthError(res, error)) return;
    console.error("Reel DLV fetch error:", error.message);
    res.status(500).json({ error: "Failed to fetch delivery items", details: error.message });
  }
});

// GET batch info by key (RECV service, read-only — Batch is not filterable)
router.get("/rcv/batch/:batch", async (req, res) => {
  const { batch } = req.params;
  if (!batch) return res.status(400).json({ error: "Batch number is required" });

  try {
    const { username, password } = getUserFromHeaders(req);
    const url = `${REEL_RCV_URL}${REEL_RCV_SERVICE_PATH}/BatchInfoSet('${encodeURIComponent(batch)}')?$format=json`;

    const response = await axios.get(url, {
      httpsAgent,
      auth: { username, password },
      headers: { Accept: "application/json" },
      validateStatus: () => true,
      timeout: 30000,
    });

    if (response.status === 404) {
      return res.status(404).json({ error: "Batch not found" });
    }
    if (response.status !== 200) {
      console.error("Reel RCV batch lookup failed:", { status: response.status, data: response.data });
      return res.status(response.status).json({ error: "Error fetching batch info from SAP", data: response.data });
    }

    res.json(response.data);
  } catch (error) {
    if (handleAuthError(res, error)) return;
    console.error("Reel RCV batch lookup error:", error.message);
    res.status(500).json({ error: "Failed to fetch batch info", details: error.message });
  }
});

// POST the receipt (RECV service — deep insert). Fetches its own CSRF token
// server-side so the browser never needs cross-origin cookies for this.
router.post("/rcv/receive", async (req, res) => {
  try {
    const { username, password } = getUserFromHeaders(req);

    const csrfResponse = await axios.get(`${REEL_RCV_URL}${REEL_RCV_SERVICE_PATH}/`, {
      httpsAgent,
      auth: { username, password },
      headers: { "X-CSRF-Token": "Fetch", Accept: "application/json" },
      validateStatus: () => true,
      timeout: 30000,
    });

    const csrfToken = csrfResponse.headers["x-csrf-token"];
    if (!csrfToken) {
      console.error("Reel RCV CSRF fetch failed:", { status: csrfResponse.status, data: csrfResponse.data });
      return res.status(400).json({ error: "Failed to obtain CSRF token from the RECV service." });
    }

    const setCookieHeaders = csrfResponse.headers["set-cookie"];
    const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders.map((c) => c.split(";")[0]).join("; ") : (setCookieHeaders || "");

    const postResponse = await axios.post(`${REEL_RCV_URL}${REEL_RCV_SERVICE_PATH}/ReceiveConfirmationSet`, req.body, {
      httpsAgent,
      auth: { username, password },
      headers: {
        "X-CSRF-Token": csrfToken,
        Cookie: cookies,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      validateStatus: () => true,
      timeout: 30000,
    });

    if (postResponse.status >= 400) {
      const errorMessage = postResponse.data?.error?.message?.value || postResponse.data?.error?.message || "Failed to post receipt.";
      console.error("Reel RCV post failed:", { status: postResponse.status, data: postResponse.data });
      return res.status(postResponse.status).json({ error: errorMessage, raw: postResponse.data });
    }

    res.json(postResponse.data);
  } catch (error) {
    if (handleAuthError(res, error)) return;
    console.error("Reel RCV post error:", error.message);
    res.status(500).json({ error: "Failed to post receipt", details: error.message });
  }
});

module.exports = router;
