import https from 'https';

export const handler = async (event) => {
  let body;

  try {
    console.log(event);
    body = JSON.parse(event.body);
  } catch (err) {
    console.log(err);
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { username, password } = body;

  if (!username || !password) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Username and password are required' }),
    };
  }

  const postData = JSON.stringify({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: '6idpit1jdd5pmuru7mp3je802q',
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  });

  const options = {
    hostname: 'cognito-idp.eu-west-1.amazonaws.com',
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
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

          if (parsed.AuthenticationResult) {
            const tokens = {
              accessToken: parsed.AuthenticationResult.AccessToken,
              refreshToken: parsed.AuthenticationResult.RefreshToken,
            };

            resolve({
              statusCode: 200,
              headers: corsHeaders(),
              body: JSON.stringify(tokens),
            });
          } else {
            // Cognito returned an error-like response
            resolve({
              statusCode: 401, // or 400 depending on your preference
              headers: corsHeaders(),
              body: JSON.stringify({
                error: parsed.message || 'Authentication failed',
                type: parsed.__type,
              }),
            });
          }
        } catch (err) {
          resolve({
            statusCode: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: 'Failed to parse response from Cognito' }),
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
