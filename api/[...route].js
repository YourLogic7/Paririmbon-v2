let appPromise;

export default async function handler(request, response) {
  appPromise ??= import("../apps/api/src/app.js").then(({ default: app }) => app);
  const app = await appPromise;
  return app(request, response);
}
