/**

 * Check icseip dev RDS for payment callback tables/columns.

 *

 * Usage (from pay-callback-reconciler):

 *   node scripts/check-dev-schema.mjs

 *

 * Env (direct credentials):

 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

 *

 * Env (AWS Secrets Manager — same as worker Lambda):

 *   DB_HOST, DB_PORT, DB_NAME, DB_CREDENTIALS, AWS_REGION, AWS_PROFILE

 */

import pg from 'pg';

import {

  SecretsManagerClient,

  GetSecretValueCommand,

} from '@aws-sdk/client-secrets-manager';



const REQUIRED_TABLES = {

  payment_webhooks: [

    'webhook_id',

    'payment_id',

    'event_type',

    'status',

    'raw_payload',

    'enqueued_at',

  ],

  payment: ['payment_id', 'status', 'amount', 'reference', 'description', 'finished'],

  payment_events: [

    'event_id',

    'payment_id',

    'event_type',

    'event_data',

    'event_timestamp',

    'processed',

    'received_at',

  ],

};



async function resolveCredentials() {

  if (process.env.DB_USER && process.env.DB_PASSWORD) {

    return {

      user: process.env.DB_USER,

      password: process.env.DB_PASSWORD,

    };

  }



  const secretArn = process.env.DB_CREDENTIALS;

  if (!secretArn) {

    throw new Error('Set DB_USER/DB_PASSWORD or DB_CREDENTIALS');

  }



  const client = new SecretsManagerClient({

    region: process.env.AWS_REGION || process.env.REGION || 'eu-west-2',

  });

  const response = await client.send(

    new GetSecretValueCommand({ SecretId: secretArn })

  );

  const secret = JSON.parse(response.SecretString);

  return {

    user: secret.username,

    password: secret.password,

  };

}



async function main() {

  const { user, password } = await resolveCredentials();

  const pool = new pg.Pool({

    host: process.env.DB_HOST || process.env.HOST_NAME,

    port: Number(process.env.DB_PORT || 5432),

    database: process.env.DB_NAME || 'icseip',

    user,

    password,

    ssl: { rejectUnauthorized: false },

    connectionTimeoutMillis: 10000,

  });



  const tablesResult = await pool.query(`

    SELECT table_name

    FROM information_schema.tables

    WHERE table_schema = 'public'

      AND table_type = 'BASE TABLE'

    ORDER BY table_name

  `);



  const existingTables = new Set(tablesResult.rows.map((r) => r.table_name));

  console.log('Database:', process.env.DB_NAME || 'icseip');

  console.log('Host:', process.env.DB_HOST || process.env.HOST_NAME);

  console.log('Public tables:', [...existingTables].join(', ') || '(none)');

  console.log('');



  const missingTables = [];

  const missingColumns = [];



  for (const [table, requiredCols] of Object.entries(REQUIRED_TABLES)) {

    if (!existingTables.has(table)) {

      missingTables.push(table);

      console.log(`MISSING TABLE: ${table}`);

      continue;

    }



    const cols = await pool.query(

      `

      SELECT column_name

      FROM information_schema.columns

      WHERE table_schema = 'public' AND table_name = $1

      `,

      [table]

    );

    const colSet = new Set(cols.rows.map((r) => r.column_name));

    const absent = requiredCols.filter((c) => !colSet.has(c));



    if (absent.length) {

      missingColumns.push({ table, absent });

      console.log(`TABLE ${table}: missing columns -> ${absent.join(', ')}`);

    } else {

      console.log(`OK ${table}`);

    }

  }



  await pool.end();



  console.log('');

  if (!missingTables.length && !missingColumns.length) {

    console.log('Schema check PASSED — all required tables/columns present.');

    process.exit(0);

  }



  console.log('Schema check FAILED');

  if (missingTables.length) {

    console.log('Missing tables:', missingTables.join(', '));

    console.log('Run migrations/001_worker_schema.sql (payment_webhooks comes from payment service)');

  }

  if (missingColumns.length) {

    for (const { table, absent } of missingColumns) {

      console.log(`  ${table}: add ${absent.join(', ')}`);

    }

  }

  process.exit(1);

}



main().catch((err) => {

  console.error('Schema check error:', err.message);

  process.exit(1);

});


