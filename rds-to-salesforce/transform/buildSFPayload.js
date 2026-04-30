// buildSFPayload.js
export function buildSFPayload(snapshot, env) {
  return {
    [env.SALESFORCE_EXT_ID_FIELD]: snapshot.applicationId,
    Name: snapshot.sections?.projectDetails?.overview?.title || `Application ${snapshot.applicationId}`,
    Status__c: "Submitted",
    Operator_Name__c: snapshot.sections?.networkOperator?.details?.operatorName,
    Operator_Contact_Email__c: snapshot.sections?.networkOperator?.contact?.email,
    Asset_Type__c: snapshot.sections?.projectDetails?.assetInformation?.assetType,
    Works_Description__c: snapshot.sections?.location?.worksOverview?.summary,
    EIA_Required__c: snapshot.sections?.supportingInformation?.eiaFees?.requiresFullEia ?? null,
    Submitted_At__c: snapshot.submittedAt,
  };
}
