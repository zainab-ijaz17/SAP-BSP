import React from "react";

function formatMaterialNumber(material) {
  if (!material) return "-";
  return String(material).replace(/^0+/, "") || "0";
}

// Shows the line items fetched for a STPO (see GrStpoPage in ReelReceivingPage.js).
// Row click previews/selects a line item; the × removes it before Next is pressed.
function LineItemsTable({ lineItems, selectedLineItem, onSelectLineItem, onRemoveLineItem }) {
  if (!lineItems || lineItems.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: "1.5rem", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
            <th style={{ padding: "0.5rem" }}>Item</th>
            <th style={{ padding: "0.5rem" }}>Material</th>
            <th style={{ padding: "0.5rem" }}>Description</th>
            <th style={{ padding: "0.5rem" }}>Qty</th>
            <th style={{ padding: "0.5rem" }}>UoM</th>
            <th style={{ padding: "0.5rem" }}></th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => {
            const isSelected = selectedLineItem?.lineItem === item.lineItem;
            return (
              <tr
                key={item.lineItem}
                onClick={() => onSelectLineItem?.(isSelected ? null : item)}
                style={{
                  borderBottom: "1px solid #f1f5f9",
                  cursor: onSelectLineItem ? "pointer" : "default",
                  backgroundColor: isSelected ? "#eff6ff" : "transparent",
                }}
              >
                <td style={{ padding: "0.5rem" }}>{item.lineItem}</td>
                <td style={{ padding: "0.5rem" }}>{formatMaterialNumber(item.materialNumber)}</td>
                <td style={{ padding: "0.5rem" }}>{item.materialDescription || "-"}</td>
                <td style={{ padding: "0.5rem" }}>{item.quantity ?? "-"}</td>
                <td style={{ padding: "0.5rem" }}>{item.uom || "-"}</td>
                <td style={{ padding: "0.5rem", textAlign: "right" }}>
                  {onRemoveLineItem && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveLineItem(item); }}
                      style={{ border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", fontWeight: 600, fontSize: "1.1rem" }}
                      aria-label={`Remove line item ${item.lineItem}`}
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default LineItemsTable;
