import pkg from 'pg';
const { Client } = pkg;
import { Parser } from 'json2csv';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({ region: process.env.REGION });

const s3 = new S3Client({ region: process.env.REGION });


async function getSSMParam(name, withDecryption = true) {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: withDecryption,
  });

  const response = await ssm.send(command);
  return response.Parameter.Value;
}


export const handler = async (event) => {
  const applicationId = event.id;

  const HOST_NAME = await getSSMParam('/dev/rds/eip/host');
  const DB_USER = await getSSMParam('/dev/rds/icseip/username');
  const DB_PASSWORD = await getSSMParam('/dev/rds/icseip/password');
  const DB_NAME = await getSSMParam('/rds/eip/name');

  console.log('host:', HOST_NAME);
  console.log('db user:', DB_USER);
  console.log('dbname:', DB_NAME);
  
  // 1. Connect to RDS
  const client = new Client({
    host: HOST_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: 5432,
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  });
  

  await client.connect();

  try {
    // 2. Get the submitted row that hasn't been exported yet
    const res = await client.query(
      `SELECT * FROM application_details WHERE id = $1 AND applicaton_status = 'submitted' AND is_exported = false`,
      [applicationId]
    );

    if (res.rows.length === 0) {
      console.log('No unexported submitted application found for ID:', applicationId);
      return;
    }

    const row = res.rows;

    // 3. Convert to CSV
    const parser = new Parser();
    const csv = parser.parse(row);

    // 4. Upload to S3
    const s3Params = {
      Bucket: process.env.S3_BUCKET,
      Key: `application_details/application_${applicationId}_${Date.now()}.csv`,
      Body: csv,
      ContentType: 'text/csv',
    };

    const command = new PutObjectCommand(s3Params);
    await s3.send(command);
    console.log('Uploaded CSV to S3.');

    // 5. Mark as exported
    await client.query(
      `UPDATE application_details SET is_exported = true WHERE id = $1`,
      [applicationId]
    );

    console.log(`Marked application ${applicationId} as exported.`);
  } catch (err) {
    console.error('Error processing export:', err);
  } finally {
    await client.end();
  }
};