import { HS256Authenticator, ManagementServer } from "../src";

async function main(): Promise<void> {
  const secret = process.env.AGENTFIREWORKS_AUTH_SECRET ?? "top-secret";
  const server = new ManagementServer({
    auditPath: ".fireworks-plus-plus/audit.log",
    checkpointDir: ".fireworks-plus-plus/checkpoints",
    workflowDir: ".fireworks-plus-plus/workflows",
    authenticator: new HS256Authenticator({
      secret,
      issuer: "fireworks-plus-plus",
      audience: "dashboard"
    }),
    port: 3000
  });

  const details = await server.start();
  const token = HS256Authenticator.sign(
    {
      sub: "local-admin",
      roles: ["admin"],
      iss: "fireworks-plus-plus",
      aud: "dashboard",
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    secret
  );

  console.log("Management server:", details.url);
  console.log("Bearer token:", token);
  console.log("Open /dashboard with Authorization: Bearer <token>");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
