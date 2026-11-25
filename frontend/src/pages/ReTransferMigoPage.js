// frontend/src/pages/ReTransferMigoPage.js
// Re-Transfer: moves part of ONE scanned batch into another existing batch with a
// single 309 posting (storage location + batch transfer). The source batch comes
// from the shared scan page (BspPage, migoPath '/re-transfer-migo'); here the user
// types or scans the destination batch (BatchTo) and enters the quantity to move.
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getUserCredentials } from '../api';

const MOVEMENT_TYPE = '309';
const PLANT = '1212';
const MIGO_PATH = '/re-transfer-migo';
const BACKEND_URL = 'https://sap-app1.cfapps.eu10-004.hana.ondemand.com';

function ReTransferMigoPage({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const batchData = location.state?.batchData;
  const batches = batchData ? (Array.isArray(batchData) ? batchData : [batchData]) : [];
  const source = batches[0] ? (batches[0].d || batches[0]) : null;

  const [storageLocationTo, setStorageLocationTo] = useState('');
  const [batchTo, setBatchTo] = useState(''); // destination batch, typed or scanned
  const [quantity, setQuantity] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationPassed, setValidationPassed] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showPostSuccessPopup, setShowPostSuccessPopup] = useState(false);
  const [postedDoc, setPostedDoc] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    // Re-Transfer handles exactly one batch; the scan page enforces this too.
    if (!batchData || batches.length !== 1) {
      navigate('/bsp', { replace: true, state: { migoPath: MIGO_PATH } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchData, navigate]);

  // Any change to the posting inputs invalidates a previous Check.
  useEffect(() => {
    setValidationPassed(false);
  }, [storageLocationTo, batchTo, quantity]);

  const availableQty = Number(source?.QTY || 0);

  const validate = () => {
    if (!storageLocationTo.trim()) return 'Storage Location To is required. Please enter a value before proceeding.';
    if (!batchTo.trim()) return 'Please enter or scan the destination batch before proceeding.';
    if (batchTo.trim() === String(source?.Charg || '').toUpperCase()) {
      return 'Destination batch must be different from the batch being transferred.';
    }
    const qty = Number(quantity);
    if (!quantity.trim() || !Number.isFinite(qty) || qty <= 0) return 'Please enter a quantity greater than 0.';
    if (qty > availableQty) return `Quantity cannot be more than the available ${source?.QTY} ${source?.MEINS || ''}.`.trim();
    return '';
  };

  const preparePayload = (isTestRun) => {
    const now = Date.now();
    return {
      HeaderId: '1',
      DocDate: `/Date(${now})/`,
      PstngDate: `/Date(${now})/`,
      TestRun: isTestRun,
      TransferItemSet: [{
        HeaderId: '1',
        ItemNo: '000001',
        Material: String(source?.MATNR || '').padStart(18, '0'),
        Plant: PLANT,
        StgeLoc: source?.LGORT || '',
        Quantity: String(Number(quantity)),
        EntryUom: source?.MEINS || '',
        Batch: source?.Charg || '',
        SpecStock: source?.SOBKZ || '',
        StgeLocTo: storageLocationTo.trim(),
        BatchTo: batchTo.trim(),
        MoveType: MOVEMENT_TYPE
      }]
    };
  };

  const handleTransfer = async (isTestRun) => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const creds = getUserCredentials();
      if (!creds) throw new Error('User not authenticated. Please log in again.');

      const endpoint = isTestRun ? '/api/migo/check' : '/api/migo/post';
      const response = await axios.post(`${BACKEND_URL}${endpoint}`, preparePayload(isTestRun), {
        headers: {
          'X-User-Auth': btoa(`${creds.username}:${creds.password}`),
          'X-User-Environment': creds.environment,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        if (isTestRun) {
          setValidationPassed(true);
          setShowSuccessPopup(true);
        } else {
          setPostedDoc(response.data?.data || null);
          setShowSuccessPopup(false);
          setShowPostSuccessPopup(true);
        }
      } else {
        throw new Error(response.data.error || (isTestRun ? 'Validation failed' : 'Post failed'));
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      if (err.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAgain = () => {
    navigate('/bsp', { replace: true, state: { migoPath: MIGO_PATH } });
  };

  const handleBack = () => {
    navigate('/bsp', { state: { prefillBatches: batchData, migoPath: MIGO_PATH } });
  };

  if (!source) {
    return <div>Loading batch data...</div>;
  }

  const infoRow = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.9rem' }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500 }}>{value || '-'}</span>
    </div>
  );

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
          <button className="logout-btn" onClick={() => setShowLogoutConfirm(true)}>Logout</button>
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

      <div style={{ maxWidth: "650px", margin: "20px auto", padding: "1rem", paddingBottom: "6rem" }}>
        <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
          <h2 style={{ marginTop: 0 }}>Re-Transfer</h2>

          {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{error}</div>}

          <div style={{ marginTop: '8px', fontSize: '0.9rem', color: '#374151' }}>
            Movement Type: <strong>309 - Storage Location + Batch Transfer</strong>
          </div>

          <div style={{ marginTop: '12px', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.75rem', background: '#f9fafb' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Transfer From</div>
            {infoRow('Batch', source.Charg)}
            {infoRow('Material', source.MATNR)}
            {infoRow('Description', source.MAKTX)}
            {infoRow('Storage Location', source.LGORT)}
            {infoRow('Available Qty', `${source.QTY ?? ''} ${source.MEINS || ''}`.trim())}
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>Batch To</label>
            <input
              type="text"
              value={batchTo}
              onChange={(e) => setBatchTo(e.target.value.toUpperCase())}
              className="form-control"
              placeholder="Enter or scan batch"
            />
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>Quantity {source.MEINS ? `(${source.MEINS})` : ''}</label>
            <input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
              className="form-control"
              placeholder={`Max ${source.QTY ?? ''}`}
            />
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>Storage Location To</label>
            <input
              type="text"
              value={storageLocationTo}
              onChange={(e) => setStorageLocationTo(e.target.value.toUpperCase())}
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
              Move {quantity} {source.MEINS || ''} from batch {source.Charg} to batch {batchTo.trim()}. You can now post.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.25rem" }}>
              <button onClick={() => setShowSuccessPopup(false)} style={{ padding: "0.85rem 2rem", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px" }}>
                Back
              </button>
              <button onClick={() => handleTransfer(false)} disabled={!validationPassed || loading} style={{ padding: "0.85rem 2rem", background: validationPassed && !loading ? "#22c55e" : "#9ca3af", color: "#fff", border: "none", borderRadius: "8px" }}>
                {loading ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPostSuccessPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 60 }}>
          <div style={{ width: "100%", maxWidth: "520px", background: "white", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
            <h3 style={{ marginTop: 0 }}>Movement {MOVEMENT_TYPE} Posted Successfully</h3>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.9rem", background: "#f9fafb" }}>
              <div style={{ fontWeight: 600, color: "#111827" }}>Document Number</div>
              <div style={{ marginTop: "0.25rem", fontSize: "1.1rem", color: "#111827" }}>
                {postedDoc?.materialDocument || postedDoc?.MatDoc || '-'}
              </div>
              {(postedDoc?.message || postedDoc?.Message) && (
                <div style={{ marginTop: "0.75rem", color: "#374151" }}>{postedDoc?.message || postedDoc?.Message}</div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.25rem" }}>
              <button onClick={handleFetchAgain} style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}>
                Fetch Again
              </button>
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
        <button onClick={() => handleTransfer(true)} disabled={loading} style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}>
          {loading && !showSuccessPopup ? 'Validating...' : 'Check'}
        </button>
      </div>
    </div>
  );
}

export default ReTransferMigoPage;
