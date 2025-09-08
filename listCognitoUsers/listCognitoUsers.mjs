import AWS from 'aws-sdk';

const cognito = new AWS.CognitoIdentityServiceProvider();
const USER_POOL_ID = process.env.USER_POOL_ID;

const corsHeaders = () => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  });

export const handler = async (event) => {
    try {
        const response = await cognito.listUsers({
            UserPoolId: USER_POOL_ID,
            // Optionally you can filter by email like this:
            // Filter: 'email ^= "@"'
        }).promise();

        const filteredUsers = response.Users
            .filter(user => user.UserStatus === 'UNCONFIRMED') // ✅ Filter in code
            .map(user => ({
                username: user.Username,
                email: user.Attributes.find(attr => attr.Name === 'email')?.Value,
                email_verified: user.Attributes.find(attr => attr.Name === 'email_verified')?.Value,
                confirmation_status: user.UserStatus,
                status: user.Enabled ? 'Enabled' : 'Disabled'
            }));

        return {
            statusCode: 200,
            headers: corsHeaders(),
            body: JSON.stringify(filteredUsers),
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: error.message }),
        };
    }
};