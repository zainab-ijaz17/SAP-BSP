// frontend/src/pages/ReelTransferMigoPage.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getUserCredentials } from '../api';

const MOVEMENT_TYPE_TRANSFER = '311';
const MOVEMENT_TYPE_BATCH = '309';
const PLANT = '1212';

function ReelTransferMigoPage({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const batchData = location.state?.batchData;

  // 'transfer' = posting movement 311 (storage location transfer)
  // 'batchTransfer' = posting movement 309 (batch-to-batch transfer), which
  // happens after 311 succeeds
  const [phase, setPhase] = useState('transfer');
  const currentMovementType = phase === 'transfer' ? MOVEMENT_TYPE_TRANSFER : MOVEMENT_TYPE_BATCH;

  const [formData, setFormData] = useState({
    storageLocationTo: '',
    specialStock: 'E',
    newBatch: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [validationPassed, setValidationPassed] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showPostSuccessPopup, setShowPostSuccessPopup] = useState(false);
  const [doc311, setDoc311] = useState(null);
  const [doc309, setDoc309] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!batchData) {
      navigate('/bsp');
    }
  }, [batchData, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'storageLocationTo' || name === 'newBatch') {
      setFormData(prev => ({
        ...prev,
        [name]: value.toUpperCase()
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const buildTransferItem = (batchItem, index) => {
    if (phase === 'transfer') {
      return {
        HeaderId: "1",
        ItemNo: String(index + 1).padStart(6, '0'),
        Material: String(batchItem.MATNR || '').padStart(18, '0'),
        Plant: PLANT,
        StgeLoc: batchItem.LGORT || '',
        Quantity: String(batchItem.QTY || '0'),
        EntryUom: batchItem.MEINS || '',
        Batch: batchItem.Charg || '',
        SpecStock: formData.specialStock || batchItem.SOBKZ || 'E',
        StgeLocTo: formData.storageLocationTo || '',
        BatchTo: batchItem.Charg || '',
        MoveType: MOVEMENT_TYPE_TRANSFER
      };
    }

    // Batch-to-batch transfer (309): stock now sits in storageLocationTo
    // (from the 311 that just posted) under the original batch, and this
    // reclassifies it into the new batch at the same storage location.
    return {
      HeaderId: "1",
      ItemNo: String(index + 1).padStart(6, '0'),
      Material: String(batchItem.MATNR || '').padStart(18, '0'),
      Plant: PLANT,
      StgeLoc: formData.storageLocationTo || '',
      Quantity: String(batchItem.QTY || '0'),
      EntryUom: batchItem.MEINS || '',
      Batch: batchItem.Charg || '',
      SpecStock: formData.specialStock || batchItem.SOBKZ || 'E',
      StgeLocTo: formData.storageLocationTo || '',
      BatchTo: formData.newBatch || '',
      MoveType: MOVEMENT_TYPE_BATCH
    };
  };

  const preparePayload = (isTestRun) => {
    const nowIso = new Date().toISOString();
    const batches = Array.isArray(batchData) ? batchData : [batchData];

    return {
      HeaderId: "1",
      DocDate: `/Date(${new Date(nowIso).getTime()})/`,
      PstngDate: `/Date(${new Date(nowIso).getTime()})/`,
      TestRun: isTestRun,
      TransferItemSet: batches.map((batch, index) => buildTransferItem(batch.d || batch, index))
    };
  };

  const handleCheck = async () => {
    await handleTransfer(true);
  };

  const handlePost = async () => {
    await handleTransfer(false);
  };

  const handleFetchAgain = () => {
    navigate('/bsp', { replace: true, state: { migoPath: '/reel-transfer-migo' } });
  };

  const handleContinueToBatchTransfer = () => {
    setShowPostSuccessPopup(false);
    setValidationPassed(false);
    setError('');
    setSuccessMessage('');
    setPhase('batchTransfer');
  };

  const handleTransfer = async (isTestRun) => {
    if (phase === 'transfer' && !formData.storageLocationTo.trim()) {
      setError('Storage Location To is required. Please enter a value before proceeding.');
      return;
    }
    if (phase === 'batchTransfer' && !formData.newBatch.trim()) {
      setError('New Batch is required. Please enter a value before proceeding.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const creds = getUserCredentials();
      if (!creds) throw new Error("User not authenticated. Please log in again.");

      const payload = preparePayload(isTestRun);
      const baseUrl = 'https://sap-app1.cfapps.eu10-004.hana.ondemand.com';
      const endpoint = isTestRun ? '/api/migo/check' : '/api/migo/post';

      const response = await axios.post(`${baseUrl}${endpoint}`, payload, {
        headers: {
          'X-User-Auth': btoa(`${creds.username}:${creds.password}`),
          'X-User-Environment': creds.environment,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        if (isTestRun) {
          setValidationPassed(true);
          setSuccessMessage('Validation successful!');
          setShowSuccessPopup(true);
        } else {
          const docData = response.data?.data || null;
          if (phase === 'transfer') {
            setDoc311(docData);
          } else {
            setDoc309(docData);
          }
          setShowSuccessPopup(false);
          setShowPostSuccessPopup(true);
        }
      } else {
        throw new Error(response.data.error || (isTestRun ? 'Validation failed' : 'Post failed'));
      }
    } catch (error) {
      setError(error.response?.data?.error || error.message);
      if (error.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (phase === 'batchTransfer') {
      setPhase('transfer');
      setValidationPassed(false);
      setError('');
      setSuccessMessage('');
      return;
    }
    navigate('/bsp', {
      state: { prefillBatches: batchData, migoPath: '/reel-transfer-migo' }
    });
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  if (!batchData) {
    return <div>Loading batch data...</div>;
  }

  const currentDoc = phase === 'transfer' ? doc311 : doc309;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="user-info">
          <div className="user-details">
            <span className="username">{user?.username || "s.ashraf"}</span>
            <span className="server-info">
              Server {user?.server || "DEV"} • Client {user?.client || "110"}
            </span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {showLogoutConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', padding: '2rem', borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxWidth: '400px', width: '90%'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Confirm Logout</h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#666' }}>Are you sure you want to logout?</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLogoutConfirm(false)} style={{ padding: '0.75rem 1.5rem', border: '1px solid #ddd', backgroundColor: 'white', color: '#666', borderRadius: '6px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => { onLogout(); setShowLogoutConfirm(false); }} style={{ padding: '0.75rem 1.5rem', border: 'none', backgroundColor: '#dc3545', color: 'white', borderRadius: '6px', cursor: 'pointer' }}>
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: "650px", margin: "20px auto", padding: "1rem" }}>
        <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
          <h2 style={{ marginTop: 0 }}>{phase === 'transfer' ? 'Reel Transfer' : 'Batch Transfer'}</h2>
          {phase === 'batchTransfer' && (
            <p style={{ color: "#6b7280", marginTop: "-0.5rem" }}>
              Movement 311 posted. Now post movement 309 to reclassify this stock into the new batch.
            </p>
          )}

          {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{error}</div>}
          {successMessage && <div style={{ background: "#dcfce7", color: "#166534", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{successMessage}</div>}

          <div className="form-group" style={{ marginTop: '8px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>Movement Type</label>
            <input
              type="text"
              value={currentMovementType}
              readOnly
              required
              className="form-control"
              style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
            />
          </div>

          <div className="form-group" style={{ marginTop: '8px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>Storage Location To</label>
            <input
              type="text"
              name="storageLocationTo"
              value={formData.storageLocationTo}
              onChange={handleChange}
              className="form-control"
              required
              readOnly={phase === 'batchTransfer'}
              style={phase === 'batchTransfer' ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' } : undefined}
            />
          </div>

          {phase === 'batchTransfer' && (
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px' }}>New Batch</label>
              <input
                type="text"
                name="newBatch"
                value={formData.newBatch}
                onChange={handleChange}
                className="form-control"
                required
              />
            </div>
          )}

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>Special Stock</label>
            <input
              type="text"
              name="specialStock"
              value={formData.specialStock}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>
        </div>
      </div>

      {showSuccessPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 50 }}>
          <div style={{ width: "100%", maxWidth: "520px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
            <h3 style={{ marginTop: 0 }}>Validation Successful</h3>
            <div style={{ background: "#dcfce7", color: "#166534", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>
              Your data has been validated successfully. You can now post.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.25rem" }}>
              <button onClick={() => setShowSuccessPopup(false)} style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px" }}>
                Back
              </button>
              <button onClick={handlePost} disabled={!validationPassed || loading} style={{ padding: "0.85rem 2rem", background: validationPassed && !loading ? "#22c55e" : "#9ca3af", color: "#fff", border: "none", borderRadius: "8px" }}>
                {loading ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPostSuccessPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 60 }}>
          <div style={{ width: "100%", maxWidth: "520px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
            <h3 style={{ marginTop: 0 }}>{phase === 'transfer' ? 'Movement 311 Posted Successfully' : 'Movement 309 Posted Successfully'}</h3>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.9rem", background: "#f9fafb" }}>
              <div style={{ fontWeight: 600, color: "#111827" }}>Document Number</div>
              <div style={{ marginTop: "0.25rem", fontSize: "1.1rem", color: "#111827" }}>
                {currentDoc?.materialDocument || currentDoc?.MatDoc || '-'}
              </div>
              {(currentDoc?.message || currentDoc?.Message) && (
                <div style={{ marginTop: "0.75rem", color: "#374151" }}>{currentDoc?.message || currentDoc?.Message}</div>
              )}
            </div>
            {phase === 'transfer' && (
              <div style={{ marginTop: "0.75rem", color: "#6b7280", fontSize: "0.9rem" }}>
                Next, post movement 309 to transfer this stock into a new batch.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.25rem" }}>
              {phase === 'transfer' ? (
                <button onClick={handleContinueToBatchTransfer} style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}>
                  Continue to Batch Transfer (309)
                </button>
              ) : (
                <button onClick={handleFetchAgain} style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}>
                  Fetch Again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "fixed", bottom: "20px", left: "20px" }}>
        <button onClick={handleBack} disabled={loading} style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px" }}>
          Back
        </button>
      </div>

      <div style={{ position: "fixed", bottom: "20px", right: "20px" }}>
        <button onClick={handleCheck} disabled={loading} style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}>
          {loading ? 'Validating...' : 'Check'}
        </button>
      </div>
    </div>
  );
}

export default ReelTransferMigoPage;
