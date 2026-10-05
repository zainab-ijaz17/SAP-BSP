import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import LoadingButton from "../components/LoadingButton";
import ConfirmModal from "../components/ConfirmModal";
import LineItemsTable from "../components/LineItemsTable";
import { fetchOutboundDelivery } from "../api/stpoGoodsReceiptApi";

// GR for Outbound Delivery — Page 1: fetch the outbound delivery the supplying plant
// shipped for a STPO, then hand off to GrStpo2Page (GRposting.js) for scanning and
// posting, exactly like GrStpoPage (ReelReceivingPage.js) does. The delivery already
// says which Batch(es) and quantities were shipped, and which STPO/STPO item each one
// belongs to (fetchOutboundDelivery() in ../api/stpoGoodsReceiptApi.js), so no extra
// batch lookup is needed on Next. The table shows one row per STPO line item with the
// quantity summed across its batches; Next forwards one row per Batch.
function groupByLineItem(deliveryItems) {
  const grouped = new Map();
  deliveryItems.forEach((item) => {
    const existing = grouped.get(item.lineItem);
    if (existing) {
      existing.quantity += Number(item.quantity) || 0;
    } else {
      grouped.set(item.lineItem, { ...item, quantity: Number(item.quantity) || 0 });
    }
  });
  return Array.from(grouped.values());
}

function GrOutboundDeliveryPage({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [deliveryNumber, setDeliveryNumber] = useState(location.state?.prefillDeliveryNumber || "");
  const [delivery, setDelivery] = useState(location.state?.prefillDelivery || null);
  const [previewItem, setPreviewItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const deliveryItems = delivery?.lineItems || [];
  const lineItems = groupByLineItem(deliveryItems);

  const handleFetch = async () => {
    setError("");
    setPreviewItem(null);
    setDelivery(null);

    if (!deliveryNumber.trim()) {
      setError("Please enter a Delivery Note.");
      return;
    }

    setLoading(true);
    try {
      setDelivery(await fetchOutboundDelivery(deliveryNumber));
    } catch (err) {
      setError(err.message || "Failed to fetch outbound delivery.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (deliveryItems.length === 0) {
      setError("Please fetch an outbound delivery first.");
      return;
    }

    navigate("/grstpo2", {
      state: {
        stpoNumber: delivery.stpoNumber,
        lineItems: deliveryItems,
        deliveryNote: delivery.deliveryNumber,
        title: "GR for Outbound Delivery Details",
        backPath: "/gr-outbound-delivery",
        backState: { prefillDeliveryNumber: deliveryNumber, prefillDelivery: delivery },
      },
    });
  };

  const handleRemoveLineItem = (item) => {
    setDelivery((prev) => ({ ...prev, lineItems: prev.lineItems.filter((li) => li.lineItem !== item.lineItem) }));
    if (previewItem?.lineItem === item.lineItem) setPreviewItem(null);
  };

  const handleReset = () => {
    setDeliveryNumber("");
    setDelivery(null);
    setPreviewItem(null);
    setError("");
  };

  const confirmClearAll = () => {
    handleReset();
    setShowClearConfirm(false);
  };

  return (
    <div className="app-container">
      <PageHeader user={user} onLogout={onLogout} />

      <div style={{ maxWidth: "600px", margin: "20px auto", padding: "1rem" }}>
        <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
          <h2 style={{ marginTop: 0 }}>GR for Outbound Delivery</h2>

          <div className="form-group">
            <label>Delivery Note</label>
            <input
              className="form-control"
              value={deliveryNumber}
              onChange={(e) => setDeliveryNumber(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              placeholder="Enter Outbound Delivery Number"
              disabled={loading}
            />
          </div>

          {delivery?.stpoNumber && (
            <div style={{ marginTop: "-0.5rem", marginBottom: "0.5rem", fontSize: "0.85rem", color: "#374151" }}>
              STPO: <strong>{delivery.stpoNumber}</strong>
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "center" }}>
            <LoadingButton onClick={handleFetch} loading={loading}>Fetch</LoadingButton>
            <LoadingButton onClick={() => setShowClearConfirm(true)} variant="danger" disabled={loading}>Clear All</LoadingButton>
          </div>

          <LineItemsTable
            lineItems={lineItems}
            selectedLineItem={previewItem}
            onSelectLineItem={setPreviewItem}
            onRemoveLineItem={handleRemoveLineItem}
          />
        </div>
      </div>

      <div style={{ position: "fixed", bottom: "20px", left: "20px" }}>
        <LoadingButton onClick={() => navigate("/main")} variant="neutral" disabled={loading}>Back</LoadingButton>
      </div>

      <div style={{ position: "fixed", bottom: "20px", right: "20px" }}>
        <LoadingButton onClick={handleNext} loading={loading} disabled={deliveryItems.length === 0}>Next</LoadingButton>
      </div>

      <ConfirmModal
        open={showClearConfirm}
        title="Clear All Entries"
        message="Are you sure you want to clear all entries? This action cannot be undone."
        confirmLabel="Yes, Clear All"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={confirmClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}

export default GrOutboundDeliveryPage;
