// flattenForAppflow.js
export function flattenForAppflow(snapshot) {
  return {
    application_id: snapshot.applicationId,
    form_type: snapshot.formType,
    submitted_at: snapshot.submittedAt,
    operator_name: snapshot.sections?.networkOperator?.details?.operatorName,
    operator_contact_email: snapshot.sections?.networkOperator?.contact?.email,
    project_name: snapshot.sections?.projectDetails?.overview?.title,
    asset_type: snapshot.sections?.projectDetails?.assetInformation?.assetType,
    route_name: snapshot.sections?.location?.route?.name,
    works_description: snapshot.sections?.location?.worksOverview?.summary,
    eia_required: snapshot.sections?.supportingInformation?.eiaFees?.requiresFullEia ?? null,
  };
}
