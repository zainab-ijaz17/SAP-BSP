// frontend/src/pages/migoPage.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getUserCredentials } from '../api';

function CharMigoPage({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const batchData = location.state?.batchData;

  const [formData, setFormData] = useState({
    movementType: '413',
    storageLocationTo: '',
    specialStock: 'E',
    batchAssignments: []
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [validationPassed, setValidationPassed] = useState(false);
  const [transferResult, setTransferResult] = useState(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showPostSuccessPopup, setShowPostSuccessPopup] = useState(false);
  const [postSuccessData, setPostSuccessData] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!batchData) {
      navigate('/char');
      return;
    }

    const batches = Array.isArray(batchData) ? batchData : [batchData];

    setFormData(prev => ({
      ...prev,
      batchAssignments: batches.map(batch => {
        const item = batch.d || batch;

        return {
          batchNumber: item.Charg || '',
          salesOrderFrom: item.SalesOrder || '',
          salesOrderItemFrom: item.SoItem || '',
          salesOrderTo: '',
          salesOrderItemTo: ''
        };
      })
    }));
  }, [batchData, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'storageLocationTo') {
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

  const handleBatchAssignmentChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.batchAssignments];

      updated[index] = {
        ...updated[index],
        [field]: value
      };

      return {
        ...prev,
        batchAssignments: updated
      };
    });
  };

  const preparePayload = (isTestRun) => {
    const nowIso = new Date().toISOString();

    if (Array.isArray(batchData)) {
      return {
        HeaderId: "1",
        DocDate: `/Date(${new Date(nowIso).getTime()})/`,
        PstngDate: `/Date(${new Date(nowIso).getTime()})/`,
        TestRun: isTestRun,
        TransferItemSet: batchData.map((batch, index) => {
          const batchItem = batch.d || batch;
          const assignment = formData.batchAssignments[index] || {};
          
          const finalSalesOrderFrom = assignment.salesOrderFrom || batchItem.SalesOrder || '';
          const finalSalesOrderItemFrom = assignment.salesOrderItemFrom || batchItem.SoItem || '';
          
          const finalSalesOrderTo = assignment.salesOrderTo?.trim() || finalSalesOrderFrom;
          const finalSalesOrderItemTo = assignment.salesOrderItemTo?.trim() || finalSalesOrderItemFrom;
          
          return {
            HeaderId: "1",
            ItemNo: String(index + 1).padStart(6, '0'),
            Material: String(batchItem.MATNR || '').padStart(18, '0'),
            Plant: batchItem.Werks || '',
            StgeLoc: batchItem.LGORT || '',
            Quantity: String(batchItem.QTY || '0'),
            EntryUom: batchItem.MEINS || '',
            Batch: batchItem.Charg || '',
            SalesOrder: finalSalesOrderFrom,
            SoItem: finalSalesOrderItemFrom,
            SpecStock: formData.specialStock || batchItem.SOBKZ || 'E',
            StgeLocTo: formData.storageLocationTo || '',
            BatchTo: batchItem.Charg || '',
            MoveType: formData.movementType,
            SalesOrderTo: finalSalesOrderTo,
            SoItemTo: finalSalesOrderItemTo
          };
        })
      };
    }

    const batchContent = batchData.d || batchData;
    const assignment = formData.batchAssignments[0] || {};
    
    const finalSalesOrderFrom = assignment.salesOrderFrom || batchContent.SalesOrder || '';
    const finalSalesOrderItemFrom = assignment.salesOrderItemFrom || batchContent.SoItem || '';
    
    const finalSalesOrderTo = assignment.salesOrderTo?.trim() || finalSalesOrderFrom;
    const finalSalesOrderItemTo = assignment.salesOrderItemTo?.trim() || finalSalesOrderItemFrom;

    return {
      HeaderId: "1",
      DocDate: `/Date(${new Date(nowIso).getTime()})/`,
      PstngDate: `/Date(${new Date(nowIso).getTime()})/`,
      TestRun: isTestRun,
      TransferItemSet: [{
        HeaderId: "1",
        ItemNo: "000001",
        Material: String(batchContent.MATNR || '').padStart(18, '0'),
        Plant: batchContent.Werks || '',
        StgeLoc: batchContent.LGORT || '',
        Quantity: String(batchContent.QTY || '0'),
        EntryUom: batchContent.MEINS || '',
        Batch: batchContent.Charg || '',
        SalesOrder: finalSalesOrderFrom,
        SoItem: finalSalesOrderItemFrom,
        SpecStock: formData.specialStock || batchContent.SOBKZ || 'E',
        StgeLocTo: formData.storageLocationTo || '',
        BatchTo: batchContent.Charg || '',
        MoveType: formData.movementType,
        SalesOrderTo: finalSalesOrderTo,
        SoItemTo: finalSalesOrderItemTo
      }]
    };
  };

  const handleCheck = async () => {
    await handleTransfer(true);
  };

  const handlePost = async () => {
    await handleTransfer(false);
  };

  const handleFetchAgain = () => {
    navigate('/char', { replace: true, state: null });
  };

  const handleTransfer = async (isTestRun) => {
    if (!formData.storageLocationTo.trim()) {
      setError('Storage Location To is required. Please enter a value before proceeding.');
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
          setTransferResult(response.data.data);
          setValidationPassed(true);
          setSuccessMessage('Validation successful!');
          setShowSuccessPopup(true);
        } else {
          setTransferResult(response.data?.data || null);
          setShowSuccessPopup(false);
          setPostSuccessData(response.data?.data || null);
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
    navigate('/char', {
      state: { prefillBatches: batchData }
    });
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  if (!batchData) {
    return <div>Loading batch data...</div>;
  }

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
          <h2 style={{ marginTop: 0 }}>MIGO Transfer</h2>

          {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{error}</div>}
          {successMessage && <div style={{ background: "#dcfce7", color: "#166534", padding: "0.75rem", borderRadius: "8px", marginTop: "0.5rem" }}>{successMessage}</div>}

          {/* MOVEMENT TYPE ON THE TOP */}
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Movement Type</label>
            <select
              name="movementType"
              value={formData.movementType}
              onChange={handleChange}
              className="form-control"
              required
            >
              <option value="413">413</option>
              <option value="311">311</option>
            </select>
          </div>

          {/* EACH BATCH CARD WITH LINE-BY-LINE LAYOUT */}
          {formData.movementType === '413' && formData.batchAssignments.map((assignment, index) => (
            <div
              key={index}
              style={{
                background: '#fcfcfd',
                border: '1px solid #eef2f6',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}
            >
              <h4 style={{ margin: '0 0 16px 0', color: 'black', fontSize: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                Item Allocation #{index + 1}
              </h4>
              
              {/* LINE 1: Sales Order From */}
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Sales Order From</label>
                <input
                  type="text"
                  value={assignment.salesOrderFrom}
                  readOnly
                  className="form-control"
                  style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                />
              </div>

              {/* LINE 2: Sales Order Item From */}
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Sales Order Item From</label>
                <input
                  type="text"
                  value={assignment.salesOrderItemFrom}
                  readOnly
                  className="form-control"
                  style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                />
              </div>

              {/* LINE 3: Grid row for Batch Number, Sales Order To, and Sales Order Item To */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  alignItems: 'start'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '500' }}>Batch Number</label>
                  <input
                    type="text"
                    value={assignment.batchNumber}
                    readOnly
                    className="form-control"
                    style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#1e293b', fontWeight: '500' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '600' }}>Sales Order To</label>
                  <input
                    type="text"
                    value={assignment.salesOrderTo}
                    onChange={(e) => handleBatchAssignmentChange(index, 'salesOrderTo', e.target.value)}
                    className="form-control"
                    placeholder="SO Target"
                    style={{ borderColor: '#bae6fd' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '600' }}>SO Item To</label>
                  <input
                    type="text"
                    value={assignment.salesOrderItemTo}
                    onChange={(e) => handleBatchAssignmentChange(index, 'salesOrderItemTo', e.target.value)}
                    className="form-control"
                    placeholder="Item Target"
                    style={{ borderColor: '#bae6fd' }}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* FOOTER GLOBAL PARAMETERS */}
          <div className="form-group" style={{ marginTop: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px' }}>Storage Location To</label>
            <input
              type="text"
              name="storageLocationTo"
              value={formData.storageLocationTo}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>

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

      {/* FOOTER FIXED ACTION CONTAINERS */}
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
            <h3 style={{ marginTop: 0 }}>Posted Successfully</h3>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "0.9rem", background: "#f9fafb" }}>
              <div style={{ fontWeight: 600, color: "#111827" }}>Document Number</div>
              <div style={{ marginTop: "0.25rem", fontSize: "1.1rem", color: "#111827" }}>
                {postSuccessData?.materialDocument || postSuccessData?.MatDoc || '-'}
              </div>
              {(postSuccessData?.message || postSuccessData?.Message) && (
                <div style={{ marginTop: "0.75rem", color: "#374151" }}>{postSuccessData?.message || postSuccessData?.Message}</div>
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
        <button onClick={handleCheck} disabled={loading} style={{ padding: "0.85rem 2rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px" }}>
          {loading ? 'Validating...' : 'Check'}
        </button>
      </div>
    </div>
  );
}

export default CharMigoPage;