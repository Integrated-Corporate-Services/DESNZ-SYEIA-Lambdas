import { AppflowClient, StartFlowCommand } from "@aws-sdk/client-appflow";

const client = new AppflowClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  const flowName = process.env.APPFLOW_NAME; // set this as env var

  try {
    const command = new StartFlowCommand({ flowName });
    await client.send(command);
    console.log('Flow started successfully');
  } catch (error) {
    console.error("Failed to start AppFlow:", error);
  }
};