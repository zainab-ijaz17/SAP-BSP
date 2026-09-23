import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getUserCredentials } from "../api";
import PageHeader from "../components/PageHeader";

// Routed through our backend (not called directly from the browser) since
// SAP API Management doesn't return CORS headers for browser requests; the
// backend also fetches its own CSRF token server-side before posting.
// TODO: switch to the deployed CF app (https://sap-app1.cfapps.eu10-004.hana.ondemand.com)
// once the reel routes are pushed there — for now the backend only runs locally.
const BACKEND_BASE_URL = "http://localhost:5000";

function generateUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Maps a matched batch (as produced by ReelReceivingPage/ScanPage) onto the exact
// ReceiveItem fields from ZREEL_RECV_SRV's $metadata.
const buildReceiveItem = (uuid, batch) => ({
  Uuid: uuid,
  Batch: batch.Batch || batch.scannedBatch || "",
  Material: batch.Material || "",
  Description: batch.Description || batch.MatDesc || batch.Maktx || "",
  Quantity: batch.Quantity || "",
  Uom: batch.Uom || batch.EntryUom || "",
  StorLoc: batch.StorLoc || batch.StgeLoc || batch.Lgort || "",
  ReelWidth: batch.ReelWidth || batch.Width || "",
  WidthUnit: batch.WidthUnit || "",
  WidthMm: batch.WidthMm || "",
});

function ReelConfirmPage({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const documentData = location.state?.documentData;
  const matchedBatches = location.state?.materials || [];

  const [simulate, setSimulate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [showResultPopup, setShowResultPopup] = useState(false);

  useEffect(() => {
    if (matchedBatches.length === 0) {
      navigate("/reel-receiving");
    }
  }, [matchedBatches, navigate]);

  const handleConfirm = async () => {
    setError("");
    setLoading(true);
    try {
      const creds = getUserCredentials();
      if (!creds) throw new Error("User not authenticated. Please log in again.");

      const uuid = generateUuid();

      const payload = {
        Uuid: uuid,
        Simulate: simulate,
        ReceiveItemSet: matchedBatches.map((b) => buildReceiveItem(uuid, b)),
      };

      const res = await fetch(`${BACKEND_BASE_URL}/api/reel/rcv/receive`, {
        method: "POST",
        headers: {
          "X-User-Auth": btoa(`${creds.username}:${creds.password}`),
          "X-User-Environment": creds.environment,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to post receipt.");
      }

      setResult(json?.d || json);
      setShowResultPopup(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const closeResultPopup = () => {
    setShowResultPopup(false);
  };

  const handleDoneAfterPost = () => {
    setShowResultPopup(false);
    navigate("/main");
  };

  const handleBack = () => {
    navigate("/scan", { state: { documentData } });
  };

  if (matchedBatches.length === 0) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app-container">
      <PageHeader user={user} onLogout={onLogout} />

      <div style={{ maxWidth: "700px", margin: "20px auto", padding: "1rem" }}>
        <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
          <h2 style={{ marginTop: 0 }}>Confirm Receipt</h2>
          <p style={{ color: "#6b7280", marginTop: "-0.5rem" }}>
            Posts movement 311 (transfer to receiving location), then, if not a test run, movement 309 (reclassify to standard batch).
          </p>

          {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{error}</div>}

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "1rem 0", padding: "0.85rem", background: "#f3f4f6", borderRadius: "8px" }}>
            <input
              type="checkbox"
              id="simulate"
              checked={simulate}
              onChange={(e) => setSimulate(e.target.checked)}
            />
            <label htmlFor="simulate" style={{ fontWeight: 500, cursor: "pointer" }}>
              Test mode (simulate only — nothing is posted)
            </label>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>Batch #</th>
                  <th style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>Width</th>
                  <th style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>Description</th>
                  <th style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {matchedBatches.map((batch, index) => (
                  <tr key={`${batch.Batch}-${index}`} style={{ borderBottom: "12px solid #f3f4f6" }}>
                    <td style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>{batch.Batch || batch.scannedBatch || "-"}</td>
                    <td style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>
                      {batch.ReelWidth || batch.Width || "-"} {batch.WidthUnit || ""}
                    </td>
                    <td style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>{batch.Description || batch.MatDesc || batch.Maktx || "-"}</td>
                    <td style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>{batch.Quantity || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ position: "fixed", bottom: "20px", left: "20px" }}>
        <button onClick={handleBack} disabled={loading} style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px" }}>
          Back
        </button>
      </div>

      <div style={{ position: "fixed", bottom: "20px", right: "20px" }}>
        <button onClick={handleConfirm} disabled={loading} style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}>
          {loading ? "Posting..." : "Confirm"}
        </button>
      </div>

      {showResultPopup && result && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 60 }}>
          <div style={{ width: "100%", maxWidth: "520px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
            <h3 style={{ marginTop: 0 }}>{simulate ? "Test Run Result" : (result.Success ? "Posted Successfully" : "Posting Failed")}</h3>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.9rem", background: "#f9fafb" }}>
              {!simulate && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <strong>311 Material Doc:</strong>
                    <span>{result.MatDoc311 || "-"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <strong>309 Material Doc:</strong>
                    <span>{result.MatDoc309 || "-"}</span>
                  </div>
                </>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>Success:</strong>
                <span>{result.Success ? "Yes" : "No"}</span>
              </div>
              {result.Message && (
                <div style={{ marginTop: "0.75rem", color: "#374151" }}>{result.Message}</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button
                onClick={closeResultPopup}
                style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px" }}
              >
                Close
              </button>
              {!simulate && result.Success && (
                <button
                  onClick={handleDoneAfterPost}
                  style={{ padding: "0.85rem 2rem", background: "#22c55e", color: "#fff", border: "none", borderRadius: "8px" }}
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReelConfirmPage;
