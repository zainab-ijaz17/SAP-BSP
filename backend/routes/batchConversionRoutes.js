const express = require('express');
const axios = require('axios');
const https = require('https');

const router = express.Router();

// Batch Conversion (CPI iFlow "Batch_conv", backed by a Z-table on SAP client 110
// that maps material + deckle -> standard batch). Reel Transfer's 309 step uses it
// to auto-fill the New Batch for a scanned reel.
// The iFlow is keyed on material + deckle only, so for a scanned batch we first
// read its deckle (reel width, 4-digit mm) from the batch's reel width
// characteristic via API_BATCH_SRV/BatchCharcValue, then call CPI with the scanned
// material + that deckle.
// CPI uses its own service-key credentials, not the logged-in SAP user's, so they
// stay on the backend and never reach the handheld.
const BATCH_CONV_URLS = {
  dev: process.env.CPI_BATCH_CONV_URL
    || 'https://integration-suite-q07hbh9w.it-cpi026-rt.cfapps.eu10-002.hana.ondemand.com/http/Batch_conv',
  prd: process.env.CPI_BATCH_CONV_URL_PRD
    || 'https://integration-suite-prd-ud55bnea.it-cpi026-rt.cfapps.eu10-002.hana.ondemand.com/http/Batch_conv'
};
// prd tenant credentials: CPI_BATCH_CONV_USER_PRD / CPI_BATCH_CONV_PASS_PRD. Falls back
// to the dev pair only if the prd pair is not set.
function getBatchConvCredentials(environment) {
  const env = process.env;
  if (environment === 'prd' && env.CPI_BATCH_CONV_USER_PRD && env.CPI_BATCH_CONV_PASS_PRD) {
    return { username: env.CPI_BATCH_CONV_USER_PRD, password: env.CPI_BATCH_CONV_PASS_PRD };
  }
  return { username: env.CPI_BATCH_CONV_USER, password: env.CPI_BATCH_CONV_PASS };
}

// Batch characteristic services via API Management; each proxy maps to a service root.
// dev: API_BATCH_SRV. prd: ZBATCH_CLASSIFICATION_SRV (see fetchReelWidthPrd).
const BATCH_CHARC_VALUE_URLS = {
  dev: process.env.SAP_API_MGMT_BATCH_CLASS_URL || 'https://devspace.test.apimanagement.eu10.hana.ondemand.com/batch-class',
  prd: process.env.SAP_API_MGMT_BATCH_CLASS_URL_PRD || 'https://prdspace.prod01.apimanagement.eu10.hana.ondemand.com/batch/char'
};
// Reel width characteristic's internal ID (CharcInternalID / ATINN) per system.
const REEL_WIDTH_CHARC_IDS = { dev: '2907', prd: '2907' };
// prd's ZBATCH_CLASSIFICATION_SRV identifies characteristics by name, not ID.
const REEL_WIDTH_CHAR_NAME_PRD = (process.env.REEL_WIDTH_CHAR_NAME_PRD || 'Z_1223_WIDTH').trim();

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

class LookupError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getUserFromHeaders(req) {
  const authHeader = req.headers['x-user-auth'];
  if (!authHeader) return null;
  try {
    const [username, password] = Buffer.from(authHeader, 'base64').toString('utf-8').split(':');
    return username && password ? { username, password } : null;
  } catch {
    return null;
  }
}

function getEnvironment(req) {
  const env = req.headers['x-user-environment'] || 'dev';
  return env === 'prd' || env === '300' ? 'prd' : 'dev';
}

