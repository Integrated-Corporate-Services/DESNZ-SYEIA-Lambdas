import https from 'https';
import crypto from 'crypto';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';


const ssm = new SSMClient({ region: process.env.REGION });

async function getSSMParam(name, withDecryption = true) {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: withDecryption,
  });

  const response = await ssm.send(command);
  return response.Parameter.Value;
}

export const handler = async (event) => {
  let body;
  const COGNITO_SECRET_ID = await getSSMParam(process.env.COGNITO_CLIENT_SECRET);
  const clientId = process.env.COGNITO_CLIENT_ID;

  try {
    console.log(event);
    body = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { firstName, lastName, email, password } = body;

  if (!firstName || !lastName || !email || !password) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: 'First name, last name, email, and password are required',
      }),
    };
  }

  if (!validateEmail(email)) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid email format' }),
    };
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: passwordValidation.message }),
    };
  }

  if (!clientId || !COGNITO_SECRET_ID) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Missing Cognito client ID or secret in environment variables' }),
    };
  }

  const username = email;
  const secretHash = generateSecretHash(username, clientId, COGNITO_SECRET_ID);

  const postData = JSON.stringify({
    ClientId: clientId,
    Username: username,
    Password: password,
    SecretHash: secretHash,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'given_name', Value: firstName },
      { Name: 'family_name', Value: lastName },
    ],
  });

  const options = {
    hostname: 'cognito-idp.eu-west-2.amazonaws.com',
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (parsed.UserConfirmed !== undefined) {
            resolve({
              statusCode: 200,
              headers: corsHeaders(),
              body: JSON.stringify({
                userConfirmed: parsed.UserConfirmed,
                message: 'User registration successful',
                userName: email,
              }),
            });
          } else {
            let errorMessage = parsed.message || 'User registration failed';

            if (
              parsed.__type &&
              parsed.__type.includes('UsernameExistsException')
            ) {
              errorMessage = 'An account with this email already exists.';
            }

            resolve({
              statusCode: 400,
              headers: corsHeaders(),
              body: JSON.stringify({
                error: errorMessage,
                type: parsed.__type,
              }),
            });
          }
        } catch (err) {
          resolve({
            statusCode: 500,
            headers: corsHeaders(),
            body: JSON.stringify({
              error: 'Failed to parse response from Cognito',
            }),
          });
        }
      });
    });

    req.on('error', (err) => {
      reject({
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: err.message }),
      });
    });

    req.write(postData);
    req.end();
  });
};

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
});

const validatePassword = (password) => {
  const minLength = /.{8,}/;
  const upper = /[A-Z]/;
  const lower = /[a-z]/;
  const digit = /[0-9]/;
  const special = /[^A-Za-z0-9]/;

  if (!minLength.test(password))
    return { valid: false, message: 'Password must be at least 8 characters long' };
  if (!upper.test(password))
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  if (!lower.test(password))
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  if (!digit.test(password))
    return { valid: false, message: 'Password must contain at least one number' };
  if (!special.test(password))
    return { valid: false, message: 'Password must contain at least one special character' };

  return { valid: true };
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

function generateSecretHash(username, clientId, COGNITO_SECRET_ID) {
  return crypto
    .createHmac('SHA256', COGNITO_SECRET_ID)
    .update(username + clientId)
    .digest('base64');
}
