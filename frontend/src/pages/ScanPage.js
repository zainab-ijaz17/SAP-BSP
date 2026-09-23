import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getUserCredentials } from '../api';
import PageHeader from '../components/PageHeader';

// Routed through our backend (not called directly from the browser) since
// SAP API Management doesn't return CORS headers for browser requests.
// TODO: switch to the deployed CF app (https://sap-app1.cfapps.eu10-004.hana.ondemand.com)
// once the reel routes are pushed there — for now the backend only runs locally.
const BACKEND_BASE_URL = "http://localhost:5000";

function ScanPage({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const documentData = location.state?.documentData; // Full OData response
  const materials = documentData?.d?.RefItemSet?.results || [];
  
  const [scannedBatch, setScannedBatch] = useState('');
  const [matchedBatches, setMatchedBatches] = useState([]); // { material, isMatched: true/false }
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showDetailsPopup, setShowDetailsPopup] = useState(false);
  const [showLeftovers, setShowLeftovers] = useState(false);
  const [finishOffloadingClicked, setFinishOffloadingClicked] = useState(false);
  const [expandedCards, setExpandedCards] = useState({});
  const [showFullInfoPopup, setShowFullInfoPopup] = useState(false);
  const [selectedFullInfoBatch, setSelectedFullInfoBatch] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!documentData || !materials.length) {
      navigate('/reel-receiving');
    }
    // Focus input on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [documentData, materials, navigate]);

  // Extract batch number from barcode (handle various formats).
  // Batches are stored in SAP as 10-char zero-padded numbers, same as the DN,
  // so pad short scans/manual entries out to match BatchInfoSet's key.
  const extractBatchNumber = (barcode) => {
    if (!barcode) return '';
    const cleaned = barcode.trim().toUpperCase();
    if (!cleaned) return '';
    return /^[0-9]+$/.test(cleaned) ? cleaned.padStart(10, '0') : cleaned;
  };

  const addScannedBatch = (entry) => {
    setMatchedBatches(prev => {
      const key = entry.Batch || entry.scannedBatch;
      const exists = prev.some(b => (b.Batch || b.scannedBatch) === key);
      if (exists) return prev;
      return [...prev, entry];
    });
  };

  const handleScan = async () => {
    if (!scannedBatch.trim() || scanning) {
      return;
    }

    const batchNumber = extractBatchNumber(scannedBatch);
    if (!batchNumber) {
      return;
    }

    setScanError('');
    setScanning(true);
    try {
      const creds = getUserCredentials();
      if (!creds) throw new Error('User not authenticated. Please log in again.');

      const endpoint = `${BACKEND_BASE_URL}/api/reel/rcv/batch/${encodeURIComponent(batchNumber)}`;
      const res = await fetch(endpoint, {
        headers: {
          "X-User-Auth": btoa(`${creds.username}:${creds.password}`),
          "X-User-Environment": creds.environment,
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          addScannedBatch({
            Material: 'Not Found',
            Description: 'Batch not found in system',
            Batch: batchNumber,
            Quantity: '',
            isMatched: false,
            isValid: false,
            scannedBatch: batchNumber,
            apiMessage: 'Batch not found in system',
          });
          return;
        }
        const body = await res.json().catch(() => null);
        console.error("Batch lookup failed:", { status: res.status, statusText: res.statusText, body });
        throw new Error(body?.error || `Batch lookup failed (HTTP ${res.status}).`);
      }

      const json = await res.json();
      const info = json?.d;
      if (!info) throw new Error('Empty response from batch lookup.');

      const isValid = info.Status ? info.Status === 'S' : true;
      const batchKey = (info.Batch || batchNumber).trim().toUpperCase();
      const isMatched = materials.some(m => (m.Batch || '').trim().toUpperCase() === batchKey);

      addScannedBatch({
        ...info,
        scannedBatch: batchNumber,
        isMatched,
        isValid,
        apiMessage: info.Message || '',
      });
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
      setScannedBatch('');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleManualEntry = (e) => {
    if (e.key === 'Enter') {
      handleScan();
    } else {
      setScannedBatch(e.target.value);
    }
  };

  // Calculate leftover batches (in document but not scanned)
  const getLeftoverBatches = () => {
    const scannedBatchNumbers = matchedBatches
      .filter(b => b.isMatched)
      .map(b => (b.Batch || '').trim().toUpperCase());
    
    return materials.filter(m => {
      const batchNum = (m.Batch || '').trim().toUpperCase();
      return batchNum && !scannedBatchNumbers.includes(batchNum);
    });
  };

  const leftoverBatches = getLeftoverBatches();

  const openDetails = (batch) => {
    setSelectedBatch(batch);
    setShowDetailsPopup(true);
  };

  const closeDetails = () => {
    setSelectedBatch(null);
    setShowDetailsPopup(false);
  };

  const formatMaterialNumber = (material) => {
    if (!material) return '-';
    // Skip leading zeros and display from first non-zero digit
    return material.replace(/^0+/, '');
  };

  const openFullInfoPopup = (batch) => {
    setSelectedFullInfoBatch(batch);
    setShowFullInfoPopup(true);
  };

  const closeFullInfoPopup = () => {
    setSelectedFullInfoBatch(null);
    setShowFullInfoPopup(false);
  };

  const toggleCardExpansion = (index) => {
    setExpandedCards(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleFinishOffloading = () => {
    setShowLeftovers(true);
    setFinishOffloadingClicked(true);
  };

  const handleNext = () => {
    // Navigate to MIGO page with matched, validated batches
    const matchedOnly = matchedBatches.filter(b => b.isMatched && b.isValid !== false);
    if (matchedOnly.length === 0) {
      // Show popup for no matched batches
      alert('No valid matched batches found. Please scan at least one matching batch that passed validation before proceeding.');
      return;
    }
    
    navigate('/reel-confirm', {
      state: {
        materials: matchedOnly,
        isMaterialFlow: true,
        documentData: documentData
      }
    });
  };

  const handleBack = () => {
    navigate('/reel-receiving');
  };

  return (
    <div className="app-container">
      <PageHeader user={user} onLogout={onLogout} />

      <div style={{ maxWidth: "900px", margin: "20px auto", padding: "1rem" }}>
        <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
          <h2 style={{ marginTop: 0 }}>Scan Batches</h2>

          {/* Scan Input Section */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
              
            </label>
            <input
              ref={inputRef}
              type="text"
              value={scannedBatch}
              onChange={handleManualEntry}
              onKeyDown={handleManualEntry}
              placeholder="Scan barcode or enter batch number"
              style={{ 
                width: "100%", 
                padding: "0.85rem", 
                borderRadius: "8px", 
                border: "1px solid #d1d5db", 
                fontSize: "1rem",
                marginBottom: "0.75rem"
              }}
              autoFocus
            />
            {scanError && (
              <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginBottom: "0.75rem" }}>
                {scanError}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={handleScan}
                disabled={!scannedBatch.trim() || scanning}
                style={{
                  flex: 1,
                  padding: "0.85rem 2rem",
                  background: (scannedBatch.trim() && !scanning) ? "#3b82f6" : "#9ca3af",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: (scannedBatch.trim() && !scanning) ? "pointer" : "not-allowed"
                }}
              >
                {scanning ? "Checking..." : "Scan"}
              </button>
              <button
                onClick={handleFinishOffloading}
                style={{
                  flex: 1,
                  padding: "0.85rem 2rem",
                  background: "#10b981",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer"
                }}
              >
                Finish Offloading
              </button>
            </div>
          </div>

          {/* Results Table - Matched and Unmatched */}
          {matchedBatches.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ marginBottom: "0.75rem" }}>Scanned Batches</h3>
              <div style={{ overflowX: "auto" }}>
                {matchedBatches.map((batch, index) => (
                  <div 
                    key={index} 
                    onClick={() => openFullInfoPopup(batch)}
                    style={{
                      marginBottom: "1rem",
                      padding: "1rem",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      backgroundColor: !batch.isMatched ? "#fef2f2" : (batch.isValid === false ? "#fff7ed" : "#f0fdf4"),
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Material:</strong>
                      <span>{formatMaterialNumber(batch.Material) || '-'}</span>
                    </div>
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Description:</strong>
                      <span>{batch.Description || batch.MatDesc || batch.Maktx || '-'}</span>
                    </div>
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Batch:</strong>
                      <span>{batch.Batch || batch.scannedBatch || '-'}</span>
                    </div>
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Width:</strong>
                      <span>{batch.ReelWidth ? `${batch.ReelWidth} ${batch.WidthUnit || ''}` : '-'}</span>
                    </div>
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Quantity:</strong>
                      <span>{batch.Quantity ? `${batch.Quantity} ${batch.Uom || batch.EntryUom || ''}` : '-'}</span>
                    </div>
                    <div style={{ display: "flex" }}>
                      <strong style={{ minWidth: "120px" }}>Status:</strong>
                      <span>
                        {!batch.isMatched ? (
                          <span style={{ color: "#ef4444", fontWeight: 600 }}>✗ Not Matched</span>
                        ) : batch.isValid === false ? (
                          <span style={{ color: "#f59e0b", fontWeight: 600 }}>⚠ Validation Failed</span>
                        ) : (
                          <span style={{ color: "#10b981", fontWeight: 600 }}>✓ Matched</span>
                        )}
                      </span>
                    </div>
                    {batch.apiMessage && (
                      <div style={{ display: "flex", marginTop: "0.5rem" }}>
                        <strong style={{ minWidth: "120px" }}>Message:</strong>
                        <span style={{ color: batch.isValid === false ? "#b91c1c" : "#374151" }}>{batch.apiMessage}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leftover Batches Table */}
          {showLeftovers && leftoverBatches.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ marginBottom: "0.75rem", color: "#000000" }}>Leftover Batches</h3>
              <div style={{ overflowX: "auto" }}>
                {leftoverBatches.map((batch, index) => (
                  <div 
                    key={index} 
                    onClick={() => openFullInfoPopup(batch)}
                    style={{ 
                      marginBottom: "1rem",
                      padding: "1rem",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      backgroundColor: "#fef3c7",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Material:</strong>
                      <span>{formatMaterialNumber(batch.Material) || '-'}</span>
                    </div>
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Description:</strong>
                      <span>{batch.Description || batch.MatDesc || batch.Maktx || '-'}</span>
                    </div>
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Batch:</strong>
                      <span>{batch.Batch || '-'}</span>
                    </div>
                    <div style={{ display: "flex", marginBottom: "0.5rem" }}>
                      <strong style={{ minWidth: "120px" }}>Width:</strong>
                      <span>{batch.ReelWidth ? `${batch.ReelWidth} ${batch.WidthUnit || ''}` : '-'}</span>
                    </div>
                    <div style={{ display: "flex" }}>
                      <strong style={{ minWidth: "120px" }}>Quantity:</strong>
                      <span>{batch.Quantity ? `${batch.Quantity} ${batch.Uom || batch.EntryUom || ''}` : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation Buttons */}
      <div style={{ position: "fixed", bottom: "20px", left: "20px" }}>
        <button
          onClick={handleBack}
          style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}
        >
          Back
        </button>
      </div>

      <div style={{ position: "fixed", bottom: "20px", right: "20px" }}>
        <button
          onClick={handleNext}
          disabled={matchedBatches.filter(b => b.isMatched && b.isValid !== false).length === 0 || !finishOffloadingClicked}
          style={{
            padding: "0.85rem 2rem",
            background: (matchedBatches.filter(b => b.isMatched && b.isValid !== false).length > 0 && finishOffloadingClicked) ? "#3b82f6" : "#9ca3af",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: (matchedBatches.filter(b => b.isMatched && b.isValid !== false).length > 0 && finishOffloadingClicked) ? "pointer" : "not-allowed"
          }}
        >
          Next
        </button>
      </div>

      {/* Full Information Popup */}
      {showFullInfoPopup && selectedFullInfoBatch && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Full Batch Information</h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>Material:</strong>
                <span>{formatMaterialNumber(selectedFullInfoBatch.Material) || '-'}</span>
              </div>
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>Description:</strong>
                <span>{selectedFullInfoBatch.Description || selectedFullInfoBatch.MatDesc || selectedFullInfoBatch.Maktx || '-'}</span>
              </div>
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>Batch:</strong>
                <span>{selectedFullInfoBatch.Batch || selectedFullInfoBatch.scannedBatch || '-'}</span>
              </div>
              {selectedFullInfoBatch.TargetBatch && (
                <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                  <strong style={{ minWidth: '140px' }}>Target Batch:</strong>
                  <span>{selectedFullInfoBatch.TargetBatch}</span>
                </div>
              )}
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>Width:</strong>
                <span>{selectedFullInfoBatch.ReelWidth ? `${selectedFullInfoBatch.ReelWidth} ${selectedFullInfoBatch.WidthUnit || ''}` : '-'}</span>
              </div>
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>Quantity:</strong>
                <span>{selectedFullInfoBatch.Quantity ? `${selectedFullInfoBatch.Quantity} ${selectedFullInfoBatch.Uom || selectedFullInfoBatch.EntryUom || ''}` : '-'}</span>
              </div>
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>Status:</strong>
                <span>
                  {selectedFullInfoBatch.isMatched !== undefined ? (
                    !selectedFullInfoBatch.isMatched ? (
                      <span style={{ color: "#ef4444", fontWeight: 600 }}>✗ Not Matched</span>
                    ) : selectedFullInfoBatch.isValid === false ? (
                      <span style={{ color: "#f59e0b", fontWeight: 600 }}>⚠ Validation Failed</span>
                    ) : (
                      <span style={{ color: "#10b981", fontWeight: 600 }}>✓ Matched</span>
                    )
                  ) : (
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>⚠ Left Over</span>
                  )}
                </span>
              </div>
              {selectedFullInfoBatch.apiMessage && (
                <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                  <strong style={{ minWidth: '140px' }}>Message:</strong>
                  <span style={{ color: selectedFullInfoBatch.isValid === false ? "#b91c1c" : "#374151" }}>{selectedFullInfoBatch.apiMessage}</span>
                </div>
              )}
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>Item No:</strong>
                <span>{selectedFullInfoBatch.ItemNo || selectedFullInfoBatch.ItemNumber || '-'}</span>
              </div>
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>Plant:</strong>
                <span>{selectedFullInfoBatch.Plant || selectedFullInfoBatch.Werks || '-'}</span>
              </div>
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>Storage Location:</strong>
                <span>{selectedFullInfoBatch.StorLoc || selectedFullInfoBatch.StgeLoc || selectedFullInfoBatch.Lgort || '-'}</span>
              </div>
              <div style={{ display: 'flex', marginBottom: '0.5rem' }}>
                <strong style={{ minWidth: '140px' }}>UOM:</strong>
                <span>{selectedFullInfoBatch.Uom || selectedFullInfoBatch.EntryUom || selectedFullInfoBatch.Meins || '-'}</span>
              </div>
              <div style={{ display: 'flex' }}>
                <strong style={{ minWidth: '140px' }}>Document Year:</strong>
                <span>{selectedFullInfoBatch.Mjahr || selectedFullInfoBatch.DocumentYear || '-'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={closeFullInfoPopup}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: '1px solid #ddd',
                  backgroundColor: 'white',
                  color: '#666',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Popup */}
      {showDetailsPopup && selectedBatch && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Batch Details</h3>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Material:</strong>
                <span>{selectedBatch.Material || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Description:</strong>
                <span>{selectedBatch.Description || selectedBatch.MatDesc || selectedBatch.Maktx || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Batch:</strong>
                <span>{selectedBatch.Batch || selectedBatch.scannedBatch || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Width:</strong>
                <span>{selectedBatch.Width || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Quantity:</strong>
                <span>{selectedBatch.Quantity || '-'} {selectedBatch.Uom || selectedBatch.EntryUom || ''}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Storage Location:</strong>
                <span>{selectedBatch.StorLoc || selectedBatch.StgeLoc || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Plant:</strong>
                <span>{selectedBatch.Plant || '-'}</span>
              </div>
              {selectedBatch.ItemNo && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>Item Number:</strong>
                  <span>{selectedBatch.ItemNo || '-'}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={closeDetails}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: '1px solid #ddd',
                  backgroundColor: 'white',
                  color: '#666',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScanPage;
