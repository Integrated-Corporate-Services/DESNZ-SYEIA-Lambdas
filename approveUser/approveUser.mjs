import { CognitoIdentityProviderClient, AdminConfirmSignUpCommand, AdminUpdateUserAttributesCommand, AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import jwt from 'jsonwebtoken';  // Import the jsonwebtoken library to decode the token

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'eu-west-1' });

// CORS headers function to include in the response
const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,PUT',
});

export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Handle OPTIONS requests (CORS preflight request)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  // Extract the Authorization token from the headers
  const authorizationHeader = event.headers.Authorization;
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.error('Authorization token is missing or invalid.');
    return {
      statusCode: 401,
      headers: corsHeaders(),  // Adding CORS headers to the response
      body: JSON.stringify({ error: 'Unauthorized: Invalid or missing Authorization token.' })
    };
  }

  // Extract the token from the Authorization header
  const accessToken = authorizationHeader.split(' ')[1];
  console.log('Extracted access token:', accessToken);

  try {
    // Decode the JWT token to get the groups claim
    const decodedToken = jwt.decode(accessToken);
    console.log('Decoded token:', decodedToken);

    // Check if the user belongs to the "super" group
    if (!decodedToken || !decodedToken['cognito:groups'] || !decodedToken['cognito:groups'].includes('super')) {
      console.error('User is not in the "super" group.');
      return {
        statusCode: 403,
        headers: corsHeaders(),  // Adding CORS headers to the response
        body: JSON.stringify({ error: 'Forbidden: You must be in the "super" group to perform this action.' })
      };
    }

    // Parse the event body to extract the username
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (err) {
      return {
        statusCode: 400,
        headers: corsHeaders(),  // Adding CORS headers to the response
        body: JSON.stringify({ error: 'Invalid JSON in body' }),
      };
    }

    const username = body.username;
    console.log('username:', username);

    // Replace with your user pool ID
    const params = {
      UserPoolId: 'eu-west-1_76MbBVPZt',  // Replace with your User Pool ID
      Username: username            // Replace with dynamic username as per your event body or header
    };

    // Step 1: Confirm the user
    const confirmResult = await cognito.send(new AdminConfirmSignUpCommand(params));
    console.log('Cognito response for confirming user:', confirmResult);

    // Step 2: Mark the user's email as verified
    const updateParams = {
      UserPoolId: 'eu-west-1_76MbBVPZt', // Replace with your User Pool ID
      Username: username,  // The confirmed username
      UserAttributes: [
        {
          Name: 'email_verified',  // Email verified attribute
          Value: 'true'  // Mark email as verified
        }
      ]
    };

    const updateEmailVerifiedResult = await cognito.send(new AdminUpdateUserAttributesCommand(updateParams));
    console.log('Cognito response for updating email as verified:', updateEmailVerifiedResult);

    // Step 3: Add user to the "enduser" group
    const groupParams = {
      GroupName: 'enduser',  // Target group name
      UserPoolId: 'eu-west-1_76MbBVPZt',  // Your user pool ID
      Username: username  // The confirmed username
    };

    const addToGroupResult = await cognito.send(new AdminAddUserToGroupCommand(groupParams));
    console.log('Cognito response for adding user to group:', addToGroupResult);

    return {
      statusCode: 200,
      headers: corsHeaders(),  // Adding CORS headers to the response
      body: JSON.stringify({
        message: 'User confirmed, email marked as verified, and added to "enduser" group successfully.',
        result: addToGroupResult
      })
    };
  } catch (error) {
    console.error('Error during token validation or processing:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),  // Adding CORS headers to the response
      body: JSON.stringify({
        error: 'Failed to confirm user, mark email as verified, or add to group',
        message: error.message
      })
    };
  }
};