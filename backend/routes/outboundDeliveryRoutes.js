const express = require('express');
const axios = require('axios');
const https = require('https');

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

const router = express.Router();

// API_OUTBOUND_DELIVERY_SRV — used by GR for Outbound Delivery to read a STO's
// outbound delivery (Batch, Quantity and the referenced STPO/STPO item per item).
// The proxy's target endpoint already points at the entity set
// (/sap/opu/odata/sap/API_OUTBOUND_DELIVERY_SRV/A_OutbDeliveryHeader), so only the
// query options are added — appending /A_OutbDeliveryHeader again makes API Management
// fail with "Unable to identify proxy".
// Both go through API Management: CF can't reach the on-prem SAP host directly.
const OUTB_DELIVERY_BASE_URLS = {
  dev: process.env.SAP_API_MGMT_OUTB_DELIVERY_URL || 'https://devspace.test.apimanagement.eu10.hana.ondemand.com/outbound-delivery',
  prd: process.env.SAP_API_MGMT_OUTB_DELIVERY_URL_PRD || 'https://prdspace.prod01.apimanagement.eu10.hana.ondemand.com/outbound-delivery'
};

// Only deliveries shipped from shipping point 1223 to receiving plant 1212 whose
// goods issue is complete (OverallGoodsMovementStatus 'C') can be received here.
const OUTB_DELIVERY_SHIPPING_POINT = '1223';
const OUTB_DELIVERY_RECEIVING_PLANT = '1212';
const OUTB_DELIVERY_GM_STATUS_COMPLETE = 'C';
const OUTB_DELIVERY_SELECT = [
  'DeliveryDocument', 'DeliveryDocumentType', 'ShippingPoint', 'ReceivingPlant',
  'OverallGoodsMovementStatus', 'ActualGoodsMovementDate',
  ...[
    'DeliveryDocumentItem', 'ReferenceSDDocument', 'ReferenceSDDocumentItem', 'Material',
    'DeliveryDocumentItemText', 'MaterialGroup', 'Plant', 'StorageLocation', 'Batch',
    'ActualDeliveryQuantity', 'DeliveryQuantityUnit', 'HigherLevelItem'
  ].map((field) => `to_DeliveryDocumentItem/${field}`)
].join(',');

function getUserFromHeaders(req) {
  const authHeader = req.headers['x-user-auth'];
  let username, password;

  if (authHeader) {
    try {
      const decoded = Buffer.from(authHeader, 'base64').toString('utf-8');
      [username, password] = decoded.split(':');
    } catch (error) {
      console.error('Error decoding auth header:', error);
    }
  }

  const environmentHeader = req.headers['x-user-environment'] || 'dev';
  const environment = (environmentHeader === 'prd' || environmentHeader === '300') ? 'prd' : 'dev';

  return { username, password, environment };
}

// Looks up an outbound delivery (header + expanded items) via API_OUTBOUND_DELIVERY_SRV
// — used by GrOutboundDeliveryPage. Each item carries Material, Batch,
// ActualDeliveryQuantity and ReferenceSDDocument/ReferenceSDDocumentItem (the STPO +
// STPO item it ships), which is everything GrStpo2Page needs to post the GR against
// the STPO. No header back means the delivery doesn't exist, isn't 1223 -> 1212, or
// its goods issue isn't posted yet.
router.get('/:deliveryNumber', async (req, res) => {
  try {
    const { deliveryNumber } = req.params;
    if (!deliveryNumber) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'deliveryNumber is required'
      });
    }

    const { username, password, environment } = getUserFromHeaders(req);
    if (!username || !password) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Valid user credentials are required'
      });
    }

    const sapClient = environment === 'prd' ? '300' : '110';
    const baseUrl = OUTB_DELIVERY_BASE_URLS[environment];
    // Use the delivery number without zero-padding
    const deliveryNumberWithoutPadding = deliveryNumber.replace(/^0+/, '');
    const filter = [
      `DeliveryDocument eq '${deliveryNumberWithoutPadding.replace(/'/g, "''")}'`,
      `ShippingPoint eq '${OUTB_DELIVERY_SHIPPING_POINT}'`,
      `ReceivingPlant eq '${OUTB_DELIVERY_RECEIVING_PLANT}'`,
      `OverallGoodsMovementStatus eq '${OUTB_DELIVERY_GM_STATUS_COMPLETE}'`
    ].join(' and ');
    const url = baseUrl;

    console.log(`[${environment.toUpperCase()}] Outbound delivery lookup URL:`, url, 'filter:', filter);

    const response = await axiosInstance.get(url, {
      params: {
        'sap-client': sapClient,
        '$filter': filter,
        '$select': OUTB_DELIVERY_SELECT,
        '$expand': 'to_DeliveryDocumentItem',
        '$format': 'json'
      },
      auth: { username, password },
      headers: { Accept: 'application/json' },
      timeout: 25000,
      validateStatus: () => true
    });

    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');

    if (response.status >= 400) {
      const sapMessage = response.data?.error?.message;
      const sapErrorText = typeof sapMessage === 'string' ? sapMessage : sapMessage?.value;
      return res.status(response.status).json({
        error: 'SAP API error',
        message: sapErrorText || `SAP returned ${response.status}`,
        details: response.data
      });
    }

    const headers = response.data?.d?.results || response.data?.value || [];
    const header = headers[0];
    if (!header) {
      return res.status(404).json({
        error: 'Not found',
        message: `Outbound delivery ${deliveryNumber} not found`
      });
    }

    // Update the delivery number to match what SAP returned
    const actualDeliveryNumber = header.DeliveryDocument;

    const items = header.to_DeliveryDocumentItem?.results || header.to_DeliveryDocumentItem || [];
    const { to_DeliveryDocumentItem, __metadata, ...headerFields } = header;
    return res.status(200).json({ success: true, header: headerFields, items, deliveryNumber: actualDeliveryNumber });

  } catch (error) {
    console.error('Outbound delivery lookup error:', error.response?.data || error.message);
    res.header('Access-Control-Allow-Origin', '*');

    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Authentication failed', message: 'Invalid credentials for SAP system' });
    }

    return res.status(error.response?.status || 500).json({
      error: 'Proxy server error',
      message: error.message,
      details: error.response?.data
    });
  }
});

router.options('/:deliveryNumber', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-User-Auth, X-User-Environment');
  res.status(200).send();
});

module.exports = router;
