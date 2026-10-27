export const FIND_APPLICATION_STATUS_FOR_UPDATE = `SELECT status FROM application WHERE application_id = $1 FOR UPDATE`;

export const MARK_APPLICATION_FURTHER_INFORMATION_REQUESTED = `UPDATE application
SET status = 'FURTHER_INFORMATION_REQUESTED', updated_at = NOW()
WHERE application_id = $1`;

// Same recipient rule as the backend's FIND_APPLICANT_CONTACT.
export const FIND_APPLICANT_CONTACT = `SELECT a.desnz_ref AS "desnzRef", u.user_id AS "userId", uo.organisation_id AS "organisationId"
FROM application a
LEFT JOIN application_party ap ON ap.application_id = a.application_id
  AND ap.role = 'APPLICANT' AND ap.is_primary = TRUE
LEFT JOIN users u ON u.user_id = COALESCE(a.assigned_to, a.created_by) AND u.status = 'ACTIVE'
LEFT JOIN user_organisation uo ON uo.user_id = u.user_id AND uo.organisation_id = ap.organisation_id AND uo.status = 'ACTIVE'
WHERE a.application_id = $1`;

export const INSERT_NOTIFICATION = `INSERT INTO in_app_notification
(type, title, message, reference_type, reference_id, application_id)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (type, reference_type, reference_id) DO UPDATE SET type = EXCLUDED.type
RETURNING notification_id`;

// Returns only the recipients added now, with their new row for the audit trail.
export const INSERT_NOTIFICATION_RECIPIENTS = `INSERT INTO in_app_notification_recipient
(notification_id, recipient_user_id, organisation_id)
SELECT $1::uuid, target.user_id, target.organisation_id
FROM unnest($2::uuid[], $3::uuid[]) AS target(user_id, organisation_id)
ON CONFLICT (notification_id, recipient_user_id, organisation_id) DO NOTHING
RETURNING recipient_user_id AS "userId", organisation_id AS "organisationId",
  json_build_object('status', status, 'read_at', read_at, 'resolved_at', resolved_at,
    'created_at', created_at, 'created_by', created_by,
    'updated_at', updated_at, 'updated_by', updated_by) AS "newValues"`;
