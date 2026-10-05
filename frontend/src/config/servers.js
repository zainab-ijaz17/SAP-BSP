export const servers = [
  { label: "Development", value: "dev" },
  { label: "Production", value: "prd" }
];

export const apiEndpoints = {
  dev: 'https://sap-app1.cfapps.eu10-004.hana.ondemand.com',
  prd: 'https://sap-app1.cfapps.eu10-004.hana.ondemand.com'
};

export const getBackendBaseUrl = (environment) => {
  return apiEndpoints[environment] || apiEndpoints.dev;
};

// GR for STPO's "fetch PO" lookup (stock-transport-order) is served by a separate
// backend deployment from the rest of the app.
// TODO: prd URL not confirmed yet — defaults to the dev app until SAP/DevOps confirms it.
export const stpoFetchPoEndpoints = {
  dev: 'https://sap-app-dic.cfapps.eu10-004.hana.ondemand.com',
  prd: 'https://sap-app-dic.cfapps.eu10-004.hana.ondemand.com'
};

export const getStpoFetchPoBaseUrl = (environment) => {
  return stpoFetchPoEndpoints[environment] || stpoFetchPoEndpoints.dev;
};

// GR for Outbound Delivery's lookup (/api/outbound-delivery) is served by the
// sap-app1 CF deployment.
export const outboundDeliveryEndpoints = {
  dev: 'https://sap-app1.cfapps.eu10-004.hana.ondemand.com',
  prd: 'https://sap-app1.cfapps.eu10-004.hana.ondemand.com'
};

export const getOutboundDeliveryBaseUrl = (environment) => {
  return outboundDeliveryEndpoints[environment] || outboundDeliveryEndpoints.dev;
};
