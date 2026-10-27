// Same row shape as the backend's audit_event writes (ComprehensiveAuditRepository), retained for 2555 days.
export const INSERT_AUDIT_EVENT = `INSERT INTO audit_event
(event_category, event_type, actor_id, actor_type, subject_id, resource_type, resource_id,
 parent_resource_type, parent_resource_id, action, outcome, correlation_id, source_service,
 previous_values, new_values, change_summary, metadata, is_sensitive, gdpr_lawful_basis,
 legal_basis, security_classification, retention_until)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
 $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18, $19,
 'legal_obligation', 'OFFICIAL', NOW() + INTERVAL '2555 days')`;
