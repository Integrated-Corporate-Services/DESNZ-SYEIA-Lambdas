// mockEnv.js
export function getMockEnv() {
  return {
    SALESFORCE_AUTH_MODE: "STATIC",
    SALESFORCE_ACCESS_TOKEN: "mocktoken",
    SALESFORCE_BASE_URL: "https://mock.salesforce.com/",
    SALESFORCE_OBJECT_API: "services/data/vXX.X/sobjects/CustomObject__c",
    SALESFORCE_EXT_ID_FIELD: "External_Id__c",
    HTTP_TIMEOUT_MS: "5000"
  };
}