// Characteristic values come back as decimal strings (e.g. "1965.00000000000000");
// the iFlow wants a whole number.
function toDeckle(value) {
  const n = Number(String(value ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n);
  return Math.abs(n - rounded) < 0.001 ? rounded : null;
}

const odataLiteral = (value) => String(value ?? '').replace(/'/g, "''");

// Reads the reel width value for one Material + Batch. Returns the raw value, or
// null when the batch has no reel width on record. API_BATCH_SRV stores a numeric
// characteristic in CharcFromDecimalValue ("200.00000000000000") /
// CharcFromNumericValue ("2E2"); CharcValue is only used by char-type ones.
async function fetchReelWidth(batch, material, user, environment) {
  if (environment === 'prd') return fetchReelWidthPrd(batch, material, user);

  const charcId = REEL_WIDTH_CHARC_IDS[environment];
  const filter = `Material eq '${odataLiteral(material)}' and Batch eq '${odataLiteral(batch)}' and CharcInternalID eq '${charcId}'`;
  const response = await axios.get(`${BATCH_CHARC_VALUE_URLS[environment]}/BatchCharcValue`, {
    httpsAgent,
    params: {
      $filter: filter,
      $select: 'Material,Batch,CharcInternalID,CharcValue,CharcFromDecimalValue,CharcFromNumericValue',
      $format: 'json'
    },
    auth: user,
    headers: { Accept: 'application/json' },
    timeout: 25000,
    validateStatus: () => true
  });

  checkCharcResponse(response, batch);

  const rows = response.data?.d?.results || response.data?.value || [];
  console.log(`[${environment.toUpperCase()}] Reel width lookup ${filter} -> ${rows.length} row(s)`,
    rows.length ? JSON.stringify(rows[0]) : '');
  const record = rows[0];
  if (!record) return null;
  const candidates = [record.CharcFromDecimalValue, record.CharcFromNumericValue, record.CharcValue];
  const value = candidates.find((v) => v !== undefined && v !== null && String(v).trim() !== '' && Number(v) !== 0);
  return value ?? null;
}

// prd 300 has no API_BATCH_SRV behind API Management; /batch/char maps to the custom
// ZBATCH_CLASSIFICATION_SRV, whose BatchCharacteristicSet returns every characteristic
// of a batch as { CharName, CharDescription, CharValue, Batch, Material }.
// The reel width row is the one whose CharName is REEL_WIDTH_CHAR_NAME_PRD (Z_1223_WIDTH).
async function fetchReelWidthPrd(batch, material, user) {
  const filter = `Batch eq '${odataLiteral(batch)}' and Material eq '${odataLiteral(material)}'`;
  const response = await axios.get(`${BATCH_CHARC_VALUE_URLS.prd}/BatchCharacteristicSet`, {
    httpsAgent,
    params: { $filter: filter, $format: 'json' },
    auth: user,
    headers: { Accept: 'application/json' },
    timeout: 25000,
    validateStatus: () => true
  });

  checkCharcResponse(response, batch);

  const rows = response.data?.d?.results || response.data?.value || [];
  console.log(`[PRD] Reel width lookup ${filter} -> ${rows.length} row(s)`, JSON.stringify(rows));

  const wantedName = REEL_WIDTH_CHAR_NAME_PRD.toUpperCase();
  const record = rows.find((r) => String(r.CharName || '').trim().toUpperCase() === wantedName);
  if (!record) return null;

  // Numeric characteristics come back in scientific notation, e.g.
  // "2.4750000000000000E+03" = 2475, so parse the whole string as a number.
  const n = Number(String(record.CharValue || '').replace(/,/g, '').trim());
  return Number.isFinite(n) && n !== 0 ? String(n) : null;
}

function checkCharcResponse(response, batch) {
  if (response.status === 401) {
    throw new LookupError(401, 'SAP rejected your login while reading the reel width');
  }
  if (response.status !== 200) {
    console.error('Batch conversion: reel width lookup failed', response.status, JSON.stringify(response.data));
    const sapMessage = response.data?.error?.message;
    const text = typeof sapMessage === 'string' ? sapMessage : sapMessage?.value;
    throw new LookupError(502, `Could not read reel width for batch ${batch}${text ? `: ${text}` : ` (status ${response.status})`}`);
  }
}

async function callBatchConv(material, deckle, environment) {
  const { username, password } = getBatchConvCredentials(environment);
  if (!username || !password) {
    console.error(`Batch conversion: CPI credentials not set for ${environment}`);
    throw new LookupError(500, 'Batch conversion service is not configured');
  }

  const response = await axios.post(
    BATCH_CONV_URLS[environment],
    { Z_BATCH_CONV_API: { IV_DECKLE: deckle, IV_MATNR: material } },
    {
      auth: { username, password },
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 25000,
      validateStatus: () => true
    }
  );

  console.log(`[${environment.toUpperCase()}] Batch conversion CPI request`, JSON.stringify({ Z_BATCH_CONV_API: { IV_DECKLE: deckle, IV_MATNR: material } }),
    '-> HTTP', response.status, JSON.stringify(response.data));

  if (response.status >= 400) {
    console.error('Batch conversion CPI error', response.status, response.data);
    throw new LookupError(502, `Batch conversion service returned ${response.status}`);
  }

  const root = response.data?.root || {};
  // ET_DATA.item is an object for one row, an array for several, and ET_DATA is
  // "" when nothing matched.
  const rawItems = root.ET_DATA?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const item = items.find((i) => i?.CHARG);

  if (root.STATUS !== 'S' || !item) {
    throw new LookupError(404, root.EV_MESSAGE || `No batch found for material ${material} and deckle ${deckle}`);
  }
  return { item, message: root.EV_MESSAGE, matchCount: items.length };
}

// GET /api/batch-conversion/reel-width?batch=...&material=...
// -> 200 { success: true, reelWidth: "1965" | null, charcId }
// Used by the Reel Transfer scan page (BspPage) to show each scanned batch's width.
router.get('/reel-width', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Valid user credentials are required' });
  }
  const batch = String(req.query.batch || '').trim().toUpperCase();
  const material = String(req.query.material || '').trim().replace(/^0+/, '');
  if (!batch || !material) {
    return res.status(400).json({ success: false, message: 'batch and material are required' });
  }

  const environment = getEnvironment(req);
  try {
    const rawValue = await fetchReelWidth(batch, material, user, environment);
    const whole = toDeckle(rawValue);
    const reelWidth = rawValue === null ? null : (whole !== null ? String(whole) : String(rawValue).trim());
    return res.json({
      success: true,
      reelWidth,
      charcId: environment === 'prd' ? REEL_WIDTH_CHAR_NAME_PRD : REEL_WIDTH_CHARC_IDS[environment]
    });
  } catch (error) {
    if (error instanceof LookupError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Reel width lookup failed:', error.message);
    return res.status(502).json({ success: false, message: 'Could not reach SAP' });
  }
});

// POST /api/batch-conversion
//   { batch, material }             -> deckle read from the reel width characteristic, then converted
//   { material, deckle }            -> converted directly (manual deckle override)
//   { batch, material, deckle }     -> explicit deckle wins over the characteristic
// -> 200 { success: true, batch, material, deckle, description, sourceBatch, message }
// -> 4xx/5xx { success: false, message, material?, deckle? }
router.post('/', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Valid user credentials are required' });
  }

  const sourceBatch = String(req.body?.batch || '').trim().toUpperCase();
  let material = String(req.body?.material || '').trim();
  const hasDeckle = String(req.body?.deckle ?? '').trim() !== '';
  let deckle = hasDeckle ? toDeckle(req.body.deckle) : null;

  if (hasDeckle && deckle === null) {
    return res.status(400).json({ success: false, message: 'Deckle must be a positive whole number' });
  }
  if (!sourceBatch && (!material || deckle === null)) {
    return res.status(400).json({ success: false, message: 'batch, or material and deckle, are required' });
  }

  if (!material) {
    return res.status(400).json({ success: false, message: 'material is required' });
  }

  const environment = getEnvironment(req);
  try {
    if (deckle === null) {
      const rawValue = await fetchReelWidth(sourceBatch, material.replace(/^0+/, ''), user, environment);
      if (rawValue === null) {
        return res.status(404).json({
          success: false,
          material: material.replace(/^0+/, ''),
          message: `Batch ${sourceBatch} has no reel width (characteristic ${REEL_WIDTH_CHARC_IDS[environment]}) in SAP. Enter the deckle manually.`
        });
      }
      deckle = toDeckle(rawValue);
      if (deckle === null) {
        return res.status(422).json({
          success: false,
          material: material.replace(/^0+/, ''),
          message: `Reel width for batch ${sourceBatch} is "${rawValue}", not a whole-number deckle. Enter the deckle manually.`
        });
      }
    }

    material = material.replace(/^0+/, '');
    const { item, message, matchCount } = await callBatchConv(material, deckle, environment);

    return res.json({
      success: true,
      batch: item.CHARG,
      material: item.MATNR,
      deckle: item.DECKLE,
      description: item.MAKTX,
      sourceBatch: sourceBatch || undefined,
      message,
      matchCount
    });
  } catch (error) {
    if (error instanceof LookupError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        material: material ? material.replace(/^0+/, '') : undefined,
        deckle: deckle ?? undefined
      });
    }
    console.error('Batch conversion request failed:', error.message);
    return res.status(502).json({ success: false, message: 'Could not reach SAP / batch conversion service' });
  }
});

module.exports = router;
