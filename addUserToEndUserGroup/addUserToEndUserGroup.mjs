import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";

// Initialize the Cognito Identity Provider client
const client = new CognitoIdentityProviderClient({});

export const handler = async (event) => {
  // Input for adding the user to the "EndUsers" group
  const input = {
    GroupName: 'EndUsers',       // Group to add users to
    UserPoolId: event.userPoolId, // User Pool ID
    Username: event.userName      // Username of the user signing up
  };

  try {
    // Command to add the user to the group
    const command = new AdminAddUserToGroupCommand(input);
    await client.send(command);
    console.log(`User ${event.userName} added to EndUsers group.`);
  } catch (err) {
    console.error('Error adding user to group:', err);
  }

  return event;
};
