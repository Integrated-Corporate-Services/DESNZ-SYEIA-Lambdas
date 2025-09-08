exports.handler = async (event) => {
    // Access the user attributes, including groups
    const userGroups = event.request.groupConfiguration.groupsToAdd || [];
  
    // Add groups as custom claims to the token
    event.response = {
        claimsOverrideDetails: {
            claimsToAddOrOverride: {
                'cognito:groups': userGroups // Add the user groups as a custom claim
            }
        }
    };
  
    // Return the modified event with the user groups added to the token
    return event;
  };
  