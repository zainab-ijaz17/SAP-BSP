import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserCredentials } from '../api';
import PageHeader from '../components/PageHeader';

// Field names follow ZREEL_RECV_SRV's confirmed BatchInfo/ReceiveItem schema
// (Description/StorLoc/ReelWidth/WidthUnit/WidthMm), since ZREEL_DLV_SRV's own
// $metadata hasn't been shared yet — fallbacks cover older guesses + common SAP names.
const mapDeliveryItem = (item) => ({
  Batch: item.Batch || item.Charg || "",
  Material: item.Material || item.Matnr || "",
  Description: item.Description || item.MatDesc || item.Maktx || "",
  ReelWidth: item.ReelWidth || item.Width || "",
  WidthUnit: item.WidthUnit || "",
  WidthMm: item.WidthMm || "",
  Quantity: item.Quantity || item.Menge || "",
  Uom: item.Uom || item.Meins || item.EntryUom || "",
  ItemNo: item.ItemNo || item.ItemNumber || item.Posnr || "",
  Plant: item.Plant || item.Werks || "",
  StorLoc: item.StorLoc || item.StgeLoc || item.Lgort || "",
});

const fieldLabels = {
  Batch: "Batch Number",
  Material: "Material Number",
  Description: "Material Description",
  ReelWidth: "Reel Width",
  WidthUnit: "Width Unit",
  WidthMm: "Width (mm)",
  Quantity: "Quantity",
  Uom: "Unit of Measure",
  ItemNo: "Item Number",
  Plant: "Plant",
  StorLoc: "Storage Location",
};

function ReelReceivingPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [dnNumber, setDnNumber] = useState("");
  const [deliveryNumber, setDeliveryNumber] = useState("");
  const [deliveryItems, setDeliveryItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailsPopup, setShowDetailsPopup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDelivery = async () => {
    setError(null);
    const input = dnNumber.trim().toUpperCase();
    if (!input) return setError("Please enter a delivery note number.");

    setLoading(true);
    try {
      const creds = getUserCredentials();
      if (!creds) throw new Error("User not authenticated. Please log in again.");

      const baseUrl = "https://devspace.test.apimanagement.eu10.hana.ondemand.com/reel-dlv";
      const endpoint = "/sap/opu/odata/sap/ZREEL_DLV_SRV/DeliveryItemSet";
      const query = `?$filter=DeliveryNumber eq '${encodeURIComponent(input)}'&$format=json`;

      const res = await fetch(`${baseUrl}${endpoint}${query}`, {
        headers: {
          "Authorization": `Basic ${btoa(`${creds.username}:${creds.password}`)}`,
          "X-User-Environment": creds.environment,
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("Delivery fetch failed:", {
          status: res.status,
          statusText: res.statusText,
          wwwAuthenticate: res.headers.get("www-authenticate"),
          body,
        });
        throw new Error(`Failed to fetch delivery note information (HTTP ${res.status}).`);
      }
      const json = await res.json();
      const results = json?.d?.results || [];
      if (results.length === 0) throw new Error("No batches found for this delivery note.");

      setDeliveryNumber(input);
      setDeliveryItems(results.map(mapDeliveryItem));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setDnNumber("");
    setDeliveryNumber("");
    setDeliveryItems([]);
    setSelectedItem(null);
    setShowDetailsPopup(false);
    setError(null);
  };

  const openDetails = (item) => {
    setSelectedItem(item);
    setShowDetailsPopup(true);
  };

  const closeDetails = () => {
    setSelectedItem(null);
    setShowDetailsPopup(false);
  };

  const handleBack = () => {
    navigate("/main");
  };

  const next = () => {
    if (deliveryItems.length === 0) return setError("Please fetch a delivery note with at least one batch.");
    navigate("/scan", {
      state: {
        documentData: {
          d: {
            Mblnr: deliveryNumber,
            DeliveryNumber: deliveryNumber,
            RefItemSet: { results: deliveryItems },
          },
        },
      },
    });
  };

  return (
    <div className="app-container">
      <PageHeader user={user} onLogout={onLogout} />

      <div style={{ maxWidth: "700px", margin: "20px auto", padding: "1rem" }}>
        <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
          <h2 style={{ marginTop: 0 }}>Reel Receiving</h2>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              value={dnNumber}
              onChange={(e) => setDnNumber(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && fetchDelivery()}
              placeholder="Enter or scan delivery note number"
              style={{ flex: 1, padding: "0.85rem", borderRadius: "8px", border: "1px solid #d1d5db" }}
            />
            <button onClick={fetchDelivery} disabled={loading} style={{ padding: "0.85rem 1.5rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}>
              {loading ? "Loading..." : "Fetch"}
            </button>
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <button
              onClick={clearAll}
              disabled={deliveryItems.length === 0 || loading}
              style={{ width: "100%", padding: "0.85rem", background: "#ef4444", color: "#fff", border: "none", borderRadius: "8px" }}
            >
              Clear
            </button>
          </div>

          <div style={{ marginTop: "0.75rem", textAlign: "center", fontWeight: "600", color: "#374151", padding: "0.75rem", background: "#f3f4f6", borderRadius: "8px" }}>
            {deliveryNumber ? `Delivery Note ${deliveryNumber} • ` : ""}Batches Found: {deliveryItems.length}
          </div>

          {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{error}</div>}

          {deliveryItems.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: "1rem" }}>
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
                  {deliveryItems.map((item, index) => (
                    <tr
                      key={`${item.Batch}-${index}`}
                      onClick={() => openDetails(item)}
                      style={{ cursor: "pointer", background: selectedItem?.Batch === item.Batch ? "#e0f2fe" : "white", borderBottom: "12px solid #f3f4f6" }}
                    >
                      <td style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>{item.Batch || "-"}</td>
                      <td style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>{item.ReelWidth || "-"} {item.WidthUnit || ""}</td>
                      <td style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>{item.Description || "-"}</td>
                      <td style={{ textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>{item.Quantity || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ position: "fixed", bottom: "20px", left: "20px" }}>
        <button onClick={handleBack} disabled={loading} style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px" }}>
          Back
        </button>
      </div>

      <div style={{ position: "fixed", bottom: "20px", right: "20px" }}>
        <button onClick={next} disabled={deliveryItems.length === 0 || loading} style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}>
          Next
        </button>
      </div>

      {showDetailsPopup && selectedItem && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 60 }}
          onClick={closeDetails}
        >
          <div
            style={{ width: "100%", maxWidth: "620px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.25)", maxHeight: "80vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Batch Details</h3>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {Object.entries(selectedItem).map(([key, value]) => (
                    <tr key={key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.75rem", width: "45%", color: "#374151", fontWeight: 600, background: "#f9fafb" }}>
                        {fieldLabels[key] || key}
                      </td>
                      <td style={{ padding: "0.75rem", color: "#111827" }}>{String(value ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.25rem" }}>
              <button onClick={closeDetails} style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReelReceivingPage;
